# Reuse Guide: Fork This Engine for Your Platform

How to take the IOF Code Engine and adapt it for building any enterprise-grade SaaS platform, AI agent system, or agentic AI product.

## What You Get

When you fork this engine, you get a **production-tested** system that includes:

| Component          | Quantity     | What It Does                                  |
| ------------------ | ------------ | --------------------------------------------- |
| AI Agent Framework | 16 agents    | Specialized sub-agents for every task type    |
| Skill Engine       | 25+ skills   | Auto-activated domain knowledge               |
| Hook System        | 5 hooks      | Event-driven automation                       |
| CI/CD Pipeline     | 47 workflows | Build, deploy, self-heal, monitor             |
| Frontend Framework | 20 apps      | Next.js 15 + Sera UI template apps            |
| Backend Framework  | 7 services   | Hono microservices on ECS Fargate             |
| Package Library    | 66 packages  | Shared business logic, utilities, types       |
| Infrastructure     | IaC          | Terraform, Docker, Helm, K8s                  |
| Compliance Stack   | 7 standards  | SOC2, GDPR, PSD2, ISO 27001, etc.             |
| Multi-Tenancy      | Built-in     | RLS, tenant resolution, workspace isolation   |
| Observability      | Full stack   | Logging, monitoring, alerting, error tracking |

## Step-by-Step Fork Guide

### Step 1: Clone the Repository Structure

```bash
# Fork the IOF repository
gh repo fork Islamic-Open-Finance/app --clone --remote

# Or start fresh with the structure
mkdir my-platform && cd my-platform
# Copy the engine skeleton (see below)
```

### Step 2: Replace the Domain Layer

The IOF domain is **Islamic finance**. Your domain might be healthcare, logistics, fintech, education, etc. Here's what to swap:

| IOF Component                 | Replace With           | Location                    |
| ----------------------------- | ---------------------- | --------------------------- |
| 105 Islamic rails             | Your domain rails      | `config/rails/`             |
| contracts-core (57 schemas)   | Your domain schemas    | `packages/contracts-core/`  |
| taxonomy-core (19 categories) | Your domain taxonomy   | `packages/taxonomy-core/`   |
| AAOIFI/IFSB compliance        | Your domain compliance | `packages/compliance-core/` |
| Shariah governance fields     | Your domain governance | Schema definitions          |
| Islamic finance guardrail     | Your domain guardrail  | `.claude/skills/`           |
| Zakat, Takaful, Waqf, Sukuk   | Your domain verticals  | `packages/*-core/`          |

### Step 3: Keep the Universal Engine

These components are **domain-agnostic** and should be kept as-is:

```
KEEP (Universal):
├── .claude/agents/           # Rename but keep the pattern
├── .claude/hooks/            # Domain-agnostic automation
├── .claude/skills/           # Keep engine, update triggers
├── .github/workflows/        # Keep CI/CD/self-healing
├── packages/auth-core/       # Authentication is universal
├── packages/auth-client/     # Auth client is universal
├── packages/audit-core/      # Audit trails are universal
├── packages/db-core/         # Database layer is universal
├── packages/errors/          # Error handling is universal
├── packages/event-envelope/  # Event-driven is universal
├── packages/observability-core/ # Logging is universal
├── packages/service-core/    # Middleware is universal
├── packages/utils/           # Utilities are universal
├── packages/tenant-core/     # Multi-tenancy is universal
├── packages/workspace-core/  # Workspaces are universal
├── packages/billing-core/    # Billing is universal
├── packages/stripe-metering/ # Usage metering is universal
├── packages/webhook-core/    # Webhooks are universal
├── packages/feature-flags-core/ # Feature flags are universal
├── packages/legal-components/# Legal pages are universal
├── packages/ui-core/         # UI components are universal
├── infra/                    # Infrastructure is universal
├── CLAUDE.md                 # Principles are universal
├── turbo.json                # Build config is universal
└── pnpm-workspace.yaml       # Workspace config is universal
```

### Step 4: Configure Your CLAUDE.md

Update the root `CLAUDE.md` with your domain:

