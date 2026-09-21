import pytest

from drishti_telegram.formatting import build_notification_batches, format_event


def test_alert_layout_formats_primary_text_market_values_and_lists() -> None:
    message = format_event(
        "alerts",
        {
            "symbol": "WELCORP",
            "type": "price_alert",
            "reason": "A significant order was secured.",
            "timestamp": "2026-09-21T09:52:48.356000+00:00",
            "price": {"value": 2765.1, "change_percent": 4.04},
            "meta": {"primary_drivers": ["Large order", "New factory"]},
        },
        fields=(
            "symbol",
            "type",
            "reason",
            "timestamp",
            "price.value",
            "price.change_percent",
            "meta.primary_drivers",
        ),
    )

    assert message == (
        "🚨 <b>Market Alert · WELCORP</b>\n\n"
        "A significant order was secured.\n\n"
        "<b>Type:</b> Price Alert\n\n"
        "<b>Price:</b> ₹2,765.10\n\n"
        "<b>Change:</b> +4.04%\n\n"
        "<b>Key drivers:</b>\n"
        "• Large order\n"
        "• New factory\n\n"
        "<b>Time:</b> 21 Sep 2026 · 3:22 PM IST"
    )


def test_announcement_layout_uses_company_as_headline_and_humanizes_values() -> None:
    message = format_event(
        "announcements",
        {
            "symbol": "GULFPETRO",
            "company_name": "GP Petroleums Limited",
            "summary": "A director resigned due to time constraints.",
            "category": "Change in Management",
            "important": False,
            "date": "2026-09-21T09:52:15.428000+00:00",
        },
        fields=("symbol", "company_name", "summary", "category", "important", "date"),
    )

    assert message == (
        "📢 <b>Announcement · GULFPETRO</b>\n\n"
        "<b>GP Petroleums Limited</b>\n\n"
        "A director resigned due to time constraints.\n\n"
        "<b>Category:</b> Change in Management\n\n"
        "<b>Important:</b> No\n\n"
        "<b>Published:</b> 21 Sep 2026 · 3:22 PM IST"
    )


def test_news_layout_omits_na_symbol_and_creates_a_safe_article_link() -> None:
    message = format_event(
        "news",
        {
            "symbol": "N/A",
            "title": "Markets & <policy> update",
            "summary": "A concise overview.",
            "source": "Economic Times",
            "sentiment": "neutral",
            "date": "2026-09-21T09:48:11+00:00",
            "link": "https://example.com/article?a=1&b=2",
        },
        fields=("symbol", "title", "summary", "source", "sentiment", "date", "link"),
    )

    assert message == (
        "📰 <b>News</b>\n\n"
        "<b>Markets &amp; &lt;policy&gt; update</b>\n\n"
        "A concise overview.\n\n"
        "<b>Source:</b> Economic Times\n\n"
        "<b>Sentiment:</b> Neutral\n\n"
        "<b>Published:</b> 21 Sep 2026 · 3:18 PM IST\n\n"
        '<a href="https://example.com/article?a=1&amp;b=2">Read article →</a>'
    )


def test_block_deal_layout_formats_amounts_shares_and_price() -> None:
    message = format_event(
        "block-deals",
        {
            "symbol": "TCS",
            "company": "Tata Consultancy Services Limited",
            "exchange": "NSE",
            "trade_value_cr": 1250,
            "shares": 150000,
            "price": 3123.4,
            "date": "2026-09-21T09:52:15+00:00",
        },
        fields=("symbol", "company", "exchange", "trade_value_cr", "shares", "price", "date"),
    )

    assert "🤝 <b>Block Deal · TCS</b>" in message
    assert "<b>Tata Consultancy Services Limited</b>" in message
    assert "<b>Trade value:</b> ₹1,250 Cr" in message
    assert "<b>Shares:</b> 150,000" in message
    assert "<b>Price:</b> ₹3,123.40" in message


def test_earnings_layout_formats_significance_and_attachment() -> None:
    message = format_event(
        "earnings",
        {
            "symbol": "TCS",
            "company_name": "Tata Consultancy Services Limited",
            "quarter": "Q2 FY27",
            "summary": "Revenue and profit increased year over year.",
            "earnings_significant": True,
            "attachment_url": "https://example.com/results.pdf",
        },
        fields=(
            "symbol",
            "company_name",
            "quarter",
            "summary",
            "earnings_significant",
            "attachment_url",
        ),
    )

    assert "📊 <b>Earnings · TCS</b>" in message
    assert "<b>Quarter:</b> Q2 FY27" in message
    assert "<b>Significant:</b> Yes" in message
    assert '<a href="https://example.com/results.pdf">View attachment →</a>' in message


