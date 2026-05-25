alter table public.invitation_email_jobs enable row level security;

revoke all on table public.invitation_email_jobs from public;
revoke all on table public.invitation_email_jobs from anon;
revoke all on table public.invitation_email_jobs from authenticated;
