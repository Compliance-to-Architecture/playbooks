# Coding Engine — Skills Index

> Complete catalog of all skills available in the portable coding engine.

## Code Example Convention

Skills contain code examples using well-known libraries (pino, ioredis, zod, etc.) to illustrate patterns. These examples are **patterns to adapt**, not copy-paste-ready code. When implementing:

1. Check if the library is already in your project's `package.json` before importing
2. Use your project's canonical import path (e.g., `@iof/service-core` re-exports pino)
3. If a library is not present, install it as a project dependency — skills do not install packages

No skill requires an external service, Docker container, or SaaS subscription to function. All patterns are implementable with native tools.

## Engine Skills (Universal — Always Active)

These skills are domain-agnostic and work for any project.

| Skill | Enforcement | Triggers | File |
|-------|-------------|----------|------|
| **Stripe Billing** | suggest | stripe, billing, payment, invoice, subscription | `stripe-billing.md` |
| **Payment Processing** | suggest | payment, checkout, transaction, refund, payout, PSP | `payments-processing.md` |
| **Subscription Management** | suggest | subscription, plan, tier, upgrade, trial, churn, MRR | `subscription-management.md` |
| **Marketplace Payments** | suggest | marketplace, connect, split-payment, seller, commission | `marketplace-payments.md` |
| **SaaS Billing** | suggest | billing, revenue, pricing, quota, metering, dunning, tax | `saas-billing.md` |
| **Multi-Tenancy** | suggest | tenant, multi-tenant, isolation, workspace, RLS | `multi-tenancy.md` |
| **API Design** | suggest | api, endpoint, openapi, sdk, rest, webhook, rate-limit | `api-design.md` |
| **Auth & Authorization** | suggest | auth, login, jwt, oauth, sso, rbac, abac, mfa | `authentication-authorization.md` |
| **Compliance Framework** | suggest | compliance, SOC2, GDPR, HIPAA, audit, regulation | `compliance-framework.md` |
| **Observability** | suggest | logging, monitoring, tracing, health-check, alerting | `observability-monitoring.md` |
| **Infrastructure** | suggest | deploy, docker, kubernetes, terraform, ci/cd | `infrastructure.md` |
| **Testing Patterns** | suggest | test, e2e, integration, unit, coverage | `testing-patterns.md` |
| **Security** | suggest | security, vulnerability, encryption, xss, injection | `security-patterns.md` |
| **Report Generator** | suggest | report, summary, analysis, incident-report, audit-report | `report-generator.md` |
| **Project Planner** | suggest | plan, design, architect, new-project, requirements, scaffold | `project-planner.md` |
| **Doc Pipeline** | suggest | document, api-docs, generate-docs, tsdoc, reference-docs | `doc-pipeline.md` |
| **Architecture Pipeline** | suggest | PRD, ERD, ARD, ADR, schema-generation, requirements-document | `architecture-pipeline.md` |
| **SWE Agent Patterns** | suggest | swe-agent, coding-agent, autonomous-coding, subagent, orchestration | `swe-agent-patterns.md` |
| **Agent Memory** | suggest | hindsight, agent-memory, cross-session, retain, recall, reflect | `agent-memory.md` |
| **Code-Mode** | suggest | code-mode, batch, tool-chain, utcp, token-savings, multi-tool | `code-mode.md` |
| **Cohesive Update** | suggest | cohesive, propagate, ripple, update-all, sync-artifacts, rail-count | `cohesive-update.md` |
| **Pre-Implementation Scoring** | suggest | assess, score, complexity, risk, pre-implementation, blast radius | `pre-implementation-scoring.md` |
| **Spec Quality Gate** | suggest | gate, quality gate, spec review, readiness check, score spec | `spec-quality-gate.md` |
| **Product Requirements Prompt** | suggest | PRP, context packet, implementation brief, handoff, feature context | `product-requirements-prompt.md` |

## Engine Agents (Universal)

Agents available for delegation via the Task tool.

| Agent | Purpose | Model |
|-------|---------|-------|
| **claudemd-compliance-checker** | Verifies code changes comply with CLAUDE.md/AGENTS.md instructions | haiku |
| **yaml-k8s-validator** | Validates YAML, K8s manifests, Helm charts, Docker Compose, GH Actions | haiku |

