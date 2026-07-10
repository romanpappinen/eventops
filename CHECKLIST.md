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
- [ ] Consider moving worker-only delivery state (`invitation_email_jobs`)
      into a dedicated private schema for stricter isolation (bigger scope:
      needs a migration plus a PostgREST exposed-schemas config change and
      verification against a real Supabase stack, not doable in this
      sandbox — revisit separately)

## Local Supabase stack (host machine, connected from this devcontainer)

Goal: replace mocked `getSupabaseUser`/`getSupabaseAdmin` in tests/dev with a
real local Supabase stack, to catch RLS/RPC/migration bugs mocks can't (e.g.
the dropped-RPC bug found 2026-07-10). Needs to happen mostly on the host
machine, not from inside this sandbox — this container has no Docker.

- [ ] **Host**: install Supabase CLI, run `supabase start` from the repo
      root (uses `supabase/config.toml` + `supabase/migrations/*.sql`
      already in the repo — applies all 13 migrations automatically).
      Confirm it prints working `API URL` / `anon key` / `service_role key`.
- [ ] **Host**: confirm Supabase's Docker containers publish their ports on
      an interface reachable from other containers, not just host loopback
      (some Supabase CLI versions bind `127.0.0.1:<port>` by default, which
      other containers cannot reach). If containers can't reach it, this is
      the first thing to check.
- [ ] **Repo**: add `--add-host=host.docker.internal:host-gateway` to
      `runArgs` in `.devcontainer/devcontainer.json`, so this container can
      resolve the host machine by a stable name instead of a bridge IP that
      can change. (Small, capability-neutral change — doesn't touch
      `--cap-drop`/`--security-opt`, just adds a hosts-file entry.)
- [ ] **This container**: after rebuilding with that change, verify
      reachability first, e.g. `curl http://host.docker.internal:54321` —
      confirm it responds (even a 404/401 JSON body means the network path
      works) before touching any app config.
- [ ] **This container**: set `SUPABASE_URL=http://host.docker.internal:54321`
      (not `127.0.0.1` — that resolves to the container itself) plus
      `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` from the
      `supabase start` output, in `apps/api/.env.local` and
      `apps/worker/.env.local` (create from `.env.example`, never commit).
- [ ] **This container**: run `pnpm --filter @eventops/api test` /
      `pnpm --filter @eventops/worker test` against the real stack once
      wired, expect some currently-mocked tests to need rework (mocks
      assert exact Supabase query-builder call shapes; a real client won't
      go through those mocks at all — decide per-suite whether to keep the
      existing mocked unit tests *and* add a smaller real-stack integration
      suite, or replace one with the other).
- [ ] **This container**: once connectivity works, use the real stack to
      finally do the manual browser click-through of the invitation
      list/resend/revoke UI that's been deferred since 2026-07-06 (see
      "Invitation resend + cleanup" section above).
