import json

import pytest

from drishti_monitor.config import Coverage, MonitorConfig
from drishti_monitor.socket import RawSubscriptionSession, decode_envelope, run_socket


class FakeSocket:
    def __init__(self):
        self.sent = []

    def send(self, payload):
        self.sent.append(json.loads(payload))


def socket_config():
    return MonitorConfig(
        (
            Coverage("RELIANCE", "NSE", "energy", "high", ("earnings", "news", "concalls"), (), 30),
            Coverage("TCS", "NSE", "tech", "normal", ("news",), (), 60),
        )
    )


def test_separate_subscription_state():
    config = socket_config()
    session = RawSubscriptionSession(config)
    socket = FakeSocket()
    session.subscribe_all(socket)
    assert [frame["product"] for frame in socket.sent] == [
        "earnings",
        "news",
        "concalls",
    ]
    assert socket.sent[1]["symbols"] == ["RELIANCE", "TCS"]


class ScriptedSocket(FakeSocket):
    def __init__(self, messages):
        super().__init__()
        self.messages = iter(messages)

    def recv(self):
        value = next(self.messages)
        if isinstance(value, Exception):
            raise value
        return value

    def close(self):
        return None


def test_production_loop_ignores_ack_then_recovers_and_resubscribes_after_disconnect():
    config_value = socket_config()
    first = ScriptedSocket(
        [
            '{"status":"subscribed","product":"news","tier":"starter_100","symbols":["RELIANCE"],"full_feed":false,"detailed":true}',
            '{"channel":"news","data":{"id":"n1"}}',
            OSError("disconnect"),
        ]
    )
    second = ScriptedSocket(
        [
            '{"status":"subscribed","product":"news","tier":"starter_100","symbols":["RELIANCE"],"full_feed":false,"detailed":true}',
            '{"channel":"news","data":{"id":"n2"}}',
            OSError("done"),
        ]
    )
    connections = iter([first, second])
    actions = []
    events = []
    controls = []

    run_socket(
        RawSubscriptionSession(config_value),
        lambda: actions.append("recover"),
        lambda envelope, _received: events.append(envelope["data"]["id"]),
        lambda: next(connections),
        lambda _delay: actions.append("sleep"),
        controls.append,
        max_connections=2,
    )

    assert events == ["n1", "n2"]
    assert [item["status"] for item in controls] == ["subscribed", "subscribed"]
    assert actions == ["recover", "sleep", "recover"]
    assert [frame["product"] for frame in first.sent] == ["earnings", "news", "concalls"]
    assert second.sent == first.sent


def test_websocket_envelope_decoder_rejects_non_objects():
    assert decode_envelope('{"channel":"news","data":{"id":"n1"}}')["channel"] == "news"
    with pytest.raises(ValueError):
        decode_envelope("[]")
