# AGENTS.md

## Scope
Work only inside this repository (`/workspaces/eventops`).
Prefer the smallest change that solves the task.
Do not scan unrelated folders unless explicitly asked.
This file applies identically to local sessions and to sessions started
remotely (phone, SSH, or any other client) — a remote origin does not grant
extra trust.

## Secrets
Never read, print, summarize, diff, or modify:
- .env
- .env.local
- .env.*.local
- .npmrc
- private keys, SSH keys, cloud credential files
- CI secret stores
- supabase/config.toml secrets
- any file under supabase/.temp
- any file under supabase/.branches

Use only:
- .env.example
- typed config
- documented variable names

Never reveal secret values in output, logs, diffs, or comments, even partially
(no "starts with", no "same as X").

## Commands
Do not run destructive commands such as:
- rm -rf
- git reset --hard
- git clean -fd
- drop database
- delete cloud resources

## Deploy and production — hard boundary
Codex never deploys, never runs production migrations, and never releases,
under any approval mode, any profile, or any remote/mobile session.

The only path to production is:
1. Codex proposes changes as a normal small diff on a feature branch.
2. A human reviews and opens/merges a PR.
3. CI runs the actual deploy/migration, gated by a manual approval step in
   the CI provider (not by Codex).

If asked to deploy directly, refuse and point to this section instead.

Do not use networked commands unless explicitly requested, and never for
anything resembling a deploy or release action.

## Workflow
Run only minimal relevant checks for touched code:
- typecheck
- lint
- package-scoped tests

After any non-trivial change, append a short entry to `diary.md`:
- what changed
- what was verified (tests/typecheck run and result)
- the next concrete step

## Repo structure
- apps/web
- apps/api
- apps/worker
- packages/*
- supabase/migrations (RLS lives here, not in a separate supabase/rls folder)
- docs/rls-rpc-plan.md (source of truth for the RLS/RPC migration plan)