```markdown
# Replace these sections:

1. Project Overview → Your platform description
2. Tech Stack → Keep or modify (mostly keep)
3. Architecture Principles → Keep + add domain-specific
4. Compliance Principles → Replace with your compliance needs
5. OBP Integration → Replace with your external system integrations
6. Agent definitions → Rename for your domain
7. Skill rules → Update triggers for your domain keywords
```

### Step 5: Configure Your Infrastructure

```bash
# AWS ECS (keep pattern, update names)
infra/terraform/ecs.tf → Update service names, ECR repos

# Cloudflare (keep pattern, update domains)
infra/cloudflare/ → Update zone, domain names

# Docker (keep multi-stage pattern)
services/*/Dockerfile → Update for your services

# GitHub Actions (keep CI/CD, update deploy targets)
.github/workflows/ → Update app names, URLs
```

### Step 6: Create Your Domain Packages

```bash
# Example: Healthcare SaaS platform
pnpm create @iof/package patient-core       # Patient management
pnpm create @iof/package ehr-core           # Electronic health records
pnpm create @iof/package hipaa-core         # HIPAA compliance
pnpm create @iof/package claims-core        # Insurance claims
pnpm create @iof/package scheduling-core    # Appointment scheduling
pnpm create @iof/package telehealth-core    # Video consultations
```

### Step 7: Create Your Domain Apps

```bash
# Example: Healthcare SaaS platform
apps/
├── provider-portal/          # Healthcare provider dashboard
├── patient-dashboard/        # Patient-facing portal
├── claims-explorer/          # Insurance claims management
├── compliance-dashboard/     # HIPAA compliance monitoring
├── admin-portal/             # Keep (universal)
├── billing-dashboard/        # Keep (universal)
├── developer-portal/         # Keep (universal)
└── status-page/              # Keep (universal)
```

## Use Cases

### Enterprise SaaS Platform

- Multi-tenant architecture ready
- Billing + usage metering (Stripe) ready
- RBAC/ABAC (Cerbos) ready
- API-first with SDK generation ready

### AI Agent System

- 16-agent orchestration pattern
- Skill activation engine
- Memory architecture (hot/warm/cold)
- Self-healing failure inbox
- MCP server integration (16 servers)

### Agentic AI Product

- RALPH autonomous development loop
- Structured output pipeline
- Event-driven architecture
- Real-time monitoring + alerting
- Code generation + execution patterns

### Banking/Fintech Platform

- Ledger (TigerBeetle double-entry)
- Compliance engine (SOC2, PSD2, GDPR)
- ISO 20022 financial messaging
- Multi-jurisdiction support
- Open Banking Protocol integration

### Developer Platform / API Product

- API Explorer (interactive docs)
- SDK generation (TS, Go, Python)
- Webhook management
- Usage metering + billing
- Sandbox environment
- Developer portal

## Cost Estimates (AWS + Cloudflare)

| Component                | Monthly Cost     | Scale                           |
| ------------------------ | ---------------- | ------------------------------- |
| ECS Fargate (8 services) | ~$200-400        | 1-100 tenants                   |
| ALB                      | ~$20             | Shared                          |
| RDS PostgreSQL           | ~$50-200         | db.t3.medium → db.r5.xlarge     |
| ElastiCache Redis        | ~$30-100         | cache.t3.micro → cache.r5.large |
| ECR                      | ~$5              | With lifecycle policies         |
| Cloudflare Workers       | $5-25            | Free tier → Paid                |
| Cloudflare Pages         | Free-$20         | Unlimited sites on paid         |
| GitHub Actions           | Free-$40         | 2000-3000 min/month             |
| **Total**                | **~$330-810/mo** | **Production-ready**            |

## Timeline to Production

| Phase             | Duration       | What Happens                  |
| ----------------- | -------------- | ----------------------------- |
| Fork + Setup      | 1 day          | Clone, configure, install     |
| Domain Swap       | 3-5 days       | Replace domain packages       |
| App Customization | 5-7 days       | Build domain-specific UIs     |
| Infrastructure    | 2-3 days       | Deploy to AWS + CF            |
| Compliance        | 3-5 days       | Configure for your standards  |
| Testing           | 3-5 days       | E2E, load, security tests     |
| **Total**         | **~3-4 weeks** | **Production-ready platform** |

Compare this to building from scratch: **6-12 months** minimum.
