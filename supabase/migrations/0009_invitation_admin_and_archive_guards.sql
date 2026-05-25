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
    v_tenant_status text;
begin
    v_user_id := auth.uid();

    if auth.role() <> 'authenticated' or v_user_id is null then
        raise exception 'Authenticated user is required';
    end if;

    select status
    into v_tenant_status
    from public.tenants
    where id = p_tenant_id;

    if v_tenant_status is null then
        raise exception 'Tenant not found';
    end if;

    if v_tenant_status <> 'active' then
        raise exception 'Archived tenants cannot invite members';
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

create or replace function public.accept_tenant_invitation(
    p_invitation_id uuid
)
returns public.memberships
language plpgsql
security definer
set search_path = public
as $$
declare
    accepted_invitation public.tenant_invitations;
    accepted_membership public.memberships;
    v_user_id uuid;
    v_user_email text;
    v_tenant_status text;
begin
    v_user_id := auth.uid();

    if auth.role() <> 'authenticated' or v_user_id is null then
        raise exception 'Authenticated user is required';
    end if;

    select email
    into v_user_email
    from public.users
    where id = v_user_id;

    if v_user_email is null then
        raise exception 'User profile is required';
    end if;

    select t.status
    into v_tenant_status
    from public.tenant_invitations ti
    join public.tenants t on t.id = ti.tenant_id
    where ti.id = p_invitation_id;

    if v_tenant_status is null then
        raise exception 'Invitation not found';
    end if;

    if v_tenant_status <> 'active' then
        raise exception 'Archived tenants cannot accept invitations';
    end if;

    update public.tenant_invitations
    set
        status = 'accepted',
        accepted_at = now()
    where id = p_invitation_id
      and status = 'pending'
      and lower(email) = lower(v_user_email)
    returning * into accepted_invitation;

    if accepted_invitation is null then
        if exists (
            select 1
            from public.tenant_invitations
            where id = p_invitation_id
              and status = 'pending'
        ) then
            raise exception 'Invitation does not belong to authenticated user';
        end if;

        raise exception 'Invitation not found';
    end if;

    insert into public.memberships (
        tenant_id,
        user_id,
        role,
        status
    )
    values (
        accepted_invitation.tenant_id,
        v_user_id,
        accepted_invitation.role,
        'active'
    )
    on conflict (tenant_id, user_id)
    do update
    set
        role = excluded.role,
        status = 'active'
    returning * into accepted_membership;

    return accepted_membership;
end;
$$;

create or replace function public.revoke_tenant_invitation(
    p_tenant_id uuid,
    p_invitation_id uuid
)
returns public.tenant_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
    revoked_invitation public.tenant_invitations;
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
        raise exception 'Only tenant owners can revoke invitations';
    end if;

    update public.tenant_invitations
    set status = 'revoked'
    where id = p_invitation_id
      and tenant_id = p_tenant_id
      and status = 'pending'
    returning * into revoked_invitation;

    if revoked_invitation is null then
        if exists (
            select 1
            from public.tenant_invitations
            where id = p_invitation_id
              and tenant_id = p_tenant_id
        ) then
            raise exception 'Invitation is no longer pending';
        end if;

        raise exception 'Invitation not found';
    end if;

    return revoked_invitation;
end;
$$;

grant execute on function public.revoke_tenant_invitation(uuid, uuid) to authenticated;

drop policy if exists "members_can_create_events" on public.events;
create policy "members_can_create_events"
on public.events
for insert
to authenticated
with check (
    created_by_user_id = auth.uid()
    and exists (
        select 1
        from public.memberships m
        join public.tenants t on t.id = m.tenant_id
        where m.tenant_id = events.tenant_id
          and m.user_id = auth.uid()
          and m.status = 'active'
          and t.status = 'active'
    )
);
