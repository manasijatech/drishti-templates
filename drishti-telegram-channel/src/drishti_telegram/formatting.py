from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from html import escape
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urlparse

_MISSING = object()
_IST = timezone(timedelta(hours=5, minutes=30))

_PRODUCT_PRESENTATION = {
    "news": ("📰", "News"),
    "block-deals": ("🤝", "Block Deal"),
    "announcements": ("📢", "Announcement"),
    "earnings": ("📊", "Earnings"),
    "concalls": ("🎙️", "Conference Call"),
    "alerts": ("🚨", "Market Alert"),
}
_HEADLINE_FIELDS = ("title", "company_name", "company")
_BODY_FIELDS = ("summary", "reason", "short_analysis")
_OMITTED_FIELDS = {"symbol"}
_RICH_TEXT_ROOTS = {"summary", "long_summary", "reason", "short_analysis", "expanded_analysis"}
_FIELD_LABELS = {
    "id": "Event ID",
    "type": "Type",
    "alert_type": "Alert type",
    "category": "Category",
    "related_categories": "Related categories",
    "specific_title": "Specific title",
    "long_summary": "Detailed summary",
    "article_type": "Article type",
    "scrip_code": "Scrip code",
    "important": "Important",
    "earnings_significant": "Significant",
    "source": "Source",
    "sentiment": "Sentiment",
    "date": "Published",
    "timestamp": "Time",
    "quarter": "Quarter",
    "exchange": "Exchange",
    "trade_value_cr": "Trade value",
    "shares": "Shares",
    "price": "Price",
    "price.value": "Price",
    "price.change_percent": "Change",
    "price.as_of": "Price as of",
    "meta.primary_drivers": "Key drivers",
    "sentiment_analysis.sentiment.key_indicators.positive": "Positive indicators",
    "sentiment_analysis.sentiment.key_indicators.negative": "Negative indicators",
}
_LINK_LABELS = {
    "link": "Read article →",
    "image": "View image →",
    "logo": "View logo →",
    "attachment_url": "View attachment →",
    "transcript_url": "Read transcript →",
    "audio_url": "Listen to audio →",
}
_METADATA_PRIORITY = {
    "specific_title": 5,
    "long_summary": 5,
    "expanded_analysis": 5,
    "type": 10,
    "category": 10,
    "quarter": 10,
    "exchange": 10,
    "source": 10,
    "important": 20,
    "earnings_significant": 20,
    "sentiment": 20,
    "trade_value_cr": 20,
    "price.value": 20,
    "shares": 30,
    "price.change_percent": 30,
    "price": 40,
    "meta.primary_drivers": 40,
    "id": 90,
    "scrip_code": 90,
    "image": 90,
    "logo": 90,
    "date": 100,
    "timestamp": 100,
}


def _read_path(data: dict[str, Any], path: str) -> Any:
    value: Any = data
    for part in path.split("."):
        if not isinstance(value, dict) or part not in value:
            return _MISSING
        value = value[part]
    return value


def _plain_number(value: int | float) -> str:
    if isinstance(value, float):
        return f"{value:,.2f}".rstrip("0").rstrip(".")
    return f"{value:,}"


