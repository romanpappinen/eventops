# RLS And RPC Plan

Date: 2026-05-18

## Goal

Move the API toward a SaaS-safe default:

* request routes use a user-scoped Supabase client
* Row Level Security is the primary authorization boundary
* RPC is used for multi-table business transactions
* service role is reserved for explicit privileged operations only

This document is the route and table inventory for that migration.

---

## Decision Rules

Use direct RLS-backed table access when:

* the route can be expressed as a single-table read or write
* the database can enforce tenant isolation directly
* the route does not require privileged cross-tenant behavior

Use RPC when:

* the route writes to multiple tables in one business action
* the route needs tightly controlled role transitions
* the route needs a small privileged boundary with a stable contract

Use service role only when:

* the flow is intentionally privileged beyond a user session
* the route depends on Supabase Auth admin APIs
* the worker runs without a user JWT

---

## Table Policy Plan

### `public.users`

Target access model:

* direct RLS for read self
* direct RLS for update self
* controlled bootstrap for insert

Target policies:

* `SELECT` where `id = auth.uid()`
* `UPDATE` where `id = auth.uid()`
* optional constrained `INSERT` where `id = auth.uid()`

RPC need:

* optional `ensure_user_profile()` if profile bootstrap stays controlled

Service role need:

* still needed for auth admin user creation flows

### `public.tenants`

Target access model:

* direct RLS for list and get
* RPC for create
* likely RPC for update and archive

Target policies:

* `SELECT` when an active membership exists for `tenant_id`

RPC need:

* `create_tenant_with_owner`
* likely `update_tenant`
* likely `archive_tenant`

Reason:

* tenant create is a multi-table write with owner membership bootstrap
* tenant update and archive have role-sensitive business rules

### `public.memberships`

Target access model:

* direct RLS for read
* RPC for write flows

Target policies:

* `SELECT` when requester is an active member of the same tenant

RPC need:

* `accept_tenant_invitation`
* `add_membership`
* `change_membership_role`
* `leave_tenant`
* `revoke_membership`

Reason:

* membership writes are stateful and role-sensitive

### `public.tenant_invitations`

Target access model:

* direct RLS for owner or admin reads
* RPC for create, revoke, and accept

Target policies:

* `SELECT` when requester is an active owner or admin member of the same tenant

RPC need:

* `create_tenant_invitation`
* `revoke_tenant_invitation`
* `accept_tenant_invitation`

Reason:

* invitation flows usually touch both invitations and memberships

### `public.events`

Target access model:

* direct RLS for create, list, and get
* later direct RLS or RPC for operational update
* no request-time service role usage

Target policies:

* `SELECT` when an active membership exists for `tenant_id`
* `INSERT` when an active membership exists for `tenant_id` and `created_by_user_id = auth.uid()`
* later `UPDATE` for owner or admin operational fields only

RPC need:

* none for initial event create and read routes

Reason:

* events are the cleanest RLS-first table in the current domain

---

## Route Inventory

### Auth Routes

`POST /auth/register`

* table scope: `auth.users`, `public.users`
* target model: privileged path
* use: service role
* reason: depends on Supabase Auth admin APIs and controlled profile creation
* current state: service role
* target change: none yet
* tests: keep current contract tests

`GET /auth/me`

* table scope: token validation only
* target model: user session
* use: bearer token validation plus request context
* reason: no database read required in current implementation
* current state: already aligned
* target change: none
* tests: keep current auth tests

### Tenant Routes

`GET /tenants`

* table scope: `tenants`, `memberships`
* target model: direct RLS-backed read
* use: user-scoped Supabase client
* current state: service-role-backed read in service
* target change: remove admin-backed tenant read path
* migration need: verify and tighten `tenants` and `memberships` select policies
* test changes: recreate around RLS-visible rows, not admin membership middleware

`POST /tenants`

* table scope: `tenants`, `memberships`
* target model: RPC
* use: user request plus security-definer RPC
* current state: admin client calls RPC
* target change: call RPC through user-scoped client if possible, keep RPC as write boundary
* migration need: verify RPC semantics and any required user-visible execute permissions
* test changes: assert RPC contract rather than raw table writes

`GET /tenants/:tenantId`

