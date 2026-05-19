# Applicant Tracking & Recruitment Platform — Code Engine Example

> Built with the Coding Engine. From zero to production-grade recruitment platform with intelligent applicant tracking, automated interview scheduling, and data-driven hiring analytics.

## What This Builds

A comprehensive recruitment and talent acquisition platform with:

- **Job Posting Engine** — Multi-channel distribution, SEO-optimized career pages, social sharing
- **Applicant Tracking** — Pipeline management, resume parsing, candidate scoring, collaboration
- **Interview Scheduling** — Calendar integration, panel coordination, automated reminders, timezone handling
- **Offer Management** — Offer letter generation, approval workflows, e-signature, compensation benchmarking
- **Hiring Analytics** — Time-to-hire, source effectiveness, pipeline conversion, DEI metrics
- **Candidate Portal** — Application status, document uploads, self-scheduling, communication hub
- **Talent CRM** — Passive candidate nurturing, talent pools, re-engagement campaigns
- **Onboarding Handoff** — Automated onboarding task creation, document collection, IT provisioning triggers

## Architecture

```
apps/
├── recruiter-dashboard/       # Recruiter workspace (Next.js 15)
├── hiring-manager-portal/     # Hiring manager views (Next.js 15)
├── candidate-portal/          # Candidate-facing application portal
├── admin-portal/              # Platform administration (Next.js 15)
├── career-site/               # White-label career pages (Next.js 15)
└── docs/                      # API documentation (VitePress)

packages/
├── job-core/                  # Job posting + distribution logic
├── applicant-core/            # Applicant pipeline management
├── resume-core/               # Resume parsing + skills extraction
├── interview-core/            # Scheduling + calendar integration
├── offer-core/                # Offer lifecycle + approvals
├── analytics-core/            # Hiring analytics + reporting
├── talent-crm-core/           # Passive candidate management
├── assessment-core/           # Skills assessments + scorecards
├── auth-core/                 # Authentication + RBAC (universal)
├── billing-core/              # Stripe billing integration (universal)
├── tenant-core/               # Multi-tenancy isolation (universal)
└── audit-core/                # Audit trail (universal)

services/
├── job-api/                   # Job posting lifecycle (Hono)
├── applicant-api/             # Candidate pipeline management
├── interview-api/             # Scheduling orchestration
├── offer-api/                 # Offer workflow engine
├── analytics-api/             # Reporting + analytics
└── integration-api/           # Job board + HRIS connectors
```

## Compliance Standards

| Standard | Requirements                                                               |
| -------- | -------------------------------------------------------------------------- |
| **EEOC** | Equal employment data collection, adverse impact tracking, OFCCP reporting |
| **GDPR** | Candidate consent, data portability, right to erasure, retention limits    |
| **SOC2** | Access controls, audit trails, data encryption, vendor management          |
| **CCPA** | California consumer data rights, opt-out of data sale, disclosure          |
| **FCRA** | Background check authorization, adverse action notices, dispute rights     |
| **ADA**  | Accessible application process, reasonable accommodation tracking          |

## Multi-Tenancy

Each employer organization operates as an isolated tenant:

- **Database isolation**: Row-level security with `tenant_id` on every table; candidate PII encrypted per tenant
- **Tenant resolution**: Subdomain (`acme.recruit-platform.com`) or custom domain mapping
- **Career site**: Fully white-labeled career pages per tenant with custom branding, domain, and SEO
- **Job board integrations**: Per-tenant API keys for LinkedIn, Indeed, Glassdoor distribution
- **Data retention**: GDPR-compliant auto-purge of candidate data based on tenant-configured retention periods
- **Feature flags**: Per-tenant enablement of AI scoring, video interviews, background checks

```typescript
// Tenant-scoped candidate query with GDPR compliance
const getCandidates = async (tenantId: string, filters: CandidateFilters) => {
  assert(tenantId, "Tenant ID required for candidate queries");
  assert(
    filters.consentStatus !== "withdrawn",
    "Cannot query candidates who withdrew consent",
  );

  return db.candidate.findMany({
    where: {
      tenant_id: tenantId,
      consent_status: "active",
      ...buildFilterClause(filters),
    },
    select: candidateProjection(filters.role), // Role-based field visibility
  });
};
```

