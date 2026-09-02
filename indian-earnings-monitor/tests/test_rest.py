from drishti_monitor.rest import RestClient


class FakeSdkClient:
    def __init__(self):
        self.calls = []
        self.responses = {
            "earnings": {"data": [], "has_next": False},
            "news": {"data": [], "has_next": False},
            "concalls": {"data": [], "has_next": False},
            "upcoming_earnings": {"data": [], "has_next": False},
            "upcoming_concalls": {"data": [], "has_next": False},
            "attachments": {
                "data": [{"id": "e1", "status": "ready", "url": "https://example.com/result.pdf"}]
            },
            "transcript": {
                "transcript_url": "https://example.com/transcript.pdf",
                "audio_url": "https://example.com/audio.mp3",
                "expires_in": 604800,
            },
        }

    def _call(self, name, kwargs):
        self.calls.append((name, kwargs))
        return self.responses[name]

    def get_earnings(self, **kwargs):
        return self._call("earnings", kwargs)

    def get_news(self, **kwargs):
        return self._call("news", kwargs)

    def get_concalls(self, **kwargs):
        return self._call("concalls", kwargs)

    def get_upcoming_earnings(self, **kwargs):
        return self._call("upcoming_earnings", kwargs)

    def get_upcoming_concalls(self, **kwargs):
        return self._call("upcoming_concalls", kwargs)

    def get_earnings_attachments(self, **kwargs):
        return self._call("attachments", kwargs)

    def get_concalls_transcript(self, **kwargs):
        return self._call("transcript", kwargs)


def test_rest_uses_sdk_product_method_and_preserves_symbol_chunks():
    sdk = FakeSdkClient()
    symbols = [f"SYM{index}" for index in range(21)]
    list(RestClient(sdk).pages("news", symbols, "2026-09-01", "2026-09-02", 50))
    assert sdk.calls == [
        (
            "news",
            {
                "symbols": symbols[:20],
                "from_": "2026-09-01",
                "to": "2026-09-02",
                "limit": 50,
                "page": 1,
            },
        ),
        (
            "news",
            {
                "symbols": symbols[20:],
                "from_": "2026-09-01",
                "to": "2026-09-02",
                "limit": 50,
                "page": 1,
            },
        ),
    ]


def test_sdk_pagination_and_detailed_flags_match_product_methods():
    sdk = FakeSdkClient()
    sdk.responses["earnings"] = {"data": [{"id": "one"}], "has_next": True}
    pages = RestClient(sdk).pages("earnings", ["RELIANCE"], "from", "to", 50)
    assert next(pages) == [{"id": "one"}]
    sdk.responses["earnings"] = {"data": [], "has_next": False}
    assert next(pages) == []
    assert sdk.calls[0][1]["detailed"] is True
    assert [call[1]["page"] for call in sdk.calls] == [1, 2]


def test_resolves_verified_earnings_and_concall_artifact_shapes():
    sdk = FakeSdkClient()
    rest = RestClient(sdk)
    assert rest.earnings_attachments(["e1"])[0]["url"].endswith("result.pdf")
    assert rest.concall_artifacts("RELIANCE", "q1_27") == {
        "transcript_url": "https://example.com/transcript.pdf",
        "audio_url": "https://example.com/audio.mp3",
        "expires_in": 604800,
    }
    assert sdk.calls[-2:] == [
        ("attachments", {"ids": ["e1"]}),
        ("transcript", {"symbol": "RELIANCE", "quarter": "q1_27"}),
    ]
