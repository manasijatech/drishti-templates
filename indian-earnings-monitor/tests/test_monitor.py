from datetime import UTC, datetime
from urllib.parse import parse_qs, urlparse

import pytest

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
    assert store.checkpoint("concalls") == "2026-09-02T12:00:00+00:00"


def test_empty_recovery_is_valid(tmp_path):
    monitor = Monitor(config(), Store(tmp_path), lambda _event: None)
    rest = RestClient(
        "https://example.invalid", "x", lambda _url, _headers: {"data": [], "has_next": False}
    )
    assert monitor.recover(rest, datetime(2026, 9, 2, 12, tzinfo=UTC)) == []


def test_upcoming_calendar_paginates_and_stays_separate_from_events(tmp_path):
    requests = []

    def get(url, _headers):
        requests.append(url)
        parsed = urlparse(url)
        page = int(parse_qs(parsed.query)["page"][0])
        if parsed.path.endswith("/earnings/upcoming"):
            row = {
                "id": "ue1",
                "event_id": "event-1",
                "symbol": "RELIANCE",
                "company": "Reliance Industries",
                "date": "2026-09-10T00:00:00+00:00",
                "quarter": "q1_27",
                "purpose": "Financial Results",
                "ignored": "not-in-contract",
            }
        else:
            row = {
                "id": "uc1",
                "symbol": "RELIANCE",
                "meeting_date": "2026-09-11T16:00:00Z",
                "quarter": "q1_27",
                "ignored": "not-in-contract",
            }
        return {"data": [row] if page == 1 else [], "has_next": page == 1}

    store = Store(tmp_path)
    monitor = Monitor(config(), store, lambda _event: None)
    items = monitor.refresh_calendar(RestClient("https://example.invalid/v1", "x", get))

    assert len(requests) == 4 and len(items) == 2
    assert list(store.events()) == []
    calendar = list(store.calendar())
    assert [item["product"] for item in calendar] == ["earnings", "concalls"]
    assert calendar[0]["event_id"] == "event-1"
    assert calendar[1]["scheduled_time"] == "2026-09-11T16:00:00Z"
    assert all("ignored" not in item and "owner" not in item for item in calendar)


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


def test_normalization_does_not_use_undocumented_artifact_fields(tmp_path):
    monitor = Monitor(config(), Store(tmp_path), lambda _event: None)
    earnings = monitor.handle_envelope(
        {
            "channel": "earnings",
            "data": {
                "id": "e1",
                "symbol": "RELIANCE",
                "date": "2026-09-02T09:00:00Z",
                "attachment_url": "https://untrusted/attachment.pdf",
            },
        },
        "2026-09-02T09:01:00Z",
    )
    concall = monitor.handle_envelope(
        {
            "channel": "concalls",
            "data": {
                "id": "c1",
                "symbol": "RELIANCE",
                "date": "2026-09-02T09:00:00Z",
                "recording_url": "https://untrusted/recording.mp3",
            },
        },
        "2026-09-02T09:01:00Z",
    )
    assert earnings is not None and earnings.source_url is None
    assert concall is not None and concall.audio_url is None


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


def test_parse_and_terminal_delivery_failures_persist_and_delivery_retry_succeeds(tmp_path):
    store = Store(tmp_path)
    monitor = Monitor(
        config(max_attempts=1), store, lambda _event: (_ for _ in ()).throw(RuntimeError())
    )

    assert (
        monitor.handle_envelope(
            {"channel": "news", "data": {"id": "bad-without-symbol"}},
            "2026-09-02T09:00:00+00:00",
        )
        is None
    )
    event = monitor.handle_envelope(
        {
            "channel": "earnings",
            "data": {"id": "e1", "symbol": "RELIANCE", "date": "2026-09-02T09:00:00Z"},
        },
        "2026-09-02T09:01:00+00:00",
    )

    assert event is not None and event.delivery_state == "failed"
    failures = list(store.failures())
    assert [failure["kind"] for failure in failures] == ["parse", "delivery"]
    delivery_failure = failures[1]

    delivered = []
    retry_monitor = Monitor(config(max_attempts=1), Store(tmp_path), delivered.append)
    assert retry_monitor.retry_failure(delivery_failure["failure_id"]) is True
    assert delivered[0].provider_id == "e1"
    assert list(Store(tmp_path).failures()) == [failures[0]]
    assert "failure_resolved" in Store(tmp_path).audit_path.read_text()


