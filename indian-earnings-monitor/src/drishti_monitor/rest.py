from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .config import Channel

JsonGetter = Callable[[str, dict[str, str]], dict[str, Any]]


def http_get(url: str, headers: dict[str, str]) -> dict[str, Any]:
    request = Request(url, headers=headers)
    with urlopen(request, timeout=30) as response:  # noqa: S310 - configured trusted base URL
        value = json.load(response)
    if not isinstance(value, dict):
        raise ValueError("Drishti returned a non-object response")
    return value


class RestClient:
    def __init__(self, base_url: str, api_key: str, getter: JsonGetter = http_get) -> None:
        self.base_url = base_url.rstrip("/")
        self.headers = {"X-API-Key": api_key, "Accept": "application/json"}
        self.getter = getter

    def pages(
        self,
        channel: Channel,
        symbols: list[str],
        from_time: str,
        to_time: str,
        limit: int,
    ) -> Iterator[list[dict[str, Any]]]:
        for offset in range(0, len(symbols), 20):
            query: dict[str, str | int] = {
                "symbols": ",".join(symbols[offset : offset + 20]),
                "from": from_time,
                "to": to_time,
                "limit": limit,
            }
            if channel in ("earnings", "concalls"):
                query["detailed"] = "true"
            yield from self._paginated(channel, query)

    def upcoming(
        self, product: str, symbols: list[str], limit: int
    ) -> Iterator[list[dict[str, Any]]]:
        if product not in ("earnings", "concalls"):
            raise ValueError("upcoming product must be earnings or concalls")
        for offset in range(0, len(symbols), 20):
            query: dict[str, str | int] = {
                "symbols": ",".join(symbols[offset : offset + 20]),
                "limit": limit,
            }
            yield from self._paginated(f"{product}/upcoming", query)

    def _paginated(self, path: str, query: dict[str, str | int]) -> Iterator[list[dict[str, Any]]]:
        page = 1
        while True:
            response = self.getter(
                f"{self.base_url}/{path}?{urlencode({**query, 'page': page})}", self.headers
            )
            data = response.get("data")
            if not isinstance(data, list) or any(not isinstance(item, dict) for item in data):
                raise ValueError("Drishti response data must be a list of objects")
            yield data
            if response.get("has_next") is not True:
                return
            page += 1

    def earnings_attachments(self, ids: list[str]) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for offset in range(0, len(ids), 20):
            query = urlencode({"ids": ",".join(ids[offset : offset + 20])})
            response = self.getter(f"{self.base_url}/earnings/attachments?{query}", self.headers)
            data = response.get("data")
            if not isinstance(data, list) or any(not isinstance(item, dict) for item in data):
                raise ValueError("earnings attachment response data must be a list of objects")
            results.extend(data)
        return results

    def concall_artifacts(self, symbol: str, quarter: str) -> dict[str, Any]:
        query = urlencode({"symbol": symbol, "quarter": quarter})
        response = self.getter(
            f"{self.base_url}/concalls/transcript?{query}",
            self.headers,
        )
        allowed = {key: response.get(key) for key in ("transcript_url", "audio_url", "expires_in")}
        return {key: value for key, value in allowed.items() if value is not None}
