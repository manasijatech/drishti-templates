from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, cast

import httpx
from drishti_sdk import DrishtiApiError, DrishtiClient

from drishti_telegram.bridge import BridgeError, WebSocketSession


async def drishti_account(api_key: str) -> dict[str, Any]:
    def load() -> dict[str, Any]:
        with DrishtiClient(api_key=api_key) as client:
            return cast(dict[str, Any], client.get_account())

    try:
        return await asyncio.to_thread(load)
    except DrishtiApiError as exc:
        if exc.status_code in (401, 403):
            raise BridgeError(
                "Drishti account check failed: the API key is invalid or unauthorized"
            ) from exc
        raise BridgeError(f"Drishti account check failed with HTTP {exc.status_code}") from exc
    except httpx.HTTPError as exc:
        raise BridgeError("Could not reach Drishti for the account check") from exc


@asynccontextmanager
async def drishti_session(api_key: str) -> AsyncIterator[WebSocketSession]:
    client = DrishtiClient(api_key=api_key)
    try:
        async with client.websocket(subscribe_max_attempts=1) as session:
            yield cast(WebSocketSession, session)
    finally:
        client.close()
