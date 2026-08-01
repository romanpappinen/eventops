# EventOps

**EventOps** is a multi-tenant event ingestion and operations platform built as a production-style portfolio project. It is not a toy CRUD app: the goal is to demonstrate practical backend architecture, multi-tenancy, authentication, database security (Row Level Security), background processing, testing, deployment, and a disciplined AI-assisted development workflow, end to end, on a real deployed system rather than a local-only demo.

---

## What This Project Does

A tenant (a company or team) registers, creates a workspace, and invites teammates. The tenant's own backend systems can then authenticate with a scoped API key and send business/system events into EventOps:

```json
{
  "source": "checkout-service",
  "type": "order.created",
  "occurredAt": "2026-08-01T12:00:00.000Z",
  "payload": { "orderId": "123", "amount": 49 }
}
```

Each event is accepted synchronously, then validated asynchronously by a background worker and moved to `processed` or `failed` (with a reason). Tenant members can see the event log, the outcome of each event, and a stats view (counts by status, failure rate, over a selectable window) in the web UI.

The full flow implemented today:

1. register and sign in (Supabase Auth)
2. create a tenant, invite teammates by email (with delivery tracking, resend, and expiry/cleanup)
3. create a tenant-scoped API key for server-to-server ingestion
4. send events via `POST /events` using only the API key — no user session required
5. a background worker validates each event and transitions its status
6. tenant members read the event log and a stats dashboard in the web app

This is deployed as a real, live system (Render + a production Supabase project), not only a local dev setup.

---

## Tech Stack

### Frontend
* Vue 3, Vite, TypeScript
* Pinia for state
* Vue Router
* Playwright for browser end-to-end tests

### Backend API (`apps/api`)
* Node.js, Express, TypeScript
* Zod for request/response and environment validation
* `@supabase/supabase-js` (both a user-context client, for RLS-scoped requests, and a service-role admin client)
* `pino` / `pino-http` for structured JSON logging and per-request IDs
* `express-rate-limit` on registration, invitation acceptance/resend, and event ingestion

### Background Worker (`apps/worker`)
* Node.js, TypeScript, `tsx`
* Three independent poll loops running concurrently: invitation email delivery, invitation/job cleanup, and event processing
* Talks to Supabase directly over PostgREST (no queue library) — `REDIS_URL` is a required, validated environment variable and a Render Key Value instance is provisioned, but nothing in the codebase uses it yet; it exists for future queue-backed work, not current background processing

### Database & Auth
* Supabase (Postgres + Auth/GoTrue)
* SQL migrations under `supabase/migrations/`
* Row Level Security on every application table
* `security definer` RPC functions for multi-table writes and for tables deliberately hidden from PostgREST

### Testing
* Vitest + Supertest for API integration and unit tests
* A separate opt-in `test:live` suite per app that runs the same code against a real local Supabase stack (no mocks)
* Playwright for full-browser end-to-end flows
* TypeScript typecheck across every package

### Monorepo / Tooling
* pnpm workspaces + Turborepo
* Shared packages: `@eventops/config` (typed env schemas), `@eventops/shared` (shared types), `@eventops/validation` (Zod DTOs shared between `apps/api` and `apps/web`), `@eventops/logger`, plus shared ESLint/TypeScript configs
* Dev Container for a consistent Linux development environment

### CI / Deployment
* GitHub Actions (`.github/workflows/ci.yml`): install, typecheck, and test on every push to `main` and every pull request
* Branch protection on `main` requires the CI check to pass before merging
* Render Blueprint (`render.yaml`): `eventops-api`, `eventops-worker`, `eventops-web`, `eventops-redis`, deployed against a dedicated production Supabase project (see `docs/deployment.md`)

### AI-Assisted Development
* Claude Code, driven by repository-level rules in `CLAUDE.md`
* Scoped to this repository, with an explicit secrets boundary (`.env`, credential files, and CI secret stores are never read, printed, or modified)
* No direct path to production: every change lands as a small diff on a feature branch, reviewed and merged by a human, deployed only through CI and the Render Blueprint above — never triggered directly by the assistant

---

## Repository Structure

