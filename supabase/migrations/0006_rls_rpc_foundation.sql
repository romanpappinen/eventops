drop policy if exists "members_can_see_tenants" on public.tenants;
create policy "members_can_see_tenants"
on public.tenants
for select
to authenticated
using (
    exists (
        select 1
        from public.memberships m
        where m.tenant_id = tenants.id
          and m.user_id = auth.uid()
          and m.status = 'active'
    )
);

drop policy if exists "members_can_see_memberships" on public.memberships;
create policy "members_can_see_memberships"
on public.memberships
for select
to authenticated
using (
    exists (
        select 1
        from public.memberships m
        where m.tenant_id = memberships.tenant_id
          and m.user_id = auth.uid()
          and m.status = 'active'
    )
);

create policy "users_can_insert_self"
on public.users
for insert
to authenticated
with check (id = auth.uid());

create policy "users_can_update_self"
on public.users
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "owners_can_see_tenant_invitations"
on public.tenant_invitations
for select
to authenticated
using (
    exists (
        select 1
        from public.memberships m
        where m.tenant_id = tenant_invitations.tenant_id
          and m.user_id = auth.uid()
          and m.role = 'owner'
          and m.status = 'active'
    )
);

create or replace function public.create_tenant_with_owner(
    p_name text,
    p_slug text,
    p_description text,
    p_created_by_user_id uuid
)
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
    created_tenant public.tenants;
begin
    if p_created_by_user_id is null then
        raise exception 'Created by user is required';
    end if;

    if auth.role() = 'authenticated' and auth.uid() is distinct from p_created_by_user_id then
        raise exception 'Authenticated user does not match tenant creator';
    end if;

    insert into public.tenants (
        name,
        slug,
        description,
        created_by_user_id
    )
    values (
        p_name,
        p_slug,
        p_description,
        p_created_by_user_id
    )
    returning * into created_tenant;

    insert into public.memberships (
        tenant_id,
        user_id,
        role,
        status
    )
    values (
        created_tenant.id,
        p_created_by_user_id,
        'owner',
        'active'
    );

    return created_tenant;
end;
$$;

create or replace function public.create_tenant_invitation(
    p_tenant_id uuid,
    p_email text,
    p_role text,
    p_invited_by_user_id uuid
)
returns public.tenant_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
    invitation public.tenant_invitations;
    invited_user_id uuid;
begin
    if p_invited_by_user_id is null then
        raise exception 'Inviting user is required';
    end if;

    if auth.role() = 'authenticated' and auth.uid() is distinct from p_invited_by_user_id then
        raise exception 'Authenticated user does not match inviting user';
    end if;

    if not exists (
        select 1
        from public.memberships
        where tenant_id = p_tenant_id
          and user_id = p_invited_by_user_id
          and role = 'owner'
          and status = 'active'
    ) then
        raise exception 'Only tenant owners can invite members';
    end if;

    select id
    into invited_user_id
    from public.users
    where lower(email) = lower(p_email)
    limit 1;

    if invited_user_id is not null and exists (
        select 1
        from public.memberships
        where tenant_id = p_tenant_id
          and user_id = invited_user_id
          and status = 'active'
    ) then
        raise exception 'User is already an active member of this tenant';
    end if;

    insert into public.tenant_invitations (
        tenant_id,
        email,
        role,
        status,
        invited_by_user_id
    )
    values (
        p_tenant_id,
        lower(p_email),
        p_role,
        'pending',
        p_invited_by_user_id
    )
    returning * into invitation;

    return invitation;
end;
$$;

grant execute on function public.create_tenant_with_owner(text, text, text, uuid) to authenticated;
grant execute on function public.create_tenant_invitation(uuid, text, text, uuid) to authenticated;
