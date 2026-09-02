from __future__ import annotations

import argparse
import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

from .config import load_config
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
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    config = load_config(args.config)
    store = Store(args.state_dir)
    monitor = Monitor(config, store, console_delivery)
    if args.command == "queue":
        print(json.dumps(list(store.events()), indent=2, sort_keys=True))
        return 0
    now = datetime(2026, 9, 2, 12, tzinfo=UTC) if args.command == "demo" else datetime.now(UTC)
    if args.command == "demo":
        fixture_path = Path(__file__).parents[2] / "fixtures" / "rest-pages.json"
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))

        def fixture_getter(url: str, _headers: dict[str, str]) -> dict[str, Any]:
            channel = next(name for name in ("earnings", "news", "concalls") if f"/{name}?" in url)
            return cast(dict[str, Any], fixture[channel])

        rest = RestClient("https://fixture.invalid/v1", "fixture-key", fixture_getter)
    else:
        api_key = os.environ.get("DRISHTI_API_KEY")
        if not api_key:
            raise SystemExit("DRISHTI_API_KEY is required for live-smoke")
        rest = RestClient(
            os.environ.get("DRISHTI_BASE_URL", "https://developers.manasija.in/v1"), api_key
        )
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
            )
            return 0
    accepted = monitor.recover(rest, now)
    print(f"accepted={len(accepted)} queue={sum(1 for _ in store.events())}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
