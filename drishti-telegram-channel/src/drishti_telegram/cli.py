from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from collections.abc import Mapping, Sequence
from contextlib import AbstractAsyncContextManager
from pathlib import Path
from typing import TextIO

import httpx
from drishti_sdk import DrishtiWebSocketError

from drishti_telegram.app import check, run
from drishti_telegram.bridge import (
    UPGRADE_URL,
    AccountPlan,
    BridgeError,
    PlanRequiredError,
    WebSocketSession,
    validate_account_access,
)
from drishti_telegram.chat_id import find_chat_ids
from drishti_telegram.config import AppConfig, load_config
from drishti_telegram.runtime import drishti_account, drishti_session
from drishti_telegram.telegram import TelegramClient, TelegramError


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="drishti-telegram",
        description="Forward Drishti WebSocket events to a private Telegram chat or channel.",
    )
    parser.add_argument("--config", type=Path, default=Path("config.yaml"))
    parser.add_argument("command", choices=("chat-id", "check", "run"))
    return parser


def _configure_logging(stderr: TextIO, *, show_lifecycle: bool) -> None:
    logging.basicConfig(
        level=logging.WARNING,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=stderr,
    )
    if show_lifecycle:
        logging.getLogger("drishti_sdk").setLevel(logging.INFO)


def main(
    argv: Sequence[str] | None = None,
    *,
    environ: Mapping[str, str] | None = None,
    stdout: TextIO = sys.stdout,
    stderr: TextIO = sys.stderr,
) -> int:
    args = _parser().parse_args(argv)
    environment = os.environ if environ is None else environ
    if args.command == "chat-id":
        return find_chat_ids(
            args.config.parent / ".env",
            environ=environment,
            stdout=stdout,
            stderr=stderr,
        )
    try:
        config = load_config(args.config, environ=environment)
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=stderr)
        return 2
    _configure_logging(stderr, show_lifecycle=args.command == "run")
    try:
        return asyncio.run(_execute(args.command, config, stdout=stdout))
    except PlanRequiredError as exc:
        print(f"error: {exc}", file=stderr)
    except TimeoutError:
        print(
            "error: Drishti did not acknowledge the subscriptions. Check the API key and "
            f"network connection. Sandbox/free plans must upgrade at {UPGRADE_URL}",
            file=stderr,
        )
    except (BridgeError, DrishtiWebSocketError, TelegramError) as exc:
        print(f"error: {exc}", file=stderr)
    except KeyboardInterrupt:
        print("Stopped.", file=stderr)
        return 130
    return 1


async def _execute(command: str, config: AppConfig, *, stdout: TextIO) -> int:
    account_access = validate_account_access(
        config,
        await drishti_account(config.drishti_api_key),
    )
    async with httpx.AsyncClient(timeout=15.0) as http:
        telegram = TelegramClient(
            bot_token=config.telegram.bot_token,
            chat_id=config.telegram.chat_id,
            http=http,
        )

        def session_context() -> AbstractAsyncContextManager[WebSocketSession]:
            return drishti_session(config.drishti_api_key)

        if command == "check":
            plan = await check(config, telegram, session_context)
            print(
                f"OK: Telegram destination access; Drishti account: {account_access.plan}; "
                f"configured WebSocket streams available; acknowledged tier: {plan.tier}",
                file=stdout,
            )
            return 0

        def ready(plan: AccountPlan) -> None:
            print(
                f"Connected: Drishti account {account_access.plan}; WebSocket tier {plan.tier}",
                file=stdout,
            )

        await run(config, telegram, session_context, on_ready=ready)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
