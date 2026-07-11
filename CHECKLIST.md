# Next Steps Checklist

Working sequentially — check items off as they're done. Source: `diary.md`
history + README "Development Roadmap" + the 2026-07-04 API review.

## Stability hardening (done 2026-07-04)

- [x] Add `requireTenantAccess()` application-layer check to events routes
- [x] Add rate limiting to `POST /auth/register` and `/invitations/accept`

## Test hygiene

- [x] Fix time-bombed fixed date in `invitations-accept.test.ts` ("returns
      invitation details for a valid token") — `accept_token_expires_at` is
      hardcoded to `2026-06-01`, now in the past; use a relative/future date
      (done 2026-07-06: replaced with a `Date.now() + 30 days` constant)
- [x] Fix `apps/web/tests/auth.store.test.ts` > "surfaces backend hydration
      errors after Supabase login succeeds" — fails in isolation too
      (found 2026-07-06 while working on the invitation list UI, unrelated
      to that change; `store.status` comes back `'idle'` instead of
      `'error'`)
      (done 2026-07-10: `applySession`'s silent-recovery path for a backend
      `Unauthorized` response was meant for silent session restore on page
      load, but it also fired during explicit `login()`, swallowing the
      error. Added an `options.silentOnUnauthorized` flag, defaulting to
      `true` for `initialize()`/auth-state-change restores, set to `false`
      for the explicit `login()` call so it now surfaces the error)

## Invitation resend + cleanup

- [x] Owner-only resend invitation endpoint (fresh accept token, reset
      expiry, requeue email job) (done 2026-07-06)
- [x] Cleanup path for expired invitations and permanently-failed email jobs
      (done 2026-07-06: hygiene sweep in apps/worker, pruning terminal
      invitation_email_jobs rows older than INVITATION_EMAIL_JOB_RETENTION_DAYS;
      no 'expired' DB status needed, expiry already enforced at accept time)
- [x] Extend invitation list API responses + tenant settings UI with
      resend/error visibility (done 2026-07-06: API already had the fields;
      added apps/web list/resend/revoke UI in TenantEditPage.vue.
      Not verified via real browser click-through -- no docker/Supabase or
      browser driver in this sandbox; store-level tests + typecheck only)
- [x] Worker tests for retry exhaustion and token regeneration behavior
      (done 2026-07-06: token regeneration covered at the API layer by the
      resend endpoint tests; retry exhaustion covered by
      invitation-email-worker.test.ts)

## Code review pass (done 2026-07-06)

- [x] `/code-review --level high` over the whole session's work
      (`92166be..HEAD`) — 9 findings, all fixed:
      resend returning/persisting stale delivery state, a status-check race
      in resend's token reissue, archived-tenant Resend/Revoke buttons not
      hidden in the UI, store list mutated without a successful prior fetch,
      three duplicated upsert-by-id blocks, duplicated test mock chains,
      sequential-but-independent Supabase calls, and an oversized cleanup
      DELETE payload.

## Event route gaps

- [x] Implement `GET /tenants/:tenantId/events/:eventId` (done 2026-07-10:
      `getEventForTenant` in `events.service.ts`, reuses the existing
      `eventParamsDtoSchema`; 404 when not found, 502 on read failure)
- [x] Wire the shared `listEventsQueryDtoSchema`
      (`packages/validation/src/request/events.ts`) through the `validate()`
      middleware instead of the local duplicate schema in
      `events.controller.ts` (done 2026-07-10: also found and deleted three
      stale committed `.js` build artifacts in `packages/validation/src/`
      that shadowed the `.ts` sources for the relative import in
      `events.routes.ts` -- same class of bug as the `packages/config`
      cleanup earlier; `noEmit: true` means nothing regenerates them)

## Later / lower priority

- [x] Frontend invitation expiry/resend admin controls (superseded by the
      "Invitation resend + cleanup" section above — resend/revoke UI with
      expired/failed visibility shipped 2026-07-06 in `TenantEditPage.vue`)
- [x] Periodic cleanup/maintenance worker for expired invitations and stale
      queue rows (superseded by the "Invitation resend + cleanup" section
      above — hourly hygiene sweep shipped 2026-07-06 in
      `apps/worker/src/invitation-cleanup-sweep.ts`)
- [x] Document canonical tenant RPC functions across migration history
      (`0003`/`0006`/`0007`/`0008`/`0009`/`0011`) so future work doesn't
      reintroduce drift (done 2026-07-10: added a "Canonical RPC Reference"
      table to `docs/rls-rpc-plan.md`. While tracing the history, found
      `acceptTenantInvitationForUser` in `tenant.service.ts` still called
      the `accept_tenant_invitation(uuid)` RPC dropped by migration `0011`
      -- the function was unreferenced by any controller/route/test, so
      deleted it along with the now-unused `TenantInvitationParams`
      type/schema in `tenant.schemas.ts`)
- [x] Consider moving worker-only delivery state (`invitation_email_jobs`)
      into a dedicated private schema for stricter isolation (done
      2026-07-11, applied directly to the real local Supabase stack via
      `supabase migration up` -- see `docs/rls-rpc-plan.md`'s
      "`invitation_email_jobs` Private-Schema RPCs" section for full
      details). Migration `0014` moves the table to a `private` schema
      never listed in PostgREST's exposed schemas (no config change needed
      -- deliberately did *not* expose `private` via REST, which would
      have been only a cosmetic improvement; instead all access goes
      through 7 narrow `security definer` RPCs in `public`). Migration
      `0015` fixes a real gap found while verifying against the live
      stack: revoking `EXECUTE` from `PUBLIC` alone left `anon`/
      `authenticated` still able to call the new RPCs (this Supabase
      project has separate default privileges granting them EXECUTE on
      new `public`-schema functions) -- confirmed via a live probe
      (anon-key call returned `200 []` instead of a permission error
      before the fix, `401 permission denied` after). Updated
      `apps/api`'s `enqueueInvitationEmail` and all four of
      `apps/worker/src/lib/supabase-rest.ts`'s table-based helpers to call
      the new RPCs instead of `.from('invitation_email_jobs')`. All 75 api
      + 6 worker mocked tests, all 14 live tests, and the browser E2E test
      pass against the real migrated database. Additionally hand-verified
      every worker RPC (enqueue/list-pending/claim/mark-sent/delete-old)
      directly against the real stack with a real invitation, and cleaned
      up stray test data left behind by earlier runs today (found via
      this verification, unrelated to the migration itself).

