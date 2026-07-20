create table public.api_keys (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    name text not null,
    key_hash text not null unique,
    key_prefix text not null,
    created_by_user_id uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    last_used_at timestamptz,
    revoked_at timestamptz
);

create index api_keys_tenant_id_idx on public.api_keys (tenant_id);

alter table public.api_keys enable row level security;

create policy "owners_can_see_tenant_api_keys"
on public.api_keys
for select
to authenticated
using (public.is_active_tenant_owner(tenant_id));

create policy "owners_can_create_tenant_api_keys"
on public.api_keys
for insert
to authenticated
with check (
    created_by_user_id = auth.uid()
    and public.is_active_tenant_owner(tenant_id)
    and public.is_active_tenant(tenant_id)
);

create policy "owners_can_revoke_tenant_api_keys"
on public.api_keys
for update
to authenticated
using (public.is_active_tenant_owner(tenant_id))
with check (public.is_active_tenant_owner(tenant_id));

alter table public.events
    add column created_by_api_key_id uuid references public.api_keys(id) on delete set null;
