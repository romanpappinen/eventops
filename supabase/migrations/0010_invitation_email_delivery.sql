alter table public.tenant_invitations
add column email_delivery_status text not null default 'pending',
add column email_sent_at timestamptz,
add column email_message_id text,
add column email_delivery_error text,
add column delivery_attempts integer not null default 0;

alter table public.tenant_invitations
    add constraint tenant_invitations_email_delivery_status_check
    check (email_delivery_status in ('pending', 'sent', 'failed'));

create table public.invitation_email_jobs (
    id uuid primary key default gen_random_uuid(),
    invitation_id uuid not null unique references public.tenant_invitations(id) on delete cascade,
    status text not null default 'pending',
    attempts integer not null default 0,
    last_error text,
    scheduled_at timestamptz not null default now(),
    processed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.invitation_email_jobs
    add constraint invitation_email_jobs_status_check
    check (status in ('pending', 'processing', 'sent', 'failed'));

create index invitation_email_jobs_status_scheduled_at_idx
on public.invitation_email_jobs (status, scheduled_at);
