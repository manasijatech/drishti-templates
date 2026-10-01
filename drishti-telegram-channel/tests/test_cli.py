from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from io import StringIO
from pathlib import Path
from typing import Any

import pytest
from drishti_sdk import DrishtiWebSocketError, SubscribedEvent

import drishti_telegram.cli as cli
from drishti_telegram.config import PRODUCTS


def test_check_reports_configuration_errors_without_a_traceback(tmp_path: Path) -> None:
    path = tmp_path / "config.yaml"
    path.write_text("symbols: [RELIANCE]\n", encoding="utf-8")
    stderr = StringIO()

    exit_code = cli.main(["--config", str(path), "check"], environ={}, stderr=stderr)

    assert exit_code == 2
    assert stderr.getvalue() == "error: Missing required environment variable: DRISHTI_API_KEY\n"


class FakeHttpContext:
    async def __aenter__(self) -> object:
        return object()

    async def __aexit__(self, *args: object) -> None:
        return None


class FakeTelegram:
    def __init__(self, **kwargs: object) -> None:
        pass

    async def check(self) -> None:
        return None


class AcknowledgingSession:
    async def subscribe(self, product: str, **kwargs: object) -> None:
        return None

    async def events(self) -> AsyncIterator[Any]:
        for product in PRODUCTS:
            yield SubscribedEvent(
                product=product.replace("-", "_"),
                tier="starter_100",
                symbols=["RELIANCE"],
            )


def _environment() -> dict[str, str]:
    return {
        "DRISHTI_API_KEY": "drishti-key",
        "TELEGRAM_BOT_TOKEN": "telegram-token",
        "TELEGRAM_CHAT_ID": "@market-alerts",
    }


def _install_fakes(
    monkeypatch: pytest.MonkeyPatch,
    session: object,
) -> None:
    monkeypatch.setattr(cli.httpx, "AsyncClient", lambda **kwargs: FakeHttpContext())
    monkeypatch.setattr(cli, "TelegramClient", FakeTelegram)

    async def account_details(api_key: str) -> dict[str, object]:
        return {
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
            }
        }

    monkeypatch.setattr(cli, "drishti_account", account_details)

    @asynccontextmanager
    async def session_context(api_key: str) -> AsyncIterator[object]:
        yield session

    monkeypatch.setattr(cli, "drishti_session", session_context)


def test_check_reports_the_acknowledged_plan(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    path = tmp_path / "config.yaml"
    path.write_text("symbols: [RELIANCE]\n", encoding="utf-8")
    stdout = StringIO()
    stderr = StringIO()
    _install_fakes(monkeypatch, AcknowledgingSession())

    exit_code = cli.main(
        ["--config", str(path), "check"],
        environ=_environment(),
        stdout=stdout,
        stderr=stderr,
    )

    assert exit_code == 0
    assert stdout.getvalue() == (
        "OK: Telegram destination access; Drishti account: Starter; "
        "configured WebSocket streams available; acknowledged tier: starter_100\n"
    )
    assert stderr.getvalue() == ""


def test_check_explains_ambiguous_websocket_403(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class RejectingSession:
        async def subscribe(self, product: str, **kwargs: object) -> None:
            raise DrishtiWebSocketError("Forbidden", code="403")

    path = tmp_path / "config.yaml"
    path.write_text("symbols: [RELIANCE]\n", encoding="utf-8")
    stderr = StringIO()
    _install_fakes(monkeypatch, RejectingSession())

    exit_code = cli.main(
        ["--config", str(path), "check"],
        environ=_environment(),
        stderr=stderr,
    )

    assert exit_code == 1
    assert "product add-ons and full-market entitlements" in stderr.getvalue()
    assert "https://platform.manasija.in/developer-portal" in stderr.getvalue()
