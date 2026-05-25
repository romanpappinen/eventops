create table public.events (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    source text not null,
    type text not null,
    subject text,
    occurred_at timestamptz not null,
    received_at timestamptz not null default now(),
    payload jsonb not null,
    metadata jsonb not null default '{}'::jsonb,
    status text not null default 'accepted',
    created_by_user_id uuid references public.users(id) on delete set null,
    idempotency_key text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.events
    add constraint events_status_check
    check (status in ('accepted', 'processed', 'failed', 'archived'));

alter table public.events
    add constraint events_payload_object_check
    check (jsonb_typeof(payload) = 'object');

alter table public.events
    add constraint events_metadata_object_check
    check (jsonb_typeof(metadata) = 'object');

create index events_tenant_created_at_idx
on public.events (tenant_id, created_at desc);

create index events_tenant_type_created_at_idx
on public.events (tenant_id, type, created_at desc);

create index events_tenant_status_created_at_idx
on public.events (tenant_id, status, created_at desc);

alter table public.events enable row level security;

create policy "members_can_see_events"
on public.events
for select
using (
    exists (
        select 1
        from public.memberships m
        where m.tenant_id = events.tenant_id
          and m.user_id = auth.uid()
          and m.status = 'active'
    )
);
