from pathlib import Path

import pytest

from drishti_telegram.config import PRODUCTS, load_config


def test_load_config_builds_a_complete_watchlist_configuration(tmp_path: Path) -> None:
    path = tmp_path / "config.yaml"
    path.write_text("symbols: [reliance, TCS, reliance]\n", encoding="utf-8")

    config = load_config(
        path,
        environ={
            "DRISHTI_API_KEY": "drishti-key",
            "TELEGRAM_BOT_TOKEN": "telegram-token",
            "TELEGRAM_CHAT_ID": "@market-alerts",
        },
    )

    assert config.symbols == ("RELIANCE", "TCS")
    assert config.full_feed is False
    assert tuple(config.streams) == PRODUCTS
    assert all(stream.enabled for stream in config.streams.values())
    assert all(stream.fields == ("*",) for stream in config.streams.values())
    assert config.drishti_api_key == "drishti-key"
    assert config.telegram.chat_id == "@market-alerts"


def test_empty_watchlist_requires_explicit_full_feed(tmp_path: Path) -> None:
    path = tmp_path / "config.yaml"
    path.write_text("symbols: []\n", encoding="utf-8")

    with pytest.raises(ValueError, match="full_feed: true"):
        load_config(
            path,
            environ={
                "DRISHTI_API_KEY": "drishti-key",
                "TELEGRAM_BOT_TOKEN": "telegram-token",
                "TELEGRAM_CHAT_ID": "@market-alerts",
            },
        )


def test_stream_settings_override_defaults_per_product(tmp_path: Path) -> None:
    path = tmp_path / "config.yaml"
    path.write_text(
        """
symbols: [RELIANCE]
streams:
  news:
    enabled: false
  announcements:
    detailed: false
    fields: [symbol, summary, metadata.source]
""".lstrip(),
        encoding="utf-8",
    )

    config = load_config(
        path,
        environ={
            "DRISHTI_API_KEY": "drishti-key",
            "TELEGRAM_BOT_TOKEN": "telegram-token",
            "TELEGRAM_CHAT_ID": "@market-alerts",
        },
    )

    assert config.streams["news"].enabled is False
    assert config.streams["announcements"].detailed is False
    assert config.streams["announcements"].fields == (
        "symbol",
        "summary",
        "metadata.source",
    )


def test_credentials_are_rejected_in_yaml(tmp_path: Path) -> None:
    path = tmp_path / "config.yaml"
    path.write_text(
        "symbols: [RELIANCE]\ndrishti_api_key: do-not-put-secrets-here\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="environment variables only"):
        load_config(
            path,
            environ={
                "DRISHTI_API_KEY": "drishti-key",
                "TELEGRAM_BOT_TOKEN": "telegram-token",
                "TELEGRAM_CHAT_ID": "@market-alerts",
            },
        )


def test_missing_environment_credentials_have_a_clear_error(tmp_path: Path) -> None:
    path = tmp_path / "config.yaml"
    path.write_text("symbols: [RELIANCE]\n", encoding="utf-8")

    with pytest.raises(ValueError, match="DRISHTI_API_KEY"):
        load_config(path, environ={})


def test_credentials_are_loaded_from_dotenv_next_to_config(tmp_path: Path) -> None:
    path = tmp_path / "config.yaml"
    path.write_text("symbols: [RELIANCE]\n", encoding="utf-8")
    (tmp_path / ".env").write_text(
        "DRISHTI_API_KEY=dotenv-drishti-key\n"
        "TELEGRAM_BOT_TOKEN=dotenv-telegram-token\n"
        "TELEGRAM_CHAT_ID=@dotenv-channel\n",
        encoding="utf-8",
    )

    config = load_config(path, environ={})

    assert config.drishti_api_key == "dotenv-drishti-key"
    assert config.telegram.bot_token == "dotenv-telegram-token"
    assert config.telegram.chat_id == "@dotenv-channel"


def test_environment_credentials_override_dotenv(tmp_path: Path) -> None:
    path = tmp_path / "config.yaml"
    path.write_text("symbols: [RELIANCE]\n", encoding="utf-8")
    (tmp_path / ".env").write_text(
        "DRISHTI_API_KEY=dotenv-drishti-key\n"
        "TELEGRAM_BOT_TOKEN=dotenv-telegram-token\n"
        "TELEGRAM_CHAT_ID=@dotenv-channel\n",
        encoding="utf-8",
    )

    config = load_config(
        path,
        environ={
            "DRISHTI_API_KEY": "exported-drishti-key",
            "TELEGRAM_BOT_TOKEN": "exported-telegram-token",
            "TELEGRAM_CHAT_ID": "@exported-channel",
        },
    )

    assert config.drishti_api_key == "exported-drishti-key"
    assert config.telegram.bot_token == "exported-telegram-token"
    assert config.telegram.chat_id == "@exported-channel"


def test_at_least_one_stream_must_be_enabled(tmp_path: Path) -> None:
    path = tmp_path / "config.yaml"
    disabled_streams = "\n".join(f"  {product}:\n    enabled: false" for product in PRODUCTS)
    path.write_text(
        f"symbols: [RELIANCE]\nstreams:\n{disabled_streams}\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="at least one stream"):
        load_config(
            path,
            environ={
                "DRISHTI_API_KEY": "drishti-key",
                "TELEGRAM_BOT_TOKEN": "telegram-token",
                "TELEGRAM_CHAT_ID": "@market-alerts",
            },
        )


def test_boolean_settings_do_not_accept_truthy_strings(tmp_path: Path) -> None:
    path = tmp_path / "config.yaml"
    path.write_text(
        'symbols: [RELIANCE]\nstreams:\n  news:\n    enabled: "false"\n',
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="streams.news.enabled must be true or false"):
        load_config(
            path,
            environ={
                "DRISHTI_API_KEY": "drishti-key",
                "TELEGRAM_BOT_TOKEN": "telegram-token",
                "TELEGRAM_CHAT_ID": "@market-alerts",
            },
        )
