-- Enforce the idempotency_key contract that already existed as an unused
-- column: two events for the same tenant with the same non-null
-- idempotency_key are the same logical event. NULL values are exempt
-- (events without a supplied key never conflict with each other).

create unique index events_tenant_idempotency_key_unique
on public.events (tenant_id, idempotency_key)
where idempotency_key is not null;
