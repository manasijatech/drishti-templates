import json

import pytest

from drishti_monitor.config import Coverage, MonitorConfig
from drishti_monitor.socket import RawSubscriptionSession, decode_envelope


class FakeSocket:
    def __init__(self):
        self.sent = []

    def send(self, payload):
        self.sent.append(json.loads(payload))


def test_separate_subscription_state_and_deterministic_reconnect_recovery():
    config = MonitorConfig(
        (
            Coverage("RELIANCE", "NSE", "energy", "high", ("earnings", "news", "concalls"), (), 30),
            Coverage("TCS", "NSE", "tech", "normal", ("news",), (), 60),
        )
    )
    session = RawSubscriptionSession(config)
    socket = FakeSocket()
    actions = []
    session.subscribe_all(socket)
    session.reconnect(lambda: actions.append("rest-recovery"), socket)
    assert [frame["product"] for frame in socket.sent] == [
        "earnings",
        "news",
        "concalls",
        "earnings",
        "news",
        "concalls",
    ]
    assert socket.sent[1]["symbols"] == ["RELIANCE", "TCS"]
    assert actions == ["rest-recovery"]


def test_websocket_envelope_decoder_rejects_non_objects():
    assert decode_envelope('{"channel":"news","data":{"id":"n1"}}')["channel"] == "news"
    with pytest.raises(ValueError):
        decode_envelope("[]")
