from __future__ import annotations

import argparse
import asyncio
import json
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast

from drishti_sdk.exceptions import DrishtiApiError

from .config import CHANNELS, MonitorConfig, load_config
from .model import ResearchEvent
from .monitor import Monitor
from .rest import RestClient, create_sdk_client
from .socket import watch_sdk
from .store import Store


def console_delivery(event: Any) -> None:
    print(json.dumps(event.to_dict(), sort_keys=True))


def simple_delivery(event: ResearchEvent) -> None:
    detail = event.headline or event.company or event.provider_id
    print(f"{event.channel.upper()}: {event.symbol} - {detail}")


def _recovery_is_recent(
    store: Store,
    config: MonitorConfig,
    now: datetime,
    *,
    maximum_age: timedelta = timedelta(minutes=1),
) -> bool:
    enabled_channels = {channel for coverage in config.coverage for channel in coverage.channels}
    if not enabled_channels:
        return False
    for channel in enabled_channels:
        value = store.checkpoint(channel)
        if value is None:
            return False
        try:
            checkpoint = datetime.fromisoformat(value).astimezone(UTC)
        except (ValueError, TypeError):
            return False
        age = now.astimezone(UTC) - checkpoint
        if age < timedelta(0) or age > maximum_age:
            return False
    return True


