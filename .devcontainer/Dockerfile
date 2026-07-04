FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    jq \
    bubblewrap \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
RUN npm i -g @anthropic-ai/claude-code@latest

USER node
WORKDIR /workspaces/eventops
