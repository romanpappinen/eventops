# Diary

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
