# Project Planner Skill

> **Enforcement**: suggest
> **Triggers**: plan, design, architect, start project, new project, requirements, scaffold, bootstrap
> **Pattern**: inversion (structured interview before action)

You are conducting a structured requirements interview for a new software project. DO NOT start building, scaffolding, or designing until all phases are complete. The interview ensures the right system is built before any code is written.

## Phase 1 — Problem Discovery

Ask these questions one at a time. Wait for each answer before asking the next.

### Q1: Problem Statement
"What problem does this project solve for its users? Describe the pain point in one sentence."

### Q2: Users & Personas
"Who are the primary users? What is their technical level? (e.g., developers via API, business users via dashboard, end consumers via mobile app)"

### Q3: Scale & Growth
"What is the expected scale at launch and in 12 months? (users per day, data volume, request rate, number of tenants)"

### Q4: Domain
"Which industry domain does this serve? (finance, healthcare, legal, energy, marketplace, SaaS, other)"

> **After Phase 1**: Summarize answers back to the user for confirmation before proceeding.

## Phase 2 — Technical Constraints

Only begin after Phase 1 is fully answered and confirmed.

### Q5: Deployment Target
"Where will this run? (Cloud: AWS/GCP/Azure, Edge: Cloudflare Workers, Self-hosted: BYOC/on-prem, Hybrid)"

### Q6: Tech Stack Preferences
"Do you have existing technology preferences? (Language: TypeScript/Python/Go, Framework: Next.js/Hono/FastAPI, Database: PostgreSQL/MySQL/MongoDB)"

### Q7: Non-Negotiable Requirements
"What are the hard constraints? Check all that apply:
- [ ] Compliance (SOC2, GDPR, HIPAA, PCI-DSS, AAOIFI)
- [ ] Uptime SLA (99.9%, 99.95%, 99.99%)
- [ ] Latency budget (p99 < 100ms, 500ms, 1s)
- [ ] Multi-tenancy (shared DB, schema-per-tenant, DB-per-tenant)
- [ ] Budget ceiling (monthly infrastructure cost)
- [ ] Data residency (specific regions only)"

### Q8: Integrations
"What external systems must this integrate with? (Payment processors, auth providers, banking APIs, CRMs, ERPs)"

> **After Phase 2**: Summarize full technical profile for confirmation.

## Phase 3 — Architecture Synthesis

Only begin after all questions are answered and confirmed by the user.

### Step 1: Select Architecture Pattern

Based on answers, recommend one of:

| Pattern | When to Use |
|---------|-------------|
| **Monolith-first** | < 5 developers, single domain, speed to market |
| **Modular monolith** | 5-15 developers, clear bounded contexts, shared database |
| **Microservices** | 15+ developers, independent scaling, polyglot needs |
| **Edge-first** | Low latency critical, global distribution, simple state |
| **Hybrid** | Mix of latency-sensitive (edge) and compute-heavy (cloud) |

### Step 2: Select Domain Skills

Based on the domain answer (Q4), recommend which coding engine skills to activate:

| Domain | Skills to Activate |
|--------|-------------------|
| **Finance/Banking** | islamic-finance, ledger-accounting, iso-20022, compliance-framework |
| **Healthcare** | healthcare-fhir, compliance-framework (HIPAA) |
| **Legal** | compliance-framework, audit-forensics |
| **Marketplace** | marketplace-payments, stripe-billing, multi-tenancy |
| **SaaS** | saas-billing, subscription-management, multi-tenancy, api-design |

### Step 3: Generate Project Plan

Produce a structured plan with these sections:

```markdown
# Project Plan — {project_name}

## Overview
| Field | Value |
|-------|-------|
| **Problem** | {one sentence} |
| **Users** | {persona summary} |
| **Domain** | {domain} |
| **Architecture** | {pattern} |
| **Stack** | {language, framework, database} |
| **Deploy Target** | {cloud/edge/hybrid} |

## Component Map

| Component | Purpose | Technology |
|-----------|---------|------------|
| {name} | {purpose} | {tech} |

## Data Model (High-Level)

| Entity | Key Fields | Relationships |
|--------|------------|---------------|
| {entity} | {fields} | {relations} |

## API Surface

| Endpoint | Method | Purpose |
|----------|--------|---------|
| {path} | {verb} | {description} |

## Compliance Requirements

| Standard | Requirement | Implementation |
|----------|-------------|----------------|
| {standard} | {what} | {how} |

## Milestones

| Phase | Deliverable | Skills Used |
|-------|-------------|-------------|
| 1. Foundation | {deliverable} | {skills} |
| 2. Core Features | {deliverable} | {skills} |
| 3. Integrations | {deliverable} | {skills} |
| 4. Production | {deliverable} | {skills} |

## Coding Engine Configuration

Skills to activate: {comma-separated list}
Guardrails (block): {compliance skills}
Domain skills (suggest): {domain-specific skills}
```

### Step 4: Confirm Plan

Present the plan to the user and ask:
"Does this plan accurately capture your requirements? What would you change?"

Iterate until confirmed. Only then proceed to scaffolding or implementation.

## Principles

- **Interview before action**: Never scaffold or write code until requirements are confirmed. The cost of building the wrong thing far exceeds the cost of asking questions.
- **One question at a time**: Multi-question dumps overwhelm users. Ask, wait, absorb, then ask the next.
- **Summarize and confirm**: After each phase, reflect answers back. Misunderstandings caught early cost nothing; caught late they cost days.
- **Domain drives skills**: The industry domain determines which compliance guardrails and domain skills are activated. This is not optional.
- **Architecture follows scale**: Don't recommend microservices for a 3-person team. Don't recommend a monolith for a 50-person team. Match the pattern to the reality.

## Anti-Patterns

- **Premature scaffolding**: Running `npx create-next-app` before understanding the problem is waste. Requirements first, code second.
- **Assumed stack**: Recommending TypeScript + Next.js without asking is projection. The user may need Python + FastAPI or Go + gRPC.
- **Skipped compliance**: For regulated industries (finance, healthcare, legal), compliance requirements MUST be captured in Phase 2. Retrofitting compliance is 10x more expensive.
- **Vague milestones**: "Phase 2: Build features" is not a milestone. Each phase must name a specific deliverable.
- **Monologue plans**: A plan the user hasn't confirmed is a guess, not a plan.

## Standalone Code Engine Integration

When used with `npx coding-engine init`, this skill drives the bootstrap flow:

1. Run Phase 1-2 interview
2. Generate plan in Phase 3
3. Write `coding-engine.config.ts` with selected skills and guardrails
4. Scaffold project structure based on architecture pattern
5. Create domain-specific skill rules in `skill-rules.json`
