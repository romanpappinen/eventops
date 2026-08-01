-- Same class of gap as migration 0019, this time hitting service_role:
-- a real production error confirmed service_role had no privileges on
-- public.api_keys ("permission denied for table api_keys", 42501), even
-- though service_role normally gets full access to every table by
-- default on Supabase. That default apparently only covers tables that
-- existed when the project was created -- api_keys was added later by
-- migration 0017, well after project bootstrap, and never got the grant.
grant select, insert, update, delete on
    public.users,
    public.tenants,
    public.memberships,
    public.tenant_invitations,
    public.events,
    public.api_keys
to service_role;

-- Covers any future public table so this can't silently recur.
alter default privileges in schema public
    grant select, insert, update, delete on tables to service_role;
