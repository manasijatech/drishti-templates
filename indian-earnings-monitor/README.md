# Indian Earnings, News, and Concall Monitor

A runnable, source-linked Drishti CLI for an Indian-equities research desk. It refreshes the
upcoming earnings/concall calendar, recovers earnings/news/concall records over REST, consumes
three independent WebSocket subscriptions, and routes accepted records into a durable analyst
review queue.

This is event monitoring only. It does not place broker orders and is not a full tick feed.

## Architecture and data boundary

```text
coverage JSON -> upcoming REST endpoints -> separate calendar records
              -> list REST recovery      -> queue records + window checkpoints
raw WebSocket -> ack/control handling     -> queue records
                                      \--> failure/retry queue + append-only audit
```

`var/state.json` contains checkpoints, calendar records, review events, amendment links, and
active/resolved failures. `var/audit.jsonl` is append-only. Calendar entries never become
delivered `ResearchEvent` records implicitly. Provider source content is separate from the
unused `generated_summary` field; this version performs no AI generation.

Coverage owners, priorities, delivery names, and SLAs are local operator policy. Drishti's
upcoming APIs do not assign analysts, so assigning or changing calendar ownership remains an
explicit operator workflow outside the provider record.

## Safe setup and authentication

Python 3.11 or newer is required:

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install -e '.[dev]'
cp .env.example .env
```

Set `DRISHTI_API_KEY` only in the server process environment. REST requests send it in the
`X-API-Key` header. Never put a real key in JSON, browser code, logs, or git. The examples have
no credentials.

## Deterministic demo

```bash
drishti-monitor --config config.example.json --state-dir /tmp/drishti-demo demo
drishti-monitor --config config.example.json --state-dir /tmp/drishti-demo queue
drishti-monitor --config config.example.json --state-dir /tmp/drishti-demo calendar
drishti-monitor --config config.example.json --state-dir /tmp/drishti-demo failures
```

`demo` needs no key or network. It runs event recovery and both upcoming-calendar refreshes
against deterministic fixtures. Keeping its state directory demonstrates deduplication; use a
new temporary directory for a fresh run.

## Live commands

These calls can consume Drishti credits; WebSockets require an entitled paid plan.

```bash
export DRISHTI_API_KEY='...'

# Recover all three event products and refresh both calendars once, then exit.
drishti-monitor --config config.example.json --state-dir var live-smoke

# Refresh or list schedule records separately.
drishti-monitor --config config.example.json --state-dir var calendar-refresh
drishti-monitor --config config.example.json --state-dir var calendar

# Recover, connect, acknowledge subscriptions, and continue through reconnects.
drishti-monitor --config config.example.json --state-dir var watch
```

`watch` sends one subscription each for `earnings`, `news`, and `concalls`. A documented
`status: subscribed` acknowledgement is audited as control data, not processed as a market
event. After disconnect, the same production loop performs REST recovery before opening the
next socket and replaying subscriptions.

REST recovery chunks coverage into at most 20 symbols per request, paginates with a maximum
configured limit of 50, and uses inclusive `from`/`to` windows. A channel checkpoint advances
to the completed window end only after every symbol chunk/page has produced a durable outcome.
A failed page leaves that channel's prior checkpoint unchanged, making restart gap-safe.

## Review, source, and failure operations

```bash
drishti-monitor --config config.example.json --state-dir var queue
drishti-monitor --config config.example.json --state-dir var add-note earnings RECORD_ID 'Checked PDF'
drishti-monitor --config config.example.json --state-dir var mark-reviewed earnings RECORD_ID
drishti-monitor --config config.example.json --state-dir var failures
drishti-monitor --config config.example.json --state-dir var retry-failure FAILURE_ID

# Resolve billed source artifacts only when an analyst needs them.
drishti-monitor --config config.example.json --state-dir var resolve-source earnings RECORD_ID
drishti-monitor --config config.example.json --state-dir var resolve-source concalls RECORD_ID
```

Parsing failures and exhausted delivery attempts remain visible and retryable until resolved;
resolution is audited rather than deleting history. Amendments preserve both records and expose
`amendment_of` plus `related_identities` in queue output.

News sources use the verified `link` field. Earnings PDFs are resolved on demand with
`GET /v1/earnings/attachments`, whose result is `data[{id,status,url,...}]`. Concall artifacts
are resolved with `GET /v1/concalls/transcript?symbol=...&quarter=...`, returning verified
`transcript_url` and `audio_url`. When the provider reports no artifact, source fields remain
`null`; the provider ID remains available for later retry. Undocumented `recording_url` and
earnings `attachment_url` payload assumptions are not used.

The built-in delivery adapter writes JSON to stdout. Delivery names in configuration are policy
metadata, not implicit third-party calls. Replace the adapter with a server-side integration.

## Verified endpoint coverage

- `GET /v1/earnings`, `GET /v1/news`, `GET /v1/concalls`
- `GET /v1/earnings/upcoming`, `GET /v1/concalls/upcoming`
- `GET /v1/earnings/attachments`, `GET /v1/concalls/transcript`
- `wss://developers.manasija.in/v1/ws`

The implementation follows the checked OpenAPI `data`/`has_next`, `page`/`limit`, and artifact
response shapes. It does not invent cursors or provider fields.

## Validation

```bash
ruff format --check .
ruff check .
mypy --strict
pytest
python -m build
```

Tests cover configuration, 20-symbol chunks, pagination, calendars, empty results, late
transcripts, artifacts/audio, amendments and related versions, durable failures/retry,
notes/review, crash-safe checkpoints, acknowledgements, reconnect/resubscription, deduplication,
source output, and audit history.

## Authoritative contracts

Consulted 2026-09-02:

- [Drishti overview and base URLs](https://drishti.manasija.in/docs)
- [Authentication](https://drishti.manasija.in/docs/guides/authentication)
- [Pagination and filtering](https://drishti.manasija.in/docs/guides/pagination-filtering)
- [Earnings list](https://drishti.manasija.in/docs/api-reference/earnings/list-earnings-filings)
- [News list](https://drishti.manasija.in/docs/api-reference/news/list-news-feed-items)
- [Conference-call list](https://drishti.manasija.in/docs/api-reference/conference-calls/list-conference-calls)
- [WebSocket streams](https://drishti.manasija.in/docs/guides/websockets)
- [OpenAPI contract](https://developers.manasija.in/openapi.json)

## Known limitations

There is no calendar-owner mutation command, cross-product semantic correlation, third-party
delivery adapter, AI summarization, broker execution, or tick feed. Artifact URLs may expire;
resolve them again on demand. JSON state is suitable for this focused single-process template,
not concurrent multi-process writers.