## Local Supabase stack (host machine, connected from this devcontainer)

Goal: replace mocked `getSupabaseUser`/`getSupabaseAdmin` in tests/dev with a
real local Supabase stack, to catch RLS/RPC/migration bugs mocks can't (e.g.
the dropped-RPC bug found 2026-07-10). Needs to happen mostly on the host
machine, not from inside this sandbox — this container has no Docker.

- [x] **Host**: install Supabase CLI, run `supabase start` from the repo
      root (uses `supabase/config.toml` + `supabase/migrations/*.sql`
      already in the repo — applies all 13 migrations automatically).
      Confirm it prints working `API URL` / `anon key` / `service_role key`.
      (confirmed 2026-07-10: `host.docker.internal:54321/rest/v1/` serves a
      live PostgREST OpenAPI schema with this repo's exact tables —
      `users`/`tenants`/`events` incl. custom columns like
      `idempotency_key`; `/auth/v1/health` responds with GoTrue `v2.188.1`)
- [x] **Host**: confirm Supabase's Docker containers publish their ports on
      an interface reachable from other containers, not just host loopback
      (some Supabase CLI versions bind `127.0.0.1:<port>` by default, which
      other containers cannot reach). If containers can't reach it, this is
      the first thing to check.
      (confirmed 2026-07-10: ports 54321 API/Kong, 54322 direct Postgres,
      and 54323 Studio are all reachable from this container)
