from urllib.parse import parse_qs, urlparse

from drishti_monitor.rest import RestClient


def test_rest_chunks_more_than_twenty_symbols_without_losing_coverage():
    requests = []

    def get(url, _headers):
        requests.append(url)
        return {"data": [], "has_next": False}

    symbols = [f"SYM{index}" for index in range(21)]
    list(
        RestClient("https://example.invalid/v1", "key", get).pages(
            "news", symbols, "2026-09-01", "2026-09-02", 50
        )
    )

    chunks = [parse_qs(urlparse(url).query)["symbols"][0].split(",") for url in requests]
    assert [len(chunk) for chunk in chunks] == [20, 1]
    assert [symbol for chunk in chunks for symbol in chunk] == symbols


def test_resolves_verified_earnings_and_concall_artifact_shapes():
    requests = []

    def get(url, _headers):
        requests.append(url)
        if "/earnings/attachments?" in url:
            return {
                "data": [{"id": "e1", "status": "ready", "url": "https://example.com/result.pdf"}]
            }
        return {
            "transcript_url": "https://example.com/transcript.pdf",
            "audio_url": "https://example.com/audio.mp3",
            "expires_in": 604800,
        }

    rest = RestClient("https://example.invalid/v1", "key", get)
    assert rest.earnings_attachments(["e1"])[0]["url"].endswith("result.pdf")
    assert rest.concall_artifacts("RELIANCE", "q1_27") == {
        "transcript_url": "https://example.com/transcript.pdf",
        "audio_url": "https://example.com/audio.mp3",
        "expires_in": 604800,
    }
    assert urlparse(requests[0]).path == "/v1/earnings/attachments"
    assert urlparse(requests[1]).path == "/v1/concalls/transcript"