* table scope: `tenants`
* target model: direct RLS-backed read
* use: user-scoped Supabase client
* current state: admin-backed membership middleware plus admin read
* target change: remove admin-backed tenant-access middleware from read route
* migration need: verify `tenants` select policy is sufficient
* test changes: use RLS-visible row or empty/not-found semantics

`PATCH /tenants/:tenantId`

* table scope: `tenants`
* target model: likely RPC
* use: controlled update boundary
* current state: admin-backed membership middleware plus admin table update
* target change: move role enforcement into RPC or explicit DB-side rule
* migration need: likely new RPC
* test changes: recreate around RPC failure and role contract

`DELETE /tenants/:tenantId`

* table scope: `tenants`
* target model: likely RPC archive flow
* use: controlled archive boundary
* current state: admin-backed membership middleware plus admin table update
* target change: move to archive RPC
* migration need: likely new RPC
* test changes: recreate around RPC success and forbidden/archive semantics

`POST /tenants/:tenantId/invitations`

* table scope: `tenant_invitations`, `memberships`
* target model: RPC
* use: controlled invitation creation flow
* current state: admin-backed membership middleware plus admin RPC call
* target change: route may still use owner or admin guard for HTTP behavior, but write boundary should remain RPC
* migration need: owner or admin invitation read policy plus RPC review
* test changes: keep invitation contract, remove assumption that admin middleware is the true security boundary

### Event Routes

`GET /tenants/:tenantId/events`

* table scope: `events`
* target model: direct RLS-backed read
* use: user-scoped Supabase client
* current state: aligned
* target change: fix shared runtime query-validator export so route can use shared middleware-only validation cleanly
* migration need: none beyond existing event select policy
* test changes: already recreated for RLS-style behavior

`POST /tenants/:tenantId/events`

* table scope: `events`
* target model: direct RLS-backed write
* use: user-scoped Supabase client
* current state: aligned after insert policy migration
* target change: none for security model
* migration need: none beyond existing event insert policy
* test changes: already recreated for RLS-style behavior

`GET /tenants/:tenantId/events/:eventId`

* table scope: `events`
* target model: direct RLS-backed read
* use: user-scoped Supabase client
* current state: not implemented
* target change: implement with tenant and event filters plus normalized response
* migration need: none beyond existing event select policy
* test changes: create from scratch with RLS-style visibility expectations

---

## Middleware And Helper Changes

Keep:

* `requireAuth`
* `asyncHandler`
* global `errorHandler`
* reusable param and body validation middleware

Change:

* stop using `requireTenantAccess()` as the default tenant authorization model
* use user-scoped Supabase client helpers for RLS-backed routes
* keep RPC routes thin and explicit

Helper work needed:

1. treat `req.authToken` as a first-class authenticated request field across RLS-backed services
2. keep `getSupabaseUser(accessToken)` as the default data client for request routes
3. narrow `getSupabaseAdmin()` usage to auth admin, controlled RPC bootstrap, and worker flows

Middleware work needed:

1. split route families into:
   * RLS-backed routes
   * RPC-backed routes
2. keep `requireTenantAccess()` only where it provides useful HTTP semantics during migration, not as the long-term core security boundary
3. fix shared runtime validator exports so routes do not need local fallback schemas

---

## Error Handling Plan

Target response contract:

* `400` invalid params, query, or body
* `401` missing or invalid bearer token
* `403` explicit forbidden when route semantics require it
* `404` resource not visible through RLS or not found
* `409` business conflict
* `502` Supabase or database upstream failure
* `500` unexpected app bug

Route guidance:

* RLS-backed `INSERT` or `UPDATE` denials should map to `404` or `403` consistently
* RLS-backed list routes can return `200` with empty items when no rows are visible
* single-resource RLS-backed reads should return `404` when no visible row is returned

---

## Validation Plan

Keep using:

* `packages/validation` for shared DTO definitions

Need to fix:

* shared runtime schema exports for new event query validation

Current issue:

* `ListEventsQueryDto` exists in the shared validation package, but the list route currently uses a local runtime schema fallback in the controller because the new shared runtime schema export was not resolving safely in the route path

Target state:

* params, query, and body validators are all reusable through middleware
* controllers should not carry local schema fallbacks once shared runtime export wiring is stable

---

## Migration Plan

Completed:

