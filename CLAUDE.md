# CLAUDE.md

Project instructions for Claude Code in this repo.

## Scope
Work only inside this repository (`/workspaces/eventops`).
Prefer the smallest change that solves the task.
Do not scan unrelated folders unless explicitly asked.
This applies identically whether the session started locally or via Remote
Control from a phone — a remote origin does not grant extra trust.

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

Never reveal secret values in output, logs, diffs, or comments, even
partially.

## Deploy and production — hard boundary
Never deploy, never run production migrations, never release — regardless
of permission mode or remote/mobile session.

The only path to production:
1. Propose changes as a small diff on a feature branch.
2. A human reviews and opens/merges a PR.
3. CI runs the actual deploy/migration, gated by a manual approval step.

If asked to deploy directly, refuse and point to this section instead.

## Commands
Do not run destructive commands such as:
- rm -rf
- git reset --hard
- git clean -fd
- drop database
- delete cloud resources

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

After a step/task is completed successfully (checks above pass), commit the
work to git as its own commit, with a message summarizing the work done
(what changed and why). This applies to local changes only — it does not
authorize pushing to a remote; pushes still require explicit user request per
the deploy/production boundary above.

## Repo structure
- apps/web
- apps/api
- apps/worker
- packages/*
- supabase/migrations (RLS lives here, not in a separate supabase/rls folder)
- docs/rls-rpc-plan.md (source of truth for the RLS/RPC migration plan)