- [x] ~~**Repo**: add `--add-host=host.docker.internal:host-gateway` to
      `runArgs` in `.devcontainer/devcontainer.json`~~ — not needed.
      Verified 2026-07-10 that `host.docker.internal` already resolves
      from inside this container without any `devcontainer.json` change;
      the platform provides it automatically.
- [x] **This container**: verify reachability first, e.g.
      `curl http://host.docker.internal:54321` — confirm it responds
      before touching any app config.
      (confirmed 2026-07-10, see above)
- [x] **This container**: set `SUPABASE_URL=http://host.docker.internal:54321`
      (not `127.0.0.1` — that resolves to the container itself) plus
      `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` from the
      `supabase start` output, in `apps/api/.env.local` and
      `apps/worker/.env.local` (create from `.env.example`, never commit).
      (done 2026-07-10 by the user; turned out `apps/api/src/server.ts`
      actually loads a single root-level `.env`, not a per-app
      `.env.local` — noted here since the original plan guessed wrong)
- [x] **This container**: verify the connection end-to-end.
      (confirmed 2026-07-10: started `pnpm --filter @eventops/api dev`
      against the real env, hit `GET /health` -> 200, then
      `POST /auth/register` with a disposable test address -> 201 with a
      real GoTrue-issued user id and a row inserted into `public.users`
      through the RLS-scoped client. Full real round trip, not mocked.
      Note: running the *existing* `pnpm test` suites would NOT have
      proven this -- every test mocks `getSupabaseUser`/`getSupabaseAdmin`
      via `vi.mock`, so they never touch the real stack regardless of env
      vars. Stopped the dev server after the check; it is not left
      running.)
