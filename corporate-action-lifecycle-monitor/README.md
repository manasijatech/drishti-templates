# Corporate Action Lifecycle Monitor

An open-source Drishti template for turning Indian exchange filings into persistent, source-linked corporate-action lifecycles.

The project combines a Next.js dashboard, a Hono API, MongoDB persistence, REST catch-up, and WebSocket updates. Every stage and material change remains linked to its source filing.

## What it tracks

- Bonus Issue
- Buyback
- Conversion of Warrants
- De-listing
- Demerger
- Dividend
- Issue of Securities
- Merger
- Offer for Sale (OFS)
- Redemption of Securities
- Rights Issue
- Stock Split

Lifecycle reconstruction is deterministic and filing-derived. Optional AI validation is advisory only and never changes stages, dates, terms, or grouping.

## Quick start with Docker

Requirements: Docker and a [Drishti API key](https://drishti.manasija.in).

```bash
cp .env.example .env
```

Set `DRISHTI_API_KEY` in `.env`, then run:

```bash
docker compose up --build
```

Open:

- Dashboard: `http://localhost:3000`
- API documentation: `http://localhost:4000/docs`
- API health: `http://localhost:4000/health`

MongoDB starts automatically and stores data in the `mongo-data` volume.

## Local development

Requirements: Bun 1.3+, Node.js 24+, and MongoDB.

```bash
bun install
cp .env.example .env
bun run dev:api
```

In a second terminal:

```bash
bun run dev
```

The API can start without `DRISHTI_API_KEY`, but ingestion and symbol validation remain disabled until the key is configured.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `DRISHTI_API_KEY` | For live data | Server-side access to Drishti REST and WebSocket APIs |
| `MONGODB_URI` | No | MongoDB connection; defaults to local MongoDB |
| `MONGODB_MAX_POOL_SIZE` | No | Maximum MongoDB pool size; defaults to `10` |
| `API_INTERNAL_URL` | No | API address used by the Next.js rewrite |
| `PUBLIC_API_URL` | No | Public API URL shown in OpenAPI metadata |
| `FRONTEND_ORIGIN` | No | Allowed browser origin for API and WebSocket access |
| `NEXT_PUBLIC_LIFECYCLE_WS_URL` | No | Browser-facing lifecycle WebSocket URL |
| `OPENROUTER_API_KEY` | No | Enables advisory validation through OpenRouter |

When `OPENROUTER_API_KEY` exists, the server uses `deepseek/deepseek-v4-flash-0731:nitro` through the OpenAI SDK. Provider failures or invalid output leave the deterministic lifecycle unchanged and produce no AI badge.

Never expose either API key through a `NEXT_PUBLIC_` variable.

## How it works

```text
Drishti REST catch-up ─┐
                      ├─> filing store ─> deterministic lifecycle engine ─> MongoDB
Drishti WebSocket ────┘                                      │
                                                            ├─> Hono REST API
                                                            └─> browser WebSocket
```

REST handles initial history, explicit synchronization, and reconnect-gap recovery. WebSockets handle continuous updates. Announcement-ID upserts keep overlapping recovery windows idempotent.

## API

```text
GET    /health
GET    /api/symbols
POST   /api/symbols                 { "symbol": "TCS" }
DELETE /api/symbols/:symbol
POST   /api/symbols/:symbol/sync
GET    /api/lifecycles
GET    /api/lifecycles/:id
GET    /api/announcements/:id/source
WS     /ws/lifecycles
GET    /openapi.json
GET    /docs
```

## Make it your own

The main customization points are:

- `apps/api/src/domain.ts` — action definitions, stages, matching, and term normalization
- `apps/api/src/lifecycle-service.ts` — synchronization and rebuild pipeline
- `apps/api/src/lifecycle-validator.ts` — optional advisory validation
- `packages/contracts/src/index.ts` — shared API and UI types
- `src/components/corporate-action-dashboard.tsx` — dashboard behavior and presentation
- `src/styles/app.css` — theme tokens and global styling

Fork the project, change the action maps or interface, replace MongoDB behind the repository contract, or consume the API from another client.

## Verification

```bash
bun run env:validate
bun run lint
bun run typecheck
bun test
bun run build
docker compose config
```

## Project structure

```text
apps/api/             Hono API, ingestion, persistence, lifecycle engine
packages/contracts/   Shared TypeScript contracts
src/app/              Next.js app entry points
src/components/       Dashboard and small UI primitives
src/styles/           Global theme and layout styles
```

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report security issues using [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
