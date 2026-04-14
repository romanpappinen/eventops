create extension if not exists "pgcrypto";

-- USERS
create table public.users (
    id uuid primary key,
    email text not null unique,
    full_name text,
    avatar_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- TENANTS (workspace / org)
create table public.tenants (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique,

    plan text not null default 'free',
    status text not null default 'active',

    created_by_user_id uuid not null references public.users(id),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- MEMBERSHIPS (user <-> tenant)
create table public.memberships (
    id uuid primary key default gen_random_uuid(),

    tenant_id uuid not null references public.tenants(id) on delete cascade,
    user_id uuid not null references public.users(id) on delete cascade,

    role text not null,
    status text not null default 'active',

    created_at timestamptz not null default now(),

    unique (tenant_id, user_id)
);
