-- Explicit base table privileges for anon/authenticated on every public
-- app table. RLS (already enabled on all of these, see migrations 0002,
-- 0003, 0004, 0012, 0017) is what actually restricts row access -- this
-- grant only lets the roles attempt a query at all. Local dev via
-- `supabase start` seeds equivalent privileges automatically, which is
-- why this gap only surfaced against a hosted project: a real production
-- error confirmed anon/authenticated had no privileges at all on
-- public.users ("permission denied for table users", 42501), even
-- though the dashboard's "Automatically expose new tables" setting was
-- enabled -- it did not apply retroactively to tables created via
-- `supabase db push`.
--
-- private.invitation_email_jobs is deliberately excluded: it is not in
-- the public schema and must stay reachable only through the
-- security-definer RPCs in migrations 0014/0015.
grant select, insert, update, delete on
    public.users,
    public.tenants,
    public.memberships,
    public.tenant_invitations,
    public.events,
    public.api_keys
to anon, authenticated;

-- Covers any future public table so this can't silently recur.
alter default privileges in schema public
    grant select, insert, update, delete on tables to anon, authenticated;