- [x] **This container**: decide and implement the test strategy for the
      real stack (done 2026-07-10). Chose: keep every existing mocked unit
      test as-is, and add a fully separate opt-in suite under
      `apps/api/tests/live/**/*.live.test.ts`, its own
      `vitest.live.config.ts` + `tests/live/setup.ts` (loads the real
      root `.env`, preflights `SUPABASE_URL` reachability and throws a
      clear error if unreachable), and a `pnpm --filter @eventops/api
      test:live` script that is never part of the default `test` script.
      `apps/api/vitest.config.ts`'s `include` was narrowed to
      `tests/integration/**` + `tests/unit/**` so the default run can
      never accidentally pick up `tests/live/**`.
      14 live tests across 4 files, all passing against the real stack:
      - `auth.live.test.ts` (5): register, duplicate-email rejection,
        `/auth/me` with a real token, 401 paths
      - `tenants.live.test.ts` (3): `create_tenant_with_owner` /
        `update_tenant` / `archive_tenant` RPCs, plus an RLS-boundary
        check that a non-member can't see/patch another tenant
      - `invitations.live.test.ts` (3): full
        invite -> resend -> `accept_tenant_invitation_by_token` RPC round
        trip (reads the real accept token straight out of
        `invitation_email_jobs` since no worker runs in tests), a
        `revoke_tenant_invitation` RPC path, and a 403 guard for a
        non-owner member on invite/list/resend/revoke
      - `events.live.test.ts` (3): RLS-backed create/list/get, a 404 for
        a missing event id, and an RLS-boundary check for a non-member
      Test data is namespaced with unique `live-*@example.com` emails and
      `*-<timestamp>-<rand>` slugs, and cleaned up per file in `afterAll`
      via a service-role client (tenants first, then users, matching FK
      cascade order) — verified 0 leftover rows after a full run.
      One real finding along the way (not a bug, a contract mismatch in
      the test's own assumption): `GET /tenants` returns membership rows
      with a nested `tenant` object, not flat tenant objects — the
      mocked tests already knew this, the live test just had to match it.
- [x] **This container**: once connectivity works, use the real stack to
      finally do the manual browser click-through of the invitation
      list/resend/revoke UI that's been deferred since 2026-07-06 (see
      "Invitation resend + cleanup" section above).
      (done 2026-07-11: this sandbox has no browser at all and no root to
      install one via `apt`/`playwright install-deps` -- worked around it
      by adding `@playwright/test` as a real devDependency of
      `apps/web` (`pnpm --filter @eventops/web test:e2e`) instead of a
      one-off throwaway check, so the click-through is now a reusable,
      repeatable automated E2E test, not a manual one-time click session.
      `apps/web/playwright.config.ts` starts both the real `apps/api` dev
      server and the `apps/web` dev server via `webServer`, against the
      real local Supabase stack (no mocks anywhere in this path).
      `apps/web/e2e/invitation-flow.spec.ts` drives a real Chromium
      browser through: register -> login -> create tenant -> invite a
      member -> resend -> revoke, asserting on-page feedback text and the
      invitations table's Status column after each action, with
      screenshots at each checkpoint. Passed twice in a row (not flaky).
      Found and fixed one real config bug along the way (not a product
      bug): `apps/web/.env.local`'s `VITE_SUPABASE_URL` was
      `http://127.0.0.1:54321` -- Vite bakes `VITE_*` vars in at dev-server
      start time, and `127.0.0.1` from inside a browser running in this
      container points at the container itself, not the host running
      Supabase. Fixed to `http://host.docker.internal:54321` (same fix
      class as the API's env var, done manually by the user since
      `.env.local` is off-limits for me to edit per CLAUDE.md). Test data
      created by both E2E runs was cleaned up from the real DB via the
      service-role client afterward. Running this locally requires a real
      browser: `pnpm --filter @eventops/web exec playwright install
      --with-deps chromium` once, then `pnpm --filter @eventops/web
      test:e2e`.

## Next priorities (planned 2026-07-11)

Everything above is done. Source: README "Development Roadmap" phases 6-7
(currently ~5% and 0%), plus the event-ingestion gaps found during the
% -completion review this session. Ordered by leverage: CI protects every
future change automatically and is cheap/low-risk, so it goes first;
correctness gaps in the product's core domain (events) go before
observability/deployment polish.

### 1. CI pipeline (README Phase 7, partial)

- [x] `.github/workflows/ci.yml`: on push/PR, checkout, setup
      node+pnpm, `pnpm install`, `pnpm typecheck` (turbo-orchestrated,
      already wired at the root), `pnpm test` (same — runs api/worker/web
      mocked suites, not `test:live`/`test:e2e`, since CI has no local
      Supabase or browser available; those stay dev-machine-only for now)
      (done 2026-07-11: single `test` job on `ubuntu-latest`, Node 22 to
      match `.devcontainer/Dockerfile`, `pnpm/action-setup` reads the
      pnpm version from `package.json`'s `packageManager` field so it
      can't drift out of sync. Verified locally by running the exact
      commands the workflow runs — `pnpm install --frozen-lockfile`,
      `pnpm typecheck` (6/6 packages), `pnpm test` (75 api + 6 worker + 7
      web, plus 3 placeholder `echo test` packages) — all green.)
- [x] Push the 17 commits from this session's checklist work to
      `origin/feature/next-small-task` (done 2026-07-11 by the user — I
      cannot push myself, no git credentials in this sandbox; confirmed
      `git rev-parse HEAD` == `git rev-parse origin/feature/next-small-task`
      after fetch, both at `a4409b0`)
- [ ] The workflow itself has **not run yet**: it only triggers on
      `push` to `main` or on a `pull_request` event, and pushing a
      feature branch matches neither. Confirmed via an unauthenticated
      GitHub API call (`/repos/.../pulls?state=open&head=...`) that no PR
      is currently open from `feature/next-small-task`. Opening a PR into
      `main` will trigger the first real run — needs to happen on GitHub
      (no `gh` CLI / credentials available here either); ask me to draft
      the PR title/description from this session's commits if useful.
- [ ] Branch protection note (not something I can set myself — needs the
      user to enable it in GitHub repo settings once the workflow exists,
      and only takes effect once the workflow has actually run at least
      once on the default branch): require the CI check to pass before
      merging to `main`
- [ ] Out of scope for this pass: real linting (`lint` scripts in every
      package are currently `echo lint <name>` placeholders, not actual
      ESLint/Prettier checks) — flagging as separate follow-up debt, not
      bundling into the CI task itself

- [x] Idempotency: add a unique constraint on
      `(tenant_id, idempotency_key)` where `idempotency_key is not null`
      in a new migration (currently just a bare nullable `text` column,
      no dedup guarantee at all despite the field existing and flowing
      through the API). Needs a product decision first: on a duplicate
      key, should `POST /events` return the *existing* event (200, true
      idempotent-replay semantics) or a `409 Conflict`? Recommend the
      former — that is the actual point of an idempotency key (safe
      client retries) — but confirm before implementing.
      (done 2026-07-11: user picked "200 with existing event" and scoped
      this round to idempotency only, quotas deferred separately.
      `idempotencyKey` didn't even exist as a client-settable field before
      this — `createEventDtoSchema` had no such field, so the DB column
      was never populated by any request. Added it as an optional body
      field. Migration `0016_events_idempotency_key_unique.sql` adds the
      partial unique index (same pattern as the existing
      `tenant_invitations_pending_email_unique` index). On a `23505`
      conflict, `createEventForTenant` now looks up and returns the
      existing event with `200` instead of erroring; the controller picks
      `200`/`201` based on a new `replayed` flag the service returns.
      Applied to the real local Supabase via `supabase migration up` and
      verified with a new live test that does two real `POST /events`
      calls with the same key and confirms the second returns the first
      event's id/payload unchanged, plus confirms no duplicate row exists
      via list. Mocked `events-create.test.ts` also covers the replay
      path. 76 api tests + 15 live tests + typecheck across
      api/validation/web/worker all green.)
- [x] Tenant quotas: no mechanism exists at all today. Needs scoping
      before implementation: what's the limit dimension (events per
      day? per hour? total row count?), where does the counter live (a
      new counter table vs. a `count(*)` query per request), and what
      happens on exceed (`429`? silent drop? queue for later?). Bigger
      design conversation, not a small diff — plan separately before
      coding.
      (done 2026-07-11: user picked events/day, `count(*)` on the fly, and
      `429`. New `EVENTS_DAILY_QUOTA` env var (`packages/config`'s
      `apiEnvSchema`, default `10000`). `createEventForTenant` now runs
      `assertEventQuotaNotExceeded` before every insert attempt: counts
      events for the tenant with `created_at` in the last rolling 24h
      (reuses the existing `events_tenant_created_at_idx` index, no new
      migration needed) and throws `429` if at/over the limit. Known,
      accepted simplification documented in a code comment: the quota
      check runs before the idempotency-replay check, so a tenant already
      at quota gets `429` even for what would have been a legitimate
      replay of one of its own existing events -- a rare edge case, not
      solved precisely in this pass. Verified live: temporarily set
      `EVENTS_DAILY_QUOTA=2` inside a live test, created 2 real events
      (both `201`), confirmed the 3rd real `POST /events` call returns
      `429` with the exact error message. 77 api tests (1 new mocked
      429 case) + 16 live tests (1 new) + typecheck across all 7
      packages all green.)

