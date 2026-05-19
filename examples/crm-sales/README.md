# Customer Relationship Management & Sales Platform — Code Engine Example

> Built with the Coding Engine. Full-cycle CRM with pipeline management, lead scoring, and revenue forecasting.

## What This Builds

A GDPR-compliant CRM and sales automation platform with:

- Contact and company management with relationship mapping
- Sales pipeline with customizable stages and deal tracking
- AI-powered lead scoring and qualification
- Revenue forecasting with weighted pipeline analysis
- Activity tracking (calls, emails, meetings, tasks)
- Territory and quota management
- Email sequence automation and engagement tracking
- Sales analytics dashboards and rep performance

## Architecture

```
apps/
├── sales-portal/            # Sales rep dashboard (Next.js)
├── manager-portal/          # Sales manager analytics + forecasting
├── customer-portal/         # Customer-facing self-service
├── admin-portal/            # Platform admin (universal)
├── billing-dashboard/       # Subscription billing (universal)

packages/
├── contact-core/            # Contact/company data models
├── pipeline-core/           # Deal stages, pipeline logic
├── lead-scoring-core/       # ML-based lead qualification
├── forecast-core/           # Revenue forecasting engine
├── activity-core/           # Activity logging and tracking
├── territory-core/          # Territory assignment and rules
├── quota-core/              # Quota setting and attainment
├── email-sequence-core/     # Drip campaign automation
├── engagement-core/         # Email/call engagement tracking
├── analytics-core/          # Sales metrics and reporting
├── auth-core/               # Authentication (universal)
├── billing-core/            # Stripe billing (universal)
├── tenant-core/             # Multi-tenancy (universal)
├── audit-core/              # Audit trail (universal)

services/
├── contact-api/             # Contact management service (Hono)
├── pipeline-api/            # Deal and pipeline service
├── scoring-api/             # Lead scoring ML service
├── forecast-api/            # Revenue forecasting service
├── activity-api/            # Activity tracking service
├── email-api/               # Email sequence and delivery service
```

## Compliance Standards

| Standard     | Requirements                                                  |
| ------------ | ------------------------------------------------------------- |
| **GDPR**     | Consent management, right to erasure, data portability, DPO   |
| **CCPA**     | Do-not-sell, data disclosure, opt-out mechanisms              |
| **SOC2**     | Access controls, audit trails, encryption, incident response  |
| **CAN-SPAM** | Email opt-out, sender identification, unsubscribe processing  |
| **TCPA**     | Telephone Consumer Protection Act — call/SMS consent tracking |

## Multi-Tenancy

Each tenant represents a distinct sales organization:

- **Database isolation**: Row-level security with `tenant_id` on every table
- **Tenant routing**: Subdomain (`acme.crmcloud.com`), header, or JWT claim
- **Pipeline customization**: Each tenant defines its own deal stages, fields, and automation rules
- **Data boundaries**: Contact data, deal history, and email engagement strictly tenant-scoped
- **Configurable scoring models**: Each tenant trains its own lead scoring model on their conversion data

```typescript
// packages/tenant-core/src/middleware.ts
async function resolveTenant(c: Context): Promise<TenantContext> {
  const tenantId =
    extractFromSubdomain(c.req.url) ||
    c.req.header("X-Tenant-ID") ||
    extractFromJWT(c);

  assert(tenantId !== undefined, "Tenant resolution failed");

  const tenant = await getTenantConfig(tenantId);
  assert(tenant.status === "active", `Tenant ${tenantId} is not active`);

  return {
    tenantId,
    pipelineStages: tenant.pipelineStages,
    scoringModelId: tenant.scoringModelId,
    defaultCurrency: tenant.defaultCurrency,
  };
}
```

## Tech Stack

| Layer         | Technology            | Purpose                             |
| ------------- | --------------------- | ----------------------------------- |
| **Frontend**  | Next.js 15            | Sales portals and dashboards        |
| **UI**        | Sera UI               | Component library                   |
| **API**       | Hono                  | REST + RPC API services             |
| **Database**  | PostgreSQL 16         | Contacts, deals, activities         |
| **Cache**     | Redis 7               | Session, rate limiting, lead scores |
| **Search**    | Meilisearch           | Contact and deal search             |
| **Analytics** | ClickHouse            | Sales metrics, funnel analysis      |
| **ML**        | Python + scikit-learn | Lead scoring model training         |
| **Auth**      | Clerk + Cerbos        | RBAC with territory-based access    |
| **Email**     | AWS SES + SendGrid    | Sequence delivery and tracking      |
| **Billing**   | Stripe                | SaaS subscription + usage metering  |
| **Infra**     | AWS ECS + Cloudflare  | Compute + edge routing              |

## Observability

| Dimension      | Tool / Pattern             | Details                                          |
| -------------- | -------------------------- | ------------------------------------------------ |
| **Logging**    | Structured JSON (pino)     | Every deal update, email send, score change      |
| **Tracing**    | OpenTelemetry + Axiom      | Distributed traces across pipeline/scoring       |
| **Metrics**    | Prometheus + Grafana       | Deal velocity, conversion rates, email opens     |
| **Alerting**   | Grafana Alerts + PagerDuty | Scoring model drift, email delivery failures     |
| **Audit**      | Immutable audit log        | GDPR compliance: data access and consent log     |
| **Dashboards** | Grafana                    | Pipeline health, rep activity, forecast accuracy |