* `0004_events.sql`
* `0005_events_insert_policy.sql`

Next migration focus:

1. verify and tighten tenant read policies for `tenants` and `memberships`
2. add invitation read policy for owner or admin users
3. add any new RPCs needed for tenant update or archive
4. add event update policy only if operational event mutation is required

Do not do yet:

* broad direct-write policies for memberships or invitations
* hard-delete policies for tenant-owned business data

---

## Test Plan

Recreate tests when moving a route from admin-backed flow to RLS-backed flow.

For RLS-backed routes:

* mock `getSupabaseUser()`
* assert visible or non-visible row outcomes
* stop asserting admin membership middleware as the main guard

For RPC-backed routes:

* assert request validation
* assert RPC input contract
* assert mapped business and upstream failures

Current route status:

* event create tests: aligned
* event list tests: aligned
* tenant read and list tests: still need migration to RLS-first expectations
* tenant write and invitation tests: still centered on admin-backed behavior and need review once their target RPC model is finalized

---

## Recommended Execution Order

1. fix shared runtime validation export wiring
2. keep the events routes as the reference RLS-backed pattern
3. migrate `GET /tenants`
4. migrate `GET /tenants/:tenantId`
5. keep `POST /tenants` on RPC, but move off service-role-by-default if the RPC can be called safely with user context
6. decide and implement RPC strategy for tenant update and archive

---

## Canonical RPC Reference (as of migration `0013`)

Several of these functions were redefined across migrations while the actor
model shifted from an app-supplied user id parameter to deriving the actor
from `auth.uid()` inside the function body. This section is the single
source of truth for which signature is live. If you are about to add a
migration that touches one of these functions, `drop function if exists`
the previous signature (if the parameter list changes) before `create or
replace function` — do not leave both callable.

| Function | Canonical signature | Introduced | Superseded / dropped |
| --- | --- | --- | --- |
| `create_tenant_with_owner` | `(p_name text, p_slug text, p_description text)` | `0007` | 4-arg version taking `p_created_by_user_id uuid` (`0003`, then re-hardened in `0006`); `0007` explicitly drops it. Actor is always `auth.uid()` now. |
| `create_tenant_invitation` | `(p_tenant_id uuid, p_email text, p_role text)` | `0007` (signature); body refined by `0009` (archived-tenant guard) | 4-arg version taking `p_invited_by_user_id uuid` (`0003`, re-hardened in `0006`); `0007` explicitly drops it. `0009`'s `create or replace` keeps the same 3-arg signature — not a further signature change. |
| `update_tenant` | `(p_tenant_id uuid, p_name text default null, p_slug text default null, p_description text default null, p_description_provided boolean default false)` | `0007` | none — introduced once, no drift |
| `archive_tenant` | `(p_tenant_id uuid)` | `0007` | none — introduced once, no drift |
| `revoke_tenant_invitation` | `(p_tenant_id uuid, p_invitation_id uuid)` | `0009` | none — introduced once, no drift |
| `accept_tenant_invitation_by_token` | `(p_token_hash text)` | `0011` | `accept_tenant_invitation(p_invitation_id uuid)` (`0008`, refined by `0009`) — dropped outright by `0011` in favor of the token-based flow. **Dead: do not call `accept_tenant_invitation` — the function no longer exists in the database.** (A dead app-code caller of the dropped function was found and removed 2026-07-10; see `diary.md`.) |
| `is_active_tenant_member`, `is_active_tenant_owner`, `is_active_tenant` | `(p_tenant_id uuid)` → `boolean` | `0013` | none — RLS policy helper functions, called only from `using`/`with check` clauses, never called directly by API code |

Not an RPC, by design: invitation **resend** (`POST
/tenants/:tenantId/invitations/:invitationId/resend`) does not have a
`resend_tenant_invitation` RPC. It is a single-table write (`UPDATE
tenant_invitations ... WHERE status = 'pending'`) done in app code via
`getSupabaseAdmin()` in `tenant.service.ts`'s `reissueInvitationAcceptToken`,
gated by `requireTenantAccess({ minimumRole: 'owner' })` at the HTTP layer.
It does not touch `memberships` or any other table, so it does not need the
multi-table security-definer treatment the RPCs above exist for.
7. review memberships and invitations as explicit RPC-managed write flows
