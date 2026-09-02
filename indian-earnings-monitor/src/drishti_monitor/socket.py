from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from datetime import UTC, datetime
from typing import Any, Protocol

from .config import CHANNELS, Channel, MonitorConfig


class WebSocketEvent(Protocol):
    kind: str


class ManagedSession(Protocol):
    async def __aenter__(self) -> ManagedSession: ...
    async def __aexit__(self, *args: object) -> object: ...
    async def subscribe(
        self, product: Channel, *, symbols: list[str], detailed: bool
    ) -> object: ...
    def events(self) -> AsyncIterator[WebSocketEvent]: ...


class WebSocketClient(Protocol):
    def websocket(self) -> ManagedSession: ...


async def watch_sdk(
    client: WebSocketClient,
    config: MonitorConfig,
    recover: Callable[[], None],
    handle: Callable[[dict[str, Any], str], object],
    on_control: Callable[[str, dict[str, Any]], None] | None = None,
) -> None:
    """Recover once, then consume the official SDK's reconnecting WebSocket session."""
    recover()
    async with client.websocket() as session:
        for channel in CHANNELS:
            symbols = [item.symbol for item in config.coverage if channel in item.channels]
            if symbols:
                await session.subscribe(channel, symbols=symbols, detailed=True)
        async for event in session.events():
            if event.kind == "data":
                event_channel = getattr(event, "channel", None)
                data = getattr(event, "data", None)
                if isinstance(event_channel, str) and isinstance(data, dict):
                    handle(
                        {"channel": event_channel, "data": data},
                        datetime.now(UTC).isoformat(),
                    )
                elif on_control is not None:
                    on_control("invalid_data", _event_details(event))
            elif on_control is not None:
                on_control(event.kind, _event_details(event))


def _event_details(event: WebSocketEvent) -> dict[str, Any]:
    details: dict[str, Any] = {}
    for name in (
        "product",
        "tier",
        "full_feed",
        "symbols",
        "detailed",
        "sent_at",
        "code",
        "message",
    ):
        value = getattr(event, name, None)
        if value is not None:
            details[name] = value
    return details
