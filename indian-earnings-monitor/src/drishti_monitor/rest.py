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
        page = 1
        while True:
            query: dict[str, str | int] = {
                "symbols": ",".join(symbols),
                "from": from_time,
                "to": to_time,
                "page": page,
                "limit": limit,
            }
            if channel in ("earnings", "concalls"):
                query["detailed"] = "true"
            response = self.getter(f"{self.base_url}/{channel}?{urlencode(query)}", self.headers)
            data = response.get("data")
            if not isinstance(data, list) or any(not isinstance(item, dict) for item in data):
                raise ValueError("Drishti response data must be a list of objects")
            yield data
            if response.get("has_next") is not True:
                break
            page += 1
