from asyncio import run
from types import SimpleNamespace

from drishti_monitor.config import Coverage, MonitorConfig
from drishti_monitor.socket import watch_sdk


class FakeManagedSession:
    def __init__(self, actions):
        self.actions = actions

    async def __aenter__(self):
        self.actions.append("enter")
        return self

    async def __aexit__(self, *_args):
        self.actions.append("exit")

    async def subscribe(self, product, *, symbols, detailed):
        self.actions.append(("subscribe", product, symbols, detailed))

    async def events(self):
        yield SimpleNamespace(kind="subscribed", product="earnings")
        yield SimpleNamespace(kind="heartbeat", sent_at="2026-09-02T12:00:00Z")
        yield SimpleNamespace(kind="data", channel="earnings", data={"id": "e1"})
        yield SimpleNamespace(kind="error", code="temporary", message="retrying")


class FakeManagedClient:
    def __init__(self, actions):
        self.session = FakeManagedSession(actions)

    def websocket(self):
        return self.session


def socket_config():
    return MonitorConfig(
        (
            Coverage("RELIANCE", "NSE", "energy", "high", ("earnings", "news", "concalls"), (), 30),
            Coverage("TCS", "NSE", "tech", "normal", ("news",), (), 60),
        )
    )


def test_managed_sdk_watch_recovers_subscribes_and_only_handles_data():
    actions = []
    handled = []
    controls = []
    run(
        watch_sdk(
            FakeManagedClient(actions),
            socket_config(),
            lambda: actions.append("recover"),
            lambda envelope, received: handled.append((envelope, received)),
            lambda kind, details: controls.append((kind, details)),
        )
    )
    assert actions[:2] == ["recover", "enter"]
    assert actions[2:5] == [
        ("subscribe", "earnings", ["RELIANCE"], True),
        ("subscribe", "news", ["RELIANCE", "TCS"], True),
        ("subscribe", "concalls", ["RELIANCE"], True),
    ]
    assert actions[-1] == "exit"
    assert handled[0][0] == {"channel": "earnings", "data": {"id": "e1"}}
    assert handled[0][1].endswith("+00:00")
    assert [kind for kind, _details in controls] == ["subscribed", "heartbeat", "error"]
