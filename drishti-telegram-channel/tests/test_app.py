from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import pytest
from drishti_sdk import DataEvent, SubscribedEvent

from drishti_telegram.app import check, run
from drishti_telegram.config import PRODUCTS, AppConfig, StreamConfig, TelegramConfig


class FakeSession:
    def __init__(self, *, include_data: bool = False) -> None:
        self._include_data = include_data

    async def subscribe(
        self,
        product: str,
        *,
        symbols: tuple[str, ...],
        detailed: bool,
    ) -> None:
        return None

    async def events(self) -> AsyncIterator[Any]:
        for product in PRODUCTS:
            yield SubscribedEvent(
                product=product.replace("-", "_"),
                tier="pro_1000",
                symbols=["RELIANCE"],
            )
        if self._include_data:
            yield DataEvent(
                channel="alerts",
                data={"symbol": "RELIANCE", "type": "price_alert"},
            )


class FakeTelegram:
    def __init__(self) -> None:
        self.checked = False
        self.sent: list[str] = []

    async def check(self) -> None:
        self.checked = True

    async def send(self, text: str) -> None:
        self.sent.append(text)


@pytest.mark.asyncio
async def test_check_validates_telegram_and_reports_websocket_plan() -> None:
    config = AppConfig(
        drishti_api_key="drishti-key",
        telegram=TelegramConfig(bot_token="telegram-token", chat_id="@market-alerts"),
        symbols=("RELIANCE",),
        full_feed=False,
        streams={product: StreamConfig() for product in PRODUCTS},
    )
    telegram = FakeTelegram()

    @asynccontextmanager
    async def session_context() -> AsyncIterator[FakeSession]:
        yield FakeSession()

    plan = await check(config, telegram, session_context, timeout=1)

    assert telegram.checked is True
    assert plan.name == "Pro"


@pytest.mark.asyncio
async def test_run_forwards_events_after_all_subscriptions_are_acknowledged() -> None:
    config = AppConfig(
        drishti_api_key="drishti-key",
        telegram=TelegramConfig(bot_token="telegram-token", chat_id="@market-alerts"),
        symbols=("RELIANCE",),
        full_feed=False,
        streams={product: StreamConfig() for product in PRODUCTS},
    )
    telegram = FakeTelegram()

    @asynccontextmanager
    async def session_context() -> AsyncIterator[FakeSession]:
        yield FakeSession(include_data=True)

    plan = await run(config, telegram, session_context, timeout=1, batch_window=0)

    assert plan.name == "Pro"
    assert len(telegram.sent) == 1
    assert telegram.sent[0].startswith("🚨 <b>Market Alert · RELIANCE</b>")
