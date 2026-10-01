from collections.abc import AsyncIterator
from dataclasses import replace
from typing import Any

import pytest
from drishti_sdk import DataEvent, DrishtiWebSocketError, ErrorEvent, SubscribedEvent

from drishti_telegram.bridge import (
    UPGRADE_URL,
    AccountAccessError,
    BridgeError,
    PlanRequiredError,
    forward_events,
    identify_plan,
    validate_account_access,
)
from drishti_telegram.config import PRODUCTS, AppConfig, StreamConfig, TelegramConfig
from drishti_telegram.telegram import TelegramError


class FakeSession:
    def __init__(self, events: list[Any]) -> None:
        self.subscriptions: list[tuple[str, tuple[str, ...], bool]] = []
        self._events = events

    async def subscribe(
        self,
        product: str,
        *,
        symbols: tuple[str, ...],
        detailed: bool,
    ) -> None:
        self.subscriptions.append((product, symbols, detailed))

    async def events(self) -> AsyncIterator[Any]:
        for event in self._events:
            yield event


def make_config() -> AppConfig:
    return AppConfig(
        drishti_api_key="drishti-key",
        telegram=TelegramConfig(bot_token="telegram-token", chat_id="@market-alerts"),
        symbols=("RELIANCE", "TCS"),
        full_feed=False,
        streams={product: StreamConfig() for product in PRODUCTS},
    )


def test_account_preflight_accepts_enabled_configured_streams() -> None:
    config = make_config()
    access = validate_account_access(
        config,
        {
            "data": {
                "status": "active",
                "metadata": {"subscription_plan_name": "Pro"},
                "websocket_addons": [
                    {
                        "product": product.replace("-", "_"),
                        "enabled": True,
                        "tier": "pro_1000",
                    }
                    for product in PRODUCTS
                ],
            }
        },
    )

    assert access.plan == "Pro"
    assert access.enabled_streams["block-deals"] == "pro_1000"


def test_account_preflight_accepts_product_full_market_addon_on_starter() -> None:
    config = make_config()
    config.streams["earnings"] = StreamConfig(full_feed=True)

    access = validate_account_access(
        config,
        {
            "data": {
                "status": "active",
                "metadata": {"subscription_plan_name": "Starter"},
                "websocket_addons": [
                    {
                        "product": product.replace("-", "_"),
                        "enabled": True,
                        "tier": "starter_100",
                    }
                    for product in PRODUCTS
                ],
                "live_entitlement": {
                    "active_symbol_limit": 100,
                    "full_market_products": ["earnings"],
                },
            }
        },
    )

    assert access.plan == "Starter"
    assert access.full_market_streams == frozenset({"earnings"})


def test_account_preflight_rejects_full_feed_for_product_without_entitlement() -> None:
    config = make_config()
    config.streams["earnings"] = StreamConfig(full_feed=True)

    with pytest.raises(AccountAccessError, match="full-market access for: earnings"):
        validate_account_access(
            config,
            {
                "data": {
                    "status": "active",
                    "metadata": {"subscription_plan_name": "Pro"},
                    "websocket_addons": [
                        {
                            "product": product.replace("-", "_"),
                            "enabled": True,
                            "tier": "pro_1000",
                        }
                        for product in PRODUCTS
                    ],
                    "live_entitlement": {"full_market_products": ["announcements"]},
                }
            },
        )


def test_account_preflight_defers_full_feed_check_when_entitlement_field_is_absent() -> None:
    config = make_config()
    config.streams["earnings"] = StreamConfig(full_feed=True)

    access = validate_account_access(
        config,
        {
            "data": {
                "status": "active",
                "metadata": {"subscription_plan_name": "Pro"},
                "websocket_addons": [
                    {
                        "product": product.replace("-", "_"),
                        "enabled": True,
                        "tier": "pro_1000",
                    }
                    for product in PRODUCTS
                ],
            }
        },
    )

    assert access.full_market_streams is None


def test_account_preflight_lists_every_unavailable_configured_stream() -> None:
    config = make_config()
    config.streams["alerts"] = StreamConfig(enabled=False)

    with pytest.raises(AccountAccessError) as raised:
        validate_account_access(
            config,
            {
                "data": {
                    "status": "active",
                    "metadata": {"subscription_plan_name": "Sandbox"},
                    "websocket_addons": [
                        {"product": "alerts", "enabled": True, "tier": "starter_100"}
                    ],
                }
            },
        )

    message = str(raised.value)
    assert "Sandbox" in message
    assert "news, block-deals, announcements, earnings, concalls" in message
    assert "Enabled WebSocket streams: alerts (starter_100)" in message
    assert "config.yaml" in message
    assert UPGRADE_URL in message


def test_account_preflight_rejects_an_inactive_account() -> None:
    with pytest.raises(AccountAccessError, match="status is suspended"):
        validate_account_access(
            make_config(),
            {
                "data": {
                    "status": "suspended",
                    "metadata": {"subscription_plan_name": "Pro"},
                    "websocket_addons": [],
                }
            },
        )


