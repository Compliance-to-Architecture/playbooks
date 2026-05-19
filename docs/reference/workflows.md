# Workflow Reference

All 47 GitHub Actions workflows organized by function.

## CI / Build (5)

| Workflow     | File             | Trigger                      | Purpose                              |
| ------------ | ---------------- | ---------------------------- | ------------------------------------ |
| CI           | ci.yml           | push/PR to main, claude/\*\* | Format, lint, typecheck, test, build |
| Build        | build.yml        | push to main                 | Build all packages and apps          |
| Build Docker | build-docker.yml | push to main                 | Build + push Docker images to ECR    |
| Build Shared | build-shared.yml | workflow_call                | Reusable build workflow              |
| CD Sandbox   | cd-sandbox.yml   | push to main                 | Deploy to sandbox environment        |

## Deploy (6)

| Workflow         | File                 | Trigger              | Purpose                              |
| ---------------- | -------------------- | -------------------- | ------------------------------------ |
| Deploy           | deploy.yml           | workflow_run (Build) | Deploy frontend (CF) + backend (ECS) |
| Deploy App       | deploy-app.yml       | workflow_dispatch    | Deploy single app to CF Pages        |
| \_Deploy App     | \_deploy-app.yml     | workflow_call        | Reusable single-app deploy           |
| Deploy Now       | deploy-now.yml       | workflow_dispatch    | Force immediate deployment           |
| Terraform Deploy | terraform-deploy.yml | workflow_dispatch    | AWS infrastructure provisioning      |
| SES Configure    | ses-configure.yml    | workflow_dispatch    | Configure AWS SES email              |

## Self-Healing (5)

| Workflow          | File                        | Trigger                   | Purpose                          |
| ----------------- | --------------------------- | ------------------------- | -------------------------------- |
| Fixer             | fixer.yml                   | workflow_run (CI failure) | Auto-fix CI failures with Claude |
| Failure Collector | failure-collector.yml       | schedule + deploy         | Aggregate all failures           |
| Failure to Logs   | failure-to-logs.yml         | workflow_run              | Push failure logs to logs branch |
| Auto-Merge        | auto-merge.yml              | PR events                 | Auto-merge approved PRs          |
| Failure Bundle    | failure-bundle-standard.yml | workflow_call             | Standardized failure collection  |

## Security (4)

| Workflow      | File              | Trigger       | Purpose                           |
| ------------- | ----------------- | ------------- | --------------------------------- |
| CodeQL        | codeql.yml        | push/schedule | Code scanning analysis            |
| Security Scan | security-scan.yml | push/PR       | Dependency + container scanning   |
| DAST Scan     | dast-scan.yml     | schedule      | Dynamic application security test |
| API Auth Scan | api-auth-scan.yml | schedule      | API authentication audit          |

## Monitoring (8)

| Workflow                | File                        | Trigger           | Purpose                         |
| ----------------------- | --------------------------- | ----------------- | ------------------------------- |
| Verify CF Deployments   | verify-cf-deployments.yml   | workflow_run      | Verify Cloudflare deployments   |
| Content Verify          | content-verify.yml          | workflow_run      | Verify deployed content         |
| Health Check Diagnostic | health-check-diagnostic.yml | workflow_dispatch | Health check all services       |
| Diagnose Frontends      | diagnose-frontends.yml      | workflow_dispatch | Frontend deployment diagnostics |
| Chaos Engineering       | chaos-engineering.yml       | schedule          | Chaos testing                   |
| E2E Tests               | e2e.yml                     | schedule          | End-to-end tests                |
| Verify Artifacts        | verify-artifacts.yml        | workflow_run      | Verify build artifacts          |
| DR Test                 | dr-test.yml                 | schedule          | Disaster recovery test          |

## Agent (3)

| Workflow         | File                 | Trigger           | Purpose                   |
| ---------------- | -------------------- | ----------------- | ------------------------- |
| Agent Lifecycle  | agent-lifecycle.yml  | workflow_run      | Agent event processing    |
| Agent Log Access | agent-log-access.yml | workflow_dispatch | Agent log retrieval       |
| CI Status Report | ci-status-report.yml | schedule          | Generate CI status report |

## Infrastructure (8)

| Workflow              | File                         | Trigger           | Purpose                     |
| --------------------- | ---------------------------- | ----------------- | --------------------------- |
| AWS Infra Audit       | aws-infrastructure-audit.yml | schedule          | AWS resource audit          |
| CF Cleanup            | cf-cleanup.yml               | workflow_dispatch | Cloudflare resource cleanup |
| CF Deep Diagnostic    | cf-deep-diagnostic.yml       | workflow_dispatch | Deep CF diagnostics         |
| CF Diagnostic         | cf-diagnostic.yml            | workflow_dispatch | CF deployment diagnostics   |
| CF Fix Auto-Deploy    | cf-fix-auto-deploy.yml       | workflow_dispatch | Fix CF auto-deploy issues   |
| CF Forensic Audit     | cf-forensic-audit.yml        | workflow_dispatch | CF forensic analysis        |
| CF KV Audit           | cf-kv-audit.yml              | workflow_dispatch | Cloudflare KV audit         |
| CF Pages Debug        | cf-pages-debug.yml           | workflow_dispatch | CF Pages debugging          |
| CF Query              | cf-query.yml                 | workflow_dispatch | CF API queries              |
| Set Edge Auth Secrets | set-edge-auth-secrets.yml    | workflow_dispatch | Configure edge secrets      |

## Utility (5)

| Workflow              | File                      | Trigger      | Purpose                   |
| --------------------- | ------------------------- | ------------ | ------------------------- |
| Store Logs            | store-logs.yml            | workflow_run | Store workflow logs       |
| Codemap Reindex       | codemap-reindex.yml       | schedule     | Rebuild codemap index     |
| Release Graph Publish | release-graph-publish.yml | push to main | Publish dependency graph  |
| Repo Graph Check      | repo-graph-check.yml      | push/PR      | Validate dependency graph |
| Repo Graph Publish    | repo-graph-publish.yml    | push to main | Publish repo graph        |
| Roam                  | roam.yml                  | schedule     | Architectural analysis    |

## Workflow Rules

1. Every workflow has a `concurrency` group
2. Max workflow chain depth: 2
3. Deploy only via `workflow_run` from Build
4. Fixer only triggers on main branch failures
5. `[skip ci]` on non-code branch pushes
6. No recursive triggers