def test_invalid_websocket_envelope_is_a_durable_parse_failure(tmp_path):
    store = Store(tmp_path)
    monitor = Monitor(config(), store, lambda _event: None)

    assert (
        monitor.handle_envelope(
            {"status": "unexpected", "message": "not a delivery"},
            "2026-09-02T09:00:00Z",
        )
        is None
    )
    failure = next(store.failures())
    assert failure["kind"] == "parse"
    assert failure["payload"]["status"] == "unexpected"


def test_resolved_artifacts_are_exposed_and_amendments_link_both_versions(tmp_path):
    def get(url, _headers):
        if "/earnings/attachments?" in url:
            return {"data": [{"id": "e2", "status": "ready", "url": "https://source/result.pdf"}]}
        return {
            "transcript_url": "https://source/transcript.pdf",
            "audio_url": "https://source/audio.mp3",
        }

    store = Store(tmp_path)
    monitor = Monitor(config(), store, lambda _event: None)
    common = {"symbol": "RELIANCE", "quarter": "q1_27", "date": "2026-09-02T09:00:00Z"}
    monitor.handle_envelope(
        {"channel": "earnings", "data": {"id": "e1", **common}}, "2026-09-02T09:01:00Z"
    )
    monitor.handle_envelope(
        {"channel": "earnings", "data": {"id": "e2", **common}}, "2026-09-02T09:02:00Z"
    )
    monitor.handle_envelope(
        {"channel": "concalls", "data": {"id": "c1", **common}}, "2026-09-02T09:03:00Z"
    )
    rest = RestClient("https://example.invalid/v1", "x", get)

    earnings = monitor.resolve_earnings_source(rest, "e2")
    concall = monitor.resolve_concall_sources(rest, "c1")

    assert earnings.source_url == "https://source/result.pdf"
    assert concall.source_url == "https://source/transcript.pdf"
    assert concall.audio_url == "https://source/audio.mp3"
    assert store.event("earnings", "e1").related_identities == ["earnings:e2"]
    assert store.event("earnings", "e2").related_identities == ["earnings:e1"]


def test_recovery_checkpoint_advances_only_after_complete_window_and_restart_is_gap_safe(tmp_path):
    calls = []
    fail_page_two = True

    def get(url, _headers):
        nonlocal fail_page_two
        parsed = urlparse(url)
        channel = parsed.path.rsplit("/", 1)[-1]
        page = int(parse_qs(parsed.query)["page"][0])
        calls.append((channel, page))
        if channel == "earnings" and page == 2 and fail_page_two:
            fail_page_two = False
            raise OSError("page failed")
        rows = {
            1: [{"id": f"{channel}-new", "symbol": "RELIANCE", "date": "2026-09-02T11:00:00Z"}],
            2: [{"id": f"{channel}-old", "symbol": "RELIANCE", "date": "2026-09-02T10:00:00Z"}],
        }
        return {"data": rows.get(page, []), "has_next": page == 1}

    store = Store(tmp_path)
    monitor = Monitor(config(), store, lambda _event: None)
    rest = RestClient("https://example.invalid/v1", "x", get)
    now = datetime(2026, 9, 2, 12, tzinfo=UTC)

    with pytest.raises(OSError, match="page failed"):
        monitor.recover(rest, now)
    assert store.checkpoint("earnings") is None

    monitor.recover(rest, now)
    assert store.event("earnings", "earnings-old").provider_id == "earnings-old"
    assert store.checkpoint("earnings") == "2026-09-02T12:00:00+00:00"