## Extended Skills (Universal — Available to All Projects)

These skills cover advanced engineering domains beyond the core set.

### Data & Storage
| Skill | Enforcement | Triggers | File |
|-------|-------------|----------|------|
| **Database Optimization** | suggest | query, index, partition, replica, connection-pool, N+1 | `database-optimization.md` |
| **Caching Strategies** | suggest | cache, redis, CDN, invalidation, TTL, stampede | `caching-strategies.md` |
| **Search & Indexing** | suggest | search, meilisearch, elasticsearch, full-text, autocomplete | `search-indexing.md` |
| **Data Migration** | suggest | migration, seed, rollback, schema-version, zero-downtime | `data-migration.md` |
| **ETL Pipelines** | suggest | etl, pipeline, airflow, dbt, data-quality, transform | `etl-pipelines.md` |

### Backend Architecture
| Skill | Enforcement | Triggers | File |
|-------|-------------|----------|------|
| **Message Queues** | suggest | kafka, sqs, rabbitmq, pub/sub, dead-letter, backpressure | `message-queues.md` |
| **CQRS & Event Sourcing** | suggest | cqrs, event-store, projection, saga, eventual-consistency | `cqrs-event-sourcing.md` |
| **Batch Processing** | suggest | batch, job-queue, bullmq, scheduled, idempotent, checkpoint | `batch-processing.md` |
| **GraphQL Patterns** | suggest | graphql, resolver, dataloader, subscription, federation | `graphql-patterns.md` |
| **Rate Limiting** | suggest | rate-limit, throttle, token-bucket, sliding-window, quota | `rate-limiting.md` |

### AI & ML
| Skill | Enforcement | Triggers | File |
|-------|-------------|----------|------|
| **LLM & Agent Patterns** | suggest | llm, prompt, llm-agent, tool-calling, guardrail, eval | `llm-agent-patterns.md` |
| **Model Deployment** | suggest | model-serving, inference, gpu, model-registry, a/b-test | `model-deployment.md` |
| **Model Evaluation** | suggest | eval, benchmark, accuracy, bias, regression-test | `model-evaluation.md` |
| **RAG Patterns** | suggest | rag, chunking, embedding, vector-store, reranking | `rag-patterns.md` |

### Frontend
| Skill | Enforcement | Triggers | File |
|-------|-------------|----------|------|
| **Component Architecture** | suggest | component, atomic-design, composition, compound, accessibility | `component-architecture.md` |
| **State Management** | suggest | zustand, jotai, tanstack-query, optimistic, cache-sync | `state-management.md` |
| **Frontend Performance** | suggest | web-vitals, code-splitting, lazy-load, bundle, SSR | `frontend-performance.md` |
| **Internationalization** | suggest | i18n, l10n, locale, RTL, translation, ICU | `internationalization.md` |
| **PWA Patterns** | suggest | pwa, service-worker, offline, push-notification, installable | `pwa-patterns.md` |

### DevOps & Platform
| Skill | Enforcement | Triggers | File |
|-------|-------------|----------|------|
| **GitOps & Deployment** | suggest | gitops, blue-green, canary, argocd, deploy-strategy | `gitops-deployment.md` |
| **Service Mesh** | suggest | istio, linkerd, mtls, traffic, circuit-breaker | `service-mesh.md` |
| **Kubernetes Patterns** | suggest | kubernetes, k8s, helm, operator, pod, HPA | `kubernetes-patterns.md` |
| **Feature Flags** | suggest | feature-flag, a/b-test, rollout, kill-switch, experiment | `feature-flags.md` |

### Integrations
| Skill | Enforcement | Triggers | File |
|-------|-------------|----------|------|
| **Email & SMS** | suggest | email, sms, ses, sendgrid, twilio, template, bounce | `email-sms.md` |
| **File Storage** | suggest | s3, r2, presigned-url, multipart, cdn, image-processing | `file-storage.md` |
| **OAuth Providers** | suggest | oauth, oidc, social-login, pkce, token-refresh | `oauth-providers.md` |
| **Webhook Patterns** | suggest | webhook, retry, signature, idempotency, dead-letter | `webhook-patterns.md` |
| **Notification Systems** | suggest | notification, in-app, push, preference, batching | `notification-systems.md` |

