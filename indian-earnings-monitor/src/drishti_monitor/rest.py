from __future__ import annotations

from collections.abc import Callable, Iterator, Mapping
from typing import Any, Protocol, cast

from drishti_sdk import DrishtiClient

from .config import Channel


class SdkClient(Protocol):
    def get_earnings(self, **kwargs: Any) -> object: ...
    def get_news(self, **kwargs: Any) -> object: ...
    def get_concalls(self, **kwargs: Any) -> object: ...
    def get_upcoming_earnings(self, **kwargs: Any) -> object: ...
    def get_upcoming_concalls(self, **kwargs: Any) -> object: ...
    def get_earnings_attachments(self, **kwargs: Any) -> object: ...
    def get_concalls_transcript(self, **kwargs: Any) -> object: ...


def create_sdk_client(api_key: str, base_url: str | None = None) -> DrishtiClient:
    """Construct the official client at the sole production transport boundary."""
    return DrishtiClient(api_key=api_key, base_url=base_url)


class RestClient:
    def __init__(self, client: SdkClient) -> None:
        self.client = client

    def pages(
        self,
        channel: Channel,
        symbols: list[str],
        from_time: str,
        to_time: str,
        limit: int,
    ) -> Iterator[list[dict[str, Any]]]:
        methods: dict[Channel, Callable[..., object]] = {
            "earnings": self.client.get_earnings,
            "news": self.client.get_news,
            "concalls": self.client.get_concalls,
        }
        for symbol_chunk in _chunks(symbols):
            query: dict[str, Any] = {
                "symbols": symbol_chunk,
                "from_": from_time,
                "to": to_time,
                "limit": limit,
            }
            if channel in ("earnings", "concalls"):
                query["detailed"] = True
            yield from self._paginated(methods[channel], query)

    def upcoming(
        self, product: str, symbols: list[str], limit: int
    ) -> Iterator[list[dict[str, Any]]]:
        methods: dict[str, Callable[..., object]] = {
            "earnings": self.client.get_upcoming_earnings,
            "concalls": self.client.get_upcoming_concalls,
        }
        if product not in methods:
            raise ValueError("upcoming product must be earnings or concalls")
        for symbol_chunk in _chunks(symbols):
            query: dict[str, Any] = {"symbols": symbol_chunk, "limit": limit}
            if product == "concalls":
                query["detailed"] = True
            yield from self._paginated(methods[product], query)

    def _paginated(
        self, method: Callable[..., object], query: dict[str, Any]
    ) -> Iterator[list[dict[str, Any]]]:
        page = 1
        while True:
            response = _object_response(method(**query, page=page), "Drishti")
            yield _data_rows(response, "Drishti")
            if response.get("has_next") is not True:
                return
            page += 1

    def earnings_attachments(self, ids: list[str]) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for id_chunk in _chunks(ids):
            response = _object_response(
                self.client.get_earnings_attachments(ids=id_chunk), "earnings attachment"
            )
            results.extend(_data_rows(response, "earnings attachment"))
        return results

    def concall_artifacts(self, symbol: str, quarter: str) -> dict[str, Any]:
        response = _object_response(
            self.client.get_concalls_transcript(symbol=symbol, quarter=quarter),
            "concall artifact",
        )
        allowed = {key: response.get(key) for key in ("transcript_url", "audio_url", "expires_in")}
        return {key: value for key, value in allowed.items() if value is not None}


def _chunks(values: list[str]) -> Iterator[list[str]]:
    for offset in range(0, len(values), 20):
        yield values[offset : offset + 20]


def _object_response(value: object, label: str) -> Mapping[str, object]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} returned a non-object response")
    return cast(dict[str, object], value)


def _data_rows(response: Mapping[str, object], label: str) -> list[dict[str, Any]]:
    data = response.get("data")
    if not isinstance(data, list) or any(not isinstance(item, dict) for item in data):
        raise ValueError(f"{label} response data must be a list of objects")
    return cast(list[dict[str, Any]], data)
