# Order Win Tracker

Strictly typed ingestion pipeline for Indian listed-company order-win announcements. It retrieves the Drishti announcement feed with the exact `Award/Receipt of Order` category, validates each response, and stores an idempotent projection in MongoDB. A small terminal UI shows the active ingestion stage, counters, and each row as it is stored.

## Current slice

- Bun and Hono API
- Official `drishti-sdk` integration
- MongoDB persistence through Mongoose
- Unauthenticated manual ingestion and reads
- Cursor-paginated order-win reads
- Lightweight OpenTUI ingestion view
- Append-only architecture decisions in `decision.md`

No browser UI, inferred contract values, scheduler, WebSocket consumer, or npm scaffolding CLI is included yet.

## Terminal UI

With MongoDB running and the environment variables in `.env` configured, start one live ingestion:

```bash
bun run cli
```

The screen updates while pages are fetched and rows are inserted, updated, skipped as unchanged, or rejected. Press `q` to exit after the run. To preview the interface without MongoDB or an API key:

```bash
bun run cli:demo
```

## Run with Docker

```bash
cp .env.example .env
```

Set `DRISHTI_API_KEY`, then run:

```bash
docker compose up --build
```

The API listens on `http://localhost:3000` by default.
Docker Compose initializes MongoDB as a single-node replica set for lease-fenced projection transactions.
The published API port binds to loopback only. The API has no application authentication; keep it private or add authentication at a TLS reverse proxy before exposing it beyond the host.

Open `http://localhost:3000/docs` for Scalar's interactive API client. The OpenAPI document is available at `http://localhost:3000/openapi.json`.

## Configure tracked symbols

The default configuration tracks the whole market:

```bash
curl http://localhost:3000/api/v1/tracking-configurations/current
```

Replace it with a symbol allowlist for future ingestion runs:

```bash
curl -X PUT http://localhost:3000/api/v1/tracking-configurations/current \
  -H "Content-Type: application/json" \
  -d '{"symbols":["TCS","RELIANCE"]}'
```

Symbols are trimmed, uppercased, deduplicated, and sorted. Send `{"symbols":[]}` to return to all-market mode. Existing stored order wins are retained when the configuration changes.

## Ingest order wins

Use the configured lookback window:

```bash
curl -i -X POST http://localhost:3000/api/v1/order-win-ingestions \
  -H "Content-Type: application/json" \
  -d '{}'
```

Or provide an explicit UTC window:

```bash
curl -i -X POST http://localhost:3000/api/v1/order-win-ingestions \
  -H "Content-Type: application/json" \
  -d '{"from":"2026-09-01T00:00:00Z","to":"2026-09-07T23:59:59Z"}'
```

## Read order wins

```bash
curl "http://localhost:3000/api/v1/order-wins?symbol=RELIANCE&limit=25"
```

Pass `meta.nextCursor` back as the `cursor` query parameter for the next page.

## Extension points

- Implement `AnnouncementSource` for another upstream provider.
- Implement `OrderWinRepository` for another persistence technology.
- Add new pipeline behavior around `OrderWinIngestionService`, not in Hono handlers.
- Preserve raw source-backed fields. Add extraction as a separate stage with explicit confidence and provenance.

## Quality commands

```bash
bun install
bun run check
bun run test
bun run build
```