@pytest.mark.asyncio
async def test_identify_plan_subscribes_every_enabled_product() -> None:
    events = [
        SubscribedEvent(
            product=product.replace("-", "_"),
            tier="starter_100",
            symbols=["RELIANCE", "TCS"],
        )
        for product in PRODUCTS
    ]
    session = FakeSession(events)

    plan, remaining_events = await identify_plan(session, make_config(), timeout=1)

    assert plan.name == "Starter"
    assert plan.tier == "starter_100"
    assert [subscription[0] for subscription in session.subscriptions] == [
        product.replace("-", "_") for product in PRODUCTS
    ]
    assert remaining_events is not None


@pytest.mark.asyncio
async def test_identify_plan_prompts_free_accounts_to_upgrade() -> None:
    session = FakeSession([ErrorEvent(message="WebSocket access requires a paid plan", code="403")])

    with pytest.raises(PlanRequiredError, match=UPGRADE_URL):
        await identify_plan(session, make_config(), timeout=1)


@pytest.mark.asyncio
async def test_identify_plan_normalizes_direct_subscription_403() -> None:
    class RejectingSession(FakeSession):
        async def subscribe(
            self,
            product: str,
            *,
            symbols: tuple[str, ...],
            detailed: bool,
        ) -> None:
            raise DrishtiWebSocketError("Forbidden", code="403")

    with pytest.raises(BridgeError, match="add-ons"):
        await identify_plan(RejectingSession([]), make_config(), timeout=1)


@pytest.mark.asyncio
async def test_full_feed_requires_full_feed_acknowledgements() -> None:
    config = replace(make_config(), symbols=(), full_feed=True)
    events = [
        SubscribedEvent(product=product.replace("-", "_"), tier="pro_1000") for product in PRODUCTS
    ]

    with pytest.raises(RuntimeError, match="full-feed"):
        await identify_plan(FakeSession(events), config, timeout=1)


@pytest.mark.asyncio
async def test_product_full_feed_keeps_other_streams_on_the_watchlist() -> None:
    config = make_config()
    config.streams["earnings"] = StreamConfig(full_feed=True)
    events = [
        SubscribedEvent(
            product=product.replace("-", "_"),
            tier="full_market" if product == "earnings" else "starter_100",
            full_feed=product == "earnings",
            symbols=None if product == "earnings" else ["RELIANCE", "TCS"],
        )
        for product in PRODUCTS
    ]
    session = FakeSession(events)

    plan, _ = await identify_plan(session, config, timeout=1)

    subscriptions = {product: symbols for product, symbols, _ in session.subscriptions}
    assert subscriptions["earnings"] == ()
    assert subscriptions["news"] == ("RELIANCE", "TCS")
    assert plan.name == "Mixed"
    assert plan.tier == "full_market, starter_100"


@pytest.mark.asyncio
async def test_product_full_feed_requires_its_own_acknowledgement() -> None:
    config = make_config()
    config.streams["earnings"] = StreamConfig(full_feed=True)
    events = [
        SubscribedEvent(
            product=product.replace("-", "_"),
            tier="starter_100",
            full_feed=False,
            symbols=["RELIANCE", "TCS"],
        )
        for product in PRODUCTS
    ]

    with pytest.raises(BridgeError, match="earnings"):
        await identify_plan(FakeSession(events), config, timeout=1)


@pytest.mark.asyncio
async def test_watchlist_requires_every_symbol_in_each_acknowledgement() -> None:
    events = [
        SubscribedEvent(
            product=product.replace("-", "_"),
            tier="starter_100",
            symbols=["RELIANCE"],
        )
        for product in PRODUCTS
    ]

    with pytest.raises(RuntimeError, match="did not accept the configured watchlist"):
        await identify_plan(FakeSession(events), make_config(), timeout=1)


@pytest.mark.asyncio
async def test_forward_events_batches_projected_notifications_in_order() -> None:
    config = make_config()
    config.streams["alerts"] = StreamConfig(fields=("symbol", "price.value"))
    sent: list[str] = []

    class Notifier:
        async def send(self, text: str) -> None:
            sent.append(text)

    async def events() -> AsyncIterator[Any]:
        yield DataEvent(channel="alerts", data={"symbol": "TCS", "price": {"value": 100}})
        yield DataEvent(
            channel="alerts",
            data={"symbol": "RELIANCE", "price": {"value": 200}},
        )

    async def yield_control(seconds: float) -> None:
        return None

    await forward_events(events(), config, Notifier(), batch_window=1, sleep=yield_control)

    assert sent == [
        "🚨 <b>Market Alert · TCS</b>\n\n"
        "<b>Price:</b> ₹100.00\n\n"
        "──────────\n\n"
        "🚨 <b>Market Alert · RELIANCE</b>\n\n"
        "<b>Price:</b> ₹200.00"
    ]


@pytest.mark.asyncio
async def test_forward_events_discards_a_notification_after_final_send_failure() -> None:
    attempts = 0

    class FailingNotifier:
        async def send(self, text: str) -> None:
            nonlocal attempts
            attempts += 1
            raise TelegramError("failed after retries")

    async def events() -> AsyncIterator[Any]:
        yield DataEvent(channel="alerts", data={"symbol": "TCS"})

    async def no_wait(seconds: float) -> None:
        return None

    await forward_events(events(), make_config(), FailingNotifier(), sleep=no_wait)

    assert attempts == 1
