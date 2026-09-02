import json
from datetime import UTC, datetime

import pytest
from drishti_sdk.exceptions import DrishtiApiError

import drishti_monitor.cli as cli
from drishti_monitor.cli import main
from drishti_monitor.config import Coverage, MonitorConfig
from drishti_monitor.monitor import Monitor
from drishti_monitor.store import Store


def write_config(path):
    path.write_text(
        json.dumps(
            {
                "coverage": [
                    {
                        "symbol": "RELIANCE",
                        "exchange": "NSE",
                        "owner": "energy",
                        "channels": ["earnings", "news", "concalls"],
                    }
                ],
                "maxDeliveryAttempts": 1,
            }
        )
    )


class ClosingSdk:
    def __init__(self, error=None):
        self.close_count = 0
        self.error = error

    def close(self):
        self.close_count += 1

    def _page(self):
        if self.error is not None:
            raise self.error
        return {"data": [], "has_next": False}

    def get_earnings(self, **_kwargs):
        return self._page()

    def get_news(self, **_kwargs):
        return self._page()

    def get_concalls(self, **_kwargs):
        return self._page()

    def get_upcoming_earnings(self, **_kwargs):
        return self._page()

    def get_upcoming_concalls(self, **_kwargs):
        return self._page()

    def get_earnings_attachments(self, **_kwargs):
        return self._page()

    def get_concalls_transcript(self, **_kwargs):
        return {}


def live_args(config_path, state_path, command):
    return ["--config", str(config_path), "--state-dir", str(state_path), command]


def test_cli_lists_calendar_and_failures_and_mutates_review_queue(tmp_path, capsys):
    config_path = tmp_path / "config.json"
    state_path = tmp_path / "state"
    write_config(config_path)
    store = Store(state_path)
    store.save_calendar(
        "earnings",
        {
            "provider_id": "upcoming-1",
            "product": "earnings",
            "symbol": "RELIANCE",
            "scheduled_time": "2026-09-10T00:00:00Z",
        },
    )
    monitor = Monitor(
        MonitorConfig((Coverage("RELIANCE", "NSE", "energy", "normal", ("earnings",), (), 60),)),
        store,
        lambda _event: None,
    )
    monitor.handle_envelope(
        {
            "channel": "earnings",
            "data": {"id": "e1", "symbol": "RELIANCE", "date": "2026-09-02T09:00:00Z"},
        },
        "2026-09-02T09:01:00Z",
    )
    store.record_failure("parse", "invalid payload", channel="news", payload={"id": "bad"})
    common = ["--config", str(config_path), "--state-dir", str(state_path)]

    assert main([*common, "calendar"]) == 0
    assert "upcoming-1" in capsys.readouterr().out
    assert main([*common, "failures"]) == 0
    assert "invalid payload" in capsys.readouterr().out
    assert main([*common, "add-note", "earnings", "e1", "Checked filing"]) == 0
    assert main([*common, "mark-reviewed", "earnings", "e1"]) == 0

    queue = Store(state_path).event("earnings", "e1")
    assert queue.notes == ["Checked filing"]
    assert queue.review_state == "reviewed"


def test_cli_retries_durable_delivery_failure(tmp_path, capsys):
    config_path = tmp_path / "config.json"
    state_path = tmp_path / "state"
    write_config(config_path)
    store = Store(state_path)
    monitor = Monitor(
        MonitorConfig(
            (Coverage("RELIANCE", "NSE", "energy", "normal", ("earnings",), (), 60),),
            max_delivery_attempts=1,
        ),
        store,
        lambda _event: (_ for _ in ()).throw(RuntimeError()),
    )
    monitor.handle_envelope(
        {
            "channel": "earnings",
            "data": {"id": "e1", "symbol": "RELIANCE", "date": "2026-09-02T09:00:00Z"},
        },
        "2026-09-02T09:01:00Z",
    )
    failure_id = next(store.failures())["failure_id"]

    result = main(
        [
            "--config",
            str(config_path),
            "--state-dir",
            str(state_path),
            "retry-failure",
            failure_id,
        ]
    )

    assert result == 0
    assert "retried=true" in capsys.readouterr().out
    assert list(Store(state_path).failures()) == []


def test_cli_watch_runs_the_async_sdk_path(tmp_path, monkeypatch):
    config_path = tmp_path / "config.json"
    state_path = tmp_path / "state"
    write_config(config_path)
    sdk = ClosingSdk()
    observed = []

    async def fake_watch(client, config, recover, handle, on_control):
        observed.append((client, config.coverage[0].symbol, handle, on_control))

    monkeypatch.setenv("DRISHTI_API_KEY", "test-only-key")
    monkeypatch.setattr(cli, "create_sdk_client", lambda _key, _base: sdk)
    monkeypatch.setattr(cli, "watch_sdk", fake_watch)

    assert (
        main(
            [
                "--config",
                str(config_path),
                "--state-dir",
                str(state_path),
                "watch",
            ]
        )
        == 0
    )
    assert observed[0][0:2] == (sdk, "RELIANCE")
    assert sdk.close_count == 1