```txt
eventops/
  apps/
    api/                 # Express backend API
    web/                 # Vue frontend
    worker/              # Background worker (email delivery, cleanup, event processing)

  packages/
    config/               # Typed environment validation (Zod schemas)
    shared/                # Shared TypeScript types
    validation/            # Shared request/response DTO schemas
    logger/                # Structured logging wrapper (pino)
    eslint-config/         # Shared lint configuration
    tsconfig/              # Shared TypeScript configs

  supabase/
    config.toml           # Supabase local config
    migrations/            # Database migrations (schema, RLS, RPCs)

  docs/
    deployment.md          # Production Supabase + Render setup
    rls-rpc-plan.md        # RLS/RPC design decisions and reference
    REMOTE-ACCESS.md

  .devcontainer/          # Containerized development environment
  .github/workflows/       # CI pipeline
  CLAUDE.md                # AI development rules for this repository
  CHECKLIST.md              # Running work log: what shipped, in what order, and why
  diary.md                  # Dated engineering log with verification notes
  render.yaml                # Render deployment Blueprint
  .env.example
  package.json
  pnpm-workspace.yaml
  turbo.json
```

---

## Domain Model

| Table | Purpose |
| --- | --- |
| `users` | Application-level profile linked 1:1 to a Supabase Auth user |
| `tenants` | An organization/workspace; owns all tenant-scoped data |
| `memberships` | Join table between users and tenants, with a `role` (`owner`/`admin`/`member`) and `status` |
| `tenant_invitations` | Pending/accepted/revoked email invitations, with hashed accept tokens and expiry |
| `invitation_email_jobs` | Delivery queue for invitation emails (kept in a `private` schema, unreachable via PostgREST — see below) |
| `api_keys` | Tenant-scoped credentials for server-to-server event ingestion; only a hash is stored |
| `events` | Ingested events: payload, metadata, `status` (`accepted`/`processed`/`failed`), `failure_reason`, and attribution to either a user or an API key |

One user can belong to many tenants; one tenant can have many users, invitations, API keys, and events.

---

## API Surface

All routes are mounted in `apps/api/src/app.ts`. `requireAuth` expects a Supabase user JWT; `requireApiKey` expects a tenant API key and has no user session at all.

```txt
GET  /health | /ready | /live

POST /auth/register
GET  /auth/me                                            (requireAuth)

GET    /tenants                                          (requireAuth)
POST   /tenants                                           (requireAuth)
GET    /tenants/:tenantId                                  (requireAuth, member+)
PATCH  /tenants/:tenantId                                   (requireAuth, owner)
DELETE /tenants/:tenantId                                    (requireAuth, owner — archive)

POST   /tenants/:tenantId/invitations                        (requireAuth, owner)
GET    /tenants/:tenantId/invitations                         (requireAuth, owner)
DELETE /tenants/:tenantId/invitations/:invitationId             (requireAuth, owner — revoke)
POST   /tenants/:tenantId/invitations/:invitationId/resend        (requireAuth, owner)
GET    /invitations/accept?token=...                          (requireAuth)
POST   /invitations/accept                                     (requireAuth)

GET    /tenants/:tenantId/api-keys                            (requireAuth, owner)
POST   /tenants/:tenantId/api-keys                              (requireAuth, owner)
DELETE /tenants/:tenantId/api-keys/:apiKeyId                     (requireAuth, owner — revoke)

GET    /tenants/:tenantId/events                              (requireAuth, member+)
GET    /tenants/:tenantId/events/stats?windowDays=1-90            (requireAuth, member+)
GET    /tenants/:tenantId/events/:eventId                       (requireAuth, member+)
POST   /tenants/:tenantId/events                               (requireAuth, member+ — manual/UI ingestion)

POST   /events                                                (requireApiKey — server-to-server ingestion)
```

`POST /events` is the server-to-server ingestion path: the tenant is resolved only from the API key, never from client input. `POST /tenants/:tenantId/events` is the same underlying create logic, reached instead with a human session, used by the manual "create event" form in the UI. Both paths share idempotency-key replay and per-tenant daily quota enforcement.

A full walkthrough for integrators is documented in the app itself at `/docs/ingestion` (`apps/web/src/pages/DocsIngestionPage.vue`).

---

## Event Processing Pipeline

