# Remote / mobile access to Claude Code — safe setup

Goal: trigger and review Claude Code work from a phone, without exposing
the dev container to the public internet and without giving up local
tooling (tests, Supabase, etc.).

## Primary option — Claude Code Remote Control

Claude Code has a built-in Remote Control feature: your phone becomes a
window into a session already running inside this devcontainer.

- Outbound-only: the local Claude Code process makes HTTPS requests to
  Anthropic's API and holds a connection open. No inbound port on your
  machine, no firewall rule, no SSH key.
- Full local context: filesystem, tests, Supabase, everything already set
  up in this container is available exactly as if you were typing locally.
- Permission model unchanged: default mode still asks before every
  mutating action (write, bash, network) — being remote doesn't loosen this.

Setup, each time you want to use it:
1. In the devcontainer terminal: `claude`
2. First run: `/login` (once), accept the folder-trust prompt (once).
3. Inside a session: `/rc` — this prints a QR code.
4. Scan it with the Claude app on your phone.

Requirements:
- Claude Pro, Max, Team, or Enterprise subscription (not available via bare
  API key).
- Your computer must stay on and the container running for the session to
  stay alive — this is a live bridge to your local machine, not a cloud
  sandbox.

## Fallback option — Tailscale + SSH into the container

Only needed if you want a full raw terminal from your phone (not just
Claude Code's chat interface) — e.g. to run arbitrary shell commands,
tail logs, or use tools Claude Code doesn't expose directly.

1. Tailscale on the host (already set up: `RomanPC` in your tailnet).
2. Tailscale on the phone (already set up).
3. OpenSSH Server on the host, restricted to the Tailscale range
   (`100.64.0.0/10`) at the firewall level — not the public internet.
4. A dedicated, non-admin Windows user with a `ForceCommand` that drops
   straight into `docker exec -it <container> bash` on login — so an SSH
   session never reaches a raw Windows shell, only the container.

This path is more setup and more moving parts than Remote Control. Use it
only if you specifically need a full terminal, not just Claude Code.

## Deploy from a phone: don't give Claude the keys

Claude Code — local or via Remote Control — should never hold deploy
credentials or run deploy commands. This is enforced in `CLAUDE.md`. The
safe flow for "deploy from my phone":

1. Claude Code makes the change and opens a PR.
2. You approve the PR from the phone (GitHub mobile app — a read/approve
   action, not a credentialed shell).
3. CI (GitHub Actions or similar) does the actual build + deploy, gated by
   a required manual approval / environment protection rule.
