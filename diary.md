# Diary

Date: 2026-05-19

## What I checked

* Read the top-level `README.md`.
* Checked the current worktree to see what is in progress.
* Reviewed `supabase/migrations`.
* Checked the Supabase directory structure for an RLS location.
* Read the RLS-related SQL migrations and the existing plan in `docs/rls-rpc-plan.md`.

## Current repo state

There is active unfinished work in the API, shared packages, tests, docs, and Supabase migrations.

The most visible backend change is a move toward an RLS-first pattern for event ingestion:

* `0004_events.sql` adds `public.events`, indexes, constraints, and an RLS `SELECT` policy.
* `0005_events_insert_policy.sql` adds the RLS `INSERT` policy for authenticated active members.
* `apps/api/src/modules/events/*` adds `GET /tenants/:tenantId/events` and `POST /tenants/:tenantId/events`.
* Event tests exist for create and list flows and are already written around user-scoped Supabase access instead of service-role access.

There is also broader API cleanup in progress:

* new shared error and middleware pieces were added (`api-error`, `async-handler`, `error-handler`, `validate`)
* tenant controllers/routes were refactored
* validation and shared types were expanded for the events flow
* `README.md` was updated to describe the newer tenant and event architecture

## Supabase notes

`supabase/migrations` currently contains:

* `0001_users_tenants_memberships.sql`
* `0002_rls.sql`
* `0003_tenant_creation_and_invitations.sql`
* `0004_events.sql`
* `0005_events_insert_policy.sql`
* `0006_rls_rpc_foundation.sql`

There is no separate `supabase/rls` folder in this repository.

RLS is currently defined through migrations, mainly:

* `0002_rls.sql` for initial `users`, `tenants`, and `memberships` read policies
* `0004_events.sql` for `events` read policy
* `0005_events_insert_policy.sql` for `events` insert policy
* `0006_rls_rpc_foundation.sql` for tightened tenant/membership reads, user self-write policies, invitation read policy, and safer RPC wrappers

The direction is clear:

* event routes are the reference RLS-backed pattern
* tenant reads should move away from admin-backed access
* tenant writes should stay behind RPC boundaries where the operation is multi-table or role-sensitive

## Important gap

The repo already contains `docs/rls-rpc-plan.md`, and it still lists unfinished migration work. The implementation is only partially through that plan.

From the code and docs, the biggest unfinished area is tenant-route migration:

* `GET /tenants` and `GET /tenants/:tenantId` are still described as needing migration to direct RLS-backed reads
* tenant update/archive still likely need dedicated RPCs
* invitation and membership flows still need review as explicit RPC-managed write paths
* event query validation still has a local controller fallback instead of fully clean shared runtime validation wiring
* `GET /tenants/:tenantId/events/:eventId` is still not implemented

## What we need to do next

1. Finish the shared runtime validation wiring for event query validation so routes do not depend on local fallback parsing.
2. Migrate `GET /tenants` to a user-scoped Supabase client and rely on RLS instead of the admin-backed read path.
3. Migrate `GET /tenants/:tenantId` the same way and remove tenant-read dependence on admin-backed access middleware.
4. Decide the write boundary for `PATCH /tenants/:tenantId` and `DELETE /tenants/:tenantId`, then add explicit RPCs for update/archive if that remains the chosen model.
5. Review invitation and membership write flows so they are clearly RPC-managed and not implicitly secured by middleware alone.
6. Implement `GET /tenants/:tenantId/events/:eventId` using the existing event RLS model.
7. After each route migration, update the related tests so they assert RLS-visible behavior rather than admin middleware behavior.

## Constraints to keep in mind

* RLS work is in SQL migrations, not a dedicated `supabase/rls` folder.
* Do not inspect or use `supabase/.temp`.
* Keep service-role usage narrow: auth admin, explicit privileged RPC/bootstrap paths, and worker-only flows.
