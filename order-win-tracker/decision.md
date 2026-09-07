# Decision Log

This file is append-only. If a decision changes, add a new entry that references and supersedes the earlier entry. Do not rewrite historical decisions.

## D-001: Build an independent template

- Date: 2026-09-07
- Status: Accepted
- Context: The repository contains other Drishti templates, but this service must remain a separate entity.
- Decision: Create `order-win-tracker` as a self-contained top-level Bun workspace with no imports from sibling templates.
- Reasons: Independent installation, upgrades, tests, and deployment prevent accidental coupling.
- Alternatives considered: Extend `chat-drishti-mcp`; rejected because its agent-chat architecture is unrelated.
- Consequences: Some configuration is duplicated intentionally.
- Supersedes: None

## D-002: Make the first release headless

- Date: 2026-09-07
- Status: Accepted
- Context: The first useful increment is deterministic ingestion and retrieval, not a dashboard.
- Decision: Implement only the Hono API in the first slice. Defer Next.js, Tailwind, shadcn, and Fumadocs until an API documentation or product UI slice is approved.
- Reasons: A smaller vertical slice validates the data source, persistence model, and extension seams first.
- Alternatives considered: Scaffold an empty frontend; rejected because unused code creates maintenance without user value.
- Consequences: The selected frontend stack remains planned but is not installed in this slice.
- Supersedes: None

## D-003: Use the official Drishti SDK deterministically

- Date: 2026-09-07
- Status: Accepted
- Context: Product pipelines need deterministic control over API calls.
- Decision: Use server-side `drishti-sdk` and `getAnnouncements` with the exact category `Award/Receipt of Order` and `detailed: true`.
- Reasons: The SDK ships typed helpers and avoids model-selected MCP calls.
- Alternatives considered: Drishti MCP and direct REST calls; rejected for this pipeline step.
- Consequences: A valid `DRISHTI_API_KEY` is required for live ingestion.
- Supersedes: None

## D-004: Validate every external boundary at runtime

- Date: 2026-09-07
- Status: Accepted
- Context: Compile-time SDK and ODM types do not prove runtime payload validity.
- Decision: Parse environment variables, HTTP input, Drishti responses, and database projections with Zod-owned contracts.
- Reasons: Invalid upstream or persisted data must fail explicitly rather than contaminate the domain model.
- Alternatives considered: Trust SDK declarations; rejected because declarations do not validate network data.
- Consequences: Contract changes produce visible ingestion failures that require deliberate handling.
- Supersedes: None

## D-005: Separate ports from adapters

- Date: 2026-09-07
- Status: Accepted
- Context: The pipeline must be easy to extend and test.
- Decision: Define announcement-source and repository ports in the core package, with Drishti and Mongoose in adapter packages.
- Reasons: New sources and stores can be introduced without changing pipeline orchestration or Hono routes.
- Alternatives considered: Call SDK and Mongoose directly from routes; rejected because it couples transport, workflow, and infrastructure.
- Consequences: The workspace has more packages, but each package has a narrow responsibility.
- Supersedes: None

## D-006: Use source IDs for idempotency

- Date: 2026-09-07
- Status: Accepted
- Context: Incremental windows overlap intentionally and upstream rows may reappear.
- Decision: Uniquely identify records by `(source, sourceAnnouncementId)` and track content hashes to distinguish inserts, updates, and unchanged rows.
- Reasons: Replays become safe while amended announcement content can still update.
- Alternatives considered: Deduplicate by symbol and date; rejected because multiple valid disclosures can share both.
- Consequences: A changed source record updates the projection while preserving first-seen time.
- Supersedes: None

## D-007: Use Better Auth with an administrator allowlist

