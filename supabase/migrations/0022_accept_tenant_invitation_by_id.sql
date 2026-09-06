-- Tokenless counterpart to accept_tenant_invitation_by_token (0011). Needed
-- because a brand-new user who has to confirm their email before getting a
-- session loses the accept token: it only ever lived in sessionStorage on
-- the tab that opened the invite link, and the confirmation link opens in a
-- separate browser context. Once the user is authenticated with a verified
-- email, that email match is itself sufficient to authorize acceptance, so
-- this looks the invitation up by id instead of by token hash.
--
-- Keep this in sync with accept_tenant_invitation_by_token: same checks,
-- same membership upsert, same accept_token_hash/accept_token_used_at
-- clearing on success.
create or replace function public.accept_tenant_invitation_by_id(
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
        accepted_at = now(),
        accept_token_used_at = now(),
        accept_token_hash = null
    where id = p_invitation_id
      and status = 'pending'
      and accept_token_expires_at > now()
      and lower(email) = lower(v_user_email)
    returning * into accepted_invitation;

    if accepted_invitation is null then
        if exists (
            select 1
            from public.tenant_invitations
            where id = p_invitation_id
              and status = 'pending'
              and accept_token_expires_at <= now()
        ) then
            raise exception 'Invitation has expired';
        end if;

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

grant execute on function public.accept_tenant_invitation_by_id(uuid) to authenticated;
