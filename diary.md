# Diary

Date: 2026-08-01 (2)

## What changed

Added a tenant-facing event stats view -- the last open item from
`CHECKLIST.md`'s "Observability basics" section, rescoped once the user
clarified they meant something for the *end user* (tenant members), not
ops/Prometheus-style metrics. New `GET /tenants/:tenantId/events/stats`
endpoint (`apps/api/src/modules/events/`) runs three parallel count
queries against `events` (accepted/processed/failed, matching the
existing `assertEventQuotaNotExceeded` count-query shape) over a
`windowDays` window (1-90, default 7), and a "Stats" card in
`TenantEventsPage.vue` shows total/processed/failed/in-queue counts plus
a failure-rate percentage, with 24h/7d/30d window buttons. No migration
needed -- existing indexes already cover the query. Planned via
`EnterPlanMode` with an `Explore` + `Plan` subagent pass first (see
`/home/node/.claude/plans/scalable-wiggling-sloth.md`).

## What was verified

`apps/api` 101/101 tests (7 new in `events-stats.test.ts`), `apps/web`
14/14 (2 new in `tenants.store.test.ts`), typecheck clean across
validation/api/web. Live check against the real local Supabase stack:
registered a fresh user, created a tenant, sent 2 small + 1 oversized
event through the real ingestion path, confirmed the stats endpoint
returned exactly what the real worker produced
(`{total:3, processed:2, failed:1, accepted:0}`), plus confirmed
`windowDays=0`/`91` both 400. Browser check (Playwright, throwaway
script per this session's established pattern): logged in, navigated to
the tenant's events page through real in-app links (not direct `goto`,
per the session's earlier session-rehydration-race finding), confirmed
the stats card renders correctly and the window buttons re-fetch.

## Next concrete step

Nothing outstanding. `CHECKLIST.md`'s last open item from the
"Observability basics"/dashboard section is now closed; only real
linting remains as long-standing, non-blocking debt.

Date: 2026-08-01

## What changed

First real production deployment. User clicked through Render/Supabase/
GitHub dashboards (I have no credentials for any of them in this sandbox);
I diagnosed failures from pasted logs and shipped fixes as normal commits
on `feature/next-small-task`, each going through the now-working
PR -> CI -> merge path.

Three real bugs found and fixed along the way, all confirmed only once
real (non-mocked, non-local) infrastructure was in play:

1. `render.yaml`'s `REDIS_URL` `fromService` entries were missing a
   `type: keyvalue` field Render's Blueprint validator now requires.
2. `corepack enable` in every service's `buildCommand` broke the
   `eventops-web` static-site build (`EROFS`, read-only `/usr/bin`) and
   was redundant anyway -- Render already installs the pnpm version
   pinned in `package.json`'s `packageManager` field before running the
   build command. Dropped it from all three services.
3. Two rounds of the same underlying issue: Supabase's "Automatically
   expose new tables" dashboard setting, and `service_role`'s usual
   default full-table-access, both apparently only apply to tables that
   existed when the hosted project was created -- anything added later
   via `supabase db push` (i.e. every table in this repo, added via
   migrations after the fact) got no base grants at all. First hit as
   `authenticated` getting `permission denied for table users` when
   creating a tenant; fixed with migration
   `0019_grant_public_table_privileges.sql`. Second hit as `service_role`
   getting `permission denied for table api_keys` on a real
   `POST /events` call; fixed with
   `0020_grant_service_role_table_privileges.sql`. Both grant
   `select/insert/update/delete` explicitly (RLS, already enabled on
   every table, is what actually restricts row access) and set default
   privileges so future tables can't hit the same gap.

Also found and fixed a real observability gap while debugging bug #3:
`require-api-key.ts` swallowed the underlying Supabase error on a failed
lookup and always returned a generic 503 with nothing logged -- unlike
`errorHandler`, which already logs everything via `req.log`. Added
`req.log?.error(...)` in both the `if (error)` and `catch` branches.

## What was verified

Full live round trip against the real production stack: registered a
real user through the deployed `eventops-web` UI, confirmed email
confirmation + auto-login, created a tenant (this is what first hit
bug #3 above), created an API key, sent a small event and a ~40KB event
via `POST /events` with only the raw API key and zero Supabase session,
refreshed the real UI, and confirmed both events reached the correct
terminal status (`processed` / `failed` with the exact expected
`failureReason` text), correctly attributed to the API key by name. The
test API key was revoked immediately after (it had been pasted in
plaintext in chat during debugging).

User explicitly declined the optional CI deploy-approval gate
(`docs/deployment.md` section 4) -- keeping Render's default auto-deploy
on push to `main`. Not a gap, a decision; revisit only if asked.

## Next concrete step

Nothing outstanding from this deployment push. Remaining open items are
long-standing, deliberately deprioritized ones: real linting (`lint`
scripts are still `echo` placeholders) and metrics/dashboard-style
observability. Both are tracked in `CHECKLIST.md`, neither blocking
anything.

Date: 2026-07-20 (4)

## What changed

User picked up the deprioritized "Event audit trail for tenants" idea from
`CHECKLIST.md` section 5. Before implementing, grepped `apps/api` and
`apps/worker` and found the premise was stale: `events.status` is set to
`'accepted'` at insert and **never changed by any code anywhere** -- there
is no processing pipeline at all, so a "history of status changes" would
have been a history of nothing. Talked this through with the user
(including a detour where they asked me to re-explain the whole thing in
plain language, since the jump straight into design trade-offs lost them)
and got agreement to build the real thing instead: an actual async
processing step in `apps/worker`, with a plan validated by a Plan subagent
against the real code before implementing (full plan at
`/home/node/.claude/plans/scalable-wiggling-sloth.md`).

Design, in short: "processing" = structural payload/metadata size
validation (no downstream integrations exist in this project to actually
deliver events to) -- a real gap, not a fake check, since Express's default
100KB body limit lets anything up to 100KB through synchronous ingestion
today, so this is the only thing that would ever catch a 32-100KB payload.
Single atomic `accepted` -> `processed`/`failed` transition, no
intermediate status (the check is synchronous). Result stored as one new
`failure_reason` column on `events` (migration
`0018_events_failure_reason.sql`) rather than a separate history table --
with only one real transition per event ever (no retries), a history table
would store at most one row per event, no more informative than a column.
New `apps/worker/src/event-processor.ts` claims events via a plain
conditional PostgREST PATCH (`events?id=eq.<id>&status=eq.accepted`), no
new jobs table/RPC needed since `events` is a normal public table the
worker's service-role key already reaches directly (unlike
`invitation_email_jobs`, deliberately hidden in a `private` schema).

## What was verified

* `pnpm --filter @eventops/worker typecheck` / `test` -- clean, 8/8 (new
  `event-processor.test.ts`).
* `pnpm --filter @eventops/api typecheck` / `test` -- clean, 94/94
  (existing events fixtures updated with `failureReason: null`).
* `pnpm --filter @eventops/web typecheck` / `test` -- clean, 12/12.
* Migration `0018` applied to the real local Supabase stack, confirmed via
  `information_schema.columns`.
* Live check: restarted the dev servers (HMR still unreliable in this
  sandbox for the worker process too, not just Vite -- confirmed the new
  `event-processor.ts` only started logging after a full restart),
  registered a real user via curl, created a real tenant + API key, sent
  one small and one ~41KB event via `POST /events` with zero Supabase
  session, waited one poll interval (3s), confirmed via `GET
  /tenants/:tenantId/events` that the small event became `processed` and
  the large one `failed` with the exact expected `failureReason` string.
* Browser check (throwaway Playwright script, same pattern as prior
  sessions): same flow through the real UI end to end -- screenshot
  confirms the failed event's reason renders in red under its status, the
  processed event renders clean, both attributed to the API key by name,
  and the new Refresh button actually pulls the updated statuses in.

## Next concrete step

Feature is done, verified live and in a real browser, `CHECKLIST.md`
section 5 fully checked off. `.env.example` still needs the 3 new worker
vars appended by the user manually -- I'm blocked from reading/editing it
per `CLAUDE.md`'s secrets boundary even though it's nominally on the
allowed list (same sandbox permission restriction hit earlier this
session). Commit this work, then ask the user what's next -- CI pipeline
PR / branch protection and the deploy-gate wiring are the only other
open items in `CHECKLIST.md`, both requiring the user's own GitHub/Render
actions rather than more code.

---

Date: 2026-07-20 (3)

## What changed

Two small user-requested fixes/additions, after confirming the previous
Vite-proxy fix worked:

* Navbar bug: `AppSidebar.vue` used `justify-content: space-between` across
  three flex children (header block, nav, logout button) on a
  `min-height: 100vh` container -- with three items, `space-between` puts
  the middle one (the nav) roughly at the vertical center of the page
  instead of right under the header, which is what the user was seeing.
  Fixed by grouping the header block and nav together in a `.sidebar-top`
  wrapper and pinning only the logout button to the bottom via
  `margin-top: auto` on a plain flex column.
* New English docs page (`DocsIngestionPage.vue`, route
  `/docs/ingestion`, linked from the sidebar as "API docs") walking a
  newcomer through server-to-server event ingestion end to end: how to get
  an API key, the `POST /events` endpoint and request/response shape
  (pulled directly from `createEventDtoSchema`, `events.controller.ts`,
  and `requireApiKey`'s actual status codes rather than guessed), field
  reference table, idempotency behavior, attribution, and a working curl
  example.

## What was verified

* `pnpm --filter @eventops/web typecheck` / `test` -- clean, 12/12.
* Real-browser check via a throwaway Playwright script (register, log in,
  screenshot the sidebar, click through to the docs page, screenshot it).
  First attempt showed the fix wasn't visible and Vue Router logged
  `No match found for location with path "/docs/ingestion"` -- the running
  Vite dev server was serving a stale, pre-edit version of `routes.ts`
  (confirmed by curling `/src/core/navigation/routes.ts` directly and
  diffing against disk). File-watching isn't reliable in this sandbox for
  changes made through the tool rather than the dev server's own process,
  so a plain edit doesn't reliably trigger Vite's HMR here -- worth
  remembering for any future UI verification in this environment: after
  editing routed/entry files, restart the dev server rather than trusting
  HMR, then re-verify. After restarting, the same script confirmed both
  fixes render correctly with no console errors.

## Next concrete step

Both fixes are done, verified in a real browser, and ready to commit.
Nothing else queued right now -- ask the user what's next once these land.

---

Date: 2026-07-20 (2)

## What changed

User hit `ERR_CONNECTION_REFUSED` on `POST http://localhost:3000/auth/register`
while testing the new API-keys/events UI in a real browser. Root cause: this
is a remote/devcontainer session where only the web app's port (5173) is
forwarded to the browser -- `apps/web/src/lib/api.ts` hardcoded
`http://localhost:3000` as the API base URL by default, which doesn't exist
from the browser's point of view. Fixed by adding a Vite dev-server proxy
(`apps/web/vite.config.ts`) for the API's route prefixes (`/auth`,
`/invitations`, `/events`, `/tenants`) and defaulting the base URL to a
relative path when `import.meta.env.MODE === 'development'` (not `DEV` --
vitest also sets `DEV=true` for its own `'test'` mode, which broke 11/12
store tests on the first attempt before switching to `MODE`). Production is
unaffected since `VITE_API_URL` is always set explicitly there (`render.yaml`).

## What was verified

* `pnpm --filter @eventops/web typecheck` -- clean.
* `pnpm --filter @eventops/web test` -- 12/12 (after switching `DEV` to
  `MODE === 'development'`).
* Restarted the dev servers (they had stopped running) and confirmed with
  `curl` that `POST http://localhost:5173/auth/register` and
  `GET http://localhost:5173/tenants` now reach the API through the proxy
  (400/401, not connection-refused) instead of requiring port 3000 to be
  separately forwarded.

## Next concrete step

Ask the user to confirm the browser-based flow now works end to end on
their side; the underlying feature work (API keys + events) is otherwise
already complete and committed (see the entry below).

---

Date: 2026-07-20

## What changed

Finished the API keys + event ingestion + events UI feature (plan at
`/home/node/.claude/plans/scalable-wiggling-sloth.md`), continuing from the
backend-only state left at 2026-07-14 (11).

* Live tests: `api-keys.live.test.ts` (owner CRUD round trip, non-owner 403,
  outsider RLS boundary) and `events-ingest.live.test.ts` (real `POST
  /events` with only a raw key and zero Supabase session, garbage-key 401,
  revoked-key 401), against the real local Supabase stack -- 22/22 passing.
* Frontend: `apps/web/src/lib/api.ts` gained `ApiKey`/`TenantEvent` types and
  the five new request functions. Initially wrote these with a snake_case
  `*Item` + mapper layer copying the `Tenant`/`TenantInvitation` pattern --
  caught before committing that `api-keys.controller.ts`/
  `events.controller.ts` already normalize to camelCase server-side
  (`normalizeApiKeyRecord`/`normalizeEventRecord`), so the mapper layer was
  wrong and removed; the wire format matches the frontend types directly.
* `stores/tenants.ts`: new `apiKeys`/`events` state and
  `fetchApiKeys`/`createApiKey`/`revokeApiKey`/`fetchEvents`/`createEvent`
  actions, same status-flag + `upsertById` shape as the existing invitation
  actions.
* `TenantEditPage.vue`: new "API Keys" card -- create form, one-time raw-key
  reveal panel (first use of `navigator.clipboard` in this repo, with a
  fallback message if it throws), table with revoke, link to the new events
  page.
* New `TenantEventsPage.vue` + `/tenants/:tenantId/events` route: events
  table with attribution resolved to "You" / "Another member" / "API:
  `<name>`", plus a manual create-event form (payload/metadata JSON
  textareas, client-side `JSON.parse` validation before submit).