### 3. Observability basics (README Phase 6, ~5% done today)

- [x] Structured logging: replace ad hoc `console.log`/`console.error`
      calls across `apps/api`/`apps/worker` with a consistent structured
      logger (even a minimal JSON-line format would beat the current
      mix); needs a library/approach decision first (pino is the common
      lightweight choice, but worth confirming rather than assuming)
      (done 2026-07-11: new shared package `@eventops/logger`
      (`createLogger(service)`) wraps `pino` -- pretty-printed only in
      `NODE_ENV=development`, raw JSON otherwise, and `level: 'silent'`
      in `NODE_ENV=test` so the 75+ mocked tests that call `createApp()`
      don't pay any transport/worker-thread overhead. Used consistently
      in both `apps/api` and `apps/worker` -- every `console.log`/
      `console.error` in both apps' `src/` was replaced (found and fixed
      via a repo-wide grep, confirmed 0 remain). Also removed 3 more
      stale committed `.js` files shadowing `.ts` sources in
      `packages/shared/src` while in there (same class of bug fixed
      twice already this session in `packages/config`/`validation`;
      swept the whole repo afterward, confirmed no more remain anywhere).
- [x] Request IDs: generate/propagate a request id through
      `apps/api`'s middleware chain, include it in error responses and
      logs, so a single request's log lines are traceable
      (done 2026-07-11: wired `pino-http` into `app.ts` with a
      `genReqId` that honors an incoming `X-Request-Id` header or
      generates a `crypto.randomUUID()`, and always echoes it back as a
      response header. `errorHandler` now logs every error via
      `req.log` (bound with the request id automatically by pino-http)
      before responding. Deliberately did **not** add `requestId` to
      JSON error response *bodies* -- roughly a dozen existing tests
      assert exact response-body shape via `toEqual`, and the header
      already gives full correlation capability without touching any of
      them. Verified live: ran the real dev server, confirmed
      auto-generated UUIDs, honored custom `X-Request-Id` headers,
      pino-http's automatic per-request access log, and the
      `errorHandler`'s explicit `WARN`/`ERROR` log entries all carry the
      same id and actually appear in the log output.)
