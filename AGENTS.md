# AGENTS.md

## Scope
Work only inside this repository.
Prefer the smallest change that solves the task.
Do not scan unrelated folders unless explicitly asked.

## Secrets
Never read, print, summarize, diff, or modify:
- .env
- .env.local
- .env.*.local
- private keys
- cloud credential files
- .npmrc
- CI secret stores
- supabase/config.toml secrets
- any file under supabase/.temp

Use only:
- .env.example
- typed config
- documented variable names

Never reveal secret values in output, logs, diffs, or comments.

## Commands
Do not run destructive commands such as:
- rm -rf
- git reset --hard
- git clean -fd
- drop database
- delete cloud resources

Do not run deploy, release, or production migration commands.
Do not use networked commands unless explicitly requested.

## Workflow
Run only minimal relevant checks for touched code:
- typecheck
- lint
- package-scoped tests

## Repo structure
- apps/web
- apps/api
- apps/worker
- packages/*
