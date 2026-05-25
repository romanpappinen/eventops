# EventOps

**EventOps** is a backend-focused multi-tenant event ingestion and operations platform built as a production-style portfolio project.

The goal of this project is not to build a toy CRUD app. The goal is to demonstrate practical knowledge of backend architecture, system design patterns, multi-tenancy, authentication, database security, background processing, testing, and safe AI-assisted development.

This repository is designed to be understandable for engineering managers, senior developers, and interviewers who want to see how the system is structured and how development decisions are made.

---

## Product Idea

EventOps is a platform where companies can send business or system events into a central backend.

Example event:

```json
{
  "type": "order_created",
  "userId": "123",
  "amount": 49,
  "timestamp": "2026-04-24T12:00:00.000Z"
}
```

The platform can then validate, store, process, and expose these events for operational workflows.

Possible use cases:

* event ingestion for SaaS products
* operational dashboards
* audit trails
* customer activity tracking
* async event processing
* quota-based usage limits
* tenant-isolated analytics
* future alerting and automation workflows

The first version focuses on the backend foundation: tenants, users, memberships, authentication, API structure, database migrations, RLS, tests, and developer environment.

---

## Why This Project Exists

This project is intentionally designed to demonstrate knowledge that is useful for middle-plus fullstack/backend interviews.

It focuses on topics such as:

* Node.js backend architecture
* Express API design
* multi-tenant SaaS patterns
* Supabase Auth and Postgres
* Row Level Security foundations
* service-oriented module structure
* typed environment validation
* database migrations
* integration testing
* monorepo organization
* background workers
* safe local development with containers
* AI-assisted development workflow with Codex CLI

The project is built step by step, with each feature intended to be small, testable, and reviewable.

---

## Tech Stack

### Frontend

* Vue 3
* Vite
* TypeScript

### Backend API

* Node.js
* Express
* TypeScript
* Zod
* Supabase JS client

### Database and Auth

* Supabase
* PostgreSQL
* Supabase Auth
* SQL migrations
* Row Level Security

### Background Processing

* Worker app in Node.js
* Redis planned for queues and async jobs

### Testing

* Vitest
* Supertest
* API integration tests
* TypeScript typecheck

### Monorepo / Tooling

* pnpm workspaces
* Turborepo
* Shared packages
* Dev Container
* WSL-friendly development setup

### AI-Assisted Development

* Codex CLI inside Dev Container
* Repository-level rules through `AGENTS.md`
* Project-level Codex config through `.codex/config.toml`
* Restricted environment exposure
* No direct access to real secrets

---

## Repository Structure

```txt
eventops/
  apps/
    api/                 # Express backend API
    web/                 # Vue frontend
    worker/              # Background worker

  packages/
    config/              # Typed environment validation
    shared/              # Shared types and utilities
    validation/          # Shared validation schemas
    eslint-config/       # Shared lint configuration
    tsconfig/            # Shared TypeScript configs

  supabase/
    config.toml          # Supabase local config
    migrations/          # Database migrations

  .devcontainer/         # Containerized development environment
  .codex/                # Codex CLI project config
  AGENTS.md              # AI development rules
  .env.example           # Safe environment variable template
  package.json
  pnpm-workspace.yaml
  turbo.json
```

---

## Core Domain Model

The first version of the platform uses a standard SaaS multi-tenancy model.

### `users`

Application-level user profiles linked to Supabase Auth users.

### `tenants`

Organizations, teams, or workspaces. A tenant owns data and isolates access.

### `memberships`

A join table between users and tenants.

It stores:

* tenant ID
* user ID
* role
* membership status

This model allows one user to belong to many tenants and each tenant to have many users.

---

## Current API Foundation

### Health Endpoints

The API exposes health-style endpoints:

```txt
GET /health
GET /ready
GET /live
```

These endpoints are covered by integration tests.

### Auth Middleware

The API has a `requireAuth` middleware that:

* reads a Bearer token
* validates the token with Supabase Auth
* attaches the authenticated user to the request

### Supabase Client Layer

Supabase clients are created through helper functions:

```ts
getSupabaseAdmin()
getSupabaseAuth()
```

The clients are initialized lazily so that environment variables are loaded before runtime code needs them.

### Tenant Endpoints

The tenant module is the first business module.

Current endpoints:

```txt
GET /tenants
POST /tenants
GET /tenants/:tenantId
PATCH /tenants/:tenantId
DELETE /tenants/:tenantId
POST /tenants/:tenantId/invitations
```

The intended flow is:

