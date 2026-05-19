# Quickstart Guide

From zero to running platform in 30 minutes.

## Prerequisites

| Tool        | Version | Install                                                      |
| ----------- | ------- | ------------------------------------------------------------ |
| Node.js     | 22+     | `nvm install 22`                                             |
| pnpm        | 9.14+   | `corepack enable && corepack prepare pnpm@9.14.2 --activate` |
| Docker      | 27+     | [docker.com](https://docker.com)                             |
| Git         | 2.40+   | `brew install git` / `apt install git`                       |
| GitHub CLI  | 2.40+   | `brew install gh`                                            |
| AWS CLI     | 2.x     | `brew install awscli`                                        |
| Wrangler    | 4.x     | `npm i -g wrangler`                                          |
| Claude Code | Latest  | `npm i -g @anthropic-ai/claude-code`                         |

## Quick Setup

```bash
# 1. Clone
git clone https://github.com/Islamic-Open-Finance/app.git
cd app

# 2. Install
pnpm install

# 3. Environment
cp .env.example .env
# Edit .env with your credentials

# 4. Start databases (Docker)
docker compose -f infra/docker/docker-compose.yml up -d

# 5. Run migrations
pnpm db:migrate

# 6. Seed data
pnpm db:seed

# 7. Start development
pnpm dev
```

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://iof:iof@localhost:5432/iof

# Redis
REDIS_URL=redis://localhost:6379

# Search
MEILISEARCH_HOST=http://localhost:7700
MEILISEARCH_API_KEY=masterKey

# Auth
CLERK_PUBLIC_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Cloudflare
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ZONE_ID=...
CLOUDFLARE_ACCOUNT_ID=...

# AWS
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=eu-west-1

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Verify Installation

```bash
# Build everything
pnpm build

# Run checks
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test

# All should pass
```

## Start Claude Code

```bash
# Start Claude Code in the repo
claude

# First session, run mandatory startup
npx @claudetools/codemap index
npx tsx scripts/ci/session_failure_context.ts
npx tsx scripts/ci/generate_status.ts
```

## Port Map (from PORTS.md)

| Service            | Port |
| ------------------ | ---- |
| rail-api           | 3000 |
| analytics-api      | 3001 |
| ledger-service     | 3002 |
| finops-api         | 3003 |
| obp-gateway        | 3004 |
| document-renderer  | 3005 |
| customer-dashboard | 4000 |
| admin-portal       | 4001 |
| api-explorer       | 4002 |
| developer-portal   | 4003 |
| billing-dashboard  | 4004 |
| PostgreSQL         | 5432 |
| Redis              | 6379 |
| Meilisearch        | 7700 |
| OBP Demo Server    | 8080 |
| ClickHouse         | 8123 |
| Cerbos             | 3592 |
