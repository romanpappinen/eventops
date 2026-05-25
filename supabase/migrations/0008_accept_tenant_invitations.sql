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

grant execute on function public.accept_tenant_invitation(uuid) to authenticated;