1. user authenticates through Supabase
2. API validates the user token
3. API ensures the user profile exists in `public.users`
4. user creates a tenant
5. API creates owner membership
6. user can list tenants where they are an active member
7. tenant-scoped routes load membership server-side and enforce role checks

### Tenant Backend Structure

The tenant API now follows a route/controller/service split:

* `tenants.routes.ts`
* `tenants.controller.ts`
* `tenant.service.ts`
* `tenant.schemas.ts`
* `tenant-access.middleware.ts`

The middleware `requireTenantAccess()` is used for tenant-scoped authorization.

It:

* loads the authenticated user's active membership for a tenant
* enforces a minimum role such as `member` or `owner`
* blocks access before controller code runs

### Tenant Creation Rules

Tenant creation accepts:

* `name` required
* `description` optional
* `slug` optional

The API:

* normalizes or derives the slug
* creates the tenant through a database RPC
* automatically creates an active `owner` membership for the creator
* returns `409` on unique slug conflicts

### Tenant Invitation Rules

Owners can invite members by email through:

```txt
POST /tenants/:tenantId/invitations
```

Invitation payload:

* `email`
* `role` as `admin` or `member`

The current implementation stores a pending invitation record. It does not yet send email or implement invitation acceptance.

### Frontend Tenant Flow

The Vue app now includes authenticated tenant pages:

```txt
/tenants
/tenants/new
/tenants/:tenantId/edit
```

Current frontend behavior:

* list accessible tenants through the backend API
* create a tenant from the UI
* show tenant details for an accessible tenant
* invite members by email from the tenant settings page

Tenant update UI is intentionally limited until the backend update flow is finalized end to end.

---

## Database Migrations

Database schema is managed through Supabase SQL migrations.

Current migrations:

```txt
supabase/migrations/0001_users_tenants_memberships.sql
supabase/migrations/0002_rls.sql
supabase/migrations/0003_tenant_creation_and_invitations.sql
```

The schema includes:

* `users`
* `tenants`
* `memberships`
* `tenant_invitations`
* indexes
* basic constraints
* initial Row Level Security policies

The goal is to keep database structure reproducible across machines and environments instead of manually creating tables in the Supabase UI.

Important:

* tenant creation now depends on the RPC `public.create_tenant_with_owner`
* tenant invitations now depend on the RPC `public.create_tenant_invitation`
* both are created by migration `0003`

If the local Supabase database was started before the latest migration was added, apply the latest migrations before testing tenant creation from the UI or API.

---

## Row Level Security Strategy

RLS is enabled early because this project is multi-tenant.

Initial policies focus on read access:

* users can read their own profile
* tenant members can read their tenants
* tenant members can read memberships within their tenant

For server-side writes, the API uses the Supabase service role key on the backend only.

Important rule:

> The service role key must never be exposed to the frontend.

Future work will expand RLS policies and add more explicit permission checks at the API service layer.

---

## Development Environment

This project is intended to be developed inside a Dev Container.

Why:

* consistent Linux environment
* isolated dependencies
* Codex CLI runs inside the container, not on the host machine
* safer AI-assisted workflow
* fewer Windows/Node/pnpm permission issues

Recommended local setup:

1. Windows host
2. WSL Ubuntu
3. repository cloned into WSL filesystem
4. VS Code opened from WSL
5. Dev Container started from VS Code
6. Supabase local stack started through project-local CLI

---

## Environment Variables

The repository contains only a safe template:

```txt
.env.example
```

A real local `.env` file must be created manually and must never be committed.

Required variables:

```env
NODE_ENV=development
API_PORT=3000

SUPABASE_URL=__SET_LOCALLY__
SUPABASE_ANON_KEY=__SET_LOCALLY__
SUPABASE_SERVICE_ROLE_KEY=__SET_LOCALLY__

REDIS_URL=__SET_LOCALLY__
```

For local Supabase, the values come from:

```bash
pnpm exec supabase start
```

or, depending on the local setup:

```bash
pnpm dlx supabase start
```

Security rules:

* `.env` is ignored by Git
* `.env.example` is committed
* real secrets are never pasted into prompts
* Codex is instructed not to read `.env`

---

## Running the Project

### Install dependencies

From inside the Dev Container:

```bash
pnpm install
```

### Start local Supabase

Run from the project root on the host/available Docker environment:

```bash
pnpm exec supabase start
```

If using project-local execution through pnpm dlx:

```bash
pnpm dlx supabase start
```

### Start the monorepo apps

From inside the Dev Container:

```bash
pnpm dev
```