def _format_datetime(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    local = parsed.astimezone(_IST)
    clock = local.strftime("%I:%M %p").lstrip("0")
    return f"{local:%d %b %Y} · {clock} IST"


def _humanize(value: str) -> str:
    return value.replace("_", " ").replace("-", " ").strip().title()


def _sentence_label(value: str) -> str:
    text = value.replace("_", " ").replace("-", " ").strip().lower()
    return text[:1].upper() + text[1:]


def _display(field: str, value: Any) -> str:
    leaf = field.rsplit(".", 1)[-1]
    if leaf in {"date", "timestamp", "as_of"} or leaf.endswith(("_at", "_date")):
        formatted = _format_datetime(value)
        if formatted is not None:
            return formatted
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if value is None:
        return "—"
    if field in {"price", "price.value"} and isinstance(value, (int, float)):
        return f"₹{float(value):,.2f}"
    if field == "trade_value_cr" and isinstance(value, (int, float)):
        return f"₹{_plain_number(value)} Cr"
    if field == "price.change_percent" and isinstance(value, (int, float)):
        prefix = "+" if value > 0 else ""
        return f"{prefix}{_plain_number(value)}%"
    if leaf.endswith("_percent") and isinstance(value, (int, float)):
        return f"{_plain_number(value)}%"
    if leaf == "shares" and isinstance(value, (int, float)):
        return _plain_number(value)
    if leaf in {"type", "sentiment"} and isinstance(value, str):
        return _humanize(value)
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return str(value)


def _field_label(field: str) -> str:
    if field in _FIELD_LABELS:
        return _FIELD_LABELS[field]
    leaf = field.rsplit(".", 1)[-1]
    if leaf in _FIELD_LABELS:
        return _FIELD_LABELS[leaf]
    return _sentence_label(leaf)


def _is_http_url(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _clean_value(value: Any) -> Any:
    if value is None:
        return _MISSING
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for key, nested in value.items():
            cleaned_value = _clean_value(nested)
            if cleaned_value is not _MISSING:
                cleaned[str(key)] = cleaned_value
        return cleaned if cleaned else _MISSING
    if isinstance(value, (list, tuple)):
        cleaned_items = [
            cleaned for item in value if (cleaned := _clean_value(item)) is not _MISSING
        ]
        return cleaned_items if cleaned_items else _MISSING
    return value


def _has_content(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, dict):
        return any(_has_content(item) for item in value.values())
    if isinstance(value, (list, tuple)):
        return any(_has_content(item) for item in value)
    return True


def _flatten_mapping(value: dict[str, Any], *, prefix: str) -> list[tuple[str, Any]]:
    flattened: list[tuple[str, Any]] = []
    for key, nested in value.items():
        path = f"{prefix}.{key}" if prefix else str(key)
        if not _has_content(nested):
            continue
        if isinstance(nested, dict):
            flattened.extend(_flatten_mapping(nested, prefix=path))
        else:
            flattened.append((path, nested))
    return flattened


def _link_label(field: str) -> str:
    leaf = field.rsplit(".", 1)[-1]
    if field in _LINK_LABELS:
        return _LINK_LABELS[field]
    if leaf in _LINK_LABELS:
        return _LINK_LABELS[leaf]
    subject = _humanize(leaf.removesuffix("_url"))
    return f"Open {subject.lower()} →" if subject else "Open link →"


def _format_inline_markdown(value: str) -> str:
    rendered = escape(value)
    rendered = re.sub(r"`([^`\n]+)`", r"<code>\1</code>", rendered)
    rendered = re.sub(r"\*\*([^*\n]+)\*\*", r"<b>\1</b>", rendered)
    rendered = re.sub(r"__([^_\n]+)__", r"<b>\1</b>", rendered)
    rendered = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"<i>\1</i>", rendered)
    return rendered


def _table_cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def _is_table_separator(line: str) -> bool:
    cells = _table_cells(line)
    return len(cells) >= 2 and all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells)


def _render_markdown_table(headers: list[str], rows: list[list[str]]) -> list[str]:
    rendered: list[str] = []
    for row_index, row in enumerate(rows):
        padded = row + [""] * (len(headers) - len(row))
        first_header = _format_inline_markdown(headers[0])
        first_value = _format_inline_markdown(padded[0])
        rendered.append(f"<b>{first_header}: {first_value}</b>")
        for header, value in zip(headers[1:], padded[1:], strict=False):
            if value:
                rendered.append(
                    f"• <b>{_format_inline_markdown(header)}:</b> {_format_inline_markdown(value)}"
                )
        if row_index < len(rows) - 1:
            rendered.append("")
    return rendered


def _format_rich_text(value: str) -> str:
    lines = value.splitlines()
    rendered: list[str] = []
    index = 0
    while index < len(lines):
        line = lines[index].rstrip()
        stripped = line.strip()
        if not stripped:
            rendered.append("")
            index += 1
            continue

        if index + 1 < len(lines) and "|" in stripped and _is_table_separator(lines[index + 1]):
            headers = _table_cells(stripped)
            rows: list[list[str]] = []
            index += 2
            while index < len(lines) and "|" in lines[index] and lines[index].strip():
                rows.append(_table_cells(lines[index]))
                index += 1
            rendered.extend(_render_markdown_table(headers, rows))
            continue

        heading = re.match(r"^#{1,6}\s+(.+)$", stripped)
        if heading:
            rendered.append(f"<b>{_format_inline_markdown(heading.group(1))}</b>")
            index += 1
            continue

        bullet = re.match(r"^\s*[-+*]\s+(.+)$", line)
        if bullet:
            rendered.append(f"• {_format_inline_markdown(bullet.group(1))}")
            index += 1
            continue

        quote = re.match(r"^\s*&gt;\s+(.+)$", escape(line))
        if quote:
            rendered.append(f"<blockquote>{quote.group(1)}</blockquote>")
            index += 1
            continue

        if re.fullmatch(r"\s*([-*_])\1{2,}\s*", line):
            rendered.append("──────────")
            index += 1
            continue

        rendered.append(_format_inline_markdown(stripped))
        index += 1

    compact: list[str] = []
    for line in rendered:
        if line or (compact and compact[-1]):
            compact.append(line)
    while compact and not compact[-1]:
        compact.pop()
    return "\n".join(compact)


