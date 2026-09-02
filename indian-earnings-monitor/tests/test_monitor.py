from datetime import UTC, datetime
from urllib.parse import parse_qs, urlparse

from drishti_monitor.config import Coverage, MonitorConfig
from drishti_monitor.monitor import Monitor
from drishti_monitor.rest import RestClient
from drishti_monitor.store import Store


def config(max_attempts=3):
    return MonitorConfig(
        (
            Coverage(
                "RELIANCE",
                "NSE",
                "energy-desk",
                "normal",
                ("earnings", "news", "concalls"),
                ("research-queue",),
                30,
            ),
        ),
        page_limit=1,
        max_delivery_attempts=max_attempts,
    )


def test_rest_recovery_paginates_all_channels_and_sets_checkpoints(tmp_path):
    requests = []
    rows = {
        "earnings": {"id": "e1", "symbol": "RELIANCE", "date": "2026-09-02T09:00:00+00:00"},
        "news": {
            "id": "n1",
            "symbol": "RELIANCE",
            "date": "2026-09-02T09:01:00+00:00",
            "link": "https://example.com/n1",
        },
        "concalls": {
            "id": "c1",
            "symbol": "RELIANCE",
            "date": "2026-09-02T09:02:00+00:00",
            "transcript_url": "https://example.com/c1",
        },
    }

    def get(url, headers):
        requests.append((url, headers))
        parsed = urlparse(url)
        channel = parsed.path.rsplit("/", 1)[-1]
        page = int(parse_qs(parsed.query)["page"][0])
        return {"data": [rows[channel]] if page == 1 else [], "has_next": page == 1}

    store = Store(tmp_path)
    accepted = Monitor(config(), store, lambda _event: None).recover(
        RestClient("https://developers.manasija.in/v1", "secret", get),
        datetime(2026, 9, 2, 12, tzinfo=UTC),
    )
    assert [event.provider_id for event in accepted] == ["e1", "n1", "c1"]
    assert len(requests) == 6
    assert all(headers["X-API-Key"] == "secret" for _, headers in requests)
    assert store.checkpoint("concalls") == "2026-09-02T09:02:00+00:00"


def test_empty_recovery_is_valid(tmp_path):
    monitor = Monitor(config(), Store(tmp_path), lambda _event: None)
    rest = RestClient(
        "https://example.invalid", "x", lambda _url, _headers: {"data": [], "has_next": False}
    )
    assert monitor.recover(rest, datetime(2026, 9, 2, 12, tzinfo=UTC)) == []


def test_envelope_normalizes_routes_deduplicates_and_preserves_source(tmp_path):
    delivered = []
    store = Store(tmp_path)
    monitor = Monitor(config(), store, delivered.append)
    envelope = {
        "channel": "news",
        "data": {
            "id": "news-1",
            "symbol": "RELIANCE",
            "company": "Reliance Industries",
            "date": "2026-09-02T09:00:00+00:00",
            "title": "Results filed",
            "summary": "Source text",
            "link": "https://example.com/source",
        },
    }
    event = monitor.handle_envelope(envelope, "2026-09-02T09:01:00+00:00")
    duplicate = monitor.handle_envelope(envelope, "2026-09-02T09:02:00+00:00")
    assert event is not None and event.owner == "energy-desk"
    assert event.source_content == "Source text" and event.generated_summary is None
    assert event.source_url == "https://example.com/source"
    assert duplicate is None and len(delivered) == 1


def test_amendment_and_late_transcript_are_separate_records(tmp_path):
    store = Store(tmp_path)
    monitor = Monitor(config(), store, lambda _event: None)
    common = {"symbol": "RELIANCE", "quarter": "q1_27", "date": "2026-09-02T09:00:00+00:00"}
    first = monitor.handle_envelope(
        {"channel": "earnings", "data": {"id": "e1", **common}}, "2026-09-02T09:01:00+00:00"
    )
    amendment = monitor.handle_envelope(
        {"channel": "earnings", "data": {"id": "e2", **common}}, "2026-09-02T09:02:00+00:00"
    )
    transcript = monitor.handle_envelope(
        {
            "channel": "concalls",
            "data": {"id": "c1", **common, "transcript_url": "https://example.com/transcript.pdf"},
        },
        "2026-09-03T09:00:00+00:00",
    )
    assert first is not None and amendment is not None and transcript is not None
    assert amendment.amendment_of == "earnings:e1" and amendment.priority == "high"
    assert transcript.source_url.endswith("transcript.pdf")
    assert len(list(store.events())) == 3


def test_distinct_same_day_news_is_not_mislabeled_as_an_amendment(tmp_path):
    monitor = Monitor(config(), Store(tmp_path), lambda _event: None)
    first = monitor.handle_envelope(
        {
            "channel": "news",
            "data": {"id": "n1", "symbol": "RELIANCE", "date": "2026-09-02T09:00:00+00:00"},
        },
        "2026-09-02T09:01:00+00:00",
    )
    second = monitor.handle_envelope(
        {
            "channel": "news",
            "data": {"id": "n2", "symbol": "RELIANCE", "date": "2026-09-02T10:00:00+00:00"},
        },
        "2026-09-02T10:01:00+00:00",
    )
    assert first is not None and second is not None
    assert second.amendment_of is None


def test_delivery_failure_retries_and_review_actions_are_audited(tmp_path):
    attempts = 0

    def flaky(_event):
        nonlocal attempts
        attempts += 1
        if attempts < 2:
            raise RuntimeError("temporary")

    store = Store(tmp_path)
    monitor = Monitor(config(), store, flaky)
    event = monitor.handle_envelope(
        {
            "channel": "earnings",
            "data": {"id": "e1", "symbol": "RELIANCE", "date": "2026-09-02T09:00:00+00:00"},
        },
        "2026-09-02T09:01:00+00:00",
    )
    assert event is not None and event.delivery_state == "delivered" and attempts == 2
    monitor.add_note("earnings", "e1", "Reviewed source PDF")
    monitor.mark_reviewed("earnings", "e1")
    audit = store.audit_path.read_text()
    assert "delivery_failed" in audit and "note_added" in audit and '"action": "reviewed"' in audit
