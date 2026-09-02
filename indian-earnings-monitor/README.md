# Indian Earnings, News, and Concall Monitor

A runnable, source-linked Drishti CLI template for an Indian-equities research desk. It
recovers missed earnings, news, and conference-call records over REST, consumes each live
product as a separate WebSocket subscription, and routes accepted records into a persistent
analyst review queue.

This template monitors research events only. It cannot place broker orders and it is not a
full tick-level market-data feed. Use a broker API for execution and a licensed market-data
feed for ticks.

## Architecture

```text
coverage JSON -> REST recovery (one checkpoint/product) -> normalize + deduplicate
                                                        -> deterministic owner/SLA
raw WebSocket -> separate earnings/news/concalls frames -> review queue + delivery retry
                                                        -> append-only audit JSONL
```

State lives under `var/` by default: `state.json` is the queue/checkpoint read model and
`audit.jsonl` is the append-only activity trail. Provider source content and the optional
`generated_summary` field are separate. Version 0.1 does not generate summaries.

## Safe setup

Python 3.11 or newer is required. From this directory:

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install -e '.[dev]'
cp .env.example .env
```

Do not put a real key in configuration or client-side code. Export it only in the server
process environment (`set -a; . ./.env; set +a` is one local option). The checked-in coverage
example uses public symbols and placeholder destinations, and contains no credentials.

## Deterministic demo

```bash
drishti-monitor --config config.example.json --state-dir /tmp/drishti-monitor-demo demo
drishti-monitor --config config.example.json --state-dir /tmp/drishti-monitor-demo queue
```

The demo performs the complete REST-to-queue workflow using deterministic fixtures and needs
no network or API key. Remove the demo state directory before rerunning if you want to see the
same records accepted again; keeping it demonstrates deduplication.

## Optional live smoke and service

An API key with the relevant product access is required. WebSockets require a paid Drishti
plan. These commands make billable API calls; list detail mode costs more than summary mode.

```bash
export DRISHTI_API_KEY='...'
drishti-monitor --config config.example.json --state-dir var live-smoke
drishti-monitor --config config.example.json --state-dir var watch
```

`live-smoke` performs one bounded recovery and exits. `watch` performs bounded recovery, opens
the raw socket, sends independent `earnings`, `news`, and `concalls` subscribe frames, and
processes envelopes until interrupted. After any disconnect it recovers from each saved REST
checkpoint before reconnecting and replaying all subscriptions. Inclusive time bounds can
redeliver the checkpoint record; provider-ID deduplication makes that safe.

The built-in delivery adapter prints JSON to stdout. Replace `console_delivery` with a
server-side queue, Slack, or email adapter; the retry boundary updates visible delivery state
and appends failures to the audit trail. Delivery destinations in the coverage file are policy
metadata and are never called implicitly.

## Review workflow and records

Every accepted event preserves provider ID, channel, symbol/company, provider source time,
local received time, source URL when supplied, review state, owner, priority, and deadline.
Notes and review transitions use `Monitor.add_note` and `Monitor.mark_reviewed`. The business
key `(channel, symbol, quarter, source date)` identifies a new provider ID as an amendment
when a quarter is supplied; both versions remain in the queue and the amendment is raised to
high priority. News without a quarter is deduplicated only by provider ID so distinct same-day
stories are never mislabeled as amendments.

List endpoints do not always supply source URLs. Earnings attachment URLs should be resolved
on demand through `/v1/earnings/attachments`; concall artifacts can arrive later and should be
accepted as later records. This first version deliberately does not prefetch billed attachments,
correlate records across different products, deliver to third-party services, or call AI.

## Validation

```bash
ruff format --check .
ruff check .
mypy
pytest
python -m build
```

Tests cover configuration, pagination, headers and query construction, empty responses,
checkpoints, all three product shapes, source preservation, late transcripts, amendments,
delivery failure/retry, analyst notes/review, socket envelopes, independent subscription state,
REST-before-resubscribe ordering, deduplication, and audit output.

## Authoritative Drishti contracts

Consulted on 2026-09-02:

- [Drishti overview and base URLs](https://drishti.manasija.in/docs)
- [Authentication](https://drishti.manasija.in/docs/guides/authentication)
- [Pagination and filtering](https://drishti.manasija.in/docs/guides/pagination-filtering)
- [Earnings list](https://drishti.manasija.in/docs/api-reference/earnings/list-earnings-filings)
- [News list](https://drishti.manasija.in/docs/api-reference/news/list-news-feed-items)
- [Conference-call list](https://drishti.manasija.in/docs/api-reference/conference-calls/list-conference-calls)
- [WebSocket streams and envelopes](https://drishti.manasija.in/docs/guides/websockets)
- [Executable OpenAPI contract](https://developers.manasija.in/openapi.json)

The implementation uses the documented `data` plus `has_next` response and `page`/`limit`
pagination. It does not infer undocumented cursors or provider fields.
