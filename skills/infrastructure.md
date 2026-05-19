# Infrastructure & Deployment Skill

> **Enforcement**: suggest
> **Triggers**: deploy, docker, kubernetes, terraform, ci/cd, ecs, cloudflare, helm, pipeline

## Overview

Multi-cloud deployment patterns covering Docker, Kubernetes, Terraform, CI/CD pipelines, and edge computing.

## Docker Multi-Stage Build Pattern

```dockerfile
# Stage 1: Build
FROM node:22-slim AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build --filter=@project/service-name

# Stage 2: Runtime (minimal)
FROM node:22-slim AS runtime
WORKDIR /app
RUN addgroup --system app && adduser --system --ingroup app app
COPY --from=build --chown=app:app /app/services/service-name/dist ./dist
COPY --from=build --chown=app:app /app/node_modules ./node_modules
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:3000/health || exit 1
CMD ["node", "dist/index.js"]
```

## CI/CD Pipeline Pattern

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-test-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm format:check
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

## Terraform Module Pattern

```hcl
# infra/terraform/modules/service/main.tf
resource "aws_ecs_service" "service" {
  name            = var.service_name
  cluster         = var.cluster_id
  task_definition = aws_ecs_task_definition.task.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [aws_security_group.service.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.service.arn
    container_name   = var.service_name
    container_port   = var.container_port
  }
}
```

## Cloudflare Workers Deployment

```bash
# Deploy to Cloudflare Workers
wrangler deploy --name service-name
# Deploy static app to Cloudflare Pages
wrangler pages deploy ./dist --project-name app-name
```

## Health Check Standard

Every service MUST expose `/health`:

```json
{
  "status": "healthy",
  "version": "1.2.3",
  "uptime": 3600,
  "checks": [
    { "name": "database", "status": "up", "latency_ms": 5 },
    { "name": "redis", "status": "up", "latency_ms": 1 },
    { "name": "external-api", "status": "up", "latency_ms": 120 }
  ]
}
```

## Core Principles

- **Multi-Stage Docker Builds**: Every production Dockerfile uses a `build` stage (full toolchain) and a minimal `runtime` stage. Only compiled output and production `node_modules` are copied to the runtime image. Source `.ts` files and dev dependencies must never exist in the final image.
- **Infrastructure as Code**: All cloud resources (ECS services, security groups, ALB rules, DNS records) are declared in Terraform. Manual console changes are forbidden and will be overwritten on the next `terraform apply`.
- **Zero Single Points of Failure**: Frontend builds (Cloudflare Pages) and backend builds (Docker/ECS) are independent workflows. A Docker build timeout must never block a frontend deploy. Each workflow = one responsibility.
- **Concurrency Controls on All Workflows**: Every GitHub Actions workflow must declare a `concurrency` group. Without it, parallel runs queue unbounded jobs, consume minutes, and generate duplicate failure notifications.
- **Secrets via SSM, Never Env Literals**: Runtime secrets are fetched from AWS SSM Parameter Store at container start. Secrets are never embedded in Dockerfile `ENV` instructions, task definition JSON, or committed `.env` files.

## Patterns

- **ECR Lifecycle Policies**: Every ECR repository must have a lifecycle policy that expires untagged images after 1 day and retains a maximum of 10 tagged images. Without this, image accumulation causes runaway storage costs.
- **Blue/Green ECS Deployment**: Deploy a new task definition revision alongside the existing one, shift traffic via the ALB target group, and keep the old revision available for 10-minute instant rollback.
- **SHA + Latest Tag Strategy**: Tag every image with both the short Git SHA (`abc1234`) for traceability and `latest` for convenience. Never use `latest` alone in ECS task definitions — pin to the SHA tag so rollbacks are deterministic.
- **Non-Root Container User**: All runtime containers run as a non-root system user (`USER node` or `USER 1001`). This limits the blast radius of container escape vulnerabilities.
- **`.dockerignore` Enforcement**: Every service Dockerfile must have a sibling `.dockerignore` excluding `node_modules`, `.git`, `*.test.ts`, `*.spec.ts`, source maps, and dev config files. Verify with `docker build --no-cache` in CI.

## Anti-Patterns

- **Full OS Base Images in Production**: Using `node:22` (Debian) instead of `node:22-slim` or `alpine` adds hundreds of MB of unnecessary OS packages, increasing attack surface and image pull time.
- **Coupling Frontend and Backend Workflows**: A single workflow that builds both the Docker image and the Next.js app means a Docker timeout blocks the frontend deploy. Separate workflows prevent this cascade.
- **Direct-to-Production Terraform Apply**: Running `terraform apply` directly against the production state without a `plan` review step and human approval risks unintended resource destruction. Always gate production apply behind a manual approval job.
- **Hardcoded Port Numbers**: Embedding port numbers directly in application code or Dockerfiles makes multi-service deployments fragile. Reference `PORTS.md` as SSOT and inject ports via environment variables.
- **No Health Check on ECS Tasks**: ECS Fargate tasks without a health check are marked healthy immediately and receive traffic before the application is ready. Always define `HEALTHCHECK` in the Dockerfile and a health check grace period in the service definition.

## Checklist

- [ ] All Dockerfiles use multi-stage builds; final stage is `node:22-slim` or equivalent
- [ ] `.dockerignore` present alongside every Dockerfile
- [ ] Runtime container runs as non-root user
- [ ] ECR lifecycle policy configured: 1-day untagged expiry, max 10 tagged images
- [ ] Images tagged with both short Git SHA and `latest`
- [ ] ECS task definition uses ECR image URI (never Docker Hub)
- [ ] All GitHub Actions workflows have `concurrency` group defined
- [ ] Frontend and backend build/deploy workflows are independent (no coupling)
- [ ] All secrets sourced from SSM Parameter Store at runtime
- [ ] Every service exposes `/health` returning structured JSON

## References

- [AWS ECS Fargate Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/intro.html)
- [Cloudflare Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [Docker Multi-Stage Builds](https://docs.docker.com/build/building/multi-stage/)
- [GitHub Actions Concurrency](https://docs.github.com/en/actions/using-jobs/using-concurrency)