- [ ] Out of scope for this pass: metrics-style endpoints and dashboard
      views (README lists these too, but they're a bigger, separate
      effort once basic logging/request IDs exist)

### 4. Deployment prep (README Phase 7, 0% done today)

Scope note: per `CLAUDE.md`'s hard boundary, actually deploying,
running production migrations, or releasing is something I can never do,
in any permission mode. So this section is capped at *preparation* the
user still has to trigger/approve — not a path to me shipping anything
live.

- [ ] Render deployment config (`render.yaml` or equivalent) for
      `apps/api`/`apps/worker`/`apps/web`, as a proposed diff on a
      feature branch only
- [ ] Document the production Supabase project setup steps (the user
      creates the actual project; I can only write the how-to)
- [ ] Wire the CI pipeline (once item 1 above exists) to gate a deploy
      step behind manual approval, per `CLAUDE.md`'s "the only path to
      production" section
- [ ] Deployment documentation in `README.md`

### 5. Event audit trail for tenants (not in the original README roadmap — new idea, lower priority)

Came up 2026-07-11 while discussing observability: what was built there
(structured logs, request ids) is purely internal/system-facing — an
ops/debugging tool, not visible to end users and not queryable by
tenant. A *product* feature giving tenant users visibility into "what
happened to my event" (received -> processed -> failed, with reasons and
timestamps) is a different, separate concern. Recommended deprioritizing
below tenant quotas and deployment prep, since it's not blocking anything
and is comparable in scope to the idempotency work already done — the
user agreed. Recorded here so the idea isn't lost, not scheduled yet.

- [ ] Needs scoping before any implementation: does this require a new
      `event_status_history`-style table recording every status
      transition (richest, but a real schema/write-path change to
      `createEventForTenant` and wherever else event status changes), or
      is it enough to expose the existing `events` row's current
      `status`/timestamps plus `updated_at` through a tenant-scoped API
      response (cheaper, but not a true history — one transition only)?
- [ ] If a history table is chosen: RLS policy (tenant members can read
      their own tenant's history, matching the existing `events` RLS
      pattern), and a `GET /tenants/:tenantId/events/:eventId/history`
      -style endpoint
- [ ] Frontend surface (a history/timeline view somewhere in
      `apps/web`) — not scoped at all yet