- Date: 2026-09-07
- Status: Accepted
- Context: Email/password auth is required, and ingestion must not be triggerable by every registered user.
- Decision: Mount Better Auth on Hono and authorize ingestion when the session email is listed in `ADMIN_EMAILS`.
- Reasons: It is explicit, environment-controlled, and avoids a premature mutable authorization model.
- Alternatives considered: First-user-is-admin and a role plugin; rejected because signup ordering is unsafe and role management is outside this slice.
- Consequences: Administrators are changed through deployment configuration.
- Supersedes: None

## D-008: Use Mongoose for pipeline data and the native Mongo adapter for auth

- Date: 2026-09-07
- Status: Accepted
- Context: The selected stack requires Mongoose, while Better Auth's supported MongoDB adapter consumes a native `Db` and optional `MongoClient`.
- Decision: Use Mongoose repositories for order-win data and a shared native MongoDB client for Better Auth collections.
- Reasons: This follows both supported integration paths without implementing a custom auth adapter.
- Alternatives considered: A custom Mongoose Better Auth adapter; rejected as unnecessary security-sensitive code.
- Consequences: The API process owns two clients to the same MongoDB deployment and closes both on shutdown.
- Supersedes: None

## D-009: Defer the npm scaffolding CLI

- Date: 2026-09-07
- Status: Accepted
- Context: `npm create order-tracker-drishti@latest` is the desired installation experience, but publishing an installer before the template contract stabilizes would freeze an incomplete interface.
- Decision: Implement and verify the API template first, then package it in `create-order-tracker-drishti` as the next distribution slice.
- Reasons: The installer should consume a tested template rather than duplicate evolving setup logic.
- Alternatives considered: Build the CLI in parallel; rejected to preserve the one-step implementation scope.
- Consequences: This slice runs from the repository with Docker Compose; one-command scaffolding follows later.
- Supersedes: None

## D-010: Pin verified registry versions

- Date: 2026-09-07
- Status: Accepted
- Context: The initially selected Better Auth version did not have a matching separately published MongoDB adapter.
- Decision: Pin `better-auth` and `@better-auth/mongo-adapter` to the same verified npm release, `1.7.3`, and keep exact versions for infrastructure-facing dependencies.
- Reasons: Matching core and adapter releases avoids peer-contract drift and makes generated installations reproducible.
- Alternatives considered: Use version ranges or an older undocumented adapter; rejected because either can produce non-reproducible or unsupported combinations.
- Consequences: Dependency upgrades are deliberate changes and require a new decision entry when they alter integration behavior.
- Supersedes: None

## D-011: Skip dependency declaration checking

- Date: 2026-09-07
- Status: Accepted
- Context: Bun's ambient declarations and Node's declarations currently conflict inside dependency type files under TypeScript 5.8, before application code is checked.
- Decision: Enable `skipLibCheck` while retaining all strict checks for repository source code.
- Reasons: The conflict is between third-party declaration packages and cannot be corrected by application code. Checking dependencies would make the build depend on an upstream declaration mismatch.
- Alternatives considered: Disable DOM types or patch installed dependencies; rejected because the service uses Web APIs and generated dependency patches are brittle.
- Consequences: TypeScript trusts dependency declaration internals, while imports and all project-owned code remain fully typechecked.
- Supersedes: None

## D-012: Run local MongoDB as a replica set

- Date: 2026-09-07
- Status: Accepted
- Context: Better Auth uses transactions when its MongoDB adapter receives a client, and standalone MongoDB rejects transaction numbers.
- Decision: Initialize the Docker MongoDB service as a single-node `rs0` replica set and include `replicaSet=rs0` in the application connection string.
- Reasons: Keeping transactions enabled follows the supported Better Auth adapter path and gives future multi-document pipeline writes the same capability.
- Alternatives considered: Omit the client and disable auth transactions; rejected because it weakens write atomicity to avoid a solvable local topology issue.
- Consequences: Docker Compose includes a one-shot replica-set initialization service and API startup waits for it.
- Supersedes: None

## D-013: Gate administrator provisioning with a separate secret