This starts:

* `apps/web`
* `apps/api`
* `apps/worker`

### Run API tests

```bash
pnpm --filter @eventops/api test
```

### Run API typecheck

```bash
pnpm --filter @eventops/api typecheck
```

---

## Testing Strategy

The project starts with API integration tests.

Current coverage includes:

* health endpoints
* auth registration and `GET /auth/me`
* protected tenant routes returning `401` without authentication
* tenant creation validation and duplicate slug handling
* tenant invitation authorization
* tenant CRUD role checks and archive behavior

The testing strategy is intentionally incremental:

1. test public infrastructure endpoints
2. test auth guards
3. test validation failures
4. test happy-path tenant creation
5. test tenant role enforcement and isolation
6. test async processing
7. later add frontend and end-to-end tests

The goal is not to chase 100% coverage early. The goal is to protect critical contracts and prevent architectural regressions.

---

## AI-Assisted Development Workflow

This project uses Codex CLI inside the Dev Container.

Codex is configured through:

```txt
.codex/config.toml
AGENTS.md
```

The intended usage is controlled and review-based.

Recommended workflow:

1. create a small feature branch
2. ask Codex to inspect relevant files only
3. ask Codex to propose a plan before editing
4. approve only safe commands
5. require a small diff
6. run tests and typecheck
7. run `/review`
8. commit the change
9. open or merge a PR

Example prompt:

```txt
Implement GET /auth/me in apps/api.

Use:
- existing requireAuth middleware
- existing Supabase helpers from apps/api/src/lib/supabase.ts

Follow:
- router/controller/service pattern
- thin routes
- business logic in services

Do not:
- read or modify .env
- create new Supabase clients
- add dependencies without asking

Before editing:
- inspect only relevant files
- propose a file plan

After editing:
- run pnpm --filter @eventops/api test
- run pnpm --filter @eventops/api typecheck
```

---

## Branching and Development Flow

The project should be developed in small feature branches.

Recommended flow:

```bash
git checkout main
git pull
git checkout -b feature/api-auth-me
```

After implementation:

```bash
pnpm --filter @eventops/api test
pnpm --filter @eventops/api typecheck
git status
git diff
git add .
git commit -m "feat(api): add auth me endpoint"
git push -u origin feature/api-auth-me
```
---

## Development Roadmap

### Phase 1 — Foundation

* monorepo setup
* web, api, worker apps
* shared packages
* typed config
* Supabase migrations
* RLS foundation
* health endpoints
* initial API tests
* Dev Container
* Codex CLI sandbox workflow

### Phase 2 — Authentication

* `GET /auth/me`
* user profile sync
* frontend auth client
* login/logout flow
* protected frontend routes

### Phase 3 — Tenant Management

* create tenant
* list tenants
* tenant membership roles
* owner/admin/viewer permission checks
* tenant-scoped API guards

### Phase 4 — Event Ingestion

* event source definitions
* event schema validation
* `POST /events`
* tenant quotas
* idempotency keys
* event storage

### Phase 5 — Async Processing

* Redis-backed queue
* worker processing pipeline
* retry strategy
* dead-letter queue
* job status tracking

### Phase 6 — Observability

* structured logging
* request IDs
* error format
* metrics-style endpoints
* basic dashboard views

### Phase 7 — Deployment

* Render deployment
* production env setup
* Supabase production project
* CI checks
* migration workflow
* deployment documentation

---

## Engineering Principles

This project follows several core principles:

### Small changes

Each feature should be implemented as a small, reviewable diff.

### Typed boundaries

Environment variables, request bodies, and shared contracts should be validated.

### Backend-first correctness

Business rules should live in backend services, not only in the frontend.

### Tenant isolation

All tenant-owned data must be scoped by tenant membership and permissions.

### No secrets in Git

Only `.env.example` is committed. Real credentials stay local or in deployment provider secret storage.

### Tests before scale

Important contracts should be tested before the system grows.

### AI as assistant, not owner

Codex can suggest and implement changes, but every diff must be reviewed by the developer.

---

## Current Status

Diary:

### 2026-05-25

Done in `apps/api`:

* invitation creation now generates a one-time accept token, stores only its hash on the invitation record, and queues email delivery work in `invitation_email_jobs`
* owner invitation management now includes listing and revoke flows
* invitation activation now uses `GET /invitations/accept` and `POST /invitations/accept` with authenticated email matching, expiry checks, archived-tenant checks, and single-use token acceptance
* invitation and tenant APIs now expose invitation delivery state and expiry metadata for the frontend
* invitation acceptance and invitation preview integration tests now cover token-based activation, expiry, archived tenants, and mismatched emails

