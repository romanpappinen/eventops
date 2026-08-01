# Deployment prep

Status: **preparation only**. Nothing in this document has been applied.
Per `CLAUDE.md`'s hard boundary, actual deploys, production migrations,
and releases always require a human to trigger them — this doc and
`render.yaml` exist so that trigger is a small, reviewed action, not a
from-scratch investigation.

## 1. Production Supabase project

Create a **separate** Supabase project for production — never point
production traffic at the local dev stack (`supabase start`) or reuse
its keys.

1. In the Supabase dashboard, create a new project (pick a region close
   to where `eventops-api`/`eventops-worker` will run, e.g. Oregon for
   Render's `oregon` region in `render.yaml`).
2. Apply every migration in `supabase/migrations/` in order, against the
   new project. Two ways to do this:
   - `supabase link --project-ref <ref>` then `supabase db push`, or
   - `supabase migration up --db-url "<production connection string>"`
     (same command used locally in this repo's history — see
     `docs/rls-rpc-plan.md` for the pattern).
   Either way, run it from a trusted machine with the production
   connection string, never from this sandbox (out of scope for me to
   run — see `CLAUDE.md`).
3. Confirm RLS is enabled on every table the migrations create (the
   migrations already enable it per-table; this is a sanity check, not
   a new step) and re-run the same anon/authenticated `EXECUTE`
   privilege check documented in `docs/rls-rpc-plan.md`'s
   "`invitation_email_jobs` Private-Schema RPCs" section — the same
   default-privileges gap that bit the private-schema RPCs locally can
   just as easily exist on a fresh project.
4. Collect three values from the project's API settings page:
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` (also used by `apps/web` as
   `VITE_SUPABASE_ANON_KEY`), `SUPABASE_SERVICE_ROLE_KEY`. These are
   secrets — set them directly in the Render dashboard (the
   `sync: false` entries in `render.yaml`), never commit them.
5. Auth settings: configure the production site URL and redirect URLs
   in Supabase Auth settings to match the deployed `eventops-web` URL
   (or a future custom domain), not `localhost`.

## 2. Redis

`apps/api` and `apps/worker` both require `REDIS_URL` (see
`packages/config/src/lib/api-env.ts` / `worker-env.ts`). `render.yaml`
provisions a Render Key Value (Redis-compatible) instance
(`eventops-redis`) and wires `REDIS_URL` into both services via
`fromService` — no manual value needed for that one variable.

## 3. Render services (`render.yaml`)

`render.yaml` at the repo root defines four services as a single
Blueprint:

- `eventops-api` — Node web service, `pnpm --filter @eventops/api
  start` (runs via `tsx`, not a compiled `dist/` — see the note below).
- `eventops-worker` — Node background worker, same pattern.
- `eventops-web` — static site, `vue-tsc -b && vite build`, published
  from `apps/web/dist`.
- `eventops-redis` — managed Key Value instance backing both `api` and
  `worker`.

To apply it: in the Render dashboard, "New" → "Blueprint", point it at
this repo/branch. Render parses `render.yaml`, shows every service it
would create, and prompts for each `sync: false` env var before
creating anything — review that screen carefully before confirming.

**Why `tsx` in production, not compiled JS**: `apps/api`/`apps/worker`
both `import` from internal workspace packages (`@eventops/config`,
`@eventops/shared`, `@eventops/validation`, `@eventops/logger`) that
resolve via `"main": "./src/index.ts"` straight to TypeScript source.
`tsx` (already used for `dev`) transpiles on the fly and understands
this; plain `node` running compiled `dist/server.js` does not
(`ERR_UNKNOWN_FILE_EXTENSION` for `.ts`). Rather than reworking module
resolution across four shared packages, `start` runs `tsx
src/server.ts` / `tsx src/index.ts` — same mechanism as `dev`, just
without `--watch`. `pnpm build` (`tsc -p tsconfig.build.json`) still
exists and produces a real, clean `dist/` for each app, but Render's
`startCommand` does not use it. This is a deliberate simplification,
not an oversight — see `CHECKLIST.md`'s "Deployment prep" section for
the two-option comparison that led here.

**Port binding**: Render assigns the listen port via the `PORT`
environment variable at runtime. `apps/api/src/server.ts` now prefers
`process.env.PORT` when set, falling back to the `API_PORT` env var
(default `3000`) for local development — no Render-side port
configuration needed beyond the default.

## 4. CI deploy gate

`.github/workflows/ci.yml` currently only runs typecheck/tests on push
to `main` and on pull requests. Render's own GitHub integration
(triggered by the Blueprint's `branch: main`) auto-deploys on every
push to `main` by default — that means a deploy can happen even if
CI hasn't run yet for that exact commit (GitHub Actions and Render's
deploy hook both fire independently off the same push, in an
unspecified order).

To make CI a real gate, in the Render dashboard: turn off "Auto-Deploy"
for `eventops-api`/`eventops-worker`/`eventops-web`, and use Render's
"Deploy Hook" URL for each service instead. Then extend
`.github/workflows/ci.yml` with a second job that:

- needs: `test` (so it only runs after typecheck/tests pass)
- runs only on push to `main` (not on `pull_request`)
- has an `environment: production` with a **required reviewer**
  configured in the repo's GitHub Environments settings — this is the
  actual manual-approval gate; the workflow pauses until a human
  approves the deployment in the Actions UI
- on approval, `curl`s each service's Render Deploy Hook URL (stored as
  a GitHub Actions secret, one per service)

This isn't wired up yet — the Deploy Hook URLs don't exist until the
Blueprint above has been created once in Render, and configuring a
required reviewer on a GitHub Environment is a repo-settings action,
not something committable in this diff.

## 5. What's still manual after all of the above

- Creating the production Supabase project and running its migrations.
- Creating the Render Blueprint and filling in every `sync: false`
  secret.
- Turning off Render auto-deploy and switching to Deploy Hooks.
- Adding the Deploy Hook URLs as GitHub Actions secrets.
- Configuring a required reviewer on a `production` GitHub Environment.

None of these are things I can do from this sandbox — no Render/GitHub
credentials here, and `CLAUDE.md` rules them out even if there were.