def test_simple_run_command_uses_the_async_sdk_path(tmp_path, monkeypatch, capsys):
    config_path = tmp_path / "config.json"
    state_path = tmp_path / "state"
    write_config(config_path)
    sdk = ClosingSdk()

    async def fake_watch(_client, _config, _recover, _handle, _on_control):
        raise KeyboardInterrupt

    monkeypatch.setenv("DRISHTI_API_KEY", "test-only-key")
    monkeypatch.setattr(cli, "create_sdk_client", lambda _key, _base: sdk)
    monkeypatch.setattr(cli, "watch_sdk", fake_watch)

    assert main(live_args(config_path, state_path, "run")) == 0
    assert "Monitor stopped." in capsys.readouterr().out
    assert sdk.close_count == 1


def test_run_reuses_a_recent_check_instead_of_repeating_rest_calls(tmp_path, monkeypatch, capsys):
    config_path = tmp_path / "config.json"
    state_path = tmp_path / "state"
    write_config(config_path)
    store = Store(state_path)
    checkpoint = datetime.now(UTC).isoformat()
    for channel in ("earnings", "news", "concalls"):
        store.save_checkpoint(channel, checkpoint)
    sdk = ClosingSdk(AssertionError("REST recovery should have been skipped"))

    async def fake_watch(_client, _config, recover, _handle, _on_control):
        recover()

    monkeypatch.setenv("DRISHTI_API_KEY", "test-only-key")
    monkeypatch.setattr(cli, "create_sdk_client", lambda _key, _base: sdk)
    monkeypatch.setattr(cli, "watch_sdk", fake_watch)

    assert main(live_args(config_path, state_path, "run")) == 0
    assert "Using the recent check" in capsys.readouterr().out
    assert sdk.close_count == 1


def test_run_continues_to_websocket_when_rest_recovery_is_rate_limited(
    tmp_path, monkeypatch, capsys
):
    config_path = tmp_path / "config.json"
    state_path = tmp_path / "state"
    write_config(config_path)
    sdk = ClosingSdk(DrishtiApiError(429, {"error": {"code": "rate_limit_exceeded"}}))

    async def fake_watch(_client, _config, recover, _handle, _on_control):
        recover()

    monkeypatch.setenv("DRISHTI_API_KEY", "test-only-key")
    monkeypatch.setattr(cli, "create_sdk_client", lambda _key, _base: sdk)
    monkeypatch.setattr(cli, "watch_sdk", fake_watch)

    assert main(live_args(config_path, state_path, "run")) == 0
    assert "continuing with live monitoring" in capsys.readouterr().out
    assert sdk.close_count == 1


def test_cli_closes_sdk_after_successful_finite_live_command(tmp_path, monkeypatch):
    config_path = tmp_path / "config.json"
    write_config(config_path)
    sdk = ClosingSdk()
    monkeypatch.setenv("DRISHTI_API_KEY", "test-only-key")
    monkeypatch.setattr(cli, "create_sdk_client", lambda _key, _base: sdk)

    assert main(live_args(config_path, tmp_path / "state", "live-smoke")) == 0
    assert sdk.close_count == 1


def test_simple_check_command_runs_one_finite_live_recovery(tmp_path, monkeypatch):
    config_path = tmp_path / "config.json"
    write_config(config_path)
    sdk = ClosingSdk()
    monkeypatch.setenv("DRISHTI_API_KEY", "test-only-key")
    monkeypatch.setattr(cli, "create_sdk_client", lambda _key, _base: sdk)

    assert main(live_args(config_path, tmp_path / "state", "check")) == 0
    assert sdk.close_count == 1


def test_demo_prints_a_short_human_readable_summary(tmp_path, capsys):
    assert main(["--state-dir", str(tmp_path / "state"), "demo"]) == 0

    output = capsys.readouterr().out
    assert "EARNINGS: RELIANCE" in output
    assert "accepted=3 calendar=2 queue=3" in output
    assert '"channel": "earnings"' not in output


def test_cli_closes_sdk_when_live_operation_raises(tmp_path, monkeypatch):
    config_path = tmp_path / "config.json"
    write_config(config_path)
    sdk = ClosingSdk(RuntimeError("SDK failure"))
    monkeypatch.setenv("DRISHTI_API_KEY", "test-only-key")
    monkeypatch.setattr(cli, "create_sdk_client", lambda _key, _base: sdk)

    with pytest.raises(RuntimeError, match="SDK failure"):
        main(live_args(config_path, tmp_path / "state", "calendar-refresh"))
    assert sdk.close_count == 1


def test_finite_command_shows_a_readable_rate_limit_error(tmp_path, monkeypatch):
    config_path = tmp_path / "config.json"
    write_config(config_path)
    sdk = ClosingSdk(DrishtiApiError(429, {"error": {"code": "rate_limit_exceeded"}}))
    monkeypatch.setenv("DRISHTI_API_KEY", "test-only-key")
    monkeypatch.setattr(cli, "create_sdk_client", lambda _key, _base: sdk)

    with pytest.raises(SystemExit, match="Wait one minute"):
        main(live_args(config_path, tmp_path / "state", "check"))
    assert sdk.close_count == 1
