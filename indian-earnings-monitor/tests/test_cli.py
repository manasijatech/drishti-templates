import json

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
    sdk = object()
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
