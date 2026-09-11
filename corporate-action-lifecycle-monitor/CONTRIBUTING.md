# Contributing

Contributions that improve lifecycle accuracy, source traceability, reliability, documentation, or the dashboard are welcome.

## Setup

```bash
bun install
cp .env.example .env
bun run env:validate
```

Start MongoDB, then run the API and frontend in separate terminals:

```bash
bun run dev:api
bun run dev
```

## Before opening a pull request

```bash
bun run lint
bun run typecheck
bun test
bun run build
```

Keep pull requests focused. Add tests when changing lifecycle classification, grouping, stage evidence, term normalization, synchronization, or API behavior. Update the README when configuration or public behavior changes.

Do not commit API keys, production connection strings, exported customer data, or exchange documents that cannot be redistributed.

## Design boundaries

- Source filings remain the authority for lifecycle state.
- AI validation is optional and advisory.
- Missing evidence must remain visibly missing.
- REST is for catch-up and recovery; WebSockets are the continuous path.
- One filing may update more than one corporate-action lifecycle.

By contributing, you agree that your changes are licensed under the MIT License.
