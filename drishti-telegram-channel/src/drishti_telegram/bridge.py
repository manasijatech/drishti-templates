from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Any, Protocol

from drishti_sdk import DataEvent, DrishtiWebSocketError, ErrorEvent, SubscribedEvent

from drishti_telegram.config import PRODUCTS, AppConfig
from drishti_telegram.formatting import build_notification_batches, format_event

UPGRADE_URL = "https://platform.manasija.in/developer-portal"
logger = logging.getLogger(__name__)


class BridgeError(RuntimeError):
    """The Drishti stream could not be started safely."""


class PlanRequiredError(BridgeError):
    """The API key does not have paid WebSocket access."""


class AccountAccessError(BridgeError):
    """The account cannot use the configured stream products."""


class NotificationError(RuntimeError):
    """A notification could not be delivered after its configured retries."""


class WebSocketSession(Protocol):
    async def subscribe(
        self,
        product: str,
        *,
        symbols: tuple[str, ...],
        detailed: bool,
    ) -> None: ...

    def events(self) -> AsyncIterator[Any]: ...


class Notifier(Protocol):
    async def send(self, text: str) -> None: ...


@dataclass(frozen=True)
class AccountPlan:
    name: str
    tier: str


@dataclass(frozen=True)
class AccountAccess:
    plan: str
    enabled_streams: dict[str, str]


def validate_account_access(
    config: AppConfig,
    response: Mapping[str, Any],
) -> AccountAccess:
    account = response.get("data")
    if not isinstance(account, Mapping):
        raise AccountAccessError("Drishti returned an invalid account profile")

    status = str(account.get("status") or "unknown").strip().lower()
    if status != "active":
        raise AccountAccessError(
            f"Drishti account status is {status}. Restore account access at {UPGRADE_URL}"
        )

    metadata = account.get("metadata")
    if not isinstance(metadata, Mapping):
        metadata = {}
    plan = str(
        metadata.get("subscription_plan_name") or metadata.get("subscription_plan_id") or "Unknown"
    ).strip()

    raw_addons = account.get("websocket_addons")
    if not isinstance(raw_addons, list):
        raise AccountAccessError("Drishti returned invalid WebSocket entitlement details")
    enabled_streams: dict[str, str] = {}
    for addon in raw_addons:
        if not isinstance(addon, Mapping) or addon.get("enabled") is False:
            continue
        product = _config_product_name(addon.get("product"))
        if product not in PRODUCTS:
            continue
        enabled_streams[product] = str(addon.get("tier") or "enabled")

    configured = [product for product in PRODUCTS if config.streams[product].enabled]
    unavailable = [product for product in configured if product not in enabled_streams]
    if unavailable:
        missing_text = ", ".join(unavailable)
        enabled_text = (
            ", ".join(
                f"{product} ({enabled_streams[product]})"
                for product in PRODUCTS
                if product in enabled_streams
            )
            or "none"
        )
        raise AccountAccessError(
            f"Drishti account plan {plan} does not enable the configured WebSocket streams: "
            f"{missing_text}. Enabled WebSocket streams: {enabled_text}. Disable unavailable "
            f"streams in config.yaml or manage add-ons at {UPGRADE_URL}"
        )

    return AccountAccess(plan=plan, enabled_streams=enabled_streams)


def _plan_name(tier: str) -> str:
    normalized = tier.lower()
    for name in ("starter", "pro", "scale"):
        if name in normalized:
            return name.title()
    return tier or "Paid"


def _sdk_product_name(product: str) -> str:
    return "block_deals" if product == "block-deals" else product


def _config_product_name(product: object) -> str:
    value = str(product)
    return "block-deals" if value == "block_deals" else value


def _raise_subscription_error(message: str, code: str | None = None) -> None:
    if code == "403" or "paid plan" in message.lower():
        raise PlanRequiredError(
            f"Drishti WebSocket access requires a paid plan. Upgrade at {UPGRADE_URL}"
        )
    raise BridgeError(f"Drishti subscription failed: {message}")


