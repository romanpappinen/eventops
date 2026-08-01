-- Records why an event's async processing step (apps/worker's
-- event-processor) marked it failed. Null while accepted/processed.
alter table public.events
    add column failure_reason text;
