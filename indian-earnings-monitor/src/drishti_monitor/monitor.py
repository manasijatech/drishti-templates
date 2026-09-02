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
        return accepted

    def handle_envelope(self, envelope: dict[str, Any], received_time: str) -> ResearchEvent | None:
        channel = envelope.get("channel")
        payload = envelope.get("data")
        if channel not in CHANNELS or not isinstance(payload, dict):
            raise ValueError("WebSocket envelope requires a supported channel and object data")
        return self.handle_payload(channel, payload, received_time)

    def handle_payload(
        self, channel: Channel, payload: dict[str, Any], received_time: str
    ) -> ResearchEvent | None:
        event = normalize(channel, payload, received_time)
        coverage = next(
            (item for item in self.config.coverage if item.symbol == event.symbol), None
        )
        if coverage is None or channel not in coverage.channels:
            self.store.audit("ignored_outside_coverage", channel=channel, symbol=event.symbol)
            return None
        event.owner = coverage.owner
        event.priority = coverage.priority
        deadline = datetime.fromisoformat(received_time) + timedelta(
            minutes=coverage.review_sla_minutes
        )
        event.review_deadline = deadline.isoformat()
        event.review_state = "assigned"
        status, event = self.store.accept(event)
        if status == "duplicate":
            self.store.audit("duplicate_ignored", identity=f"{channel}:{event.provider_id}")
            return None
        self.store.save_checkpoint(channel, event.source_time)
        deliver_with_retry(event, self.store, self.deliverer, self.config.max_delivery_attempts)
        return event

    def add_note(self, channel: Channel, provider_id: str, note: str) -> None:
        identity = f"{channel}:{provider_id}"
        raw = next(
            (
                item
                for item in self.store.events()
                if f"{item['channel']}:{item['provider_id']}" == identity
            ),
            None,
        )
        if raw is None:
            raise KeyError(identity)
        raw["notes"].append(note)
        event = ResearchEvent(**raw)
        self.store.update(event, "note_added")

    def mark_reviewed(self, channel: Channel, provider_id: str) -> None:
        identity = f"{channel}:{provider_id}"
        raw = next(
            (
                item
                for item in self.store.events()
                if f"{item['channel']}:{item['provider_id']}" == identity
            ),
            None,
        )
        if raw is None:
            raise KeyError(identity)
        raw["review_state"] = "reviewed"
        event = ResearchEvent(**raw)
        self.store.update(event, "reviewed")