## Tech Stack

| Layer         | Technology              | Purpose                                    |
| ------------- | ----------------------- | ------------------------------------------ |
| Frontend      | Next.js 15, Sera UI     | Recruiter dashboard, candidate portal      |
| API Framework | Hono                    | Lightweight, edge-ready API services       |
| Database      | PostgreSQL 16           | Primary data store with RLS                |
| Cache         | Redis 7                 | Session state, rate limiting, leaderboards |
| Search        | Meilisearch             | Full-text candidate and job search         |
| Queue         | BullMQ                  | Resume parsing, email campaigns, analytics |
| NLP           | OpenAI / custom models  | Resume parsing, skills extraction, scoring |
| Calendar      | Google Calendar API     | Interview scheduling + availability        |
| E-Signature   | DocuSign / HelloSign    | Offer letter signing                       |
| Auth          | Clerk + custom RBAC     | Identity + role-based access               |
| Billing       | Stripe                  | Subscription + usage-based billing         |
| Monitoring    | OpenTelemetry + Grafana | Distributed tracing, metrics               |
| Edge          | Cloudflare Workers      | Career site CDN, rate limiting             |

## Observability

Full-stack observability for recruitment reliability:

- **Distributed Tracing**: OpenTelemetry traces across applicant-api, interview-api, offer-api
- **Metrics**: Applications/day, time-to-hire, pipeline conversion rates, offer acceptance rate
- **Structured Logging**: JSON logs with `tenant_id`, `job_id`, `candidate_token`, action, severity
- **Dashboards**: Grafana — Application Pipeline, Interview Funnel, Offer Lifecycle, System Health
- **Alerting**: PagerDuty — job posting distribution failures, calendar sync errors, offer expiry warnings
- **SLOs**: 99.9% API uptime, < 500ms search latency, < 5min resume parsing time, < 2s page load

```typescript
logger.info({
  service: "applicant-api",
  event: "candidate.stage_changed",
  tenant_id: tenant.id,
  job_id: job.id,
  candidate_token: tokenize(candidate.id),
  from_stage: "phone_screen",
  to_stage: "onsite",
  trace_id: span.traceId,
  timestamp: new Date().toISOString(),
});
```

## Health & Readiness Endpoints

Every service exposes standardized health checks:

```typescript
// services/applicant-api/src/routes/health.ts
import { Hono } from "hono";

const health = new Hono();

health.get("/health", async (c) => {
  const checks = {
    status: "healthy",
    service: "applicant-api",
    version: process.env.APP_VERSION,
    timestamp: new Date().toISOString(),
    checks: {
      database: await checkPostgres(),
      redis: await checkRedis(),
      search: await checkMeilisearch(),
      queue: await checkBullMQ(),
    },
  };
  const allHealthy = Object.values(checks.checks).every(
    (c) => c.status === "up",
  );
  return c.json(checks, allHealthy ? 200 : 503);
});

health.get("/ready", async (c) => {
  const ready = await Promise.all([
    checkDatabaseMigrations(),
    checkSearchIndexReady(),
    checkCalendarIntegration(),
  ]);
  const isReady = ready.every((r) => r.ok);
  return c.json({ ready: isReady, details: ready }, isReady ? 200 : 503);
});
```

## Failure Fingerprinting & Incident Response

All failures produce fingerprinted, structured error events:

```typescript
// packages/applicant-core/src/errors.ts
interface RecruitmentFailure {
  fingerprint: string;
  service: string;
  severity: "critical" | "high" | "medium" | "low";
  category:
    | "pipeline"
    | "scheduling"
    | "integration"
    | "parsing"
    | "compliance";
  tenant_id: string;
  pii_involved: boolean;
  error_code: string; // e.g., "RESUME_PARSE_FAIL", "CALENDAR_SYNC_ERROR"
  message: string;
  stack_trace: string;
  context: {
    job_id?: string;
    candidate_count_affected?: number;
    integration_name?: string;
  };
  timestamp: string;
  trace_id: string;
}

function generateFingerprint(error: Error, service: string): string {
  const normalized =
    error.stack
      ?.split("\n")
      .slice(0, 5)
      .map((line) => line.replace(/:\d+:\d+/g, ":0:0"))
      .join("\n") ?? error.message;
  return createHash("sha256")
    .update(`${service}:${normalized}`)
    .digest("hex")
    .slice(0, 16);
}
```

