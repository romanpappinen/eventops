-- 0014 revoked execute from PUBLIC on the new invitation_email_jobs RPCs,
-- but this Supabase project has default privileges in the public schema
-- that separately grant EXECUTE to anon/authenticated on every new
-- function (independent of the PUBLIC pseudo-role). Revoking from PUBLIC
-- alone left anon and authenticated able to call worker-only functions.
-- Close that gap explicitly.

revoke execute on function public.enqueue_invitation_email_job(uuid, text) from anon, authenticated;
revoke execute on function public.list_pending_invitation_email_jobs(integer) from anon, authenticated;
revoke execute on function public.claim_invitation_email_job(uuid) from anon, authenticated;
revoke execute on function public.mark_invitation_email_job_sent(uuid, integer) from anon, authenticated;
revoke execute on function public.mark_invitation_email_job_failed(uuid, text, integer, text, timestamptz, boolean) from anon, authenticated;
revoke execute on function public.delete_terminal_invitation_email_jobs_older_than(timestamptz) from anon, authenticated;
revoke execute on function public.get_invitation_email_job_accept_token(uuid) from anon, authenticated;
