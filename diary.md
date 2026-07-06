# Diary

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
