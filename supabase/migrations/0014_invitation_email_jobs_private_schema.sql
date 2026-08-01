-- Move invitation_email_jobs out of public into a private schema that is
-- never exposed via PostgREST. The only way to read or write it is through
-- the narrow set of security-definer functions below, callable only by
-- service_role (which bypasses grants, unlike anon/authenticated).

create schema if not exists private;

alter table public.invitation_email_jobs set schema private;

-- enqueue (upsert) -----------------------------------------------------

create or replace function public.enqueue_invitation_email_job(
    p_invitation_id uuid,
    p_accept_token text
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
    insert into private.invitation_email_jobs (
        invitation_id,
        status,
        accept_token,
        attempts,
        last_error,
        processed_at,
        scheduled_at,
        updated_at
    )
    values (
        p_invitation_id,
        'pending',
        p_accept_token,
        0,
        null,
        null,
        now(),
        now()
    )
    on conflict (invitation_id) do update
    set
        status = excluded.status,
        accept_token = excluded.accept_token,
        attempts = excluded.attempts,
        last_error = excluded.last_error,
        processed_at = excluded.processed_at,
        scheduled_at = excluded.scheduled_at,
        updated_at = excluded.updated_at;
end;
$$;

-- list pending -----------------------------------------------------------

create or replace function public.list_pending_invitation_email_jobs(
    p_limit integer
)
returns table (
    id uuid,
    invitation_id uuid,
    attempts integer,
    accept_token text
)
language sql
stable
security definer
set search_path = public, private
as $$
    select id, invitation_id, attempts, accept_token
    from private.invitation_email_jobs
    where status = 'pending'
      and scheduled_at <= now()
    order by scheduled_at asc
    limit p_limit;
$$;

-- claim (optimistic lock) -------------------------------------------------

create or replace function public.claim_invitation_email_job(
    p_job_id uuid
)
returns table (
    id uuid,
    invitation_id uuid,
    attempts integer
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
    return query
    update private.invitation_email_jobs
    set status = 'processing',
        accept_token = null,
        updated_at = now()
    where private.invitation_email_jobs.id = p_job_id
      and private.invitation_email_jobs.status = 'pending'
    returning private.invitation_email_jobs.id,
              private.invitation_email_jobs.invitation_id,
              private.invitation_email_jobs.attempts;
end;
$$;

-- mark sent ----------------------------------------------------------------

create or replace function public.mark_invitation_email_job_sent(
    p_job_id uuid,
    p_attempts integer
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
    update private.invitation_email_jobs
    set status = 'sent',
        attempts = p_attempts,
        accept_token = null,
        last_error = null,
        processed_at = now(),
        updated_at = now()
    where id = p_job_id;
end;
$$;

-- mark failed (retry or terminal) ------------------------------------------

create or replace function public.mark_invitation_email_job_failed(
    p_job_id uuid,
    p_status text,
    p_attempts integer,
    p_last_error text,
    p_scheduled_at timestamptz,
    p_terminal boolean
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
    update private.invitation_email_jobs
    set status = p_status,
        attempts = p_attempts,
        accept_token = case when p_terminal then null else accept_token end,
        last_error = p_last_error,
        scheduled_at = p_scheduled_at,
        processed_at = case when p_terminal then now() else null end,
        updated_at = now()
    where id = p_job_id;
end;
$$;

-- cleanup sweep --------------------------------------------------------

create or replace function public.delete_terminal_invitation_email_jobs_older_than(
    p_cutoff timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
    deleted_count integer;
begin
    delete from private.invitation_email_jobs
    where status in ('sent', 'failed')
      and processed_at < p_cutoff;

    get diagnostics deleted_count = row_count;
    return deleted_count;
end;
$$;

-- test/inspection helper: read the raw accept token for a given invitation
-- (the worker itself only ever sees this via list_pending_invitation_email_jobs
-- while a job is still pending; this exists so tests can look it up directly
-- without running the worker).

create or replace function public.get_invitation_email_job_accept_token(
    p_invitation_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, private
as $$
    select accept_token
    from private.invitation_email_jobs
    where invitation_id = p_invitation_id;
$$;

-- Lock every function above down to service_role only. Postgres grants
-- EXECUTE on new functions to PUBLIC by default, which would otherwise
-- hand anon/authenticated callers a backdoor into worker-only state.

revoke execute on function public.enqueue_invitation_email_job(uuid, text) from public;
revoke execute on function public.list_pending_invitation_email_jobs(integer) from public;
revoke execute on function public.claim_invitation_email_job(uuid) from public;
revoke execute on function public.mark_invitation_email_job_sent(uuid, integer) from public;
revoke execute on function public.mark_invitation_email_job_failed(uuid, text, integer, text, timestamptz, boolean) from public;
revoke execute on function public.delete_terminal_invitation_email_jobs_older_than(timestamptz) from public;
revoke execute on function public.get_invitation_email_job_accept_token(uuid) from public;