* `tenants.store.test.ts`: 6 new cases for the new actions, following the
  existing mocked-`fetch` convention.
* New Playwright e2e spec `apps/web/e2e/api-keys-events-flow.spec.ts`,
  matching the existing `invitation-flow.spec.ts` convention (real browser,
  real dev servers, real local Supabase). Covers the full loop end to end:
  register -> create tenant -> create API key -> one-time reveal -> manual
  event (attributed "You") -> real `POST /events` via `request.post()` with
  only the raw key and zero Supabase session (201, `createdByUserId: null`)
  -> reload -> ingested event shows "API: `<name>`" -> revoke via UI ->
  repeat ingestion request now gets 401. Passed on the first run.

## What was verified

* `pnpm --filter @eventops/api typecheck` -- clean; `pnpm --filter
  @eventops/api test` -- 94/94.
* `pnpm --filter @eventops/web typecheck` -- clean; `pnpm --filter
  @eventops/web test` -- 12/12 (was 6; +6 new store tests).
* `pnpm --filter @eventops/web exec playwright test api-keys-events-flow`
  -- 1/1 passing against real dev servers (api + web) and real local
  Supabase, with screenshots confirming the raw-key reveal panel, the
  events table, and the revoked-key state render as expected.

## Next concrete step

This feature is done -- `CHECKLIST.md` section 4 fully checked off. Commit
this work, then return to whatever the next-highest-priority item on the
roadmap is (deployment CI-gate section 4 in `docs/deployment.md` is the
next documented-but-unimplemented piece, or the deprioritized event audit
trail idea in `CHECKLIST.md` section 5 -- ask the user which to pick up
next rather than assuming).

---

Date: 2026-07-14 (11)

## What changed

New scope, defined directly by the user: what does "functionally complete"
mean for this project? Answer: register -> create tenant + invite members
(done) -> a tenant's own external backend can authenticate and send events
into its tenant -> events are attributed correctly -> tenant members can see
an events log in the UI. Investigation surfaced two real gaps: `POST
/tenants/:tenantId/events` only ever accepted a human Supabase JWT (no
server-to-server auth path existed at all), and `apps/web` had no events UI
whatsoever despite the backend being done and tested for a while. Planned
via a formal plan-mode pass (design reviewed by a Plan subagent against the
real codebase before coding) -- full plan at
`/home/node/.claude/plans/scalable-wiggling-sloth.md`. Recorded as a new
section in `CHECKLIST.md`.

Backend work completed so far (this entry):

* Migration `0017_api_keys.sql`: new `api_keys` table, owner-only RLS
  (reusing the `is_active_tenant_owner` helper from migration `0013`, no
  RPC needed since these are single-table writes), plus a nullable
  `events.created_by_api_key_id` FK for attribution alongside the existing
  `created_by_user_id`. Applied to the real local Supabase stack.