Done in `apps/worker`:

* the worker now polls invitation email jobs from Supabase, sends invitation emails through Resend, and updates delivery status on both the job row and the invitation row
* invitation emails now use `/accept-invite?token=...` links instead of raw invitation ids
* worker retries now preserve queue state and clear raw accept tokens from jobs after successful or terminal processing

Done in `apps/web`:

* the frontend now has an `/accept-invite` page that loads invitation details, handles authenticated acceptance, and routes invited users into the tenant list after success
* login and registration now preserve the invitation flow without copying the raw token through redirect query strings
* auth session recovery now clears broken local Supabase refresh tokens instead of leaving the app in a repeated `401 /auth/me` state

Done in `supabase` and security hardening:

* `0010_invitation_email_delivery.sql` adds invitation delivery status fields and the durable invitation email job table
* `0011_invitation_accept_tokens.sql` adds hashed invitation accept tokens, expiry metadata, and the token-based acceptance RPC
* `0012_invitation_security_hardening.sql` locks down `invitation_email_jobs` with RLS and revokes direct table access from app roles
* `0013_rls_membership_helpers.sql` replaces recursive membership/tenant/event/invitation policies with security-definer helper functions to avoid RLS recursion failures in live flows

### 2026-05-18

Done in `apps/api`:

* health endpoints are mounted at `GET /health`, `GET /ready`, and `GET /live`
* auth routes include `POST /auth/register` and protected `GET /auth/me`
* bearer-token auth is enforced through `requireAuth`
* tenant routes support list, create, get, update, archive, and owner-only invitations
* shared API primitives now exist for `ApiError`, async route wrapping, request validation, and a global error handler
* the event ingestion module now supports `POST /tenants/:tenantId/events` and `GET /tenants/:tenantId/events`
* event create and list now use a user-scoped Supabase client instead of the service-role client
* `requireAuth` now keeps the bearer access token on the request so RLS-backed services can use user context
* integration tests now cover health, auth registration, auth me, tenant authorization, tenant creation, invitations, tenant CRUD, event creation, and event listing

Done in `apps/web`:

* Vue router includes protected routes for home, tenants, tenant creation, and tenant settings
* guest-only routes exist for login and registration
* auth state is managed through Pinia with Supabase session initialization
* the frontend calls the backend for `GET /auth/me`, tenant listing, tenant creation, and tenant invitations
* login and registration pages are implemented
* tenants can be listed from the API, created from the UI, and opened in a tenant settings page
* tenant settings currently support owner invitation flow, but not tenant update or archive actions

Repo-level foundation still in place:

* monorepo workspace structure is running across `apps/*` and `packages/*`
* Supabase migrations and local config are present for the current tenant and event model
* the project is set up for local development in the Dev Container with typed config packages and shared utilities

Done in `supabase` and docs:

* `0004_events.sql` adds the `events` table and initial event RLS foundation
* `0005_events_insert_policy.sql` adds the event `INSERT` policy for authenticated tenant members
* `0006_rls_rpc_foundation.sql` strengthens tenant and membership read policies, adds self-service user policies, hardens current RPCs for authenticated user-context calls, and grants authenticated execute access to the current tenant RPCs
* [docs/rls-rpc-plan.md](/workspaces/eventops/docs/rls-rpc-plan.md:1) now records the route-by-route RLS vs RPC migration plan

---

## Next Recommended Step

Diary:

### 2026-05-25

Next:

```txt
invitation resend + cleanup
```

Why this should be next:

* the invitation flow is now operational end to end, so the next highest-value work is operational resilience rather than core correctness
* failed deliveries and expired invitations now have durable state in the database, which makes resend and cleanup the natural next slice
* owners can already list invitations, so resend/expire actions can build directly on the current UI and API contracts
* background delivery now exists in the worker, so retry/backoff and cleanup behavior can be extended without redesigning the architecture

Recommended first slice:

* add an owner-only resend invitation endpoint that regenerates a fresh accept token, resets expiry, and enqueues a new email job
* add a small cleanup path for expired invitations and permanently failed email jobs
* extend invitation list responses and the tenant settings UI with resend/error visibility
* add focused worker tests around retry exhaustion and token regeneration behavior

After that:

* add invitation expiry and resend admin controls in the frontend
* move worker-only delivery state into a dedicated private schema if stricter database isolation is needed
* add a periodic cleanup or maintenance worker for expired invitations and stale queue rows
