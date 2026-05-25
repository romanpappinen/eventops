alter table public.tenant_invitations
add column accept_token_hash text,
add column accept_token_expires_at timestamptz,
add column accept_token_used_at timestamptz;

create unique index tenant_invitations_accept_token_hash_unique
on public.tenant_invitations (accept_token_hash)
where accept_token_hash is not null;

alter table public.invitation_email_jobs
add column accept_token text;

drop function if exists public.accept_tenant_invitation(uuid);
create or replace function public.accept_tenant_invitation_by_token(
    p_token_hash text
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
    where ti.accept_token_hash = p_token_hash;

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
    where accept_token_hash = p_token_hash
      and status = 'pending'
      and accept_token_expires_at > now()
      and lower(email) = lower(v_user_email)
    returning * into accepted_invitation;

    if accepted_invitation is null then
        if exists (
            select 1
            from public.tenant_invitations
            where accept_token_hash = p_token_hash
              and status = 'pending'
              and accept_token_expires_at <= now()
        ) then
            raise exception 'Invitation has expired';
        end if;

        if exists (
            select 1
            from public.tenant_invitations
            where accept_token_hash = p_token_hash
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

grant execute on function public.accept_tenant_invitation_by_token(text) to authenticated;
