# Remote / mobile access to Codex — safe setup

Goal: trigger and review Codex work from a phone, without exposing the dev
container to the public internet and without giving it deploy access.

## Two different needs — do not conflate them

1. "I want to ask Codex to do something from my phone."
2. "I want it to touch *this exact running container* on my machine."

These need different, non-overlapping solutions. Picking the wrong one is
how people end up with an SSH port open to the internet.

## Option A — Codex Cloud tasks (recommended default)

OpenAI runs Codex tasks in isolated, OpenAI-managed cloud containers,
reachable from the ChatGPT/Codex mobile app. This never touches your laptop
or your local devcontainer:

- Your local machine and its network stay completely closed — nothing to
  expose, nothing to forget to close later.
- Cloud tasks run in two phases: a setup phase that can reach the network to
  install dependencies, then an offline agent phase by default. Any secrets
  you configure for the cloud environment exist only during setup and are
  removed before the agent phase starts — so even a compromised task can't
  exfiltrate them later in the run.
- Output is a normal git diff/PR against your repo, exactly like a local
  session. You pull and review it the same way.

Use this for "let me kick off a refactor/bugfix from my phone while I'm out."
It cannot deploy anything by itself — see the deploy section below.

## Option B — Tailscale + SSH into the real local container

Only if you specifically need to control the exact container running on
your machine right now (e.g. to inspect local Supabase state):

1. Install Tailscale on the **host** machine (not inside the devcontainer).
   This puts the host on a private WireGuard-based mesh network — no public
   IP, no open port, access requires the device to be authenticated into
   your Tailscale account.
2. From the host, `ssh` into the container the normal Docker way, or expose
   only the container's SSH/terminal over the Tailscale interface — never
   over `0.0.0.0` on the host's public interface.
3. On the phone: Tailscale app (to join the mesh) + an SSH client (e.g.
   Termius) with a key-only login. Disable password auth entirely.
4. Once connected, you're just running `codex` in a normal terminal session
   inside the container — `config.toml` and `AGENTS.md` from this repo apply
   exactly as they do locally. Nothing about being remote loosens the rules.

Never use `ngrok`, a public port-forward, or `--network=host` to make this
reachable — that's the setup that gets scanned and hit by bots within
minutes.

## Deploy from a phone: don't give Codex the keys

Regardless of Option A or B, Codex itself should never hold deploy
credentials or run deploy commands — this is enforced in `AGENTS.md`. The
safe flow for "deploy from my phone":

1. Codex (cloud or local) makes the change and opens a PR.
2. You approve the PR from the phone (GitHub/GitLab mobile app — this is a
   read/approve action, not a credentialed shell).
3. CI (GitHub Actions or similar) does the actual build + deploy, gated by a
   required manual approval/environment protection rule.

This way "deploy from the phone" really means "tap approve on a PR and on a
CI gate," not "give an SSH-reachable agent your production credentials."
