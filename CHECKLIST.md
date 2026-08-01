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
- [x] The workflow's first real run (done 2026-08-01 by the user): opened
      PR #3 from `feature/next-small-task` into `main`, CI ran and passed
      (`typecheck` + `test`, run #1, `success`). Merged; a second `push`
      run on `main` also passed (run #2). Every subsequent PR/merge this
      session triggered CI the same way, all green.
- [x] Branch protection (done 2026-08-01 by the user): required status
      check `test` enabled on `main` via GitHub's ruleset UI ("Require
      status checks to pass"), confirmed available to select once the
      workflow had run at least once, per the note above.
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
- [x] Metrics-style endpoints/dashboard views (done 2026-08-01, scoped
      down from the original README idea once the user clarified this
      is for the **tenant end user**, not ops/Prometheus-style metrics
      -- a product view inside the existing web UI, not a new external
      service to stand up). New `GET /tenants/:tenantId/events/stats`
      endpoint (`?windowDays=1-90`, default 7): three parallel
      `count(exact, head:true)` queries against `events` (one per
      `accepted`/`processed`/`failed`, matching the one existing count
      precedent, `assertEventQuotaNotExceeded`), summed into `total` in
      code. Deliberately does not derive `total` as
      "all rows minus processed minus failed" -- the DB still permits a
      4th status, `archived`, that no code sets today but isn't
      schema-forbidden from being set later; querying the three
      meaningful statuses directly excludes any future `archived` row
      instead of silently miscounting it as `accepted`. No new
      migration -- existing indexes
      (`events_tenant_status_created_at_idx`) already cover the query
      shape. Same `requireTenantAccess()` (any active member) as the
      event log itself, not owner-gated -- aggregate counts are less
      sensitive than the raw log every member can already read.
      Embedded as a new "Stats" card in `TenantEventsPage.vue` (window
      buttons: 24h/7d/30d) rather than a new route -- this repo's
      pages are never split into child components or given sidebar
      entries for tenant sub-views, so this matched the existing
      `TenantEditPage.vue`/`TenantEventsPage.vue` size convention
      instead of introducing a new pattern. Verified: `apps/api`
      101/101 tests (7 new), `apps/web` 14/14 tests (2 new), typecheck
      clean across validation/api/web. Live check against the real
      local Supabase stack: registered a fresh user, created a tenant,
      sent 2 small + 1 oversized event, confirmed `GET .../events/stats`
      returned `{total:3, processed:2, failed:1, accepted:0}` matching
      the real worker outcome, plus confirmed `windowDays=0`/`91`
      correctly 400. Browser check (Playwright): logged in, navigated
      to the tenant's events page through real in-app links, confirmed
      the stats card renders the same numbers with a 33.3% failure
      rate, clicked the 30d window button, confirmed it re-fetches
      correctly.

### 4. Deployment prep (README Phase 7, 0% done today)

Scope note: per `CLAUDE.md`'s hard boundary, actually deploying,
running production migrations, or releasing is something I can never do,
in any permission mode. So this section is capped at *preparation* the
user still has to trigger/approve — not a path to me shipping anything
live.

- [x] Fix `apps/api`/`apps/worker`'s broken `build` script and make
      production start actually work (found while scoping the Render
      config below — a real blocker, not planned in advance).
      (done 2026-07-14: `apps/api/tsconfig.json`/`apps/worker/tsconfig.json`
      inherit `noEmit: true` from `packages/tsconfig/base.json` via
      `node.json`, with only `outDir` overridden — so `tsc -p
      tsconfig.json` silently emitted nothing; confirmed via stale
      `dist/server.js` untouched by a fresh `pnpm build`. Added
      `tsconfig.build.json` in both apps (`noEmit: false`, `include:
      ["src"]` only, extends the existing tsconfig) and pointed `build` at
      it instead of editing the typecheck-facing `tsconfig.json`. Along
      the way, `apps/api/src/modules/events/events.routes.ts`'s deep
      relative import of `packages/validation/src` (rather than the
      `@eventops/validation` package import every other file uses) was
      making `tsc` infer a `rootDir` all the way back to a common
      ancestor, sprawling `dist/` into a duplicated nested tree
      (`dist/apps/api/src/...`, `dist/packages/validation/src/...`)
      alongside the correct flat output — fixed by switching to the
      proper package import, matching the rest of the codebase.
      Second, deeper issue found once the build was clean: `node
      dist/server.js` crashed immediately with `ERR_UNKNOWN_FILE_EXTENSION`
      for `.ts` — every internal workspace package (`@eventops/config`,
      `@eventops/shared`, `@eventops/validation`, `@eventops/logger`)
      resolves via `package.json`'s `"main": "./src/index.ts"` straight to
      TypeScript source, which `tsx`/`vite`/`vitest` transpile on the fly
      but plain `node` cannot run at all. Presented two options to the
      user (run production via `tsx` too, vs. a bigger dual dev/build
      conditional-exports fix across all 4 shared packages); user picked
      `tsx` in production — no dev/prod resolution-drift risk, and startup
      overhead is small. `start` scripts in both apps now run `tsx
      src/server.ts` / `tsx src/index.ts` (same mechanism as `dev`, just
      without `--watch`), and `tsx` moved from `devDependencies` to
      `dependencies` in both `package.json`s so it's present in a
      production install. Verified both end-to-end: `NODE_ENV=production
      pnpm start` for `apps/api` served real traffic (`GET /health` ->
      200, correct `X-Request-Id` header, JSON-not-pretty logs); same for
      `apps/worker` (`Worker started` / `Invitation email worker started`
      / `Invitation cleanup sweep started` all logged correctly). Both
      test processes stopped cleanly afterward.)
- [x] Render deployment config (`render.yaml` or equivalent) for
      `apps/api`/`apps/worker`/`apps/web`, as a proposed diff on a
      feature branch only
      (done 2026-07-14: verified the current Render Blueprint schema via
      Render's docs rather than guessing from stale training data --
      confirmed `type: keyvalue` (Redis-compatible, `type: redis` is a
      deprecated alias), `runtime: static` + `staticPublishPath` for
      static sites, and `fromService`/`property: connectionString` for
      cross-service env var references. `render.yaml` at the repo root
      defines `eventops-api` (web), `eventops-worker` (worker),
      `eventops-web` (static site), and `eventops-redis` (keyvalue), all
      on `branch: main`, secrets marked `sync: false`. Also fixed a real
      port-binding gap found while writing this: `apps/api/src/server.ts`
      only ever read `API_PORT`, but Render assigns the listen port via
      a `PORT` env var at runtime -- now prefers `process.env.PORT` when
      set, falling back to `API_PORT` for local dev.)
- [x] Document the production Supabase project setup steps (the user
      creates the actual project; I can only write the how-to)
      (done 2026-07-14: `docs/deployment.md` -- project creation,
      applying `supabase/migrations/*` against it, re-running the same
      anon/authenticated `EXECUTE`-privilege check that caught a real gap
      locally per `docs/rls-rpc-plan.md`, collecting the three API keys,
      and updating Auth redirect URLs away from `localhost`.)
- [ ] Wire the CI pipeline to gate a deploy step behind manual approval,
      per `CLAUDE.md`'s "the only path to production" section
      (scoped but not implemented 2026-07-14: `docs/deployment.md`
      section 4 documents the approach -- disable Render's own
      auto-deploy, add a second GitHub Actions job gated on `needs: test`
      + a `production` GitHub Environment with a required reviewer, that
      calls each service's Render Deploy Hook URL on approval. The
      Blueprint now exists in Render (done 2026-08-01, see the new
      "Production deployment" section below), so Deploy Hook URLs are
      available -- the remaining blocker is a decision, not a technical
      one: user explicitly opted to keep Render's own auto-deploy on
      push to `main` rather than add a manual-approval gate (2026-08-01).
      Revisit only if the user asks for it later.)
- [x] Deployment documentation in `README.md`
      (done 2026-07-14: added a short "Deployment prep status" note under
      Phase 7 in the roadmap, pointing at `render.yaml` and
      `docs/deployment.md` rather than duplicating their content.)

## Functional completeness: server-to-server ingestion + events UI (planned 2026-07-14)

Prompted by the user defining what "functionally complete" means for this
project: register -> create tenant + invite members (both already done) ->
**a tenant's own external backend can authenticate and send events into its
tenant** -> events are attributed to whoever/whatever created them ->
**tenant members can see an events log** in the UI. Investigation found two
real gaps: `POST /tenants/:tenantId/events` only ever accepted a human
Supabase JWT (no way for an external server to authenticate at all), and
`apps/web` had zero UI for events despite the backend being fully
implemented and tested since early in this project. Full design (reviewed
via a Plan subagent against the actual codebase) recorded at
`/home/node/.claude/plans/scalable-wiggling-sloth.md`.

- [x] Migration `0017_api_keys.sql`: `api_keys` table (owner-only RLS via
      the existing `is_active_tenant_owner` helper from migration `0013`;
      no RPC needed -- single-table writes fit this repo's "RLS-first, RPC
      only for multi-table writes" principle), plus
      `events.created_by_api_key_id` nullable FK. Applied to the real local
      Supabase stack; RLS verified live via a `DO`-block role-switching
      probe (a first attempt using a single-statement `set_config('role',
      ...)` trick gave a false positive -- `anon`/non-owner appeared to see
      rows -- because a GUC change made mid-target-list isn't reliably
      visible to a sibling subquery in the same statement; a real
      sequential `SET ROLE` inside a `DO` block gave the correct 0/0/1
      result for anon/outsider/owner).
- [x] `packages/validation/src/request/api-keys.ts` + backend module
      `apps/api/src/modules/api-keys/` (types/service/controller/routes),
      mounted at `/tenants/:tenantId/api-keys`, owner-only
      (`requireTenantAccess({minimumRole:'owner'})`, same chain shape as
      invitation management). Key format `eo_live_<32 random bytes,
      base64url>`, only `sha256(key)` ever stored, raw key returned once on
      creation. No expiry by design (matches Stripe/GitHub; revoke is
      manual) -- explicitly discussed and confirmed with the user rather
      than assumed.
- [x] `requireApiKey` middleware (`apps/api/src/middleware/require-api-key.ts`):
      hash-lookup via `getSupabaseAdmin()` since there's no `auth.uid()` at
      all in this flow (same category as `requireAuth`'s
      `getSupabaseAuth().auth.getUser()` and the existing invitation
      accept-token hash lookup). `last_used_at` bookkeeping is
      fire-and-forget, never blocks the ingestion hot path.
- [x] New root-mounted `POST /events` (tenant resolved *only* from the key,
      never from client input -- confirmed by a test that a `tenantId` in
      the body gets rejected by the existing `.strict()` schema before it
      could ever be used), reusing `assertEventQuotaNotExceeded`/
      `getExistingEventByIdempotencyKey` (now exported from
      `events.service.ts`) against the admin client instead of duplicating
      quota/idempotency logic. New `app.set('trust proxy', 1)` + a
      dedicated IP-keyed rate limiter on `/events`, since this route sits
      behind Render's proxy in production and is a realistic
      key-brute-forcing target the per-tenant quota doesn't address.
- [x] Mocked backend tests: 94/94 api tests passing (17 test files, 2 new:
      `api-keys.test.ts`, `events-ingest.test.ts`), covering owner-only
      403s, hash-never-returned, revoke idempotency, missing/unknown/revoked
      key 401s, quota/idempotency/archived-tenant reuse on the new path.
- [x] Live tests against the real local Supabase stack:
      `api-keys.live.test.ts` (owner CRUD round trip, non-owner 403,
      outsider RLS boundary) and `events-ingest.live.test.ts` (real
      `POST /events` with only a raw key and zero Supabase session,
      garbage-key 401, revoked-key 401) -- 22/22 live tests passing.
- [x] Frontend: `apps/web/src/lib/api.ts` (`ApiKey`/`TenantEvent` types +
      `listTenantApiKeys`/`createTenantApiKey`/`revokeTenantApiKey`/
      `listTenantEvents`/`createTenantEvent`) and `stores/tenants.ts`
      (`apiKeys`/`events` state + matching actions, same
      status-flag/`upsertById` shape as invitations).
- [x] Frontend: "API Keys" card in `TenantEditPage.vue` -- table (name,
      prefix, created, last used, active/revoked), create form, one-time
      raw-key reveal panel with a copy-to-clipboard button, revoke via
      `window.confirm`, link to the new events page.
- [x] Frontend: new `TenantEventsPage.vue` + `/tenants/:tenantId/events`
      route (`routeNames.tenantEvents`) -- events table (source, type,
      subject, occurred-at, status, attribution resolved to "You" /
      "Another member" / "API: `<name>`") + a manual "create event" form
      (payload/metadata JSON textareas with client-side `JSON.parse`
      validation) using the existing human-JWT endpoint, unchanged.
- [x] Frontend store tests: `tenants.store.test.ts` extended with 6 new
      cases for `fetchApiKeys`/`createApiKey`/`revokeApiKey`/
      `fetchEvents`/`createEvent` -- 12/12 web tests passing.
- [x] Full verification pass: `apps/api` typecheck clean + 94/94 tests;
      `apps/web` typecheck clean + 12/12 unit tests; new Playwright e2e
      spec `apps/web/e2e/api-keys-events-flow.spec.ts` run against real
      dev servers + real local Supabase -- registers a user, creates a
      tenant, creates an API key, confirms the one-time raw-key reveal,
      creates a manual event (attributed "You"), POSTs a real ingestion
      request with only the raw key and zero Supabase session (201,
      `createdByUserId: null`), confirms it shows up in the events table
      attributed "API: `<name>`", revokes the key via the UI, confirms a
      repeat ingestion request now gets 401. Passed on first run.

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

- [x] Scoped and implemented 2026-07-20. Discovered while scoping: `events.status`
      was never actually transitioned by any code anywhere in the repo --
      every event sat at `accepted` forever, so "history" would have been
      a history of nothing. Decided with the user to build the real thing
      instead of just exposing a static field: a genuine async processing
      step in `apps/worker` that gives `status` real meaning, then surface
      it. Resolved the history-table-vs-columns question in favor of
      columns: with only one real transition per event (no retries),
      `event_status_history` would store at most one row per event -- no
      more informative than a column, far more infrastructure (new table,
      RLS policy, new endpoint, more UI). Went with a single new
      `failure_reason text` column on `events` (migration
      `0018_events_failure_reason.sql`), reusing the existing `updated_at`
      (already present, confirmed never touched by any code) as the
      "processing finished at" timestamp.
      "Processing" = structural validation, since there are no downstream
      integrations in this project to actually deliver events to: reject
      any event whose `payload`+`metadata` combined exceed
      `EVENT_MAX_PAYLOAD_BYTES` (default 32KB) -> `failed` with a specific
      `failureReason`; otherwise -> `processed`. This is a real gap, not a
      redundant check: `express.json()`'s default 100KB body limit means
      anything 32-100KB currently sails through synchronous ingestion
      untouched today.
      New `apps/worker/src/event-processor.ts` (`runEventProcessor()`,
      structured like the existing `invitation-email-worker.ts`'s poll
      loop) claims events via a plain conditional PostgREST PATCH
      (`events?id=eq.<id>&status=eq.accepted`) -- no new
      `event_processing_jobs` table/RPC needed, unlike the invitation-email
      case, because `events` is a normal public table the worker's
      service-role key already reaches directly, and the validation is
      synchronous (no external I/O), so there's no claim/complete gap to
      protect against. New worker env vars
      (`EVENT_PROCESSING_BATCH_SIZE`/`EVENT_PROCESSING_POLL_INTERVAL_MS`/
      `EVENT_MAX_PAYLOAD_BYTES`) added to `packages/config`'s
      `worker-env.ts` and `render.yaml`'s `eventops-worker` block.
      `failureReason` flows through `eventSelectFields` ->
      `normalizeEventRecord` -> `EventItem` -> the existing
      `GET /tenants/:tenantId/events` endpoints unchanged otherwise -- no
      new API surface needed.
      Frontend: `TenantEventsPage.vue`'s events table shows the failure
      reason under a failed event's status, plus a manual "Refresh" button
      (processing is now decoupled from the request that created the
      event; this repo has no websockets/polling anywhere, so a manual
      refresh matches the existing non-realtime convention).
      `DocsIngestionPage.vue` gained a new "Processing" section explaining
      the async status transition to newcomers.
      Verified: `apps/worker` typecheck clean, 8/8 tests (new
      `event-processor.test.ts`, mirrors `invitation-email-worker.test.ts`'s
      mocking convention); `apps/api` typecheck clean, 94/94 (existing
      `events.types.test.ts`/`events-get.test.ts`/`events-list.test.ts`/
      `events-create.test.ts` fixtures updated with `failureReason: null`);
      `apps/web` typecheck clean, 12/12. Live check against the real local
      Supabase stack + real running worker: sent one small and one
      41KB event via `POST /events` with a real API key and zero Supabase
      session, waited one poll interval, confirmed via `GET
      /tenants/:tenantId/events` that the small event became `processed`
      and the large one `failed` with the exact expected
      `failureReason` message. Browser check (Playwright): same flow
      through the real UI -- created a tenant and API key, sent both
      events, clicked Refresh, screenshot confirms the failed row shows
      its reason in red under the status and the processed row shows
      clean, both attributed to the API key by name.

## Production deployment (done 2026-08-01)

CI, branch protection, and Render Blueprint were prepared earlier
(see "Deployment prep" above) but never actually applied. Done this
session, all by the user clicking through Render/Supabase/GitHub
dashboards (no credentials for any of these exist in this sandbox) with
me diagnosing failures from logs and shipping fixes as normal commits:

- [x] Opened PR #3 -> CI green -> merged (first real CI run, see "CI
      pipeline" above). `.env.example` updated with the 3
      event-processing worker vars.
- [x] Render Blueprint fix: `render.yaml`'s `REDIS_URL` `fromService`
      entries were missing a now-required `type: keyvalue` field --
      Render's Blueprint validator rejected the file with "empty but
      required" until fixed (PR #4).
- [x] Render Blueprint fix: `eventops-web`'s (and, preventatively,
      `eventops-api`/`eventops-worker`'s) `buildCommand` ran
      `corepack enable && pnpm install ...`. Render's static-site
      builder has a read-only `/usr/bin`, and `corepack enable` tried to
      relink `/usr/bin/pnpm` there, failing with `EROFS`. Turned out
      redundant anyway -- Render already installs the `packageManager`-
      pinned pnpm version automatically before `buildCommand` runs.
      Dropped `corepack enable &&` from all three (PR #5).
- [x] Render Blueprint created: `eventops-api`, `eventops-worker`,
      `eventops-web`, `eventops-redis`, all `starter` plan
      ($24/month total; `eventops-web` is a free static site). User
      confirmed this is on top of, not covered by, their separate Render
      workspace plan.
- [x] Production Supabase project created; all 18 migrations applied via
      `supabase db push` from the user's own machine (not this sandbox).
- [x] Render env vars filled in for all three services (Supabase triad,
      Resend key, `APP_WEB_BASE_URL`, `VITE_*` vars) and Supabase Auth
      redirect URLs pointed at the deployed `eventops-web` URL instead
      of `localhost`.
- [x] Production bug found via `eventops-api`'s first real request logs:
      `permission denied for table users` (Postgres `42501`).
      `authenticated` had no base table privileges on `public.users` --
      Supabase's "Automatically expose new tables" dashboard setting did
      not retroactively grant privileges for tables created via
      `supabase db push` (only local dev's `supabase start` seeds this
      automatically, which is why the gap never showed up until a real
      hosted project). Fixed with migration
      `0019_grant_public_table_privileges.sql`: explicit
      `select/insert/update/delete` grants to `anon, authenticated` on
      every public app table, plus `alter default privileges` so future
      tables can't hit the same gap. Applied to both the local stack and
      production.
- [x] Second instance of the same bug class, found the same way: a real
      `POST /events` request (server-to-server ingestion, via a real API
      key) returned `503` from `requireApiKey`. The middleware silently
      swallowed the underlying Supabase error, so first had to add
      `req.log?.error(...)` logging to `require-api-key.ts` (it had none
      at all -- a real observability gap, unlike `errorHandler` which
      already logged everything) before the real cause was visible:
      `permission denied for table api_keys` -- this time `service_role`
      itself lacked privileges, because `api_keys` (migration `0017`)
      was created well after the project's initial bootstrap, and
      `service_role`'s usual "full access to everything" default
      apparently only covers tables that existed at project creation.
      Fixed with migration
      `0020_grant_service_role_table_privileges.sql`, same shape as
      `0019` but for `service_role`.
- [x] Full live verification against production: sent a real event via
      `POST /events` with a real API key and zero Supabase session (small
      payload -> `201`, `status: accepted`), sent a second ~40KB payload
      the same way, refreshed the real deployed UI, and confirmed both
      events reached their correct terminal state (`processed` and
      `failed` with the exact expected `failureReason` text), correctly
      attributed to the API key by name. Test API key revoked
      immediately after (it had been pasted in plaintext during
      debugging).
- [ ] Deploy gate behind manual approval: user explicitly declined --
      keeping Render's default auto-deploy on push to `main`. See the
      "Deployment prep" section above for the technical plan if this
      changes later.
