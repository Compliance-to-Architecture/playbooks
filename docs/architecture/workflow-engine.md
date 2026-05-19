# Workflow Engine

47 GitHub Actions workflows organized into 7 functional categories.

## Workflow Categories

```
┌─────────────────────────────────────────────────────────────────┐
│                    WORKFLOW ENGINE (47 Workflows)                │
├────────────────┬────────────────┬────────────────┬──────────────┤
│   CI/Build (5) │   Deploy (6)   │ Self-Heal (5)  │ Security (4) │
│   ci.yml       │   deploy.yml   │   fixer.yml    │ codeql.yml   │
│   build.yml    │   deploy-app   │   failure-     │ security-    │
│   build-docker │   _deploy-app  │   collector    │   scan.yml   │
│   build-shared │   deploy-now   │   failure-to-  │ dast-scan    │
│   cd-sandbox   │   terraform-   │   logs.yml     │ api-auth-    │
│                │   deploy.yml   │   auto-merge   │   scan.yml   │
├────────────────┼────────────────┼────────────────┼──────────────┤
│  Monitoring(8) │  Agent (3)     │  Infra (8)     │ Utility (8)  │
│  verify-cf-    │  agent-        │  aws-infra-    │  store-logs  │
│  deployments   │  lifecycle     │  audit.yml     │  codemap-    │
│  content-      │  agent-log-    │  cf-cleanup    │  reindex     │
│  verify.yml    │  access.yml    │  cf-deep-diag  │  ci-status-  │
│  health-check  │  fixer.yml     │  cf-diagnostic │  report.yml  │
│  diagnose-     │                │  cf-fix-auto   │  repo-graph- │
│  frontends     │                │  cf-forensic   │  check.yml   │
│  chaos-eng     │                │  cf-kv-audit   │  repo-graph- │
│  e2e.yml       │                │  cf-pages-     │  publish     │
│  verify-       │                │  debug.yml     │  release-    │
│  artifacts     │                │  cf-query.yml  │  graph.yml   │
│  dr-test.yml   │                │  ses-config    │  roam.yml    │
│                │                │  set-edge-auth │              │
└────────────────┴────────────────┴────────────────┴──────────────┘
```

## CI Pipeline

```yaml
# Trigger: push/PR to main, claude/**
ci.yml: ├── Install (pnpm install --frozen-lockfile)
  ├── Format Check (prettier --check)
  ├── Lint (eslint)
  ├── TypeCheck (tsc --noEmit)
  ├── Unit Tests (vitest)
  ├── Build (turbo build)
  └── Security Scan (trivy, npm audit)
```

## Build Pipeline

```yaml
# Trigger: push to main
build.yml → build-shared.yml:
  ├── Build all packages (turbo build)
  ├── Build all apps (Next.js export)
  └── Upload artifacts

build-docker.yml:
  ├── Build Docker images (multi-stage)
  ├── Tag: SHA + latest
  ├── Push to ECR (<AWS_ACCOUNT_ID>.dkr.ecr.eu-west-1.amazonaws.com)
  └── Vulnerability scan (trivy image)
```

## Deploy Pipeline

```yaml
# Trigger: workflow_run (build completion)
deploy.yml: ├── Deploy Frontend (Cloudflare Pages)
  │   ├── customer-dashboard → iof-customer-dashboard.pages.dev
  │   ├── admin-portal → iof-admin-portal.pages.dev
  │   ├── billing-dashboard → iof-billing-dashboard.pages.dev
  │   └── ... (20 apps)
  ├── Deploy Backend (AWS ECS)
  │   ├── Update task definitions
  │   ├── Run database migrations
  │   └── Update ECS services
  └── Verify Health
  ├── Check /health endpoints
  └── Smoke test critical paths
```

## Self-Healing Pipeline

```yaml
# Trigger: workflow_run (failure)
fixer.yml: ├── Collect failure bundle
  ├── Fingerprint failure (SHA256)
  ├── Check for existing fix PR
  ├── Claude generates fix
  ├── Create fix PR (fix/<service>/<fingerprint>)
  └── CI validates → auto-merge

failure-collector.yml: ├── Aggregate failures from all workflows
  ├── Generate failure-context.md
  └── Store in .claude/ for next session

failure-to-logs.yml: ├── Capture failure logs
  └── Push to logs branch
```

## Workflow Rules (Zero Cascade)

1. **Max chain depth: 2** — source → handler, no deeper
2. **Concurrency controls** — every workflow has a concurrency group
3. **Branch isolation** — workflows only trigger on their target branches
4. **[skip ci]** — non-code branch pushes include [skip ci]
5. **No email storms** — one failure = one notification max
6. **Independent paths** — frontend deploy never blocked by backend build

## Key Workflow Patterns

### Reusable Workflow (build-shared.yml)

```yaml
# Called by other workflows
on:
  workflow_call:
    inputs:
      app-name:
        type: string
    secrets:
      CLOUDFLARE_API_TOKEN:
        required: true
```

### Deployment Matrix (deploy-app.yml)

```yaml
strategy:
  matrix:
    app:
      - customer-dashboard
      - admin-portal
      - billing-dashboard
      # ... more apps
```

### Failure Handler (fixer.yml)

```yaml
on:
  workflow_run:
    workflows: ["CI", "Deploy"]
    types: [completed]
    branches: [main] # NOT claude/** — prevent cascade

jobs:
  auto-fix:
    if: github.event.workflow_run.conclusion == 'failure'
```

## How to Adapt Workflows for Your Platform

1. **Keep CI pipeline** — format, lint, typecheck, test, build (universal)
2. **Keep self-healing** — fixer + failure-collector (universal)
3. **Adapt deploy targets** — swap CF Pages/AWS ECS for your infra
4. **Adapt security scans** — add domain-specific compliance checks
5. **Keep store-logs** — observability is universal
6. **Remove domain-specific** — cf-kv-audit, ses-configure, etc.
