from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from typing import Protocol

from drishti_telegram.bridge import (
    AccountPlan,
    WebSocketSession,
    forward_events,
    identify_plan,
)
from drishti_telegram.config import AppConfig


class TelegramChecker(Protocol):
    async def check(self) -> None: ...


class TelegramNotifier(TelegramChecker, Protocol):
    async def send(self, text: str) -> None: ...


SessionContext = Callable[[], AbstractAsyncContextManager[WebSocketSession]]


async def check(
    config: AppConfig,
    telegram: TelegramChecker,
    session_context: SessionContext,
    *,
    timeout: float = 20.0,
) -> AccountPlan:
    await telegram.check()
    async with session_context() as session:
        plan, _ = await identify_plan(session, config, timeout=timeout)
        return plan


async def run(
    config: AppConfig,
    telegram: TelegramNotifier,
    session_context: SessionContext,
    *,
    timeout: float = 20.0,
    batch_window: float = 1.0,
    on_ready: Callable[[AccountPlan], None] | None = None,
) -> AccountPlan:
    await telegram.check()
    async with session_context() as session:
        plan, events = await identify_plan(session, config, timeout=timeout)
        if on_ready is not None:
            on_ready(plan)
        await forward_events(events, config, telegram, batch_window=batch_window)
        return plan
