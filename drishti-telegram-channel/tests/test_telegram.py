import httpx
import pytest

from drishti_telegram.telegram import TelegramClient


@pytest.mark.asyncio
async def test_send_retries_after_telegram_rate_limit() -> None:
    attempts = 0
    sleeps: list[float] = []
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        requests.append(request)
        attempts += 1
        if attempts == 1:
            return httpx.Response(
                429,
                json={
                    "ok": False,
                    "description": "Too Many Requests",
                    "parameters": {"retry_after": 3},
                },
            )
        return httpx.Response(200, json={"ok": True, "result": {"message_id": 1}})

    async def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        telegram = TelegramClient(
            bot_token="token",
            chat_id="@market-alerts",
            http=http,
            sleep=fake_sleep,
        )
        await telegram.send("hello")

    assert attempts == 2
    assert sleeps == [3.0]
    assert b'"parse_mode":"HTML"' in requests[-1].content


@pytest.mark.asyncio
async def test_send_paces_messages_for_one_telegram_channel() -> None:
    now = 10.0
    sleeps: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"ok": True, "result": {"message_id": 1}})

    async def fake_sleep(seconds: float) -> None:
        nonlocal now
        sleeps.append(seconds)
        now += seconds

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        telegram = TelegramClient(
            bot_token="token",
            chat_id="@market-alerts",
            http=http,
            sleep=fake_sleep,
            clock=lambda: now,
        )
        await telegram.send("first")
        await telegram.send("second")

    assert sleeps == [1.0]


@pytest.mark.asyncio
async def test_check_verifies_bot_can_post_to_channel() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/getMe"):
            return httpx.Response(200, json={"ok": True, "result": {"id": 42}})
        if request.url.path.endswith("/getChat"):
            return httpx.Response(
                200,
                json={"ok": True, "result": {"id": -100123, "type": "channel"}},
            )
        return httpx.Response(
            200,
            json={
                "ok": True,
                "result": {"status": "administrator", "can_post_messages": True},
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        telegram = TelegramClient(
            bot_token="token",
            chat_id="@market-alerts",
            http=http,
        )
        await telegram.check()

    assert [request.url.path.rsplit("/", 1)[-1] for request in requests] == [
        "getMe",
        "getChat",
        "getChatMember",
    ]


@pytest.mark.asyncio
async def test_check_accepts_a_private_chat_without_admin_permissions() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/getMe"):
            return httpx.Response(200, json={"ok": True, "result": {"id": 42}})
        return httpx.Response(
            200,
            json={"ok": True, "result": {"id": 12345, "type": "private"}},
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        telegram = TelegramClient(
            bot_token="token",
            chat_id="12345",
            http=http,
        )
        await telegram.check()

    assert [request.url.path.rsplit("/", 1)[-1] for request in requests] == [
        "getMe",
        "getChat",
    ]


@pytest.mark.asyncio
async def test_send_retries_five_times_after_the_initial_attempt() -> None:
    attempts = 0
    sleeps: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        return httpx.Response(500, json={"ok": False, "description": "temporary"})

    async def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        telegram = TelegramClient(
            bot_token="token",
            chat_id="@market-alerts",
            http=http,
            sleep=fake_sleep,
        )
        with pytest.raises(RuntimeError, match="after 6 attempts"):
            await telegram.send("hello")

    assert attempts == 6
    assert sleeps == [1, 2, 4, 8, 16]