def test_concall_layout_formats_transcript_and_audio_links() -> None:
    message = format_event(
        "concalls",
        {
            "symbol": "TCS",
            "quarter": "Q2 FY27",
            "short_analysis": "Management maintained its margin outlook.",
            "transcript_url": "https://example.com/transcript",
            "audio_url": "https://example.com/audio",
        },
        fields=("symbol", "quarter", "short_analysis", "transcript_url", "audio_url"),
    )

    assert "🎙️ <b>Conference Call · TCS</b>" in message
    assert "Management maintained its margin outlook." in message
    assert '<a href="https://example.com/transcript">Read transcript →</a>' in message
    assert '<a href="https://example.com/audio">Listen to audio →</a>' in message


@pytest.mark.parametrize(
    ("product", "expected_heading"),
    [
        ("news", "📰 <b>News · TCS</b>"),
        ("block-deals", "🤝 <b>Block Deal · TCS</b>"),
        ("announcements", "📢 <b>Announcement · TCS</b>"),
        ("earnings", "📊 <b>Earnings · TCS</b>"),
        ("concalls", "🎙️ <b>Conference Call · TCS</b>"),
        ("alerts", "🚨 <b>Market Alert · TCS</b>"),
    ],
)
def test_each_stream_product_has_a_distinct_readable_heading(
    product: str,
    expected_heading: str,
) -> None:
    assert format_event(product, {"symbol": "TCS"}, fields=("symbol",)) == expected_heading


def test_star_projection_formats_every_populated_field_cleanly() -> None:
    message = format_event(
        "news",
        {"symbol": "TCS", "title": "New <order>", "tags": ["deal", "technology"]},
        fields=("*",),
    )

    assert message == (
        "📰 <b>News · TCS</b>\n\n<b>New &lt;order&gt;</b>\n\n<b>Tags:</b>\n• deal\n• technology"
    )


def test_all_fields_omits_nulls_and_empty_containers_but_keeps_false_and_zero() -> None:
    message = format_event(
        "announcements",
        {
            "id": "evt-1",
            "symbol": "RACONTEUR",
            "company_name": "Raconteur Global Resources Limited",
            "summary": "An acquisition was announced.",
            "long_summary": None,
            "important": False,
            "extracted_information": {
                "stake_percent": 11.89,
                "consideration": None,
                "buyers": [
                    {
                        "name": "Max-Bio",
                        "shares": 2_142_857,
                        "note": None,
                        "details": [{"value": None, "confirmed": False}],
                    }
                ],
            },
            "related_categories": ["Acquisition", None],
            "empty": [],
            "zero_value": 0,
        },
        fields=("*",),
    )

    assert "<b>Important:</b> No" in message
    assert "<b>Stake percent:</b> 11.89%" in message
    assert "<b>Name:</b> Max-Bio · <b>Shares:</b> 2,142,857" in message
    assert "<b>Zero value:</b> 0" in message
    assert "long_summary" not in message
    assert "Consideration" not in message
    assert "Note" not in message
    assert "Empty" not in message
    assert "None" not in message
    assert "null" not in message


def test_detailed_summary_markdown_is_rendered_as_telegram_html() -> None:
    message = format_event(
        "announcements",
        {
            "symbol": "LLOYDSME",
            "company_name": "Lloyds Metals and Energy Limited",
            "summary": "The board approved an ESOP allotment and capacity expansion.",
            "long_summary": """### Overview of Board Meeting Outcomes

#### 1. Equity Allotment under ESOP-2017
* **Allotment Details:** The Board approved 1,41,969 equity shares.
* **Financial Impact:** Shares were issued at Rs. 4 per share.

#### 2. Capacity Expansion
| Plant | Current Capacity | Proposed Addition | Total Investment |
| :--- | :--- | :--- | :--- |
| Ghugus | 6,30,000 MTPA | 1,85,000 MTPA | Rs. 140 Crore |
| Konsari | 70,000 MTPA | 22,400 MTPA | Rs. 50 Crore |""",
            "extracted_information": {
                "type_of_security": "Non-Convertible Debentures (NCDs)",
            },
        },
        fields=("*",),
    )

    assert "###" not in message
    assert "####" not in message
    assert "**" not in message
    assert "| Plant |" not in message
    assert "<b>Detailed summary</b>" in message
    assert "<b>Overview of Board Meeting Outcomes</b>" in message
    assert "• <b>Allotment Details:</b> The Board approved 1,41,969 equity shares." in message
    assert "<b>Plant: Ghugus</b>" in message
    assert "• <b>Current Capacity:</b> 6,30,000 MTPA" in message
    assert "<b>Type of security:</b> Non-Convertible Debentures (NCDs)" in message


def test_notification_batches_use_a_visual_separator_and_split_oversized_events() -> None:
    batches = build_notification_batches(
        ["alpha", "beta", "y" * 13],
        max_chars=30,
    )

    assert batches == ["alpha\n\n──────────\n\nbeta", "y" * 13]


def test_oversized_html_is_split_into_valid_escaped_plain_text() -> None:
    batches = build_notification_batches(["<b>A &amp; B</b>"], max_chars=7)

    assert batches == ["A &amp;", " B"]
