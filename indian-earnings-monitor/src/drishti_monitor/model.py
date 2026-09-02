from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

from .config import Channel

ReviewState = Literal["unreviewed", "assigned", "reviewed"]


@dataclass
class ResearchEvent:
    provider_id: str
    channel: Channel
    symbol: str
    company: str | None
    source_time: str
    received_time: str
    source_url: str | None
    audio_url: str | None = None
    review_state: ReviewState = "unreviewed"
    quarter: str | None = None
    headline: str | None = None
    source_content: str | None = None
    generated_summary: str | None = None
    amendment_of: str | None = None
    related_identities: list[str] = field(default_factory=list)
    owner: str | None = None
    priority: str = "normal"
    review_deadline: str | None = None
    notes: list[str] = field(default_factory=list)
    delivery_attempts: int = 0
    delivery_state: Literal["pending", "delivered", "retry", "failed"] = "pending"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def normalize(channel: Channel, payload: dict[str, Any], received_time: str) -> ResearchEvent:
    raw_provider_id = payload.get("id")
    raw_symbol = payload.get("symbol")
    raw_source_time = payload.get("date")
    if not (
        isinstance(raw_provider_id, str)
        and raw_provider_id
        and isinstance(raw_symbol, str)
        and raw_symbol
        and isinstance(raw_source_time, str)
        and raw_source_time
    ):
        raise ValueError(f"invalid {channel} payload: id, symbol, and date are required")
    company_value = payload.get("company_name") if channel == "earnings" else payload.get("company")
    url_value = payload.get("link") if channel == "news" else None
    if channel == "concalls":
        url_value = payload.get("transcript_url")
    headline_value = payload.get("title") if channel == "news" else payload.get("summary")
    source_content = payload.get("summary") if isinstance(payload.get("summary"), str) else None
    return ResearchEvent(
        provider_id=raw_provider_id,
        channel=channel,
        symbol=raw_symbol.upper(),
        company=company_value if isinstance(company_value, str) else None,
        source_time=raw_source_time,
        received_time=received_time,
        source_url=url_value if isinstance(url_value, str) else None,
        audio_url=payload.get("audio_url") if isinstance(payload.get("audio_url"), str) else None,
        quarter=payload.get("quarter") if isinstance(payload.get("quarter"), str) else None,
        headline=headline_value if isinstance(headline_value, str) else None,
        source_content=source_content,
    )
