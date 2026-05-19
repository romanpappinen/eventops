create policy "members_can_create_events"
on public.events
for insert
to authenticated
with check (
    created_by_user_id = auth.uid()
    and exists (
        select 1
        from public.memberships m
        where m.tenant_id = events.tenant_id
          and m.user_id = auth.uid()
          and m.status = 'active'
    )
);
