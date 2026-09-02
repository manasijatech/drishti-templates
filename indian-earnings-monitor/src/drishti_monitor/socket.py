from __future__ import annotations

import json
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, Protocol

import websocket

from .config import CHANNELS, Channel, MonitorConfig


class Socket(Protocol):
    def send(self, payload: str) -> object: ...


class RawSubscriptionSession:
    """Tracks independent raw-socket subscriptions and replays them after reconnect."""

    def __init__(self, config: MonitorConfig) -> None:
        self.subscriptions: dict[Channel, dict[str, Any]] = {}
        for channel in CHANNELS:
            symbols = [item.symbol for item in config.coverage if channel in item.channels]
            if symbols:
                self.subscriptions[channel] = {
                    "op": "subscribe",
                    "product": channel,
                    "symbols": symbols,
                    "detailed": True,
                }

    def subscribe_all(self, socket: Socket) -> None:
        for channel in CHANNELS:
            if channel in self.subscriptions:
                socket.send(json.dumps(self.subscriptions[channel], separators=(",", ":")))

    def reconnect(self, recover: Callable[[], None], socket: Socket) -> None:
        recover()
        self.subscribe_all(socket)


def decode_envelope(message: str) -> dict[str, Any]:
    value = json.loads(message)
    if not isinstance(value, dict):
        raise ValueError("WebSocket message must be an object")
    return value


def watch_raw_socket(
    url: str,
    api_key: str,
    session: RawSubscriptionSession,
    recover: Callable[[], None],
    handle: Callable[[dict[str, Any], str], object],
    reconnect_delay_seconds: float = 1.0,
) -> None:
    """Run a raw client forever; REST recovery always precedes subscription replay."""
    while True:
        socket: websocket.WebSocket | None = None
        try:
            recover()
            socket = websocket.create_connection(
                url, header=[f"X-API-Key: {api_key}"], timeout=60, enable_multithread=False
            )
            session.subscribe_all(socket)
            while True:
                message = socket.recv()
                if not isinstance(message, str):
                    continue
                handle(decode_envelope(message), datetime.now(UTC).isoformat())
        except (OSError, websocket.WebSocketException, ValueError):
            time.sleep(reconnect_delay_seconds)
        finally:
            if socket is not None:
                socket.close()
