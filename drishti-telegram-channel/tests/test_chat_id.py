from io import StringIO
from pathlib import Path

import pytest

import drishti_telegram.chat_id as chat_id
import drishti_telegram.cli as cli


def test_lists_each_private_chat_once_without_printing_token(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("TELEGRAM_BOT_TOKEN=secret-token\n", encoding="utf-8")
    stdout = StringIO()
    stderr = StringIO()
    payload = {
        "ok": True,
        "result": [
            {"message": {"chat": {"id": 123456789, "type": "private", "username": "deiondz"}}},
            {
                "edited_message": {
                    "chat": {"id": 123456789, "type": "private", "username": "deiondz"}
                }
            },
            {"message": {"chat": {"id": -100123, "type": "channel", "title": "Alerts"}}},
        ],
    }

    exit_code = chat_id.find_chat_ids(
        env_file,
        environ={},
        stdout=stdout,
        stderr=stderr,
        fetch_updates=lambda token: payload,
    )

    assert exit_code == 0
    assert stdout.getvalue() == "chat_id=123456789  username=@deiondz\n"
    assert stderr.getvalue() == ""
    assert "secret-token" not in stdout.getvalue()


def test_environment_token_overrides_env_file(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("TELEGRAM_BOT_TOKEN=file-token\n", encoding="utf-8")
    received: list[str] = []

    def fetch(token: str) -> dict[str, object]:
        received.append(token)
        return {
            "ok": True,
            "result": [{"message": {"chat": {"id": 42, "type": "private", "first_name": "Deion"}}}],
        }

    exit_code = chat_id.find_chat_ids(
        env_file,
        environ={"TELEGRAM_BOT_TOKEN": "shell-token"},
        stdout=StringIO(),
        stderr=StringIO(),
        fetch_updates=fetch,
    )

    assert exit_code == 0
    assert received == ["shell-token"]


def test_reports_missing_token() -> None:
    stderr = StringIO()

    exit_code = chat_id.find_chat_ids(
        Path("missing.env"),
        environ={},
        stderr=stderr,
    )

    assert exit_code == 2
    assert "TELEGRAM_BOT_TOKEN is missing" in stderr.getvalue()


def test_reports_telegram_api_error_without_exposing_token(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("TELEGRAM_BOT_TOKEN=secret-token\n", encoding="utf-8")
    stderr = StringIO()

    exit_code = chat_id.find_chat_ids(
        env_file,
        environ={},
        stderr=stderr,
        fetch_updates=lambda token: {"ok": False, "description": "Unauthorized"},
    )

    assert exit_code == 1
    assert stderr.getvalue() == "error: Unauthorized\n"
    assert "secret-token" not in stderr.getvalue()


def test_explains_how_to_create_a_private_update(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("TELEGRAM_BOT_TOKEN=secret-token\n", encoding="utf-8")
    stderr = StringIO()

    exit_code = chat_id.find_chat_ids(
        env_file,
        environ={},
        stderr=stderr,
        fetch_updates=lambda token: {"ok": True, "result": []},
    )

    assert exit_code == 1
    assert "send /start" in stderr.getvalue()


def test_main_cli_chat_id_uses_env_beside_config(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = tmp_path / "config.yaml"
    config.write_text("this file is not loaded by chat-id\n", encoding="utf-8")
    (tmp_path / ".env").write_text("TELEGRAM_BOT_TOKEN=secret-token\n", encoding="utf-8")
    stdout = StringIO()

    def fetch(token: str) -> dict[str, object]:
        return {
            "ok": True,
            "result": [{"message": {"chat": {"id": 42, "type": "private"}}}],
        }

    monkeypatch.setattr(chat_id, "_fetch_updates", fetch)

    exit_code = cli.main(
        ["--config", str(config), "chat-id"],
        environ={},
        stdout=stdout,
        stderr=StringIO(),
    )

    assert exit_code == 0
    assert stdout.getvalue() == "chat_id=42  name=unknown\n"
