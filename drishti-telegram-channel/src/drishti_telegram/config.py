from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

import yaml
from dotenv import dotenv_values

PRODUCTS = (
    "news",
    "block-deals",
    "announcements",
    "earnings",
    "concalls",
    "alerts",
)
DEFAULT_FIELDS = {product: ("*",) for product in PRODUCTS}
SECRET_KEYS = {"drishti_api_key", "telegram_bot_token", "telegram_chat_id"}


@dataclass(frozen=True)
class StreamConfig:
    enabled: bool = True
    detailed: bool = True
    fields: tuple[str, ...] = ("*",)


@dataclass(frozen=True)
class TelegramConfig:
    bot_token: str
    chat_id: str


@dataclass(frozen=True)
class AppConfig:
    drishti_api_key: str
    telegram: TelegramConfig
    symbols: tuple[str, ...]
    full_feed: bool
    streams: dict[str, StreamConfig]


def _required_environment(environ: Mapping[str, str], name: str) -> str:
    value = environ.get(name, "").strip()
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def _boolean(value: object, *, name: str, default: bool) -> bool:
    if value is None:
        return default
    if not isinstance(value, bool):
        raise ValueError(f"{name} must be true or false")
    return value


def load_config(path: Path, *, environ: Mapping[str, str]) -> AppConfig:
    loaded = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(loaded, dict):
        raise ValueError("Configuration must be a YAML mapping")
    if SECRET_KEYS.intersection(loaded):
        raise ValueError("Credentials must be supplied through environment variables only")

    raw_symbols = loaded.get("symbols", [])
    if not isinstance(raw_symbols, list):
        raise ValueError("symbols must be a YAML list")
    symbols = tuple(
        dict.fromkeys(
            normalized for symbol in raw_symbols if (normalized := str(symbol).strip().upper())
        )
    )
    full_feed = _boolean(loaded.get("full_feed"), name="full_feed", default=False)
    if not symbols and not full_feed:
        raise ValueError("Set at least one symbol or explicitly set full_feed: true")
    raw_streams = loaded.get("streams", {})
    if not isinstance(raw_streams, dict):
        raise ValueError("streams must be a YAML mapping")
    unknown_streams = set(raw_streams).difference(PRODUCTS)
    if unknown_streams:
        names = ", ".join(sorted(str(name) for name in unknown_streams))
        raise ValueError(f"Unknown stream product: {names}")
    streams: dict[str, StreamConfig] = {}
    for product in PRODUCTS:
        raw_stream = raw_streams.get(product, {})
        if not isinstance(raw_stream, dict):
            raise ValueError(f"streams.{product} must be a YAML mapping")
        raw_fields = raw_stream.get("fields", DEFAULT_FIELDS[product])
        if not isinstance(raw_fields, (list, tuple)) or not all(
            isinstance(field, str) and field.strip() for field in raw_fields
        ):
            raise ValueError(f"streams.{product}.fields must be a list of field names")
        streams[product] = StreamConfig(
            enabled=_boolean(
                raw_stream.get("enabled"),
                name=f"streams.{product}.enabled",
                default=True,
            ),
            detailed=_boolean(
                raw_stream.get("detailed"),
                name=f"streams.{product}.detailed",
                default=True,
            ),
            fields=tuple(field.strip() for field in raw_fields),
        )
    if not any(stream.enabled for stream in streams.values()):
        raise ValueError("Enable at least one stream product")

    dotenv_environment = {
        name: value
        for name, value in dotenv_values(path.parent / ".env").items()
        if value is not None
    }
    effective_environment = {**dotenv_environment, **environ}

    return AppConfig(
        drishti_api_key=_required_environment(effective_environment, "DRISHTI_API_KEY"),
        telegram=TelegramConfig(
            bot_token=_required_environment(effective_environment, "TELEGRAM_BOT_TOKEN"),
            chat_id=_required_environment(effective_environment, "TELEGRAM_CHAT_ID"),
        ),
        symbols=symbols,
        full_feed=full_feed,
        streams=streams,
    )
