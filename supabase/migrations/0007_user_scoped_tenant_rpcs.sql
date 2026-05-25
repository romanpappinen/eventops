drop policy if exists "users_can_select_self" on public.users;
create policy "users_can_select_self"
on public.users
for select
to authenticated
using (id = auth.uid());

drop function if exists public.create_tenant_with_owner(text, text, text, uuid);
create or replace function public.create_tenant_with_owner(
    p_name text,
    p_slug text,
    p_description text
)
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
    created_tenant public.tenants;
    v_user_id uuid;
begin
    v_user_id := auth.uid();

    if auth.role() <> 'authenticated' or v_user_id is null then
        raise exception 'Authenticated user is required';
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
        v_user_id
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
        v_user_id,
        'owner',
        'active'
    );

    return created_tenant;
end;
$$;

drop function if exists public.create_tenant_invitation(uuid, text, text, uuid);
create or replace function public.create_tenant_invitation(
    p_tenant_id uuid,
    p_email text,
    p_role text
)
returns public.tenant_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
    invitation public.tenant_invitations;
    invited_user_id uuid;
    v_user_id uuid;
begin
    v_user_id := auth.uid();

    if auth.role() <> 'authenticated' or v_user_id is null then
        raise exception 'Authenticated user is required';
    end if;

    if not exists (
        select 1
        from public.memberships
        where tenant_id = p_tenant_id
          and user_id = v_user_id
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
        v_user_id
    )
    returning * into invitation;

    return invitation;
end;
$$;

create or replace function public.update_tenant(
    p_tenant_id uuid,
    p_name text default null,
    p_slug text default null,
    p_description text default null,
    p_description_provided boolean default false
)
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
    updated_tenant public.tenants;
    v_user_id uuid;
begin
    v_user_id := auth.uid();

    if auth.role() <> 'authenticated' or v_user_id is null then
        raise exception 'Authenticated user is required';
    end if;

    if not exists (
        select 1
        from public.memberships
        where tenant_id = p_tenant_id
          and user_id = v_user_id
          and role = 'owner'
          and status = 'active'
    ) then
        raise exception 'Only tenant owners can update tenants';
    end if;

    update public.tenants
    set
        name = coalesce(p_name, name),
        slug = coalesce(p_slug, slug),
        description = case
            when p_description_provided then p_description
            else description
        end,
        updated_at = now()
    where id = p_tenant_id
    returning * into updated_tenant;

    if updated_tenant is null then
        raise exception 'Tenant not found';
    end if;

    return updated_tenant;
end;
$$;

create or replace function public.archive_tenant(
    p_tenant_id uuid
)
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
    archived_tenant public.tenants;
    v_user_id uuid;
begin
    v_user_id := auth.uid();

    if auth.role() <> 'authenticated' or v_user_id is null then
        raise exception 'Authenticated user is required';
    end if;

    if not exists (
        select 1
        from public.memberships
        where tenant_id = p_tenant_id
          and user_id = v_user_id
          and role = 'owner'
          and status = 'active'
    ) then
        raise exception 'Only tenant owners can archive tenants';
    end if;

    update public.tenants
    set
        status = 'archived',
        updated_at = now()
    where id = p_tenant_id
    returning * into archived_tenant;

    if archived_tenant is null then
        raise exception 'Tenant not found';
    end if;

    return archived_tenant;
end;
$$;

grant execute on function public.create_tenant_with_owner(text, text, text) to authenticated;
grant execute on function public.create_tenant_invitation(uuid, text, text) to authenticated;
grant execute on function public.update_tenant(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.archive_tenant(uuid) to authenticated;
