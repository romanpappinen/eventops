# eventops

Multi-tenant event ingestion and analytics platform.

## Stack

- Vue 3 (frontend)
- Node.js + Express (API)
- Worker (async processing)
- Supabase (Postgres + Auth)
- Turborepo + pnpm (monorepo)

## Apps

- `apps/web` — dashboard
- `apps/api` — backend API
- `apps/worker` — background jobs

## Getting started

```bash
pnpm install
pnpm dev
