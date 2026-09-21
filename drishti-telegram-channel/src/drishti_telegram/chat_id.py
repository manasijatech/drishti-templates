from __future__ import annotations

import os
import sys
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any, TextIO

import httpx
from dotenv import dotenv_values

FetchUpdates = Callable[[str], Mapping[str, Any]]


def _fetch_updates(token: str) -> Mapping[str, Any]:
    response = httpx.get(
        f"https://api.telegram.org/bot{token}/getUpdates",
        timeout=15,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, Mapping):
        raise ValueError("Telegram returned an invalid response")
    return payload


def _private_chats(payload: Mapping[str, Any]) -> list[tuple[str, str]]:
    results = payload.get("result")
    if not isinstance(results, list):
        return []

    chats: list[tuple[str, str]] = []
    seen: set[str] = set()
    for update in results:
        if not isinstance(update, Mapping):
            continue
        message = update.get("message") or update.get("edited_message")
        if not isinstance(message, Mapping):
            continue
        chat = message.get("chat")
        if not isinstance(chat, Mapping) or chat.get("type") != "private":
            continue
        chat_id = chat.get("id")
        if not isinstance(chat_id, (int, str)):
            continue
        chat_id_text = str(chat_id)
        if chat_id_text in seen:
            continue
        seen.add(chat_id_text)

        username = chat.get("username")
        if isinstance(username, str) and username:
            identity = f"username=@{username}"
        else:
            name = " ".join(
                value
                for key in ("first_name", "last_name")
                if isinstance((value := chat.get(key)), str) and value
            )
            identity = f"name={name or 'unknown'}"
        chats.append((chat_id_text, identity))
    return chats


def find_chat_ids(
    env_file: Path,
    *,
    environ: Mapping[str, str] | None = None,
    stdout: TextIO = sys.stdout,
    stderr: TextIO = sys.stderr,
    fetch_updates: FetchUpdates | None = None,
) -> int:
    try:
        file_values = dotenv_values(env_file)
    except OSError as exc:
        print(f"error: Could not read {env_file}: {exc}", file=stderr)
        return 2

    environment = os.environ if environ is None else environ
    token = environment.get("TELEGRAM_BOT_TOKEN") or file_values.get("TELEGRAM_BOT_TOKEN")
    if not token:
        print(
            f"error: TELEGRAM_BOT_TOKEN is missing from the environment and {env_file}",
            file=stderr,
        )
        return 2

    try:
        payload = (fetch_updates or _fetch_updates)(token)
    except (httpx.HTTPError, ValueError) as exc:
        print(f"error: Could not get Telegram updates: {exc}", file=stderr)
        return 1

    if payload.get("ok") is not True:
        description = payload.get("description")
        message = description if isinstance(description, str) else "Telegram getUpdates failed"
        print(f"error: {message}", file=stderr)
        return 1

    chats = _private_chats(payload)
    if not chats:
        print(
            "error: No private chat found. Open the bot in Telegram, send /start, "
            "then run this command again.",
            file=stderr,
        )
        return 1

    for chat_id, identity in chats:
        print(f"chat_id={chat_id}  {identity}", file=stdout)
    return 0