### Business Operations
| Skill | Enforcement | Triggers | File |
|-------|-------------|----------|------|
| **Analytics & Reporting** | suggest | analytics, funnel, cohort, dashboard, clickhouse | `analytics-reporting.md` |
| **Audit Forensics** | suggest | audit-trail, immutable-log, forensic, evidence, sox | `audit-forensics.md` |
| **Audit Verification** | **block** | audit, verify, compliance-check, production-readiness, deep-audit | `audit-verification.md` |
| **UX/UI Design** | suggest | design, ui, ux, component, accessibility, wcag, a11y, design-tokens | `ux-ui-design.md` |

### Domain-Specific
| Skill | Enforcement | Triggers | File |
|-------|-------------|----------|------|
| **Healthcare FHIR** | suggest | fhir, hl7, patient, encounter, smart-on-fhir | `healthcare-fhir.md` |
| **IoT Device Management** | suggest | iot, mqtt, telemetry, ota, device-twin, edge | `iot-device-management.md` |

## Domain Skills (Created Per-Project)

These are created when you initialize the engine for a specific domain.

### Finance / Banking
| Skill | Enforcement | Purpose |
|-------|-------------|---------|
| Islamic Finance | block | Shariah compliance, AAOIFI, contract schemas |
| Banking Compliance | block | PSD2, PCI-DSS, AML/KYC |
| Ledger Accounting | suggest | Double-entry, TigerBeetle, reconciliation |
| ISO 20022 | suggest | Financial messaging standards |

### Healthcare
| Skill | Enforcement | Purpose |
|-------|-------------|---------|
| HIPAA Compliance | block | PHI protection, BAA, access controls |
| HL7 FHIR | suggest | Healthcare interoperability |
| Clinical Data | suggest | EHR/EMR data patterns |

### Legal
| Skill | Enforcement | Purpose |
|-------|-------------|---------|
| Legal Compliance | block | Attorney-client privilege, conflict checks |
| Trust Accounting | block | IOLTA trust fund management |
| eIDAS Signatures | suggest | Electronic signature compliance |

### Energy
| Skill | Enforcement | Purpose |
|-------|-------------|---------|
| REMIT Compliance | block | Energy market integrity |
| NERC CIP | block | Critical infrastructure cybersecurity |
| Trading Rules | suggest | Order management, position limits |

### Marketplace
| Skill | Enforcement | Purpose |
|-------|-------------|---------|
| Marketplace Rules | suggest | Seller onboarding, dispute resolution |
| Commission Logic | suggest | Fee calculation, payout management |

## Skill Enforcement Levels

| Level | Behavior | Use Case |
|-------|----------|----------|
| **block** | Agent MUST use skill before proceeding | Compliance guardrails (HIPAA, GDPR, Shariah) |
| **suggest** | Skill suggested but not required | Domain knowledge (API design, billing) |
| **warn** | Warning shown, allows proceeding | Style checks (TigerStyle, naming) |

## Skill Activation Flow

```
User Prompt → skill-activation-prompt hook → skill-rules.json
    │
    ├── Match keywords → Load matching skills
    ├── Match file patterns → Load matching skills
    └── Check enforcement level:
        ├── block → Must use skill, cannot proceed without it
        ├── suggest → Skill loaded into context as reference
        └── warn → Warning displayed, agent can proceed
```

## Creating Custom Skills

Use the template at `templates/skills/skill.template.md`:

1. Copy the template
2. Replace all `{{placeholders}}`
3. Add keyword triggers
4. Set enforcement level
5. Save to `.claude/skills/` directory
6. Register in `skill-rules.json`

## Skill Dependencies

Some skills reference others. The engine loads dependencies automatically:

```
stripe-billing ←── subscription-management
                ←── marketplace-payments
                ←── saas-billing

authentication-authorization ←── multi-tenancy
                              ←── api-design

compliance-framework ←── (all domain compliance skills)

report-generator ←── compliance-framework (compliance report variant)
                 ←── observability-monitoring (incident reports)

project-planner ←── (all domain skills, selected per-project)

doc-pipeline ←── api-design (API reference generation)
             ←── compliance-framework (compliance docs variant)

llm-agent-patterns ←── swe-agent-patterns
rag-patterns       ←── swe-agent-patterns

observability-monitoring ←── agent-memory (audit logging hook)
```
