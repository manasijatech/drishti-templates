from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast

Channel = Literal["earnings", "news", "concalls"]
CHANNELS: tuple[Channel, ...] = ("earnings", "news", "concalls")


@dataclass(frozen=True)
class Coverage:
    symbol: str
    exchange: str
    owner: str
    priority: str
    channels: tuple[Channel, ...]
    delivery: tuple[str, ...]
    review_sla_minutes: int


@dataclass(frozen=True)
class MonitorConfig:
    coverage: tuple[Coverage, ...]
    recovery_lookback_hours: int = 24
    page_limit: int = 20
    max_delivery_attempts: int = 3


def load_config(path: str | Path) -> MonitorConfig:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(raw.get("coverage"), list) or not raw["coverage"]:
        raise ValueError("coverage must be a non-empty list")
    coverage: list[Coverage] = []
    seen: set[str] = set()
    for item in raw["coverage"]:
        symbol = str(item["symbol"]).strip().upper()
        channels = tuple(item.get("channels", CHANNELS))
        if not symbol or symbol in seen:
            raise ValueError("coverage symbols must be non-empty and unique")
        if not channels or any(channel not in CHANNELS for channel in channels):
            raise ValueError(f"{symbol} has an unsupported channel")
        review_sla_minutes = int(item.get("reviewSlaMinutes", 60))
        if review_sla_minutes <= 0:
            raise ValueError("reviewSlaMinutes must be greater than 0")
        seen.add(symbol)
        coverage.append(
            Coverage(
                symbol=symbol,
                exchange=str(item["exchange"]),
                owner=str(item["owner"]),
                priority=str(item.get("priority", "normal")),
                channels=cast(tuple[Channel, ...], channels),
                delivery=tuple(str(value) for value in item.get("delivery", ["research-queue"])),
                review_sla_minutes=review_sla_minutes,
            )
        )
    page_limit = int(raw.get("pageLimit", 20))
    if not 1 <= page_limit <= 50:
        raise ValueError("pageLimit must be between 1 and 50")
    recovery_lookback_hours = int(raw.get("recoveryLookbackHours", 24))
    if recovery_lookback_hours < 0:
        raise ValueError("recoveryLookbackHours must be greater than or equal to 0")
    max_delivery_attempts = int(raw.get("maxDeliveryAttempts", 3))
    if max_delivery_attempts <= 0:
        raise ValueError("maxDeliveryAttempts must be greater than 0")
    return MonitorConfig(
        tuple(coverage),
        recovery_lookback_hours,
        page_limit,
        max_delivery_attempts,
    )
