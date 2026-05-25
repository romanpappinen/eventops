create or replace function public.is_active_tenant_member(
    p_tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.memberships
        where tenant_id = p_tenant_id
          and user_id = auth.uid()
          and status = 'active'
    );
$$;

create or replace function public.is_active_tenant_owner(
    p_tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.memberships
        where tenant_id = p_tenant_id
          and user_id = auth.uid()
          and role = 'owner'
          and status = 'active'
    );
$$;

create or replace function public.is_active_tenant(
    p_tenant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.tenants
        where id = p_tenant_id
          and status = 'active'
    );
$$;

grant execute on function public.is_active_tenant_member(uuid) to authenticated;
grant execute on function public.is_active_tenant_owner(uuid) to authenticated;
grant execute on function public.is_active_tenant(uuid) to authenticated;

drop policy if exists "members_can_see_tenants" on public.tenants;
create policy "members_can_see_tenants"
on public.tenants
for select
to authenticated
using (public.is_active_tenant_member(id));

drop policy if exists "members_can_see_memberships" on public.memberships;
create policy "members_can_see_memberships"
on public.memberships
for select
to authenticated
using (public.is_active_tenant_member(tenant_id));

drop policy if exists "owners_can_see_tenant_invitations" on public.tenant_invitations;
create policy "owners_can_see_tenant_invitations"
on public.tenant_invitations
for select
to authenticated
using (public.is_active_tenant_owner(tenant_id));

drop policy if exists "members_can_see_events" on public.events;
create policy "members_can_see_events"
on public.events
for select
to authenticated
using (public.is_active_tenant_member(tenant_id));

drop policy if exists "members_can_create_events" on public.events;
create policy "members_can_create_events"
on public.events
for insert
to authenticated
with check (
    created_by_user_id = auth.uid()
    and public.is_active_tenant_member(tenant_id)
    and public.is_active_tenant(tenant_id)
);