```typescript
// Structured log for deal stage changes
logger.info({
  service: "pipeline-api",
  event: "deal_stage_changed",
  tenant_id: ctx.tenantId,
  deal_id: deal.id,
  from_stage: previousStage,
  to_stage: newStage,
  deal_value: deal.amount,
  owner_id: deal.ownerId,
  request_id: ctx.requestId,
  trace_id: ctx.traceId,
});
```

## Health & Readiness Endpoints

Every service exposes structured health checks:

```typescript
// services/pipeline-api/src/routes/health.ts
app.get("/health", async (c) => {
  const checks = {
    status: "healthy",
    service: "pipeline-api",
    version: process.env.APP_VERSION,
    uptime_seconds: process.uptime(),
    checks: {
      database: await checkPostgres(),
      cache: await checkRedis(),
      search: await checkMeilisearch(),
      email_provider: await checkSES(),
    },
    timestamp: new Date().toISOString(),
  };

  const isHealthy = Object.values(checks.checks).every(
    (check) => check.status === "ok",
  );

  return c.json(checks, isHealthy ? 200 : 503);
});

app.get("/ready", async (c) => {
  const ready = (await checkPostgres()).status === "ok";
  return c.json({ ready }, ready ? 200 : 503);
});
```

## Failure Fingerprinting & Incident Response

All errors produce structured, fingerprinted JSON for automated triage:

```typescript
interface CRMFailureEvent {
  fingerprint: string; // SHA256 of service + error_code + stack_signature
  service: "contact-api" | "pipeline-api" | "scoring-api" | "email-api";
  severity: "critical" | "high" | "medium" | "low";
  error_code: string; // e.g., "SCORING_MODEL_STALE", "EMAIL_BOUNCE_RATE_HIGH"
  tenant_id: string;
  message: string;
  stack_trace: string;
  context: {
    deal_id?: string;
    contact_id?: string;
    sequence_id?: string;
  };
  timestamp: string;
}

// Fingerprint generation
function fingerprint(error: CRMFailureEvent): string {
  const signature = `${error.service}:${error.error_code}:${stackSignature(error.stack_trace)}`;
  return crypto
    .createHash("sha256")
    .update(signature)
    .digest("hex")
    .slice(0, 16);
}
```

**Incident pipeline**: Error detected -> fingerprinted -> deduplicated -> triage (auto or human) -> fix PR -> CI validates -> deploy -> verify -> close.

## Anti-Pattern Prevention & Memory

### Known Anti-Patterns

| Anti-Pattern                        | Prevention                                                 |
| ----------------------------------- | ---------------------------------------------------------- |
| Sending emails without consent      | GDPR consent check enforced in email-sequence-core         |
| Stale lead scoring models           | Model freshness assertion: retrain if >30 days old         |
| Unbounded contact search results    | All search queries have explicit `limit` (max 100)         |
| Hardcoded pipeline stages           | Stages are tenant-configurable, never hardcoded            |
| Missing activity attribution        | Every activity linked to contact + deal + user, no orphans |
| Email sequences without unsubscribe | CAN-SPAM unsubscribe link enforced at template level       |

### MEMORY.md Template

```markdown
## CRM Sales Lessons Learned

### Incident: Lead Scores Not Updating After Model Retrain (2025-06-10)

- **Root cause**: Cache TTL for scores was 24h, stale after model deploy
- **Fix**: Invalidate score cache on model deployment event
- **Prevention**: Model deploy pipeline includes cache flush step

### Incident: GDPR Erasure Request Missed Email Logs (2025-07-22)

- **Root cause**: Erasure job deleted contacts but not email engagement records
- **Fix**: Cascading delete across all related tables
- **Prevention**: Erasure integration test covers all 7 related tables
```

## Billing & Monetization

| Tier             | Price        | Features                                                |
| ---------------- | ------------ | ------------------------------------------------------- |
| **Starter**      | $29/user/mo  | 2,500 contacts, basic pipeline, email tracking          |
| **Professional** | $79/user/mo  | 25,000 contacts, lead scoring, sequences, forecasting   |
| **Enterprise**   | $149/user/mo | Unlimited contacts, territory mgmt, API, custom reports |
| **Platform**     | Custom       | White-label, dedicated infra, SLA, SSO                  |

### Usage Metering

```typescript
// Metered dimensions
const meters = {
  contacts_stored: "gauge", // Active contacts in database
  emails_sent: "count", // Sequence emails delivered
  api_calls: "count", // External API calls
  scoring_evaluations: "count", // Lead score calculations
  users_active: "gauge", // Monthly active users
};
```

### Billing Events

- `subscription.created` — New tenant onboarded
- `usage.email_sent` — Email delivered via sequence (metered)
- `usage.scoring_evaluation` — Lead scored (metered overage)
- `subscription.seat_added` — New user seat provisioned
- `subscription.upgraded` — Tier upgrade (contact limit increase)

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain crm-sales --name "DealFlow" \
  --compliance "GDPR,CCPA,SOC2,CAN-SPAM"

# 2. Create domain packages
pnpm create @code-engine/package contact-core
pnpm create @code-engine/package pipeline-core
pnpm create @code-engine/package lead-scoring-core
pnpm create @code-engine/package forecast-core
pnpm create @code-engine/package email-sequence-core

# 3. Start development
pnpm dev

# 4. Run compliance checks
pnpm test:compliance -- --standard gdpr
```
