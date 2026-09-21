from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from drishti_telegram.bridge import NotificationError


class TelegramError(NotificationError):
    """A Telegram Bot API operation failed."""


class TelegramClient:
    def __init__(
        self,
        *,
        bot_token: str,
        chat_id: str,
        http: httpx.AsyncClient,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        clock: Callable[[], float] = time.monotonic,
        max_retries: int = 5,
        minimum_interval: float = 1.0,
    ) -> None:
        self._base_url = f"https://api.telegram.org/bot{bot_token}"
        self._chat_id = chat_id
        self._http = http
        self._sleep = sleep
        self._clock = clock
        self._max_retries = max_retries
        self._minimum_interval = minimum_interval
        self._last_sent_at: float | None = None

    async def check(self) -> None:
        try:
            identity_response = await self._http.post(f"{self._base_url}/getMe")
            identity = _response_payload(identity_response)
            bot = identity.get("result")
            if identity.get("ok") is not True or not isinstance(bot, dict):
                raise TelegramError(str(identity.get("description") or "invalid bot token"))
            bot_id = bot.get("id")

            destination_response = await self._http.post(
                f"{self._base_url}/getChat",
                json={"chat_id": self._chat_id},
            )
            destination = _response_payload(destination_response)
            chat = destination.get("result")
            if destination.get("ok") is not True or not isinstance(chat, dict):
                description = str(destination.get("description") or "destination unavailable")
                raise TelegramError(f"Telegram destination check failed: {description}")
            if chat.get("type") == "private":
                return

            membership_response = await self._http.post(
                f"{self._base_url}/getChatMember",
                json={"chat_id": self._chat_id, "user_id": bot_id},
            )
            membership = _response_payload(membership_response)
        except httpx.HTTPError as exc:
            raise TelegramError("Could not reach Telegram") from exc

        member = membership.get("result")
        if membership.get("ok") is not True or not isinstance(member, dict):
            description = str(membership.get("description") or "channel access denied")
            raise TelegramError(f"Telegram channel check failed: {description}")
        status = member.get("status")
        can_post = status == "creator" or (
            status == "administrator" and member.get("can_post_messages") is True
        )
        if not can_post:
            raise TelegramError(
                "Telegram bot must be a channel administrator that can post messages"
            )

    async def send(self, text: str) -> None:
        attempts = self._max_retries + 1
        for attempt in range(1, attempts + 1):
            await self._pace()
            try:
                response = await self._http.post(
                    f"{self._base_url}/sendMessage",
                    json={
                        "chat_id": self._chat_id,
                        "text": text,
                        "parse_mode": "HTML",
                        "link_preview_options": {"is_disabled": True},
                    },
                )
                payload = _response_payload(response)
            except (httpx.HTTPError, TelegramError) as exc:
                if attempt == attempts:
                    raise TelegramError(f"Telegram send failed after {attempt} attempts") from exc
                await self._sleep(2 ** (attempt - 1))
                continue

            if response.status_code == 429:
                retry_after = _retry_after(payload) or float(2 ** (attempt - 1))
                if attempt == attempts:
                    raise TelegramError(f"Telegram rate limit persisted after {attempts} attempts")
                await self._sleep(retry_after)
                continue
            if response.is_success and payload.get("ok") is True:
                self._last_sent_at = self._clock()
                return
            if attempt == attempts:
                description = str(payload.get("description") or "unknown error")
                raise TelegramError(f"Telegram send failed after {attempt} attempts: {description}")
            await self._sleep(2 ** (attempt - 1))

    async def _pace(self) -> None:
        if self._last_sent_at is None:
            return
        remaining = self._minimum_interval - (self._clock() - self._last_sent_at)
        if remaining > 0:
            await self._sleep(remaining)


def _response_payload(response: httpx.Response) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError as exc:
        raise TelegramError("Telegram returned an invalid response") from exc
    if not isinstance(payload, dict):
        raise TelegramError("Telegram returned an invalid response")
    return payload


def _retry_after(payload: dict[str, Any]) -> float | None:
    parameters = payload.get("parameters")
    if not isinstance(parameters, dict):
        return None
    value = parameters.get("retry_after")
    if isinstance(value, (int, float)) and value >= 0:
        return float(value)
    return None