def _metadata_line(field: str, value: Any) -> str:
    label = escape(_field_label(field))
    if isinstance(value, list):
        visible = [item for item in value if _has_content(item)]
        if all(isinstance(item, dict) for item in visible):
            rendered_items: list[str] = []
            for index, item in enumerate(visible, start=1):
                assert isinstance(item, dict)
                values = " · ".join(
                    f"<b>{escape(_field_label(path))}:</b> {escape(_display(path, nested))}"
                    for path, nested in _flatten_mapping(item, prefix="")
                )
                rendered_items.append(f"• <b>{index}.</b> {values}")
            return f"<b>{label}:</b>\n" + "\n".join(rendered_items)
        items = "\n".join(f"• {escape(_display(field, item))}" for item in visible)
        return f"<b>{label}:</b>\n{items}"
    if _is_http_url(value) and (
        field in _LINK_LABELS or field.endswith("_url") or field.endswith(".url")
    ):
        return (
            f"<b>{label}:</b> "
            f'<a href="{escape(str(value), quote=True)}">{escape(_link_label(field))}</a>'
        )
    if isinstance(value, str) and field.split(".", 1)[0] in _RICH_TEXT_ROOTS:
        return f"<b>{label}</b>\n{_format_rich_text(value)}"
    return f"<b>{label}:</b> {escape(_display(field, value))}"


def format_event(product: str, data: dict[str, Any], *, fields: tuple[str, ...]) -> str:
    cleaned = _clean_value(data)
    clean_data = cleaned if isinstance(cleaned, dict) else {}
    normalized_product = product.replace("_", "-")
    icon, label = _PRODUCT_PRESENTATION.get(
        normalized_product,
        ("🔔", _humanize(normalized_product)),
    )
    symbol = str(clean_data.get("symbol") or "").strip()
    heading = label
    if symbol and symbol.upper() not in {"N/A", "MARKET"}:
        heading = f"{label} · {symbol.upper()}"
    sections = [f"{icon} <b>{escape(heading)}</b>"]

    if fields == ("*",):
        projected = clean_data
        selected_fields = tuple(projected)
    else:
        projected = {
            field: value
            for field in fields
            if (value := _read_path(clean_data, field)) is not _MISSING and _has_content(value)
        }
        selected_fields = fields

    for field in _HEADLINE_FIELDS:
        value = projected.get(field, _MISSING)
        if value is not _MISSING and str(value).strip():
            sections.append(f"<b>{escape(str(value))}</b>")
            break

    for field in _BODY_FIELDS:
        if field not in projected:
            continue
        value = projected[field]
        if isinstance(value, dict):
            body_lines = [
                _metadata_line(path, nested)
                for path, nested in _flatten_mapping(value, prefix=field)
            ]
            if body_lines:
                sections.append("\n\n".join(body_lines))
        else:
            rendered = _display(field, value)
            sections.append(
                _format_rich_text(rendered) if isinstance(rendered, str) else escape(str(rendered))
            )

    metadata: list[str] = []
    links: list[str] = []
    reserved = _OMITTED_FIELDS | set(_HEADLINE_FIELDS) | set(_BODY_FIELDS)
    metadata_fields = [
        field for field in selected_fields if field not in reserved and field in projected
    ]
    metadata_fields.sort(key=lambda field: _METADATA_PRIORITY.get(field, 50))
    for field in metadata_fields:
        value = projected[field]
        if field in _LINK_LABELS and _is_http_url(value):
            links.append(
                f'<a href="{escape(str(value), quote=True)}">{escape(_link_label(field))}</a>'
            )
        elif isinstance(value, dict):
            metadata.extend(
                _metadata_line(path, nested)
                for path, nested in _flatten_mapping(value, prefix=field)
            )
        else:
            metadata.append(_metadata_line(field, value))

    if metadata:
        sections.append("\n\n".join(metadata))
    if links:
        sections.append("  ·  ".join(links))
    return "\n\n".join(sections)


class _HTMLTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def _plain_html_text(value: str) -> str:
    parser = _HTMLTextExtractor()
    parser.feed(value)
    parser.close()
    return "".join(parser.parts)


def _escaped_chunks(value: str, max_chars: int) -> list[str]:
    chunks: list[str] = []
    current = ""
    for character in value:
        encoded = escape(character)
        if current and len(current) + len(encoded) > max_chars:
            chunks.append(current)
            current = ""
        current += encoded
    if current:
        chunks.append(current)
    return chunks


def build_notification_batches(
    event_messages: list[str],
    *,
    max_chars: int = 4096,
) -> list[str]:
    batches: list[str] = []
    current = ""
    for message in event_messages:
        if len(message) > max_chars:
            if current:
                batches.append(current)
                current = ""
            batches.extend(_escaped_chunks(_plain_html_text(message), max_chars))
            continue
        candidate = f"{current}\n\n──────────\n\n{message}" if current else message
        if len(candidate) <= max_chars:
            current = candidate
        else:
            batches.append(current)
            current = message
    if current:
        batches.append(current)
    return batches
