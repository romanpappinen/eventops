alter table public.tenants
add column description text;

create table public.tenant_invitations (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    email text not null,
    role text not null default 'member',
    status text not null default 'pending',
    invited_by_user_id uuid not null references public.users(id) on delete cascade,
    created_at timestamptz not null default now(),
    accepted_at timestamptz
);

create unique index tenant_invitations_pending_email_unique
on public.tenant_invitations (tenant_id, lower(email))
where status = 'pending';

alter table public.tenant_invitations
    add constraint tenant_invitations_role_check
    check (role in ('admin', 'member'));

alter table public.tenant_invitations
    add constraint tenant_invitations_status_check
    check (status in ('pending', 'accepted', 'revoked', 'expired'));

alter table public.tenant_invitations enable row level security;

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
