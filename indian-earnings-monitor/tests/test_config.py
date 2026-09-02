import json

import pytest

from drishti_monitor import load_config


def test_loads_and_normalizes_safe_coverage(tmp_path):
    path = tmp_path / "config.json"
    path.write_text(
        json.dumps(
            {
                "coverage": [
                    {
                        "symbol": " reliance ",
                        "exchange": "NSE",
                        "owner": "energy",
                        "channels": ["earnings", "news"],
                    }
                ]
            }
        )
    )
    config = load_config(path)
    assert config.coverage[0].symbol == "RELIANCE"
    assert config.coverage[0].channels == ("earnings", "news")


def test_rejects_invalid_or_duplicate_coverage(tmp_path):
    path = tmp_path / "config.json"
    path.write_text(
        json.dumps(
            {
                "coverage": [
                    {"symbol": "TCS", "exchange": "NSE", "owner": "tech"},
                    {"symbol": "tcs", "exchange": "BSE", "owner": "tech"},
                ]
            }
        )
    )
    with pytest.raises(ValueError, match="unique"):
        load_config(path)