* Live RLS verification hit a real methodology snag worth remembering: a
  single-statement `select set_config('role','anon',false), (select
  count(*) from api_keys)` trick gave a **false positive** (anon appeared
  to see a row that no policy grants it) -- a GUC change made by one
  expression in a target list isn't reliably visible to a sibling subquery
  evaluated in the same statement. Switched to a `DO $$ ... $$` block doing
  a real sequential `SET ROLE` + `SELECT ... INTO` + `RAISE EXCEPTION`
  (to surface the count via the CLI's error output, since `supabase db
  query` doesn't support multi-statement scripts or persist session state
  across separate invocations) -- this gave the correct result: anon=0,
  non-owner-authenticated=0, owner=1.
* New backend module `apps/api/src/modules/api-keys/` (types/service/
  controller/routes), mounted at `/tenants/:tenantId/api-keys`, owner-only.
  Key format `eo_live_<32 random bytes>`, only the sha256 hash is ever
  stored, raw key returned once on creation. Discussed key security
  explicitly with the user before coding (256-bit entropy makes brute force
  infeasible regardless of hash speed, unlike password hashing; main
  accepted limitation is no expiry -- matches Stripe/GitHub, revoke is
  manual).
* `requireApiKey` middleware: hash-lookup via `getSupabaseAdmin()` (no
  `auth.uid()` exists in this flow at all), same category as the existing
  invitation accept-token hash lookup. `last_used_at` update is
  fire-and-forget, never blocks the ingestion request.
* New root-mounted `POST /events`: tenant resolved only from the key
  (confirmed by a test that a `tenantId` in the body gets rejected by the
  existing `.strict()` schema before it could ever reach the handler).
  Reuses `assertEventQuotaNotExceeded`/`getExistingEventByIdempotencyKey`
  (now exported) against the admin client instead of duplicating quota/
  idempotency logic for the new path. Added `app.set('trust proxy', 1)` +
  a dedicated rate limiter on `/events` -- a design-review subagent caught
  that without `trust proxy`, `express-rate-limit`'s IP keying would
  collapse onto Render's proxy address once deployed, rate-limiting every
  tenant's ingestion traffic as one shared bucket.

## What was verified

* `pnpm --filter @eventops/api typecheck` -- clean.
* `pnpm --filter @eventops/api test` -- 94/94 (was 77; +17 new across two
  files, `api-keys.test.ts` and `events-ingest.test.ts`): owner-only 403s,
  hash never returned to the client, revoke is idempotent, 401 for
  missing/unknown/revoked keys, 201/200/409/429 all correctly reused on the
  new ingestion path.
* Live RLS probe against the real local Supabase stack (see above) --
  anon and non-owner members cannot see `api_keys` rows; the owner can.

## Next concrete step

Still in progress, per the plan and the new `CHECKLIST.md` section:
finish the live test suite (a real ingestion round trip with a raw key and
zero Supabase session, plus a revoked-key 401 check), then the frontend
(`apps/web/src/lib/api.ts` + store additions, an "API Keys" card in
`TenantEditPage.vue`, a new `TenantEventsPage.vue` with a log + manual
create-event form, frontend store tests), then a full verification pass
(typecheck/test everywhere, manual browser + `curl` click-through
simulating a real external backend) before committing. Going through the
checklist section in order.

---

Date: 2026-07-14 (10)

## What changed

Started "Deployment prep" (README Phase 7). Before touching Render config,
found and fixed a real, pre-existing blocker: `apps/api`/`apps/worker`
could not actually run as a production build at all.

* `apps/api/tsconfig.json`/`apps/worker/tsconfig.json` inherit
  `noEmit: true` from `packages/tsconfig/base.json` (only `outDir` was
  overridden), so `build` (`tsc -p tsconfig.json`) silently emitted
  nothing -- confirmed via a stale `dist/server.js` a fresh `pnpm build`
  didn't touch.
* Added `apps/api/tsconfig.build.json` and `apps/worker/tsconfig.build.json`
  (`noEmit: false`, `include: ["src"]` only, extends the existing
  tsconfig) and pointed `build` at them, rather than changing the
  typecheck-facing `tsconfig.json`.
* Fixed a `dist/` sprawl bug found once the build actually ran:
  `events.routes.ts`'s deep relative import into `packages/validation/src`
  (instead of the `@eventops/validation` package import used everywhere
  else) made `tsc` infer a `rootDir` back to a common ancestor, emitting a
  duplicated nested tree alongside the correct flat output. Fixed by
  switching to the proper package import.
* Found a second, more fundamental issue: `node dist/server.js` crashed
  with `ERR_UNKNOWN_FILE_EXTENSION` for `.ts` -- all 4 internal workspace
  packages resolve via `"main": "./src/index.ts"` directly to TS source
  (fine for `tsx`/`vite`/`vitest`, fatal for plain `node`). Presented two
  options to the user (run production via `tsx` too vs. a bigger dual
  dev/build conditional-exports fix across 4 packages); user picked
  `tsx` in production. `start` scripts now run `tsx src/server.ts` /
  `tsx src/index.ts`, and `tsx` moved from `devDependencies` to
  `dependencies` in both apps.

## What was verified

* `pnpm --filter @eventops/api typecheck` and `pnpm --filter
  @eventops/worker typecheck` -- clean.
* `pnpm --filter @eventops/api test` -- 77/77. `pnpm --filter
  @eventops/worker test` -- 6/6.
* Real production-mode boot, not just a clean exit code: ran
  `NODE_ENV=production pnpm start` for `apps/api`, confirmed JSON
  (not pretty-printed) logs, `GET /health` -> 200 with an
  `X-Request-Id` header. Same for `apps/worker`: confirmed `Worker
  started`, `Invitation email worker started`, and `Invitation cleanup
  sweep started` all logged correctly. Both processes stopped cleanly
  afterward, confirmed via `ps aux`.

Second part of the same day: wrote `render.yaml` (Blueprint for
`eventops-api`/`eventops-worker`/`eventops-web`/`eventops-redis`) and
`docs/deployment.md`. Fetched Render's current Blueprint docs instead of
relying on possibly-stale training data before writing the schema --
worth noting since it changed a real field (`type: keyvalue` is now
preferred over the deprecated `type: redis` alias). While writing it,
found and fixed a real gap: `apps/api/src/server.ts` only ever read
`API_PORT`, but Render assigns the listen port via `PORT` at runtime --
now prefers `process.env.PORT`, falling back to `API_PORT` locally.
Added a short "Deployment prep status" note to `README.md`'s Phase 7
section pointing at both new files instead of duplicating their content.
Left the CI deploy-approval gate documented but unimplemented (section 4
of `docs/deployment.md`) -- it depends on a Render Deploy Hook URL that
won't exist until the Blueprint is created once, and on a GitHub
Environment reviewer setting that's a repo-settings action, not a diff.

## What was verified

* `pnpm --filter @eventops/api typecheck` -- clean (after the
  `server.ts` port-binding change).
* `pnpm --filter @eventops/api test` -- 77/77, unchanged.
* Did not attempt to run/validate `render.yaml` against a real Render
  account -- out of scope for me per `CLAUDE.md`'s deploy boundary; the
  schema itself was checked against Render's current docs instead.

## Next concrete step

Deployment prep's remaining open item is the CI deploy-approval gate,
which needs the user to create the Render Blueprint first (to get
Deploy Hook URLs) and configure a GitHub Environment reviewer -- both
manual, both documented in `docs/deployment.md` section 4. Otherwise
"Deployment prep" is now content-complete; check whether anything else
is open before picking a new area of work.

---

Date: 2026-07-11 (9)

## What changed

Implemented tenant event quotas, the last item under "Event ingestion
correctness" in the "Next priorities" list. Design decisions (all made by
the user via explicit questions before coding): events/day as the limit
dimension, `count(*)` on the fly (no separate counter table), `429 Too
Many Requests` on exceed.

* `packages/config/src/lib/api-env.ts`: new `EVENTS_DAILY_QUOTA` env var,
  `z.coerce.number().int().min(1).default(10000)`.
* `apps/api/src/modules/events/events.service.ts`: new
  `assertEventQuotaNotExceeded(supabaseUser, tenantId)`, called in
  `createEventForTenant` right after the tenant-active check, before the
  insert attempt. Counts events for the tenant with `created_at` in a
  rolling 24h window (`Date.now() - 24h`, not a calendar-day boundary --
  consistent with how `express-rate-limit`'s windows already work
  elsewhere in this codebase) via `count: 'exact', head: true`. Reuses the
  existing `events_tenant_created_at_idx` index from migration `0004` --
  no new migration needed for this part.
* Documented a known, accepted simplification directly in a code comment:
  the quota check happens unconditionally before attempting insert, which
  means it runs *before* we know whether a given request would actually
  be an idempotent replay (no new row) rather than a genuine new insert.
  A tenant already at quota gets `429` even for a technically-safe replay
  of one of its own already-existing events. Rare edge case, not solved
  precisely -- flagged rather than either silently ignored or over-built.
* Added a mocked test (`events-create.test.ts`) for the 429 case, and a
  live test (`events.live.test.ts`) that temporarily overrides
  `process.env.EVENTS_DAILY_QUOTA = '2'` for the duration of one test,
  creates 2 real events (both succeed), then confirms a 3rd real
  `POST /events` call returns `429` with the exact expected error
  message -- restores the original env value in a `finally` block
  regardless of pass/fail.

## What was verified

* `pnpm --filter @eventops/api test` -- 77/77 (was 76; +1 new mocked 429
  test; the 4 other tests that reach the insert path all needed their
  mocks extended with a quota-check call, since `.from('events')` is now
  called an extra time before insert).
* `pnpm --filter @eventops/api test:live` -- 16/16 (was 15; +1 new,
  confirming real quota enforcement against the real database with a
  real tenant hitting a real, temporarily-lowered limit).
* `pnpm typecheck` (all 7 packages) -- clean.
* Confirmed 0 leftover test rows after the run (the live suite's own
  `afterAll` cleanup handled it).

## Next concrete step

"Event ingestion correctness" (idempotency + quotas) is now fully closed.
Remaining open items: Deployment prep (Phase 7, capped at preparation
only per CLAUDE.md's boundary) and the newly-recorded, deliberately
lower-priority event audit trail idea.

---

Date: 2026-07-11 (8)

## What changed

No code changes. Discussed a gap the user spotted after the observability
work: the new structured logging is purely internal/system-facing, not a
tenant-visible audit trail of what happened to a specific event (received
-> processed -> failed, with reasons/timestamps). Recommended
deprioritizing it below tenant quotas and deployment prep -- it's not in
the original README roadmap, isn't blocking anything, and is comparable
in scope to the idempotency work already done. User agreed. Recorded it
as a new, explicitly lower-priority section in `CHECKLIST.md` (open
questions: history table vs. exposing current state only; RLS policy;
API endpoint; frontend surface -- none scoped yet) so the idea isn't lost
without committing to build it now.

## What was verified

N/A -- planning only.

## Next concrete step

Continuing down the "Next priorities" list in priority order: tenant
quotas is the next unscoped item (needs decisions on limit dimension,
counter storage, exceed-behavior before any code).

---

Date: 2026-07-11 (7)

## What changed

Implemented Observability basics from the "Next priorities" list, as a
shared pattern used consistently across both backend apps (per the user's
explicit ask: "делаем паттерн под него и используем везде в апишках").

* New package `packages/logger` (`@eventops/logger`): `createLogger(service)`
  wraps `pino`. Pretty-printed via `pino-pretty` only in
  `NODE_ENV=development`; raw JSON otherwise (production-ready, log
  aggregator friendly); `level: 'silent'` in `NODE_ENV=test` so none of
  the 75+ mocked tests that construct a real `createApp()` pay any
  transport overhead. Verified all three modes manually before wiring it
  anywhere: pretty+colored in dev, clean JSON in prod, silent in test.
* `apps/api/src/app.ts`: wired `pino-http` in as the very first
  middleware, with a `genReqId` that honors an incoming `X-Request-Id`
  header (trusts an upstream load balancer / existing trace) or generates
  a `crypto.randomUUID()`, always echoing it back as a response header.
  This gives every request pino-http's automatic structured access log
  (method, path, status, response time) plus a `req.log` child logger
  already bound with that request's id, for free.
* `apps/api/src/middleware/error-handler.ts`: now logs every error via
  `req.log` (warn for `ApiError`/`ZodError`, error for unhandled) before
  responding. Deliberately did *not* add the request id to JSON error
  response *bodies* -- about a dozen existing tests assert exact body
  shape via `toEqual`, and the `X-Request-Id` header already gives full
  log correlation without touching any of them. Confirmed after the fact:
  all 76 api tests still pass unchanged.
* Replaced every `console.log`/`console.error` in `apps/api/src/server.ts`
  and all three `apps/worker/src/*.ts` files with the shared logger,
  structured with relevant fields (job id, invitation id, deleted count,
  etc.) instead of string interpolation. Also removed two ad hoc debug
  `console.log` lines in `server.ts` (pre-existing leftovers from the
  original author debugging a dotenv path issue, unrelated to this
  session's work) rather than converting them -- they weren't real
  instrumentation.
* While touching `packages/shared` to add `@eventops/logger` as a sibling
  package, noticed it also had the exact same stale-compiled-JS-shadowing-
  the-TS-source bug fixed twice already this session (`packages/config`,
  `packages/validation`): `index.js`, `lib/health.js`, `types/api.js`,
  byte-identical to HEAD, `main` field already points at `.ts`,
  `noEmit: true`, unreferenced anywhere. Deleted them, then swept the
  entire repo for any other `.ts`/`.js` sibling pairs -- found none
  remaining anywhere.

## What was verified

* Ran the real `apps/api` dev server in `NODE_ENV=development` and hit it
  with `curl`: confirmed auto-generated UUID request ids, confirmed a
  client-supplied `X-Request-Id: my-custom-trace-id` header is honored
  end to end (echoed back, appears in the log), confirmed pino-http's
  automatic per-request access log appears with full request/response
  detail, and confirmed the `errorHandler`'s explicit `WARN`-level log
  entry appears for a validation error (`POST /auth/register` with an
  empty body), all tagged with the same request id. Stopped the dev
  server afterward.
* `pnpm --filter @eventops/api test` -- 76/76 (unchanged from before this
  work -- confirms the response-body-shape decision above didn't disturb
  anything). `pnpm --filter @eventops/worker test` -- 6/6 (1 test needed
  updating: `invitation-cleanup-sweep.test.ts`'s "does not throw when the
  delete call fails" spied on `console.error` directly; now mocks
  `@eventops/logger` and asserts on the logger call instead).
* `pnpm typecheck` (turbo, all 7 packages including the new
  `@eventops/logger`) -- clean.
* `pnpm --filter @eventops/api test:live` -- 15/15 against the real local
  Supabase stack (unaffected by this change, run as a sanity check anyway
  since the real server path changed). `pnpm --filter @eventops/web
  test:e2e` -- passed, real browser through the real (now pino-http-wired)
  api server.
* Cleaned up test data left behind by the live/E2E verification runs.

## Next concrete step

Metrics-style endpoints and dashboard views (the rest of README Phase 6)
are deliberately out of scope for this pass -- bigger, separate effort.
Remaining open items on the "Next priorities" list: tenant quotas
(deferred, needs scoping) and Deployment prep (Phase 7, capped at
preparation only per CLAUDE.md's deploy boundary).

---

Date: 2026-07-11 (6)

## What changed

Implemented the idempotency half of "event ingestion correctness" from the
"Next priorities" list (quotas deliberately deferred to a separate
conversation, per the user's scoping choice). Applied to the real local
Supabase, not just written and left unverified.

* Discovered `idempotencyKey` was not even a client-settable field before
  this -- `createEventDtoSchema` (`packages/validation/src/request/events.ts`)
  had no such field, so `events.idempotency_key` was always `null`
  regardless of what a client sent. Added it as an optional body field
  (trimmed, 1-200 chars).
* `supabase/migrations/0016_events_idempotency_key_unique.sql`: partial
  unique index on `(tenant_id, idempotency_key) where idempotency_key is
  not null` -- same pattern already used by
  `tenant_invitations_pending_email_unique` (migration `0003`).
* `apps/api/src/modules/events/events.service.ts`'s `createEventForTenant`
  now passes `idempotency_key` through on insert, and on a `23505` unique
  violation (only when an idempotency key was actually supplied) looks up
  and returns the existing event instead of erroring. Return shape changed
  from the raw event to `{ event, replayed }`; the controller now returns
  `200` on replay, `201` on a genuine new insert.
* Added a live test to `events.live.test.ts`: two real `POST /events`
  calls with the same idempotency key against the real migrated database,
  confirms the second returns the first event's id and original payload
  (not the retried payload), and confirms only one row exists via list.
  Added the matching mocked case to `events-create.test.ts`.

## What was verified

* Applied migration `0016` to the real local Supabase via
  `supabase migration up --db-url ...`.
* `pnpm --filter @eventops/api test` -- 76/76 (was 75, +1 new mocked
  replay test). `pnpm --filter @eventops/api test:live` -- 15/15 (was 14,
  +1 new live replay test) against the real migrated database.
* Typecheck clean across `@eventops/api`, `@eventops/validation`,
  `@eventops/web`, `@eventops/worker`.
* Confirmed the live test's `afterAll` cleanup already removes its own
  test data (0 leftover rows found on a manual sweep afterward).

## Next concrete step

Tenant quotas remain open and unscoped (deliberately deferred) -- needs a
decision on limit dimension, counter storage, and exceed-behavior before
any implementation. Otherwise the next planned priority is Observability
basics (structured logging, request IDs) per `CHECKLIST.md`.

---

Date: 2026-07-11 (5)

## What changed

No code changes. The user pushed this session's 17 commits to
`origin/feature/next-small-task` themselves (I have no git credentials in
this sandbox and cannot push). Verified the push landed correctly: after
`git fetch origin`, local `HEAD` and `origin/feature/next-small-task` both
point at `a4409b0`.

Checked whether the new CI workflow (`.github/workflows/ci.yml`) actually
ran on GitHub as a result. It hasn't -- the workflow only triggers on
`push` to `main` or on a `pull_request` event, and pushing a feature
branch matches neither trigger. Confirmed no PR is currently open from
this branch via an unauthenticated call to
`GET /repos/romanpappinen/eventops/pulls?state=open&head=...` (empty
result). Recorded this in `CHECKLIST.md` rather than assuming the push
alone proved the pipeline works -- it proves the workflow file is valid
enough to not break the push, but the actual run is still pending a PR.

## What was verified

Git state only (`rev-parse` comparison, GitHub API PR query). No
application code touched this entry.

## Next concrete step

Opening a PR into `main` will trigger the first real CI run -- that's on
the user (or ask me to draft the PR title/description first). Moving on to
the next planned priority item regardless: event ingestion correctness
(idempotency + quotas), starting with the open design questions flagged in
`CHECKLIST.md`'s "Next priorities" section.

---

Date: 2026-07-11 (4)

## What changed

First item of the newly-planned priorities: added `.github/workflows/ci.yml`
(the `.github` directory didn't exist at all before this). Single `test`
job on `ubuntu-latest`: checkout, `pnpm/action-setup` (reads the pnpm
version from `package.json`'s `packageManager` field, so it can't drift),
`actions/setup-node` pinned to Node 22 (matches
`.devcontainer/Dockerfile`'s base image), `pnpm install --frozen-lockfile`,
`pnpm typecheck`, `pnpm test`. Deliberately does not run `test:live` or
`test:e2e` -- GitHub's runner has no local Supabase stack and no browser,
so those stay dev-machine-only.

## What was verified

Ran the exact commands the workflow runs, locally, in order:
`pnpm install --frozen-lockfile` (lockfile already in sync, no changes),
`pnpm typecheck` (turbo-orchestrated, 6/6 packages passed), `pnpm test`
(turbo-orchestrated, 75 api + 6 worker + 7 web tests passed, plus 3
packages with placeholder `echo test` scripts). This is the same coverage
already verified per-package throughout the session, now confirmed to
also work through the root-level turbo commands the CI workflow actually
invokes.

## Next concrete step

Branch protection (requiring the CI check before merging to `main`) needs
the user to enable it in GitHub's repo settings, and only after this
workflow has run at least once on the default branch -- not something
achievable from this sandbox. Next planned item: event ingestion
correctness (idempotency + quotas), per the "Next priorities" list in
`CHECKLIST.md`.

---

Date: 2026-07-11 (3)

## What changed

No code changes. `CHECKLIST.md` was fully closed out after the private-schema
migration work, so planned the next round of priorities and added a "Next
priorities" section to `CHECKLIST.md`, ordered by leverage:

1. CI pipeline (README Phase 7, currently 0%) -- cheap, low-risk, protects
   every future change automatically, so it goes first before piling on
   more feature work that only gets manually verified.
2. Event ingestion correctness (README Phase 4, partial) -- idempotency
   key enforcement (currently just a decorative unused column) and tenant
   quotas (nothing exists), both in the product's core domain.
3. Observability basics (README Phase 6, ~5%) -- structured logging,
   request IDs.
4. Deployment prep (README Phase 7, 0%) -- capped at preparation only per
   CLAUDE.md's hard deploy/production boundary; the actual go-live is
   always the user's action, never mine.

Each item lists open design questions that need a decision before coding
(e.g., idempotent-replay vs. 409 on duplicate keys; quota dimension and
enforcement mechanism; logging library choice) rather than presuming an
answer.

## What was verified

N/A -- planning only, no code touched.

## Next concrete step

Wait for the user to pick which of the four priority items to start on, or
confirm the ordering, before implementing anything.

---

Date: 2026-07-11 (2)

## What changed

Closed the last open checklist item: moved `invitation_email_jobs` into a
dedicated private schema, applied for real against the running local
Supabase stack (not just written and left unverified).

* Migration `0014_invitation_email_jobs_private_schema.sql`: creates a
  `private` schema, moves the table into it
  (`alter table public.invitation_email_jobs set schema private`), and adds
  seven `security definer` RPC functions in `public` that are now the only
  way to touch it: `enqueue_invitation_email_job`,
  `list_pending_invitation_email_jobs`, `claim_invitation_email_job`,
  `mark_invitation_email_job_sent`, `mark_invitation_email_job_failed`,
  `delete_terminal_invitation_email_jobs_older_than`, and a test-only
  `get_invitation_email_job_accept_token`. Deliberately did *not* add
  `private` to `supabase/config.toml`'s exposed schemas -- that would have
  made the "isolation" cosmetic (still reachable via REST, just a
  different URL). Going through `public`-schema RPCs only, with `private`
  never exposed at all, is a real isolation boundary.
* Migration `0015_invitation_email_job_rpc_grants_fix.sql`: found while
  verifying against the real stack that `0014`'s `revoke execute ... from
  public` wasn't enough -- this Supabase project has default privileges in
  the `public` schema that separately grant `EXECUTE` to `anon`/
  `authenticated` on new functions, independent of the `PUBLIC`
  pseudo-role. An anon-key RPC call succeeded (`200 []`) when it should
  have been rejected. `0015` explicitly revokes from `anon, authenticated`
  too; reverified afterward -- anon now gets `401 permission denied`,
  service_role still works.
* Updated `apps/api/src/modules/tenants/tenant.service.ts`'s
  `enqueueInvitationEmail` to call the RPC instead of
  `.from('invitation_email_jobs').upsert(...)`.
* Updated all four table-touching helpers in
  `apps/worker/src/lib/supabase-rest.ts` to call the matching RPCs via the
  existing `postgrestRequest` helper (target path becomes `rpc/<name>`
  instead of a table name -- no new HTTP mechanism needed).
  `updateInvitationEmailJob`'s single generic payload-object function was
  split into two typed ones, `markInvitationEmailJobSent`/
  `markInvitationEmailJobFailed`, matching the new RPC signatures;
  `invitation-email-worker.ts`'s `markJobSuccess`/`markJobFailure` updated
  to match.
* Updated the mocked test suites: `tenant-invitations.test.ts` now mocks
  `getSupabaseAdmin().rpc` (`adminRpc`) instead of asserting on
  `.from('invitation_email_jobs').upsert(...)`;
  `invitation-email-worker.test.ts` rewritten around the two new typed
  helpers instead of the old generic one.
  `invitation-cleanup-sweep.test.ts` needed no changes -- it mocks
  `deleteTerminalInvitationEmailJobsOlderThan` at the function-signature
  level, which didn't change.
* Updated `apps/api/tests/live/support/live-client.ts`'s
  `getInvitationAcceptToken` to call the new RPC instead of
  `.from('invitation_email_jobs').select(...)`, since that's no longer
  reachable at all now that the table isn't exposed.

## What was verified

* Applied both migrations directly to the real local Supabase database via
  `supabase migration up --db-url ...` (using the CLI binary directly,
  since `pnpm exec supabase` doesn't work in this sandbox --
  `PGSSLMODE=disable` and the IPv4 address were both required workarounds:
  the Go pgx driver tried IPv6 first over `host.docker.internal`, which is
  unreachable from this container, and then tried TLS, which the local
  dev Postgres doesn't speak).
* `pnpm --filter @eventops/api test` -- 75/75. `pnpm --filter
  @eventops/worker test` -- 6/6. `pnpm --filter @eventops/api typecheck`
  and `pnpm --filter @eventops/worker typecheck` -- both clean.
* `pnpm --filter @eventops/api test:live` -- 14/14 against the real,
  already-migrated database (this exercises `enqueue_invitation_email_job`
  for real through the actual invite/resend flows).
* `pnpm --filter @eventops/web test:e2e` -- passed, real browser against
  the real migrated stack.
* Directly hand-verified every worker-side RPC
  (enqueue/list-pending/claim/mark-sent/delete-terminal-older-than)
  against the real database with a real invitation created through the
  real `create_tenant_with_owner`/`create_tenant_invitation` RPCs (not
  mocked) -- all worked as designed.
* Confirmed `public.invitation_email_jobs` is gone from PostgREST
  (`404 PGRST205`), confirmed anon-key RPC calls are rejected
  (`401`/`42501 permission denied`), confirmed service-role RPC calls
  still work.
* Found and cleaned up stray test data (1 tenant, 2 users) left behind by
  earlier test runs today, unrelated to this migration -- confirmed
  `private.invitation_email_jobs` is empty afterward.

## Next concrete step

`CHECKLIST.md` has no open items left. Next session should ask the user
what to scope next -- candidates already discussed: a CI pipeline
(currently 0%), event ingestion idempotency/quotas, or a fresh
Observability/Deployment slice from the README roadmap.

---

Date: 2026-07-11

## What changed

Closed out the last open item from the "Local Supabase stack" checklist
section: the deferred manual browser click-through of the invitation
list/resend/revoke UI. Chose to build it as a real, reusable Playwright E2E
suite (added as a devDependency) rather than a one-off manual session,
since the user wanted it to be rerunnable going forward.

* Installing a browser in this sandbox hit the same class of hard limit as
  Docker earlier: no root/sudo (`no-new-privileges` blocks it), so
  `playwright install-deps` can't run `apt-get`. Also discovered mid-session
  that this devcontainer had been transparently rebuilt (hostname changed
  from `c69792e5db2e` to `7514b71937cf`), wiping the previously-downloaded
  Chromium binary -- explained this to the user rather than silently
  retrying. The user installed `playwright install --with-deps chromium`
  themselves in a live terminal attached to the same container, which has
  root, and it worked from there on.
* `apps/web/playwright.config.ts`: starts both `apps/api` and `apps/web`
  dev servers via `webServer` (array config, `cwd` set to the repo root so
  `pnpm --filter` resolves correctly), against the real local Supabase --
  no mocks anywhere in this path.
* `apps/web/e2e/invitation-flow.spec.ts`: drives a real Chromium browser
  through register -> login -> create tenant -> invite -> resend -> revoke,
  asserting on-page feedback text and the invitations table's Status
  column, with a screenshot at each checkpoint (sent to the user as visual
  proof). Passed twice in a row.
* Found one real, user-facing config bug while getting the first run
  green (not a product code bug): `apps/web/.env.local`'s
  `VITE_SUPABASE_URL` was `http://127.0.0.1:54321`. Unlike the API (which
  reads `SUPABASE_URL` from `process.env` at request time via `dotenv`),
  Vite bakes `VITE_*` env vars into the bundle at dev-server start time,
  and `127.0.0.1` from inside a browser running in this container points
  at the container itself, not the host machine running Supabase. Caught
  it by listening for the actual failed network request in a throwaway
  Playwright probe script (`net::ERR_CONNECTION_REFUSED` on
  `http://127.0.0.1:54321/auth/v1/token`) rather than guessing. Could not
  fix it myself -- `.env.local` is off-limits to read or edit per
  CLAUDE.md's secrets boundary -- so reported the exact line to change and
  the user fixed it (`http://host.docker.internal:54321`, same class of
  fix as the API's env var).
* Cleaned up all real rows created in the local Supabase DB by both E2E
  runs (3 users, 2 tenants across two runs) via a throwaway service-role
  script, same tenants-then-users order as the API live-test cleanup
  helper.
* Added `test-results/`, `playwright-report/`, `e2e-report/`,
  `e2e-artifacts/`, `blob-report/` to `.gitignore` -- these are Playwright's
  generated output, never meant to be committed.

## What was verified

* `apps/web/e2e/invitation-flow.spec.ts` passed twice in a row against the
  real local Supabase stack, real `apps/api`, real `apps/web` dev server,
  real Chromium.
* `pnpm --filter @eventops/web test` (7/7) and
  `pnpm --filter @eventops/web typecheck` -- both still pass; the `e2e/`
  directory is outside `tsconfig.json`'s `include: ["src"]`, so it isn't
  part of the regular typecheck (Playwright type-checks it internally when
  running).
* Confirmed 0 leftover test rows in the real DB after cleanup.

## Next concrete step

The entire "Local Supabase stack" checklist section is now closed. No
specific next item queued -- next session should ask the user what to
scope next (candidates already on the table: the deferred private-schema
migration for `invitation_email_jobs`, or picking up a fresh slice of the
README's "Development Roadmap", e.g. Observability or Deployment, which
are both currently near-0% per the completion assessment discussed this
session).

---

Date: 2026-07-10 (7)

## What changed

Built a real-Supabase integration test suite for `apps/api`, as a separate
opt-in layer alongside the existing mocked unit tests (not a replacement --
mocks stay fast/hermetic/CI-safe; the new suite catches what mocks
structurally can't, like the dropped-RPC bug found earlier today).

* `apps/api/tests/live/setup.ts`: loads the real root `.env` via `dotenv`
  (same path resolution as `server.ts`), requires
  `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`, and
  preflights `${SUPABASE_URL}/auth/v1/health` before any test runs --
  throws a clear, actionable error pointing at the CHECKLIST section
  instead of a cryptic connection failure deep in a test.
* `apps/api/vitest.live.config.ts` + a new `test:live` script: completely
  separate from the default `vitest.config.ts`/`test` script. Narrowed the
  default config's `include` from `tests/**/*.test.ts` to
  `tests/integration/**` + `tests/unit/**` specifically, so `pnpm test`
  (and CI) can never accidentally pick up `tests/live/**` regardless of
  file naming.
* `apps/api/tests/live/support/live-client.ts`: shared helpers --
  `registerAndSignIn` (hits the app's own `/auth/register`, then signs in
  via the anon client to get a real bearer token), `uniqueEmail`/
  `uniqueSlug` (timestamp+random, avoid collisions across runs),
  `getInvitationAcceptToken` (reads the raw token straight out of
  `invitation_email_jobs` via the service-role client, since no worker
  runs in these tests to email it out), and `cleanupLiveTestData`
  (deletes tenants first, then users -- `tenants.created_by_user_id` has
  no cascade, so order matters).
* Four live test files, 14 tests total, all passing against the real
  local stack: `auth.live.test.ts` (5), `tenants.live.test.ts` (3,
  including an RLS-boundary check), `invitations.live.test.ts` (3,
  including the full invite -> resend -> accept round trip through real
  RPCs and a 403 guard for non-owners), `events.live.test.ts` (3).
* One assumption in the first draft of `tenants.live.test.ts` was wrong,
  not a bug: expected `GET /tenants` to return flat tenant objects, but it
  actually returns membership rows with a nested `tenant` field (by
  design -- `tenant.service.ts`'s `listTenantsForUser` selects
  `memberships` with an embedded `tenant:tenants(...)`, and the web
  client's `toTenant()` already unwraps this). Fixed the test assertion,
  not the API.
* Verified cleanup actually works: a post-run query for any
  `live-*@example.com` users or `*live*` tenant slugs returned 0 rows.

## What was verified

* `pnpm --filter @eventops/api test:live` -- 14/14 passing against the
  real local Supabase stack (twice, individually per file and as a full
  run).
* `pnpm --filter @eventops/api test` -- still 75/75 (unaffected by the
  `vitest.config.ts` include-pattern narrowing).
* `pnpm --filter @eventops/api typecheck` -- passes, including the new
  `tests/live/**` files.
* Manual leftover-data check against the real stack -- 0 rows.

## Next concrete step

Only the manual browser click-through of the invitation list/resend/revoke
UI remains from the "Local Supabase stack" checklist section -- now
unblocked since a real backend is confirmed reachable and working.

---

Date: 2026-07-10 (6)

## What changed

No production code changes. Verified the real Supabase connection
end-to-end, now that the user wired env vars in (turned out
`apps/api/src/server.ts` loads a single root-level `.env`, not a per-app
`.env.local` as the checklist originally guessed).

Started `pnpm --filter @eventops/api dev` in the background against the
real env. `GET /health` returned 200. `POST /auth/register` with a
disposable test address returned 201 with a real GoTrue-issued user id and
a row landing in `public.users` -- a genuine round trip through Auth + the
RLS-scoped insert, not a mock. Stopped the dev server afterward so nothing
is left running in the background.

Important finding to remember: running the *existing* test suites
(`pnpm --filter @eventops/api test` etc.) would NOT have proven any of
this -- every current test mocks `getSupabaseUser`/`getSupabaseAdmin` via
`vi.mock`, so they never touch the real stack no matter what the env vars
say. Proving real connectivity required an actual running server and a
real HTTP request, not the test suite.

## What was verified

`GET /health` (200) and `POST /auth/register` (201, real user id) against
the live local Supabase stack via `host.docker.internal:54321`.

## Next concrete step

Decide the test strategy for exercising the real stack going forward:
keep the mocked unit tests as-is and add a separate, opt-in real-stack
integration suite, or replace some mocked suites. Then, once that's
settled, finally do the manual browser click-through of the invitation
list/resend/revoke UI deferred since 2026-07-06.

---

Date: 2026-07-10 (5)

## What changed

No code changes. Verified checklist items 1-2 of the new "Local Supabase
stack" section: the user had already run `supabase start` on the host.
Probed connectivity from inside this devcontainer with `curl`:

* `http://host.docker.internal:54321/rest/v1/` returns a live PostgREST
  OpenAPI schema listing this repo's exact tables (`users`, `tenants`,
  `events`, with custom columns like `idempotency_key`) -- confirms this is
  the right project's stack, migrated.
* `http://host.docker.internal:54321/auth/v1/health` responds with GoTrue
  `v2.188.1` -- auth service is up.
* Port 54322 (direct Postgres) and 54323 (Studio) both respond too.
* `host.docker.internal` resolves from inside this container without any
  `.devcontainer/devcontainer.json` change -- the planned `--add-host`
  runArgs edit turned out to be unnecessary; the platform already provides
  it. Struck that step from the checklist rather than making an edit that
  wasn't needed.

## What was verified

Read-only `curl` probes only, no app config touched (no `.env.local`
written yet, no test run against the real stack yet).

## Next concrete step

Wire `SUPABASE_URL=http://host.docker.internal:54321` and the anon/
service-role keys from the `supabase start` output into
`apps/api/.env.local` / `apps/worker/.env.local`, then run
`pnpm --filter @eventops/api test` / `pnpm --filter @eventops/worker test`
against the real stack per the remaining "Local Supabase stack" checklist
items.

---

Date: 2026-07-10 (4)

## What changed

No code changes. Discussed running a real local Supabase stack instead of
mocked `getSupabaseUser`/`getSupabaseAdmin` in tests -- motivated directly
by the dropped-RPC dead-code bug found earlier today, which mocks could
never have caught since they don't know the real DB schema.

Investigated this sandbox's capabilities: no Docker, no Podman, no
`/var/run/docker.sock` -- `supabase start` (Docker Compose under the hood)
cannot run here regardless of CLI install. `.devcontainer/devcontainer.json`
also deliberately drops capabilities (`--cap-drop=ALL`,
`--security-opt=no-new-privileges:true`) and restricts networking
(`--network=eventops-restricted`), so Docker-in-Docker inside this
container isn't a good idea even if it were technically possible. Network
env vars (`REMOTE_DEV_*`, WebStorm paths) suggest this container runs
locally on the user's own machine via JetBrains Gateway remote dev, not a
detached cloud sandbox -- so the user's host machine is very likely the
same machine (or reachable from) this container, making a host-run Supabase
stack a realistic option.

Added a "Local Supabase stack" section to `CHECKLIST.md` with the concrete
steps: run `supabase start` on the host, verify port binding is reachable
from other containers (not just host loopback), add
`--add-host=host.docker.internal:host-gateway` to this repo's
`devcontainer.json` `runArgs`, verify connectivity before touching app
config, then wire `SUPABASE_URL`/`SUPABASE_ANON_KEY`/
`SUPABASE_SERVICE_ROLE_KEY` in `.env.local` files pointing at
`host.docker.internal` instead of `127.0.0.1`.

## What was verified

Nothing code-level -- this was an environment/infra investigation, not a
code change. Confirmed via direct checks in this session: no docker/podman
binary, no docker socket, devcontainer.json's actual `runArgs`, and the
exact `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` names
required by `packages/config`'s typed env schemas (read the schema files
directly, not any `.env*` file, per the secrets boundary in `CLAUDE.md`).

## Next concrete step

Steps in the new "Local Supabase stack" checklist section are mostly
host-machine actions the user needs to perform themselves (installing the
CLI, running `supabase start`, editing `.env.local`). This container's role
starts at the `devcontainer.json` `--add-host` change and the connectivity
check once the host side is up.

---

Date: 2026-07-10 (3)

## What changed

Closed out most of the "Later / lower priority" checklist section.

* Marked "Frontend invitation expiry/resend admin controls" and "Periodic
  cleanup/maintenance worker" as done -- both were already shipped in the
  2026-07-06 "Invitation resend + cleanup" work; the checklist just hadn't
  been reconciled.
* Documented canonical tenant RPC functions: added a "Canonical RPC
  Reference" table to `docs/rls-rpc-plan.md` tracing every
  `create_tenant_with_owner` / `create_tenant_invitation` /
  `update_tenant` / `archive_tenant` / `revoke_tenant_invitation` /
  `accept_tenant_invitation_by_token` signature across migrations `0003`
  through `0013`, noting which are canonical and which were dropped.
* While tracing that history, found a real bug: `tenant.service.ts`'s
  `acceptTenantInvitationForUser` still called `.rpc('accept_tenant_invitation',
  ...)`, but that Postgres function was dropped by migration `0011` in
  favor of `accept_tenant_invitation_by_token`. Confirmed via grep across
  `apps/api/src` and `apps/api/tests` that this JS function was never
  imported by any controller, route, or test -- fully dead code left over
  from the pre-token accept flow. Deleted it, plus the now-unused
  `TenantInvitationParams` type and `tenantInvitationParamsSchema` in
  `tenant.schemas.ts` (both existed only to serve that one dead function).
* Left "moving `invitation_email_jobs` into a private schema" open --
  scoped it as bigger than a simple refactor (needs a migration plus a
  PostgREST exposed-schemas config change, and verification against a real
  Supabase stack this sandbox doesn't have) and deferred it rather than
  attempting it half-verified.

## What was verified

* `pnpm --filter @eventops/api typecheck` -- passes.
* `pnpm --filter @eventops/api test` -- 75/75 passing (no test referenced
  the deleted dead code, confirming it truly was unused).

## Next concrete step

Only "moving `invitation_email_jobs` into a private schema" remains open in
`CHECKLIST.md`, explicitly deferred as a separate, larger piece of work.
Otherwise the checklist is clear of ready-to-pick-up items -- next session
should start by asking what new work the user wants to scope in.

---

Date: 2026-07-10 (2)

## What changed

Closed out the "Event route gaps" checklist section.

* Added `GET /tenants/:tenantId/events/:eventId`: `getEventForTenant` in
  `events.service.ts` (select by `tenant_id` + `id`, 404 if not found, 502 on
  read failure), a `getEvent` controller, and the route in `events.routes.ts`
  reusing the existing `eventParamsDtoSchema` for params validation.
* Replaced the hand-written duplicate `limit` schema in
  `events.controller.ts` with the shared `listEventsQueryDtoSchema`
  (`packages/validation/src/request/events.ts`), wired through the
  `validate()` middleware for the `GET /` route instead of a manual
  `safeParse` inside the controller.
* While wiring that middleware, hit the same class of bug fixed earlier this
  session in `packages/config`: `packages/validation/src/` had three stale
  committed CommonJS build artifacts (`index.js`, `request/events.js`,
  `request/health.js`) that shadowed the `.ts` sources for the relative
  `.js`-suffixed import in `events.routes.ts`. The stale `events.js`
  predated `listEventsQueryDtoSchema` entirely, so the middleware crashed
  with `Cannot read properties of undefined (reading 'safeParse')` (a plain
  `TypeError`, not an `ApiError`, so it surfaced as a bare 500). Confirmed
  via `git diff`/`git ls-files` they matched HEAD exactly and
  `tsconfig.json` has `noEmit: true` (nothing regenerates them), then
  deleted all three.
* Added `apps/api/tests/integration/events-get.test.ts` covering 401, 400
  (bad uuid), 404 (not a tenant member), 404 (event not found), 200
  (normalized event body), and 502 (read failure).

## What was verified

* `pnpm --filter @eventops/api test` -- 75/75 passing (was 69/69; +6 new,
  the existing `events-list.test.ts` suite unaffected by the middleware
  change).
* `pnpm --filter @eventops/api typecheck`,
  `pnpm --filter @eventops/validation typecheck`,
  `pnpm --filter @eventops/worker typecheck`,
  `pnpm --filter @eventops/web typecheck` -- all pass.

## Next concrete step

Only the "Later / lower priority" checklist section remains (frontend
invitation expiry/resend admin controls -- partially already covered by the
invitation UI work, periodic cleanup worker -- already done via the hygiene
sweep, moving `invitation_email_jobs` to a private schema, documenting
canonical tenant RPCs across migration history). Worth re-reading that
section against what's already shipped before picking a next task.

---

Date: 2026-07-10

## What changed

Fixed the pre-existing `apps/web/tests/auth.store.test.ts` failure tracked in
`CHECKLIST.md` ("surfaces backend hydration errors after Supabase login
succeeds"). Root cause: `useAuthStore`'s `applySession`
(`apps/web/src/stores/auth.ts`) has a silent-recovery path for a backend
`Unauthorized` response on `/auth/me` -- it locally signs the user out and
resets `status` to `'idle'` with no error, instead of surfacing the failure.
That path was added for silent session restore on page load (a stale/invalid
Supabase token should just quietly log the user out rather than show a
confusing stuck error), but it was unconditionally reused inside `login()`
too, so an `Unauthorized` right after an explicit login attempt was swallowed
instead of shown to the user. Added an `options.silentOnUnauthorized` flag to
`applySession` (default `true`, matching the existing silent-restore
behavior for `initialize()`/`onAuthStateChange`), and pass `false` from the
explicit `login()` call so it now sets `status: 'error'` and surfaces the
backend's error message as before intended.

## What was verified

* `pnpm --filter @eventops/web test` -- 7/7 passing (both `auth.store.test.ts`
  cases and the 5 `tenants.store.test.ts` cases).
* `pnpm --filter @eventops/web typecheck` -- passes.

## Next concrete step

Remaining open checklist sections: "Event route gaps" (`GET
/tenants/:tenantId/events/:eventId`, wiring the shared
`listEventsQueryDtoSchema` through `validate()`), and "Later / lower
priority".

---

Date: 2026-07-06 (7)

## What changed

Applied the remaining `/code-review` findings from the previous entry
(web-side and worker-side).

* **Bug (confirmed)**: `apps/web/src/pages/TenantEditPage.vue`'s
  `canActOnInvitation` never checked the parent tenant's archived status, so
  Resend/Revoke buttons rendered for invitations under an archived tenant
  even though the backend always rejects those with 409. Now returns
  `false` up front when `tenant.value.status !== 'active'`.
* **Bug (plausible)**: `apps/web/src/stores/tenants.ts`'s
  `inviteTenantMember` unconditionally unshifted the new invitation into
  `this.invitations`, even if the initial `fetchInvitations` had never
  succeeded -- could show a misleadingly short list. Added an
  `invitationsLoaded` flag (set on a successful `fetchInvitations`) and only
  unshift when it's `true`.
* **Simplification**: extracted a shared `upsertById(list, item)` helper in
  `stores/tenants.ts`, replacing three copies of the same
  find-index/splice-or-unshift pattern (`createTenant`, `resendInvitation`,
  `revokeInvitation`).
* **Efficiency**: `apps/worker/src/lib/supabase-rest.ts`'s
  `deleteTerminalInvitationEmailJobsOlderThan` now passes `select: 'id'` on
  the DELETE, so PostgREST's `return=representation` payload is just UUIDs
  instead of full row data for every terminal job it prunes.

This closes out all 9 findings from the code review.

## What was verified

* `pnpm --filter @eventops/web typecheck` and
  `pnpm --filter @eventops/web test` — `tenants.store.test.ts` 5/5 passing.
  (The pre-existing, unrelated `auth.store.test.ts` failure noted earlier
  still fails the same way -- not touched, tracked separately in
  CHECKLIST.md.)
* `pnpm --filter @eventops/worker typecheck` and
  `pnpm --filter @eventops/worker test` — 6/6 passing.

## Next concrete step

All checklist items from the "Invitation resend + cleanup" block and this
review pass are done. Remaining open items: the pre-existing
`auth.store.test.ts` failure, and the "Event route gaps" / "Later / lower
priority" checklist sections.

---

Date: 2026-07-06 (6)

## What changed

Ran a code review (`/code-review --level high`) over the whole session's
work (`git diff 92166be..HEAD`: test date fix, resend endpoint, worker
cleanup sweep + retry tests, invitation list UI) and found 9 issues, most
severe first. This entry covers the API-side fixes (findings 1, 2, 5, 7, 8);
web-side and worker-side fixes are separate entries.

* **Bug (confirmed)**: `resendTenantInvitationForOwner` returned (and on
  failure, persisted) stale `email_delivery_status`/`email_delivery_error`/
  `delivery_attempts` instead of reflecting the just-triggered resend — a
  resend of a previously-failed invitation would report "still failed" even
  when it succeeded, and `markInvitationDeliveryFailed` unconditionally
  zeroing `delivery_attempts` in the DB while the response kept the stale
  pre-resend count meant the API response and persisted row diverged.
* **Bug (plausible, race)**: the pending-status check was a plain SELECT
  followed by an unconditional token UPDATE with no `WHERE status =
  'pending'` guard, unlike the atomic pattern the `revoke_tenant_invitation`
  RPC uses. Fixed both together by extracting a shared
  `reissueInvitationAcceptToken(invitationId)` helper
  (`tenant.service.ts`) used by both `inviteTenantMember` and
  `resendTenantInvitationForOwner`:
  * `updateInvitationAcceptToken` now guards its UPDATE with `.eq('status',
    'pending')` and `.select('id').maybeSingle()`; if the row doesn't match
    (status changed concurrently), it throws a genuine `409 "Invitation is
    no longer pending"` instead of silently succeeding.
  * a new `resetInvitationDeliveryState` explicitly resets
    `email_delivery_status`/`email_delivery_error`/`email_sent_at`/
    `email_message_id`/`delivery_attempts` to their fresh-send defaults in
    the DB (not just the response) on successful reissue, so a page refresh
    stays consistent with the immediate response.
* **Efficiency**: `resendTenantInvitationForOwner`'s tenant-status check and
  invitation lookup (two independent reads) now run via `Promise.all`
  instead of sequentially.
* **Simplification**: extracted `buildMembershipSelect(role)` in
  `tenant-invitations.test.ts` so `mockResendFlow` reuses the same
  membership-chain mock as `mockTenantAccess` instead of duplicating it.
* Tests: updated the resend test's expectations to the corrected
  delivery-state values, added a mock chain (`update`/`eq`/`select`/
  `maybeSingle`) supporting both the guarded-update and plain-update call
  shapes, and added a new test for the 409-on-concurrent-status-change case.

## What was verified

* `pnpm --filter @eventops/api typecheck` — passes.
* `pnpm --filter @eventops/api test` — 69/69 passing (68 + 1 new race-guard
  test).

## Next concrete step

Apply the remaining review findings: web-side (archived-tenant action
visibility, store unshift-without-fetch, upsert-by-id duplication) and
worker-side (cleanup sweep's wasteful `return=representation`).

---

Date: 2026-07-06 (5)

## What changed

Closed the last "Invitation resend + cleanup" checklist bullet: "Extend
invitation list API responses + tenant settings UI with resend/error
visibility." Investigation showed the API side was already done (`GET
/tenants/:tenantId/invitations` already returns `email_delivery_status`,
`email_delivery_error`, `delivery_attempts`, `accept_token_expires_at`), so
this was frontend-only, in `apps/web`.

* `apps/web/src/lib/api.ts`: extended the `TenantInvitation` type with the
  delivery/expiry fields the API already returns but the client discarded;
  added `listTenantInvitations`, `resendTenantInvitation`,
  `revokeTenantInvitation`, all following the existing
  `getTenants`/`inviteTenantMember` fetch conventions (`toTenantInvitation`
  mapper factored out of the old inline mapping).
* `apps/web/src/stores/tenants.ts`: added `invitations` state +
  `fetchInvitations`/`resendInvitation`/`revokeInvitation` actions (same
  try/catch + status-flag shape as `fetchTenants`/`createTenant`).
  `inviteTenantMember` now also unshifts the new invitation into the list.
* `apps/web/src/pages/TenantEditPage.vue`: new "Invitations" table section —
  email, role, a **derived** status column (shows "expired" client-side when
  `status === 'pending'` and `acceptTokenExpiresAt` has passed, mirroring
  the same derivation the API already does server-side for the accept-page
  lookup — no new DB status), email delivery status + inline error text,
  expiry date, and Resend/Revoke buttons (shown only for pending/expired
  rows; revoke asks for confirmation via a plain `confirm()`).
* Tests: extended `apps/web/tests/tenants.store.test.ts` with
  fetch/resend/revoke cases, following the existing `vi.stubGlobal('fetch',
  ...)` pattern. Per discussion with the user, no new component-test harness
  was introduced for `TenantEditPage.vue` (the repo has zero `.vue` component
  tests today) — coverage stays at the store level.

## What was verified

* `pnpm --filter @eventops/web typecheck` (`vue-tsc --noEmit`) — passes.
* `pnpm --filter @eventops/web test` — new `tenants.store.test.ts` cases
  pass (5/5 in that file). Full-suite run also surfaced
  `auth.store.test.ts > surfaces backend hydration errors...` failing;
  confirmed via isolated run that this is **pre-existing and unrelated** —
  it fails the same way on its own, untouched by this change. Left as-is,
  reported to the user, not fixed here (out of scope for this checklist item).
* **Not verified**: an actual browser click-through of the new UI. This
  sandbox has no `docker`/Supabase CLI (so no real backend to log into) and
  no `chromium-cli`/installed Playwright browser (so no static-page check
  either). Functional correctness rests on typecheck + the store-level
  tests (which assert exact fetch URLs, payload shapes, and resulting store
  state) rather than an observed render. A manual click-through against a
  real local Supabase instance is recommended before merging.

## Next concrete step

"Invitation resend + cleanup" checklist block is now fully closed, including
this last bullet. Recommend either: (a) a manual UI smoke-test against a
real local Supabase stack, or (b) move on to the next checklist section,
"Event route gaps" (`GET /tenants/:tenantId/events/:eventId`, shared query
validation wiring). Also flagging the pre-existing `auth.store.test.ts`
failure as something to fix separately.

---

Date: 2026-07-06 (4)

## What changed

Step 3 (stretch) of the "Invitation resend + cleanup" checklist block:
worker tests for retry exhaustion, on top of the Vitest setup added in step 2.

* `apps/worker/src/invitation-email-worker.ts`: exported `markJobFailure`,
  `markJobSuccess`, and `InvitationEmailJobRow` (previously module-private)
  so they're directly testable without driving the infinite poll loop.
* `apps/worker/tests/invitation-email-worker.test.ts` (new): covers
  `markJobFailure`'s non-terminal branch (status stays `pending`, `attempts`
  incremented, `accept_token` kept, `scheduled_at` pushed out) and terminal
  branch (`attempts` hits `INVITATION_EMAIL_MAX_ATTEMPTS`, status becomes
  `failed`, `accept_token` cleared), plus `markJobSuccess`.

## What was verified

* `pnpm --filter @eventops/worker test` — 6/6 passing.
* `pnpm --filter @eventops/worker typecheck` — passes.

## Next concrete step

"Invitation resend + cleanup" checklist block is now fully closed (resend
endpoint, cleanup sweep, worker tests). Remaining items are explicitly out of
scope for this pass: extending the invitation list API + tenant settings UI
with resend/error visibility, and the "later/lower priority" bullets
(frontend controls, moving invitation_email_jobs to a private schema,
documenting canonical tenant RPCs across migration history).

---

Date: 2026-07-06 (3)

## What changed

Implemented step 2 of the "Invitation resend + cleanup" checklist block: a
minimal hygiene sweep for terminal `invitation_email_jobs` rows.

* `packages/config/src/lib/worker-env.ts`: added
  `INVITATION_EMAIL_JOB_RETENTION_DAYS` (default 30).
* `apps/worker/src/lib/supabase-rest.ts`: added
  `deleteTerminalInvitationEmailJobsOlderThan(cutoffIso)` (REST `DELETE` where
  `status in (sent,failed)` and `processed_at < cutoffIso`); widened
  `PostgrestQueryOptions.method` to include `'DELETE'`.
* `apps/worker/src/invitation-cleanup-sweep.ts` (new): `computeRetentionCutoff`
  (pure), `runInvitationCleanupSweepOnce` (one delete pass),
  `runInvitationCleanupSweepTick` (catches/logs errors so one failure can't
  kill the loop), and `runInvitationCleanupSweep` (the infinite poll loop,
  1 hour interval, hardcoded — no new env var for cadence).
* `apps/worker/src/index.ts`: now runs the cleanup sweep alongside the
  existing email worker (`Promise.all([...])`).
* No new `'expired'` DB status and no plaintext-token cleanup needed —
  confirmed during planning that `markJobSuccess`/`markJobFailure` already
  null out `accept_token` the moment a job goes terminal; this sweep is pure
  row-count housekeeping.
* Added minimal Vitest to `apps/worker` (previously had zero test
  infrastructure): `vitest.config.ts`, `tests/setup.ts`, and
  `tests/invitation-cleanup-sweep.test.ts` covering cutoff math, the delete
  call, and that a rejected delete is caught and logged rather than thrown.

**Unrelated bug found and fixed along the way**: `packages/config/src/lib/`
had three stale, git-tracked, CommonJS-compiled `.js` files
(`index.js`, `api-env.js`, `worker-env.js`) sitting next to their `.ts`
sources from an old one-off compile (commit `92596af`). The package's
`tsconfig.json` has `noEmit: true`, so nothing regenerates them — they were
dead weight that happened to silently shadow the real `.ts` source for any
resolver that finds the literal `.js` path, and being CommonJS in a
`"type": "module"` package, would throw if ever actually loaded by Node.
This is exactly what broke my new `INVITATION_EMAIL_JOB_RETENTION_DAYS` field
in testing — the schema resolved was the stale shadow copy. Deleted all
three stray files; `@eventops/config`'s own `noEmit` typecheck and both
consuming packages (`@eventops/api`, `@eventops/worker`) still typecheck and
test clean without them.

## What was verified

* `pnpm --filter @eventops/worker test` — 3/3 passing (new suite).
* `pnpm --filter @eventops/worker typecheck` — passes.
* `pnpm --filter @eventops/config typecheck` — passes (after removing the
  stray `.js` files).
* `pnpm --filter @eventops/api typecheck` and
  `pnpm --filter @eventops/api test` — still 68/68 passing, confirming the
  removed `.js` files weren't load-bearing for the API either.

## Next concrete step

Step 3 (stretch): add `apps/worker/tests/invitation-email-worker.test.ts`
covering the existing `markJobFailure` terminal-vs-retry branches, now that
Vitest is wired up for `apps/worker`. Otherwise this checklist item stays
open for a follow-up pass.

---

Date: 2026-07-06 (2)

## What changed

Implemented step 1 of the "Invitation resend + cleanup" checklist block:
owner-only resend for a pending tenant invitation.

* `apps/api/src/modules/tenants/tenant.service.ts`: new
  `resendTenantInvitationForOwner(authToken, params)` — loads the tenant and
  invitation through the user-scoped client (RLS-backed, same client used by
  `listTenantInvitationsForOwner`/`revokeTenantInvitationForOwner`), rejects
  with `404` if the invitation doesn't belong to the tenant, `409` if the
  tenant is archived or the invitation isn't `status: 'pending'`, otherwise
  reissues the accept token via the existing `updateInvitationAcceptToken` +
  `enqueueInvitationEmail` helpers (same as the original invite path).
* Fixed a real bug in `enqueueInvitationEmail`: the upsert didn't reset
  `attempts`/`last_error`/`processed_at`. Without this, resending a
  previously-exhausted job (`status: 'failed'`, `attempts` at the max) would
  flip status back to `pending` but leave `attempts` at its old value, so the
  very next worker tick would immediately re-fail it as terminal without ever
  actually retrying the send. Now explicitly reset to `0`/`null`/`null`.
* New route `POST /tenants/:tenantId/invitations/:invitationId/resend`
  (`tenants.routes.ts`), owner-gated via the existing
  `requireTenantAccess({minimumRole:'owner'})`, no new RPC or migration — this
  mirrors how token issuance was already app-code rather than RPC for the
  original invite flow.
* New path-scoped rate limiter on the resend route (10 req/15min per IP,
  `apps/api/src/app.ts`), same `createRateLimiter` pattern as
  register/invitation-accept.
* Tests: `tenant-invitations.test.ts` gained a
  `POST .../resend` describe block (happy path incl. attempts-reset
  assertion, 404, 409×2, 403, rate-limit header check).

## What was verified

* `pnpm --filter @eventops/api test` — 68/68 passing.
* `pnpm --filter @eventops/api typecheck` — passes.

## Next concrete step

Step 2: worker hygiene sweep for terminal `invitation_email_jobs` rows
(`apps/worker`) — see `CHECKLIST.md` and the plan already scoped for it.

---

Date: 2026-07-06

## What changed

Fixed the time-bombed fixed date in `invitations-accept.test.ts` flagged in the
previous entry and in `CHECKLIST.md`. The default mocked invitation row hardcoded
`accept_token_expires_at: '2026-06-01T00:00:00.000Z'`, which had passed, so
`getInvitationByToken` (`apps/api/src/modules/tenants/tenant.service.ts`)
correctly computed the invitation as expired and the
`'returns invitation details for a valid token'` test started failing. Replaced
the hardcoded string with a `futureExpiresAt` constant computed as
`Date.now() + 30 days` at module load, used both in the mock fixture and in the
test's expected response body, so the fixture can't time-bomb again. Test-only
change — no production code touched, since the controller's expiry logic was
already correct.

## What was verified

* `pnpm --filter @eventops/api test` — 62/62 passing (previously 61/62).
* `pnpm --filter @eventops/api typecheck` — passes.

## Next concrete step

Move on to the "Invitation resend + cleanup" checklist item: owner-only resend
invitation endpoint (fresh accept token, reset expiry, requeue email job).

---

Date: 2026-07-04

## What changed

Following a security/CRUD/middleware review of `apps/api`, implemented two stability hardening items:

1. **Application-layer tenant-membership check on events routes.** `GET/POST /tenants/:tenantId/events` previously ran only `requireAuth`, relying entirely on Postgres RLS for tenant isolation — the only tenant-scoped module without a second application-level barrier. Added `requireTenantAccess()` (`apps/api/src/modules/tenants/tenant-access.middleware.js`, already used by `tenants.routes.ts`) to both routes in `events.routes.ts`. Non-members/nonexistent tenants now get `404 { error: 'Tenant not found' }` from the middleware, consistent with how `tenants.routes.ts` already behaves (previously GET silently returned `200 { items: [] }` and POST relied on a `42501` RLS error at insert time).
2. **Rate limiting on abuse-prone endpoints.** Added `express-rate-limit` and a small `createRateLimiter()` wrapper (`apps/api/src/middleware/rate-limit.js`) returning the existing `{ error: string }` JSON error shape on `429`. Applied via path-scoped `app.use()` inside `createApp()` (fresh limiter instance per call, so each test/process gets an isolated counter — no shared module-level state) to `POST /auth/register` (20 req / 15 min per IP — registration abuse / email-enumeration probing) and `GET+POST /invitations/accept` (30 req / 15 min per IP — invitation-token probing/abuse).

## What was verified

* `pnpm --filter @eventops/api typecheck` — passes.
* `pnpm --filter @eventops/api test` — 61/62 passing. Updated `events-list.test.ts` and `events-create.test.ts` to mock the new `memberships` lookup and added 404/defense-in-depth cases; added `tests/unit/rate-limit.test.ts` (max-then-429 behavior) and header-presence checks in `auth-register.test.ts` / `invitations-accept.test.ts`.
* The one remaining failure (`invitations-accept.test.ts > returns invitation details for a valid token`) is pre-existing and unrelated: the test hardcodes `accept_token_expires_at: '2026-06-01T00:00:00.000Z'`, which is now in the past relative to the current date, so the invitation reads as `expired` instead of `pending`. Not touched by this change — needs a follow-up fix (use a relative/future date instead of a fixed one).

## Next concrete step

Fix the time-bombed fixed date in `invitations-accept.test.ts` (`returns invitation details for a valid token`), then continue with the previously planned invitation resend + cleanup work.

---

Date: 2026-05-19

## What I checked

* Read the top-level `README.md`.
* Checked the current worktree to see what is in progress.
* Reviewed `supabase/migrations`.
* Checked the Supabase directory structure for an RLS location.
* Read the RLS-related SQL migrations and the existing plan in `docs/rls-rpc-plan.md`.

## Current repo state

There is active unfinished work in the API, shared packages, tests, docs, and Supabase migrations.

The most visible backend change is a move toward an RLS-first pattern for event ingestion:

* `0004_events.sql` adds `public.events`, indexes, constraints, and an RLS `SELECT` policy.
* `0005_events_insert_policy.sql` adds the RLS `INSERT` policy for authenticated active members.
* `apps/api/src/modules/events/*` adds `GET /tenants/:tenantId/events` and `POST /tenants/:tenantId/events`.
* Event tests exist for create and list flows and are already written around user-scoped Supabase access instead of service-role access.

There is also broader API cleanup in progress:

* new shared error and middleware pieces were added (`api-error`, `async-handler`, `error-handler`, `validate`)
* tenant controllers/routes were refactored
* validation and shared types were expanded for the events flow
* `README.md` was updated to describe the newer tenant and event architecture

## Supabase notes

`supabase/migrations` currently contains:

* `0001_users_tenants_memberships.sql`
* `0002_rls.sql`
* `0003_tenant_creation_and_invitations.sql`
* `0004_events.sql`
* `0005_events_insert_policy.sql`
* `0006_rls_rpc_foundation.sql`

There is no separate `supabase/rls` folder in this repository.

RLS is currently defined through migrations, mainly:

* `0002_rls.sql` for initial `users`, `tenants`, and `memberships` read policies
* `0004_events.sql` for `events` read policy
* `0005_events_insert_policy.sql` for `events` insert policy
* `0006_rls_rpc_foundation.sql` for tightened tenant/membership reads, user self-write policies, invitation read policy, and safer RPC wrappers

The direction is clear:

* event routes are the reference RLS-backed pattern
* tenant reads should move away from admin-backed access
* tenant writes should stay behind RPC boundaries where the operation is multi-table or role-sensitive

## Important gap

The repo already contains `docs/rls-rpc-plan.md`, and it still lists unfinished migration work. The implementation is only partially through that plan.

From the code and docs, the biggest unfinished area is tenant-route migration:

* `GET /tenants` and `GET /tenants/:tenantId` are still described as needing migration to direct RLS-backed reads
* tenant update/archive still likely need dedicated RPCs
* invitation and membership flows still need review as explicit RPC-managed write paths
* event query validation still has a local controller fallback instead of fully clean shared runtime validation wiring
* `GET /tenants/:tenantId/events/:eventId` is still not implemented

## What we need to do next

1. Finish the shared runtime validation wiring for event query validation so routes do not depend on local fallback parsing.
2. Migrate `GET /tenants` to a user-scoped Supabase client and rely on RLS instead of the admin-backed read path.
3. Migrate `GET /tenants/:tenantId` the same way and remove tenant-read dependence on admin-backed access middleware.
4. Decide the write boundary for `PATCH /tenants/:tenantId` and `DELETE /tenants/:tenantId`, then add explicit RPCs for update/archive if that remains the chosen model.
5. Review invitation and membership write flows so they are clearly RPC-managed and not implicitly secured by middleware alone.
6. Implement `GET /tenants/:tenantId/events/:eventId` using the existing event RLS model.
7. After each route migration, update the related tests so they assert RLS-visible behavior rather than admin middleware behavior.

## Constraints to keep in mind

* RLS work is in SQL migrations, not a dedicated `supabase/rls` folder.
* Do not inspect or use `supabase/.temp`.
* Keep service-role usage narrow: auth admin, explicit privileged RPC/bootstrap paths, and worker-only flows.

---

Date: 2026-05-19

## Iteration update

This iteration moved the API route layer to a user-context-only Supabase model.

Done:

* tenant route reads and writes now use `getSupabaseUser(authToken)` instead of `getSupabaseAdmin()`
* tenant access middleware now checks membership through the caller token, not the service role
* tenant create, invitation create, update, and archive now go through authenticated RPCs that derive the actor from `auth.uid()`
* `POST /auth/register` now uses anon `signUp` instead of auth admin user creation
* user profile upsert now runs through a user-scoped client, not the service role
* `apps/api/src/lib/supabase.ts` no longer exports `getSupabaseAdmin`
* API integration tests were updated to the user-scoped client model
* `0007_user_scoped_tenant_rpcs.sql` was added and refined to avoid duplicate-policy failure on fresh migration runs

Current result:

* all current API routes are now backed by RLS or authenticated RPC paths
* `rg -n "getSupabaseAdmin" apps/api/src apps/api/tests` returns no matches
* API route integration tests and `apps/api` typecheck pass

## What we need to do next

1. Add a forward-only migration to clean up legacy tenant RPC signatures and explicitly revoke old execute grants where they are no longer canonical.
2. Review the old duplicated migration history across `0003`, `0006`, and `0007` and document which functions/policies are canonical so future work does not reintroduce drift.
3. Implement the remaining event route gaps, especially `GET /tenants/:tenantId/events/:eventId`, using the same user-scoped RLS pattern.
4. Revisit runtime validation cleanup so event query validation is fully shared instead of partially local in controllers.
5. Keep updating `diary.md` after each iteration with what changed, what was verified, and the next concrete step.
