-- Same class of gap as migrations 0019/0020, this time hitting the
-- invitation-email-job RPCs: a real production error confirmed
-- service_role has no EXECUTE privilege on
-- public.list_pending_invitation_email_jobs (and, by the same cause,
-- the other six functions created alongside it)
-- ("permission denied for function list_pending_invitation_email_jobs",
-- 42501).
--
-- The root cause is a wrong assumption baked into migration 0014's own
-- comment: it revoked EXECUTE from PUBLIC and assumed service_role
-- "bypasses grants" the way it bypasses RLS. It doesn't -- service_role
-- only gets EXECUTE on a function via an explicit grant or Supabase's
-- default privileges, and (per 0019/0020) those defaults don't apply
-- retroactively on this hosted project to objects created after initial
-- project bootstrap. These functions were added by migration 0014, long
-- after bootstrap, so service_role never had EXECUTE on them at all.
--
-- This does not touch anon/authenticated -- their EXECUTE stays revoked
-- per 0014/0015, so this stays a server-only (apps/api admin client,
-- apps/worker) capability, not a new public surface.
grant execute on function public.enqueue_invitation_email_job(uuid, text) to service_role;
grant execute on function public.list_pending_invitation_email_jobs(integer) to service_role;
grant execute on function public.claim_invitation_email_job(uuid) to service_role;
grant execute on function public.mark_invitation_email_job_sent(uuid, integer) to service_role;
grant execute on function public.mark_invitation_email_job_failed(uuid, text, integer, text, timestamptz, boolean) to service_role;
grant execute on function public.delete_terminal_invitation_email_jobs_older_than(timestamptz) to service_role;
grant execute on function public.get_invitation_email_job_accept_token(uuid) to service_role;

-- Covers any future function in public so this can't silently recur --
-- mirrors the same forward-looking guard migration 0020 already applies
-- to tables for service_role.
alter default privileges in schema public
    grant execute on functions to service_role;