class FixtureSdkClient:
    """Deterministic SDK-boundary fake used only by the credential-free demo."""

    def __init__(self, fixture: dict[str, Any]) -> None:
        self.fixture = fixture

    def _response(self, key: str) -> dict[str, Any]:
        return cast(dict[str, Any], self.fixture[key])

    def get_earnings(self, **_kwargs: Any) -> object:
        return self._response("earnings")

    def get_news(self, **_kwargs: Any) -> object:
        return self._response("news")

    def get_concalls(self, **_kwargs: Any) -> object:
        return self._response("concalls")

    def get_upcoming_earnings(self, **_kwargs: Any) -> object:
        return self._response("earnings-upcoming")

    def get_upcoming_concalls(self, **_kwargs: Any) -> object:
        return self._response("concalls-upcoming")

    def get_earnings_attachments(self, **_kwargs: Any) -> object:
        return {"data": []}

    def get_concalls_transcript(self, **_kwargs: Any) -> object:
        return {}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Monitor Indian earnings, news, and concalls with Drishti.",
        epilog=(
            "Start with 'drishti-monitor demo'. For live data, set DRISHTI_API_KEY, "
            "then use 'drishti-monitor check' or 'drishti-monitor run'."
        ),
    )
    parser.add_argument(
        "--config",
        default="config.example.json",
        help=argparse.SUPPRESS,
    )
    parser.add_argument(
        "--state-dir",
        default="var",
        help=argparse.SUPPRESS,
    )
    parser.add_argument("--json", action="store_true", help="print full JSON records")
    sub = parser.add_subparsers(dest="command", metavar="COMMAND", required=True)
    sub.add_parser("demo", help="try the monitor with safe sample data")
    sub.add_parser("check", help="fetch live updates once, then exit")
    sub.add_parser("run", help="keep monitoring live updates until stopped")
    sub.add_parser("queue", help="show collected updates")
    sub.add_parser("calendar", help="show upcoming earnings and concalls")

    # Compatibility and operator commands remain available without crowding the quick start.
    sub.add_parser("live-smoke")
    sub.add_parser("watch")
    sub.add_parser("calendar-refresh")
    sub.add_parser("failures")
    retry = sub.add_parser("retry-failure")
    retry.add_argument("failure_id")
    note = sub.add_parser("add-note")
    note.add_argument("channel", choices=CHANNELS)
    note.add_argument("provider_id")
    note.add_argument("note")
    reviewed = sub.add_parser("mark-reviewed")
    reviewed.add_argument("channel", choices=CHANNELS)
    reviewed.add_argument("provider_id")
    source = sub.add_parser("resolve-source")
    source.add_argument("channel", choices=("earnings", "concalls"))
    source.add_argument("provider_id")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    command = {"check": "live-smoke", "run": "watch"}.get(args.command, args.command)
    config = load_config(args.config)
    store = Store(args.state_dir)
    monitor = Monitor(config, store, console_delivery if args.json else simple_delivery)
    if args.command == "queue":
        print(json.dumps(list(store.events()), indent=2, sort_keys=True))
        return 0
    if args.command == "calendar":
        print(json.dumps(list(store.calendar()), indent=2, sort_keys=True))
        return 0
    if args.command == "failures":
        print(json.dumps(list(store.failures()), indent=2, sort_keys=True))
        return 0
    if args.command == "retry-failure":
        succeeded = monitor.retry_failure(args.failure_id)
        print(f"retried={str(succeeded).lower()} failure_id={args.failure_id}")
        return 0 if succeeded else 1
    if args.command == "add-note":
        monitor.add_note(args.channel, args.provider_id, args.note)
        return 0
    if args.command == "mark-reviewed":
        monitor.mark_reviewed(args.channel, args.provider_id)
        return 0
    now = datetime(2026, 9, 2, 12, tzinfo=UTC) if command == "demo" else datetime.now(UTC)
    if command == "demo":
        fixture_path = Path(__file__).parents[2] / "fixtures" / "rest-pages.json"
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))

        rest = RestClient(FixtureSdkClient(cast(dict[str, Any], fixture)))
    else:
        api_key = os.environ.get("DRISHTI_API_KEY")
        if not api_key:
            raise SystemExit(
                "Live monitoring needs a Drishti API key.\n"
                "Set DRISHTI_API_KEY, then run this command again."
            )
        sdk = create_sdk_client(
            api_key, os.environ.get("DRISHTI_BASE_URL", "https://developers.manasija.in")
        )
        try:
            rest = RestClient(sdk)
            if command == "resolve-source":
                event = (
                    monitor.resolve_earnings_source(rest, args.provider_id)
                    if args.channel == "earnings"
                    else monitor.resolve_concall_sources(rest, args.provider_id)
                )
                print(json.dumps(event.to_dict(), sort_keys=True))
                return 0
            if command == "calendar-refresh":
                items = monitor.refresh_calendar(rest)
                print(f"calendar={len(items)}")
                return 0
            if command == "watch":

                def recover() -> None:
                    recovery_time = datetime.now(UTC)
                    if _recovery_is_recent(store, config, recovery_time):
                        print("Using the recent check; starting live monitoring.")
                        store.audit("recovery_skipped_recent_checkpoint")
                        return
                    try:
                        monitor.recover(rest, recovery_time)
                    except DrishtiApiError as error:
                        if error.status_code != 429:
                            raise
                        print(
                            "REST refresh reached Drishti's per-minute limit; "
                            "continuing with live monitoring."
                        )
                        store.audit("recovery_rate_limited", status_code=error.status_code)

                print("Monitoring live updates. Press Ctrl+C to stop.")
                try:
                    asyncio.run(
                        watch_sdk(
                            sdk,
                            config,
                            recover,
                            monitor.handle_envelope,
                            lambda kind, details: store.audit(f"websocket_{kind}", **details),
                        )
                    )
                except KeyboardInterrupt:
                    print("Monitor stopped.")
                return 0
            accepted = monitor.recover(rest, now)
            calendar = monitor.refresh_calendar(rest)
            print(
                f"accepted={len(accepted)} calendar={len(calendar)} "
                f"queue={sum(1 for _ in store.events())}"
            )
            return 0
        except DrishtiApiError as error:
            if error.status_code == 429:
                raise SystemExit(
                    "Drishti's per-minute limit was reached. Wait one minute, then try again."
                ) from None
            raise
        finally:
            sdk.close()
    accepted = monitor.recover(rest, now)
    calendar = monitor.refresh_calendar(rest)
    print(
        f"accepted={len(accepted)} calendar={len(calendar)} queue={sum(1 for _ in store.events())}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
