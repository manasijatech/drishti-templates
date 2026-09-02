from __future__ import annotations

import argparse
import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast
from urllib.parse import urlparse

from .config import CHANNELS, load_config
from .monitor import Monitor
from .rest import RestClient
from .socket import RawSubscriptionSession, watch_raw_socket
from .store import Store


def console_delivery(event: Any) -> None:
    print(json.dumps(event.to_dict(), sort_keys=True))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Drishti Indian earnings monitor")
    parser.add_argument("--config", default="config.example.json")
    parser.add_argument("--state-dir", default="var")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("demo", help="run deterministic REST fixtures")
    sub.add_parser("live-smoke", help="run one authenticated REST recovery")
    sub.add_parser("watch", help="recover with REST, then monitor WebSocket events")
    sub.add_parser("queue", help="print the analyst review queue")
    sub.add_parser("calendar", help="print stored upcoming schedule records")
    sub.add_parser("calendar-refresh", help="refresh both upcoming schedule products")
    sub.add_parser("failures", help="print active parse and delivery failures")
    retry = sub.add_parser("retry-failure", help="retry one durable failure")
    retry.add_argument("failure_id")
    note = sub.add_parser("add-note", help="append an analyst note")
    note.add_argument("channel", choices=CHANNELS)
    note.add_argument("provider_id")
    note.add_argument("note")
    reviewed = sub.add_parser("mark-reviewed", help="mark a queued event reviewed")
    reviewed.add_argument("channel", choices=CHANNELS)
    reviewed.add_argument("provider_id")
    source = sub.add_parser("resolve-source", help="resolve a filing or call artifact on demand")
    source.add_argument("channel", choices=("earnings", "concalls"))
    source.add_argument("provider_id")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    config = load_config(args.config)
    store = Store(args.state_dir)
    monitor = Monitor(config, store, console_delivery)
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
    now = datetime(2026, 9, 2, 12, tzinfo=UTC) if args.command == "demo" else datetime.now(UTC)
    if args.command == "demo":
        fixture_path = Path(__file__).parents[2] / "fixtures" / "rest-pages.json"
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))

        def fixture_getter(url: str, _headers: dict[str, str]) -> dict[str, Any]:
            key = urlparse(url).path.removeprefix("/v1/").replace("/", "-")
            return cast(dict[str, Any], fixture[key])

        rest = RestClient("https://fixture.invalid/v1", "fixture-key", fixture_getter)
    else:
        api_key = os.environ.get("DRISHTI_API_KEY")
        if not api_key:
            raise SystemExit(f"DRISHTI_API_KEY is required for {args.command}")
        rest = RestClient(
            os.environ.get("DRISHTI_BASE_URL", "https://developers.manasija.in/v1"), api_key
        )
        if args.command == "resolve-source":
            event = (
                monitor.resolve_earnings_source(rest, args.provider_id)
                if args.channel == "earnings"
                else monitor.resolve_concall_sources(rest, args.provider_id)
            )
            print(json.dumps(event.to_dict(), sort_keys=True))
            return 0
        if args.command == "calendar-refresh":
            items = monitor.refresh_calendar(rest)
            print(f"calendar={len(items)}")
            return 0
        if args.command == "watch":
            session = RawSubscriptionSession(config)

            def recover() -> None:
                monitor.recover(rest, datetime.now(UTC))

            watch_raw_socket(
                os.environ.get("DRISHTI_WS_URL", "wss://developers.manasija.in/v1/ws"),
                api_key,
                session,
                recover,
                monitor.handle_envelope,
                lambda frame: store.audit(
                    "subscription_acknowledged", product=frame.get("product")
                ),
            )
            return 0
    accepted = monitor.recover(rest, now)
    calendar = monitor.refresh_calendar(rest)
    print(
        f"accepted={len(accepted)} calendar={len(calendar)} queue={sum(1 for _ in store.events())}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
