alter table public.users enable row level security;
alter table public.tenants enable row level security;
alter table public.memberships enable row level security;

-- user sees just himself
create policy "users_can_select_self"
on public.users
for select
using (id = auth.uid());

-- user sees own tenants
create policy "members_can_see_tenants"
on public.tenants
for select
    using (
       exists (
           select 1 from public.memberships m
           where m.tenant_id = tenants.id
           and m.user_id = auth.uid()
       )
   );

-- user sees memberships inside own tenant
create policy "members_can_see_memberships"
on public.memberships
for select
       using (
           exists (
               select 1 from public.memberships m
               where m.tenant_id = memberships.tenant_id
               and m.user_id = auth.uid()
           )
       );
