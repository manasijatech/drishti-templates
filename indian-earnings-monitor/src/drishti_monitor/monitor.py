from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from .config import CHANNELS, Channel, MonitorConfig
from .delivery import Deliverer, deliver_with_retry
from .model import ResearchEvent, normalize
from .rest import RestClient
from .store import Store


class Monitor:
    def __init__(self, config: MonitorConfig, store: Store, deliverer: Deliverer) -> None:
        self.config = config
        self.store = store
        self.deliverer = deliverer

    def recover(self, rest: RestClient, now: datetime) -> list[ResearchEvent]:
        accepted: list[ResearchEvent] = []
        end = now.astimezone(UTC).isoformat()
        for channel in CHANNELS:
            fallback = now.astimezone(UTC) - timedelta(hours=self.config.recovery_lookback_hours)
            start = self.store.checkpoint(channel) or fallback.isoformat()
            symbols = [item.symbol for item in self.config.coverage if channel in item.channels]
            if not symbols:
                continue
            for page in rest.pages(channel, symbols, start, end, self.config.page_limit):
                for payload in page:
                    event = self.handle_payload(channel, payload, end)
                    if event is not None:
                        accepted.append(event)
            self.store.save_checkpoint(channel, end)
        return accepted

    def refresh_calendar(self, rest: RestClient) -> list[dict[str, Any]]:
        accepted: list[dict[str, Any]] = []
        symbols = [item.symbol for item in self.config.coverage]
        verified_fields = {
            "earnings": ("event_id", "company", "date", "purpose", "title", "quarter"),
            "concalls": ("meeting_date", "quarter", "intimation_attachment"),
        }
        for product in ("earnings", "concalls"):
            for page in rest.upcoming(product, symbols, self.config.page_limit):
                for payload in page:
                    provider_id = payload.get("id")
                    symbol = payload.get("symbol")
                    if not isinstance(provider_id, str) or not isinstance(symbol, str):
                        raise ValueError(f"invalid upcoming {product} item")
                    scheduled_field = "date" if product == "earnings" else "meeting_date"
                    item: dict[str, Any] = {
                        "provider_id": provider_id,
                        "product": product,
                        "symbol": symbol,
                        "scheduled_time": payload.get(scheduled_field),
                    }
                    for field in verified_fields[product]:
                        value = payload.get(field)
                        if value is not None:
                            item[field] = value
                    self.store.save_calendar(product, item)
                    accepted.append(item)
        return accepted

    def resolve_earnings_source(self, rest: RestClient, provider_id: str) -> ResearchEvent:
        event = self.store.event("earnings", provider_id)
        matches = rest.earnings_attachments([provider_id])
        item = next((value for value in matches if value.get("id") == provider_id), None)
        event.source_url = item.get("url") if item and item.get("status") == "ready" else None
        self.store.update(event, "source_resolved")
        return event

    def resolve_concall_sources(self, rest: RestClient, provider_id: str) -> ResearchEvent:
        event = self.store.event("concalls", provider_id)
        if event.quarter is None:
            raise ValueError("concall quarter is required to resolve artifacts")
        artifacts = rest.concall_artifacts(event.symbol, event.quarter)
        transcript = artifacts.get("transcript_url")
        audio = artifacts.get("audio_url")
        event.source_url = transcript if isinstance(transcript, str) else None
        event.audio_url = audio if isinstance(audio, str) else None
        self.store.update(event, "source_resolved")
        return event

    def handle_envelope(self, envelope: dict[str, Any], received_time: str) -> ResearchEvent | None:
        channel = envelope.get("channel")
        payload = envelope.get("data")
        if channel not in CHANNELS or not isinstance(payload, dict):
            valid_channel = channel if channel in CHANNELS else None
            self.store.record_failure(
                "parse",
                "WebSocket envelope requires a supported channel and object data",
                channel=valid_channel,
                payload=envelope,
                received_time=received_time,
            )
            return None
        return self.handle_payload(channel, payload, received_time)

    def handle_payload(
        self, channel: Channel, payload: dict[str, Any], received_time: str
    ) -> ResearchEvent | None:
        try:
            event = normalize(channel, payload, received_time)
        except ValueError as error:
            self.store.record_failure(
                "parse",
                str(error),
                channel=channel,
                payload=payload,
                received_time=received_time,
            )
            return None
        return self._process_event(event)

    def _process_event(self, event: ResearchEvent) -> ResearchEvent | None:
        channel = event.channel
        coverage = next(
            (item for item in self.config.coverage if item.symbol == event.symbol), None
        )
        if coverage is None or channel not in coverage.channels:
            self.store.audit("ignored_outside_coverage", channel=channel, symbol=event.symbol)
            return None
        event.owner = coverage.owner
        event.priority = coverage.priority
        deadline = datetime.fromisoformat(event.received_time) + timedelta(
            minutes=coverage.review_sla_minutes
        )
        event.review_deadline = deadline.isoformat()
        event.review_state = "assigned"
        status, event = self.store.accept(event)
        if status == "duplicate":
            self.store.audit("duplicate_ignored", identity=f"{channel}:{event.provider_id}")
            return None
        deliver_with_retry(event, self.store, self.deliverer, self.config.max_delivery_attempts)
        return event

    def add_note(self, channel: Channel, provider_id: str, note: str) -> None:
        event = self.store.event(channel, provider_id)
        event.notes.append(note)
        self.store.update(event, "note_added")

    def mark_reviewed(self, channel: Channel, provider_id: str) -> None:
        event = self.store.event(channel, provider_id)
        event.review_state = "reviewed"
        self.store.update(event, "reviewed")

    def retry_failure(self, failure_id: str) -> bool:
        failure = self.store.failure(failure_id)
        if failure["kind"] == "delivery":
            identity = failure.get("event_identity")
            if not isinstance(identity, str):
                raise ValueError("delivery failure has no event identity")
            channel_value, provider_id = identity.split(":", 1)
            if channel_value not in CHANNELS:
                raise ValueError("delivery failure has invalid channel")
            event = self.store.event(channel_value, provider_id)
            event.delivery_attempts = 0
            event.delivery_state = "retry"
            succeeded = deliver_with_retry(
                event, self.store, self.deliverer, self.config.max_delivery_attempts
            )
        else:
            raw_channel = failure.get("channel")
            payload = failure.get("payload")
            received_time = failure.get("received_time")
            if (
                not isinstance(raw_channel, str)
                or raw_channel not in CHANNELS
                or not isinstance(payload, dict)
                or not isinstance(received_time, str)
            ):
                raise ValueError("parse failure cannot be retried")
            parse_channel = raw_channel
            try:
                event = normalize(parse_channel, payload, received_time)
            except ValueError as error:
                self.store.record_failure(
                    "parse",
                    str(error),
                    channel=parse_channel,
                    payload=payload,
                    received_time=received_time,
                )
                return False
            succeeded = self._process_event(event) is not None
        if succeeded:
            self.store.resolve_failure(failure_id)
        return succeeded