async def _prepend(
    buffered: list[Any],
    events: AsyncIterator[Any],
) -> AsyncIterator[Any]:
    for event in buffered:
        yield event
    async for event in events:
        yield event


async def identify_plan(
    session: WebSocketSession,
    config: AppConfig,
    *,
    timeout: float = 20.0,
) -> tuple[AccountPlan, AsyncIterator[Any]]:
    enabled = {
        _sdk_product_name(product): stream
        for product, stream in config.streams.items()
        if stream.enabled
    }
    for product, stream in enabled.items():
        try:
            await session.subscribe(
                product,
                symbols=() if config.full_feed else config.symbols,
                detailed=stream.detailed,
            )
        except DrishtiWebSocketError as exc:
            _raise_subscription_error(str(exc), exc.code)

    pending = set(enabled)
    tiers: set[str] = set()
    buffered: list[Any] = []
    events = session.events()
    deadline = asyncio.get_running_loop().time() + timeout
    while pending:
        remaining = deadline - asyncio.get_running_loop().time()
        if remaining <= 0:
            raise TimeoutError("Timed out waiting for Drishti subscription acknowledgements")
        event = await asyncio.wait_for(anext(events), timeout=remaining)
        if isinstance(event, SubscribedEvent) and event.product in pending:
            if config.full_feed and not event.full_feed:
                raise BridgeError(f"Drishti did not grant full-feed access for {event.product}")
            if not config.full_feed and set(event.symbols or ()) != set(config.symbols):
                raise BridgeError(
                    f"Drishti did not accept the configured watchlist for {event.product}"
                )
            pending.remove(event.product)
            tiers.add(event.tier)
        elif isinstance(event, ErrorEvent):
            _raise_subscription_error(event.message, event.code)
        elif isinstance(event, DataEvent):
            buffered.append(event)

    tier = next(iter(tiers), "")
    return AccountPlan(name=_plan_name(tier), tier=tier), _prepend(buffered, events)


async def forward_events(
    events: AsyncIterator[Any],
    config: AppConfig,
    notifier: Notifier,
    *,
    batch_window: float = 1.0,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> None:
    queue: asyncio.Queue[Any | None] = asyncio.Queue()

    async def produce() -> None:
        try:
            async for event in events:
                if isinstance(event, (DataEvent, ErrorEvent)):
                    await queue.put(event)
                    if isinstance(event, ErrorEvent):
                        return
        finally:
            await queue.put(None)

    async def consume() -> None:
        while True:
            first = await queue.get()
            if first is None:
                return
            if isinstance(first, ErrorEvent):
                raise BridgeError(f"Drishti WebSocket error: {first.message}")

            received = [first]
            reached_end = False
            await sleep(batch_window)
            while True:
                try:
                    event = queue.get_nowait()
                except asyncio.QueueEmpty:
                    break
                if event is None:
                    reached_end = True
                    break
                if isinstance(event, ErrorEvent):
                    raise BridgeError(f"Drishti WebSocket error: {event.message}")
                received.append(event)

            messages: list[str] = []
            for event in received:
                product = _config_product_name(event.channel)
                stream = config.streams.get(product)
                if stream is None or not stream.enabled:
                    continue
                messages.append(format_event(product, event.data, fields=stream.fields))
            for message in build_notification_batches(messages):
                try:
                    await notifier.send(message)
                except NotificationError as exc:
                    logger.error("Discarding Telegram notification: %s", exc)
            if reached_end:
                return

    producer = asyncio.create_task(produce())
    consumer = asyncio.create_task(consume())
    done, pending = await asyncio.wait(
        {producer, consumer},
        return_when=asyncio.FIRST_EXCEPTION,
    )
    for task in pending:
        task.cancel()
    for task in pending:
        with contextlib.suppress(asyncio.CancelledError):
            await task
    for task in done:
        task.result()