- Date: 2026-09-07
- Status: Accepted
- Context: An email allowlist alone lets an unauthenticated caller register an administrator address before its owner.
- Decision: Permit email/password signup only when the requested address is in `ADMIN_EMAILS` and the request presents the independent `AUTH_BOOTSTRAP_TOKEN` header secret.
- Reasons: Provisioning no longer depends on who reaches public signup first, while retaining Better Auth's supported signup flow.
- Alternatives considered: First-user bootstrap and unrestricted allowlisted signup; rejected because both remain vulnerable to account preemption.
- Consequences: Operators must distribute and rotate a second secret, and ordinary public user registration is intentionally unavailable in this headless administrator-only slice.
- Supersedes: D-007's implicit unrestricted signup behavior; administrator authorization remains allowlist-based.

## D-014: Use renewable ownership-checked ingestion leases

- Date: 2026-09-07
- Status: Accepted
- Context: A fixed-duration lock can expire during a long upstream request or multi-page run, allowing overlapping writers, and run-creation failure can otherwise leak the lock.
- Decision: Renew the lease after every source page and immediately before each projection write, abort when ownership or expiry checks fail, and place run creation inside the release-protected scope.
- Reasons: No write proceeds after a detected lost lease, long runs retain ownership, and all post-acquisition failures release only their own lease.
- Alternatives considered: A longer fixed lease and a permanent lock; rejected because neither handles both long runs and crashed owners safely.
- Consequences: Ingestion adds lease-update writes and requires the repository adapter to implement renewal.
- Supersedes: None

## D-015: Apply bounded and explicit external-input failure modes

- Date: 2026-09-07
- Status: Accepted
- Context: Unbounded upstream calls can hold resources indefinitely, malformed source dates were silently converted to missing data, malformed cursors were ignored, and authenticated API traffic had no endpoint-level throttle.
- Decision: Give every Drishti fetch attempt a configurable timeout, reject malformed announcement dates and cursors at their Zod boundaries, and enforce a configurable per-user fixed-window API limit in addition to Better Auth's own limits.
- Reasons: Invalid input and unavailable dependencies fail visibly and resource usage remains bounded.
- Alternatives considered: Silent normalization and relying only on infrastructure timeouts or auth-route limits; rejected because they hide data defects and leave application routes unbounded.
- Consequences: Previously tolerated malformed values now receive validation errors, and multi-instance deployments should replace process-local API counters with a shared limiter.
- Supersedes: None

## D-016: Normalize offset-less exchange timestamps as India Standard Time

- Date: 2026-09-07
- Status: Accepted
- Context: Drishti announcement timestamps can omit a UTC offset, and JavaScript otherwise interprets those values in the server's local timezone.
- Decision: Preserve explicit offsets and interpret offset-less announcement timestamps as India Standard Time (`UTC+05:30`) before storing UTC dates.
- Reasons: Indian exchange disclosure times must represent the same instant regardless of deployment timezone.
- Alternatives considered: Process-local interpretation and rejecting all offset-less timestamps; rejected because the former is nondeterministic and the latter rejects observed Drishti payloads.
- Consequences: This assumption must be revisited if Drishti documents a different timezone contract.
- Supersedes: None

## D-017: Listen on loopback outside containers by default

- Date: 2026-09-07
- Status: Accepted
- Context: Loopback-only Docker port publishing does not protect developers who run the Bun entry point directly.
- Decision: Default `API_HOST` to `127.0.0.1`; Docker Compose explicitly listens on `0.0.0.0` inside the isolated container while publishing only to host loopback.
- Reasons: Both supported startup paths now fail closed against unintended network exposure.
- Alternatives considered: Rely only on host firewalls or Compose port binding; rejected because direct execution bypasses Compose.
- Consequences: Intentional external exposure requires an explicit listener override and a TLS reverse proxy.
- Supersedes: None

## D-018: Fence projection writes with the MongoDB lease transaction

