# Indian Earnings, News, and Concall Monitor

A small command-line tool that watches earnings, news, and concalls for the Indian companies in
`config.example.json`. It collects matching updates in a local review queue. It does not trade,
publish, or message anyone.

## Try it in two minutes

Install it:

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install -e .
```

Try the safe sample first. It needs no key and makes no network calls:

```bash
drishti-monitor demo
```

For live data, set your key and choose one command:

```bash
export DRISHTI_API_KEY='...'

drishti-monitor check  # fetch new updates once, then exit
drishti-monitor run    # keep watching; press Ctrl+C to stop
```

See what was collected:

```bash
drishti-monitor queue
drishti-monitor calendar
```

That is enough for normal use. The tool automatically stores its checkpoints and queue in
`var/`, so you do not need to pass or manage a state directory. Edit `config.example.json` to
change the companies, owners, and products being monitored.

## Architecture and data boundary

```text
coverage JSON -> Drishti SDK REST methods -> calendar records / recovery checkpoints
              -> Drishti SDK WebSocket   -> queue records
                                      \--> failure/retry queue + append-only audit
```

`var/state.json` contains checkpoints, calendar records, review events, amendment links, and
active/resolved failures. `var/audit.jsonl` is append-only. Calendar entries never become
delivered `ResearchEvent` records implicitly. Provider source content is separate from the
unused `generated_summary` field; this version performs no AI generation.

Coverage owners, priorities, delivery names, and SLAs are local operator policy. Drishti's
upcoming APIs do not assign analysts, so each calendar record deterministically inherits its
owner from coverage configuration; changing ownership is an explicit configuration workflow.
Every refresh preserves `schedule_history` and reports `schedule_status` as `scheduled`,
`changed`, or `unconfirmed`. Calendar records also show related delivered identities and
whether the expected filing/call plus filing artifact, transcript, and audio have arrived.
Upcoming requests include only symbols whose coverage enables that product.

## Setup and authentication details

Python 3.11 or newer is required:

Install `.[dev]` instead of `.` only when you also want the test and lint tools. `.env.example`
documents the available environment variables, but the CLI does not automatically load `.env`.

The template depends on `drishti-sdk>=1.0.15,<2`. Set `DRISHTI_API_KEY` only in the server
process environment. The official SDK sends it in the `X-API-Key` header. Never put a real key
in JSON, browser code, logs, or git. The examples have no credentials. `DRISHTI_BASE_URL` is an
optional SDK base URL and must not include `/v1`.

## Deterministic demo

```bash
drishti-monitor demo
drishti-monitor queue
drishti-monitor calendar
```

`demo` needs no key or network. It runs event recovery and both upcoming-calendar refreshes
against deterministic fixtures. Keeping its state directory demonstrates deduplication; use a
new temporary directory for a fresh run.

## Advanced commands

These calls can consume Drishti credits; WebSockets require an entitled paid plan.

```bash
export DRISHTI_API_KEY='...'

# These older operator names remain supported for compatibility.
drishti-monitor live-smoke
drishti-monitor calendar-refresh
drishti-monitor watch

# Override defaults only when you need separate coverage or storage.
drishti-monitor --config my-coverage.json --state-dir my-state check
```

`run` (or its older name, `watch`) performs REST recovery, opens the official SDK's async managed WebSocket session, and
subscribes separately to enabled `earnings`, `news`, and `concalls` coverage with
`detailed=True`. Only SDK events with `kind="data"` become research records. Subscription,
heartbeat, error, and other control events are audited. The SDK owns authentication,
reconnection, subscription replay, and close lifecycle; this template does not send raw frames
or implement a second reconnect loop.

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
`amendment_of`, `related_identities`, and `amendment_changes` in queue output. The latter maps
changed source/research field names to `{before, after}` values and deliberately excludes local
workflow state such as assignment, review, delivery, notes, routing, and relationships.

Every queued event has an internal `routing_reason` naming the matched symbol/product coverage
and assigned owner. When a provider row has no company name, the display value is
`<SYMBOL> (company name unavailable)` rather than a null label; this is display metadata, not a
provider-supplied company field.

Cross-product relations are deliberately deterministic and bidirectional. Earnings and concalls
relate only when both have the same symbol and verified quarter. Quarterless news relates to an
earnings or concall record only when the symbol and provider source-date (`YYYY-MM-DD`) match;
the monitor never invents a quarter. This conservative news rule can omit stories published on a
different date even when an analyst would consider them related. Calendar reconciliation uses a
unique product+symbol+quarter match (or a unique product+symbol candidate when the event has no
quarter); ambiguous schedules remain unlinked for operator review.

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

All endpoints above are called through the official Python SDK's product-specific methods. The
adapter follows `data`/`has_next`, `page`/`limit`, and artifact response shapes and does not
invent cursors or provider fields.

## Validation

```bash
ruff format --check .
ruff check .
mypy --strict
pytest
python -m build
```

Tests use SDK-boundary fakes and cover configuration, 20-symbol chunks, pagination, calendars, empty results, late
transcripts, artifacts/audio, amendments and related versions, durable failures/retry,
notes/review, crash-safe checkpoints, managed WebSocket control/data separation and independent
subscriptions, deduplication, source output, and audit history. The deterministic demo also uses
an SDK-boundary fake and needs neither a key nor network access.

## Authoritative contracts

Consulted 2026-09-02:

- [Drishti overview and base URLs](https://drishti.manasija.in/docs)
- [Authentication](https://drishti.manasija.in/docs/guides/authentication)
- [Pagination and filtering](https://drishti.manasija.in/docs/guides/pagination-filtering)
- [Earnings list](https://drishti.manasija.in/docs/api-reference/earnings/list-earnings-filings)
- [News list](https://drishti.manasija.in/docs/api-reference/news/list-news-feed-items)
- [Conference-call list](https://drishti.manasija.in/docs/api-reference/conference-calls/list-conference-calls)
- [WebSocket streams](https://drishti.manasija.in/docs/guides/websockets)
- [Python SDK](https://drishti.manasija.in/docs/sdks/python)
- [Quickstart](https://drishti.manasija.in/docs/quickstart)
- [OpenAPI contract](https://developers.manasija.in/openapi.json)

## Known limitations

There is no calendar-owner mutation command, fuzzy/semantic relation inference, third-party
delivery adapter, AI summarization, broker execution, or tick feed. Artifact URLs may expire;
resolve them again on demand. Ambiguous calendar matches are intentionally left unlinked. JSON
state is suitable for this focused single-process template, not concurrent multi-process writers.
REST recovery runs before a watch session starts; reconnection during that session is managed by
the SDK and does not trigger an application-level REST recovery on every reconnect.