Every event starts at `status: "accepted"`. A poll loop in `apps/worker` (`event-processor.ts`) picks up accepted events, checks that the combined size of `payload` and `metadata` stays within `EVENT_MAX_PAYLOAD_BYTES` (default 32KB — a real gap, since Express's own body-size limit alone would let anything up to 100KB through synchronous ingestion), and moves each event directly to `processed` or `failed` with a `failure_reason`. The worker claims events with a conditional PostgREST `PATCH ... WHERE status = 'accepted'`, which is safe under normal row locking even with multiple worker instances — no separate job-claim table or RPC was needed, since the check itself is synchronous with no external I/O to protect a claim/complete window around.

The web app exposes this as:
* a status column (with the failure reason shown inline) and a manual refresh button on the tenant events log, since processing is decoupled from the request that created the event
* a stats card (`GET /tenants/:tenantId/events/stats`) showing total/processed/failed/accepted counts and a failure rate over a selectable 24h/7d/30d window

---

## Database & Row Level Security

Schema is managed entirely through ordered SQL migrations in `supabase/migrations/` — nothing is created by hand in the Supabase dashboard. As of this writing there are 20 migrations, covering (in order): the core `users`/`tenants`/`memberships` schema and its RLS; tenant creation and invitation RPCs; the `events` table and its RLS; RLS/RPC hardening to remove recursive-policy failures; invitation email delivery and hashed accept tokens; moving `invitation_email_jobs` into a `private` schema reachable only through `security definer` RPCs (with a follow-up migration closing a default-privilege gap that left those RPCs callable by `anon`/`authenticated`); an idempotency-key unique constraint; the `api_keys` table; an event `failure_reason` column; and two migrations granting explicit base-table privileges to `anon`/`authenticated`/`service_role` after a real production incident showed Supabase's own "auto-expose new tables" behavior does not retroactively apply to tables added after a hosted project's initial creation.

RLS is enabled on every application table. The general pattern:

* reads are scoped by active tenant membership (`exists (select 1 from memberships where ...)`), with no extra role restriction where the underlying data isn't role-sensitive (e.g. the event log and its stats)
* role-sensitive writes (`update`/`delete` on tenants, invitations, API keys) are additionally gated at the API layer through `requireTenantAccess({ minimumRole: ... })`, not just RLS
* the API's backend-only service-role key bypasses RLS entirely and is never exposed to the frontend
* `invitation_email_jobs` sits outside RLS's reach altogether — it lives in a `private` Postgres schema never exposed through PostgREST, reachable only via a small set of `security definer` functions with `EXECUTE` explicitly revoked from `anon`/`authenticated`

---

## Environment Variables

Only a template is committed:

```txt
.env.example
```

A real `.env` is created locally and is never committed. Variable names (not values) are documented here and enforced by typed Zod schemas in `@eventops/config`:

**`apps/api`** (`packages/config/src/lib/api-env.ts`): `NODE_ENV`, `API_PORT`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL`, `EVENTS_DAILY_QUOTA`.

**`apps/worker`** (`packages/config/src/lib/worker-env.ts`): `NODE_ENV`, `REDIS_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `INVITATION_FROM_EMAIL`, `APP_WEB_BASE_URL`, `INVITATION_EMAIL_BATCH_SIZE`, `INVITATION_EMAIL_POLL_INTERVAL_MS`, `INVITATION_EMAIL_MAX_ATTEMPTS`, `INVITATION_EMAIL_JOB_RETENTION_DAYS`, `EVENT_PROCESSING_BATCH_SIZE`, `EVENT_PROCESSING_POLL_INTERVAL_MS`, `EVENT_MAX_PAYLOAD_BYTES`.

**`apps/web`** (build-time, baked in by Vite, not secret but environment-specific): `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

For local Supabase values, run `supabase start` from the repository root; it applies every migration automatically and prints the local API URL and keys.

---

## Running Locally

```bash
# from inside the Dev Container
pnpm install

# start a local Supabase stack (applies all migrations)
supabase start

# start apps/web, apps/api, and apps/worker together
pnpm dev
```

```bash
# typecheck and test everything
pnpm typecheck
pnpm test

# a single package
pnpm --filter @eventops/api test
pnpm --filter @eventops/api typecheck
```

---

## Testing Strategy

Mocked unit/integration tests run by default and never touch a real network or database (Supabase clients are mocked):

* `apps/api`: 18 test files, 101 tests — health, auth, tenant CRUD and role enforcement, invitations (create/list/resend/revoke/accept), API keys, event create/list/get/stats, ingestion via API key, idempotency, quota
* `apps/worker`: 3 test files, 8 tests — invitation email delivery (including retry exhaustion), cleanup sweep, event processing (pass and oversized-payload cases)
* `apps/web`: 2 test files, 14 tests — tenant/invitation/API-key/event store actions against a mocked `fetch`

Two additional suites run against real infrastructure and are intentionally excluded from the default `pnpm test`:

* `pnpm --filter @eventops/api test:live` — the same code paths, against a real local Supabase stack, including RLS-boundary checks that mocks cannot catch
* `pnpm --filter @eventops/web test:e2e` — Playwright, driving a real Chromium browser through the full invitation flow and the API-key/event-ingestion flow against real running dev servers and a real local Supabase stack

---

## CI/CD & Deployment

`.github/workflows/ci.yml` runs install, typecheck, and test on every push to `main` and every pull request. Branch protection on `main` requires that check to pass before a merge is allowed.

The system is deployed to Render from `render.yaml` (`eventops-api`, `eventops-worker`, `eventops-web`, `eventops-redis`) against a dedicated production Supabase project — not just prepared, but actually applied and live-verified end to end (registration, tenant creation, API-key issuance, real event ingestion, async processing, and the stats view all confirmed against the deployed system). `docs/deployment.md` covers the production Supabase setup and what's still manual. Render's own auto-deploy on push to `main` is currently used as-is; a manual-approval deploy gate (a second CI job behind a GitHub Environment reviewer) is designed but intentionally not wired up, by choice, not because it's blocked on anything technical.

---

## AI-Assisted Development Workflow

Development in this repository uses Claude Code, governed by `CLAUDE.md`. Key rules enforced there:

* work stays inside this repository; the smallest change that solves the task is preferred
* `.env`, credential files, and CI secret stores are never read, printed, diffed, or modified — only `.env.example`, typed config, and documented variable names are used
* no deploy, production migration, or release is ever run directly — the only path to production is a small diff on a feature branch, reviewed and merged by a human, deployed through CI/Render
* destructive commands (`rm -rf`, `git reset --hard`, `git clean -fd`, force operations) are never run
* after any non-trivial change: run the relevant typecheck/lint/tests, record what changed and what was verified in `diary.md`, and commit as its own reviewed change

`CHECKLIST.md` and `diary.md` together form a running, dated log of what was built, in what order, why, and how each change was verified — including several real bugs found only once the system was exercised against real infrastructure (a Postgres RLS-recursion failure, a default-privilege gap on a hosted Supabase project, a Render build-environment quirk), rather than assumed away.

---

## Engineering Principles

* **Small changes** — each feature lands as a small, reviewable diff
* **Typed boundaries** — environment variables, request bodies, and shared contracts are all Zod-validated
* **Backend-first correctness** — business rules (quotas, idempotency, role checks) live in backend services, not only the frontend
* **Tenant isolation** — all tenant-owned data is scoped by RLS and, where role matters, by an explicit application-layer check
* **No secrets in Git** — only `.env.example` is committed; real credentials live in local `.env` files or the deployment provider's secret storage
* **Verify against real infrastructure, not just mocks** — the live test suites and Playwright E2E specs exist because mocked tests alone missed real RLS/migration/privilege bugs during this project's own development
* **AI as assistant, not owner** — every diff is a proposal reviewed by a human before it merges or deploys

---

## Current Status & Roadmap

The core product loop is complete and deployed: registration → tenant creation → invitations → API keys → server-to-server event ingestion → async processing → event log and stats in the UI. CI and production deployment are both live, not just configured.

What remains, tracked in `CHECKLIST.md`:

* real linting — every package's `lint` script is still a placeholder (`echo lint <name>`), not actual ESLint/Prettier enforcement
* the optional manual-approval deploy gate described above, if ever wanted

For the detailed, dated history of every feature — what was built, the alternatives considered, and how each change was verified — see `CHECKLIST.md` and `diary.md`.
