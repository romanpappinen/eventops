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

## Invitation resend + cleanup

- [x] Owner-only resend invitation endpoint (fresh accept token, reset
      expiry, requeue email job) (done 2026-07-06)
- [x] Cleanup path for expired invitations and permanently-failed email jobs
      (done 2026-07-06: hygiene sweep in apps/worker, pruning terminal
      invitation_email_jobs rows older than INVITATION_EMAIL_JOB_RETENTION_DAYS;
      no 'expired' DB status needed, expiry already enforced at accept time)
- [ ] Extend invitation list API responses + tenant settings UI with
      resend/error visibility
- [x] Worker tests for retry exhaustion and token regeneration behavior
      (done 2026-07-06: token regeneration covered at the API layer by the
      resend endpoint tests; retry exhaustion covered by
      invitation-email-worker.test.ts)

## Event route gaps

- [ ] Implement `GET /tenants/:tenantId/events/:eventId`
- [ ] Wire the shared `listEventsQueryDtoSchema`
      (`packages/validation/src/request/events.ts`) through the `validate()`
      middleware instead of the local duplicate schema in
      `events.controller.ts`

## Later / lower priority

- [ ] Frontend invitation expiry/resend admin controls
- [ ] Periodic cleanup/maintenance worker for expired invitations and stale
      queue rows
- [ ] Consider moving worker-only delivery state (`invitation_email_jobs`)
      into a dedicated private schema for stricter isolation
- [ ] Document canonical tenant RPC functions across migration history
      (`0003`/`0006`/`0007`/`0009`) so future work doesn't reintroduce drift