- Date: 2026-09-07
- Status: Accepted
- Context: Renewing a lease immediately before a separate projection write still leaves a pause window in which ownership can expire and transfer.
- Decision: Atomically validate and renew the ingestion lease in the same MongoDB transaction as each order-win projection write, and reconcile leftover `running` records after acquiring an otherwise available lease.
- Reasons: A stale worker conflicts with lease transfer rather than committing a projection, and crashed runs no longer remain permanently active.
- Alternatives considered: Best-effort renewal and a longer lease; rejected because elapsed time can never prove current write ownership.
- Consequences: MongoDB replica-set transactions are now required for projection writes as well as authentication, and repository adapters must preserve the lease-fencing guarantee.
- Supersedes: D-014's separate pre-write renewal; page-level renewal remains in place for bounded source fetches.

## D-019: Use database time and compare-on-running terminal updates

- Date: 2026-09-07
- Status: Accepted
- Context: A caller timestamp captured before a process pause can make an expired lease appear valid, and an old worker can otherwise overwrite a run already marked abandoned.
- Decision: Compare lease expiry with MongoDB `$$NOW`, derive renewed expiry from that same server time inside the projection transaction, and only complete runs whose persisted status is still `running`.
- Reasons: Process pauses cannot resurrect expired ownership, and terminal run states are monotonic.
- Alternatives considered: Refresh application time immediately before each command; rejected because a pause can still occur between capture and database execution.
- Consequences: Lease fencing depends on MongoDB aggregation-pipeline updates and server time rather than application-host clock synchronization.
- Supersedes: D-018's unspecified time source and unconditional run completion behavior.

## D-020: Remove application authentication

- Date: 2026-09-07
- Status: Accepted
- Context: The template owner explicitly does not require Better Auth or application-level authentication for this headless pipeline.
- Decision: Remove Better Auth, administrator provisioning, session checks, auth-specific MongoDB access, and all auth configuration. Keep API traffic bounded by a process-level fixed-window limit and loopback-only defaults.
- Reasons: Authentication would add unused operational and dependency surface against the stated requirement.
- Alternatives considered: Retain optional or disabled Better Auth wiring; rejected because dormant security-sensitive code still carries maintenance cost.
- Consequences: Every caller that can reach the service can read data and trigger ingestion. Operators must keep the listener private or add authentication at a TLS reverse proxy before wider exposure.
- Supersedes: D-007, D-008's auth-specific client decision, D-010's Better Auth version pin, D-012's auth rationale, and D-013. MongoDB remains a replica set for D-018/D-019 projection transactions.

## D-021: Prevent expired lease renewal with database time

- Date: 2026-09-07
- Status: Accepted
- Context: Page-level lease renewal still used application timestamps, which could resurrect ownership after a process pause even though projection writes used database time.
- Decision: Match active renewal leases against MongoDB `$$NOW` and derive renewed expiry from the same server timestamp.
- Reasons: Every ownership extension now shares the same pause-safe clock and cannot renew an already expired lease.
- Alternatives considered: Remove page-level renewal and rely only on transactional writes; rejected because bounded source fetches still benefit from explicit ownership loss detection before normalization work.
- Consequences: All lease renewal paths require MongoDB aggregation-pipeline update support.
- Supersedes: D-014's application-time page-level renewal behavior.

## D-022: Use database time for initial lease acquisition

- Date: 2026-09-07
- Status: Accepted
- Context: Initial acquisition still compared lease expiry and calculated its extension with application-host time, unlike renewal and fenced writes.
- Decision: Ensure the singleton lock document exists, then atomically acquire it only when its owner already matches or MongoDB `$$NOW` says it has expired; calculate the new expiry from that same server time.
- Reasons: Clock skew between API instances and MongoDB can no longer steal or incorrectly extend ownership.
- Alternatives considered: Require synchronized host clocks; rejected because correctness should not depend on external clock discipline.
- Consequences: Every lease lifecycle transition now uses MongoDB server time.
- Supersedes: D-014's application-time initial acquisition behavior.