**Incident pipeline**: Failure detected -> Fingerprint generated -> Deduplicated -> If `pii_involved: true`, trigger GDPR data breach assessment -> Auto-create fix PR or escalate -> Track in `/docs/incidents/`.

## Anti-Pattern Prevention & Memory

| Anti-Pattern                         | Prevention                                                     |
| ------------------------------------ | -------------------------------------------------------------- |
| Storing resumes without consent      | Consent flag required before any document storage              |
| Candidate data retained beyond limit | Automated GDPR retention sweep runs daily per tenant config    |
| Biased scoring algorithms            | Adverse impact analysis on all AI scoring; quarterly DEI audit |
| Logging candidate PII                | Tokenization middleware; lint rule blocks raw PII in logs      |
| Calendar integration polling         | Webhook-based calendar sync; polling blocked by architecture   |
| Unstructured interview feedback      | Structured scorecard required before stage advancement         |

**MEMORY.md template**:

```markdown
## Known Issues

- [ ] LinkedIn RSC API rate limits at 100 calls/min — implement exponential backoff
- [ ] Google Calendar webhook delivery unreliable > 7 days — refresh subscriptions

## Resolved Incidents

- [INC-001] Resume parser exposed raw PII in error logs — fixed with scrubber middleware
- [INC-002] EEOC data missing for 15% of applications — added mandatory collection step
```

## Billing & Monetization

**Subscription Tiers**:

| Tier         | Active Jobs | Users     | Candidates/mo | Price   |
| ------------ | ----------- | --------- | ------------- | ------- |
| Starter      | 10          | 5         | 500           | $199/mo |
| Professional | 50          | 25        | 5,000         | $799/mo |
| Enterprise   | Unlimited   | Unlimited | Unlimited     | Custom  |

**Usage Metering** (Stripe Meters):

- `ats.applications.received` — Billed per application above tier allowance
- `ats.resumes.parsed` — AI resume parsing credits
- `ats.assessments.sent` — Skills assessment invitations
- `ats.job_board.postings` — External job board distribution credits

**Billing Events**:

```typescript
await stripe.billing.meterEvents.create({
  event_name: "ats.resumes.parsed",
  payload: {
    stripe_customer_id: tenant.stripeCustomerId,
    value: "1",
    job_id: job.id,
  },
});
```

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain recruitment --name "HireFlow" \
  --compliance "EEOC,GDPR,SOC2,FCRA"

# 2. Create domain packages
pnpm create @code-engine/package applicant-core
pnpm create @code-engine/package interview-core
pnpm create @code-engine/package offer-core
pnpm create @code-engine/package resume-core

# 3. Start development
pnpm install
pnpm dev

# 4. Run compliance checks
pnpm run compliance:eeoc
pnpm run compliance:gdpr-retention
```

## Timeline

| Phase                | Duration     | Deliverable                         |
| -------------------- | ------------ | ----------------------------------- |
| Setup + Auth         | 2 days       | Auth, multi-tenancy, RBAC           |
| Job Posting Engine   | 4 days       | Job CRUD, distribution, career site |
| Applicant Pipeline   | 5 days       | Tracking, resume parsing, scoring   |
| Interview Scheduling | 4 days       | Calendar sync, panel coordination   |
| Offer Management     | 3 days       | Approval workflows, e-signatures    |
| Analytics + DEI      | 3 days       | Dashboards, EEOC reporting, metrics |
| Compliance + Launch  | 3 days       | Evidence packs, GDPR audit, go-live |
| **Total**            | **~5 weeks** | Production-ready ATS platform       |
