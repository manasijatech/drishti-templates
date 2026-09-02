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

    def recv(self) -> object: ...

    def close(self) -> object: ...


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


def decode_envelope(message: str) -> dict[str, Any]:
    value = json.loads(message)
    if not isinstance(value, dict):
        raise ValueError("WebSocket message must be an object")
    return value


def run_socket(
    session: RawSubscriptionSession,
    recover: Callable[[], None],
    handle: Callable[[dict[str, Any], str], object],
    connect: Callable[[], Socket],
    sleeper: Callable[[float], None] = time.sleep,
    on_control: Callable[[dict[str, Any]], None] | None = None,
    reconnect_delay_seconds: float = 1.0,
    max_connections: int | None = None,
) -> None:
    """Run the production recovery/subscription loop with injectable I/O for deterministic tests."""
    connection_count = 0
    while max_connections is None or connection_count < max_connections:
        socket: Socket | None = None
        connection_count += 1
        try:
            recover()
            socket = connect()
            session.subscribe_all(socket)
            while True:
                message = socket.recv()
                if not isinstance(message, str):
                    continue
                envelope = decode_envelope(message)
                if envelope.get("status") == "subscribed":
                    if on_control is not None:
                        on_control(envelope)
                    continue
                handle(envelope, datetime.now(UTC).isoformat())
        except (OSError, websocket.WebSocketException, ValueError):
            if max_connections is None or connection_count < max_connections:
                sleeper(reconnect_delay_seconds)
        finally:
            if socket is not None:
                socket.close()


def watch_raw_socket(
    url: str,
    api_key: str,
    session: RawSubscriptionSession,
    recover: Callable[[], None],
    handle: Callable[[dict[str, Any], str], object],
    on_control: Callable[[dict[str, Any]], None] | None = None,
    reconnect_delay_seconds: float = 1.0,
) -> None:
    """Run a raw client forever; REST recovery always precedes subscription replay."""

    def connect() -> Socket:
        return websocket.create_connection(
            url, header=[f"X-API-Key: {api_key}"], timeout=60, enable_multithread=False
        )

    run_socket(
        session,
        recover,
        handle,
        connect,
        on_control=on_control,
        reconnect_delay_seconds=reconnect_delay_seconds,
    )
