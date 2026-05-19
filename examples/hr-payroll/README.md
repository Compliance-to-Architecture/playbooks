# Human Resources & Payroll Management Platform — Code Engine Example

> Built with the Coding Engine. End-to-end HR platform with payroll processing, benefits administration, and workforce management.

## What This Builds

A compliance-ready HR and payroll management platform with:

- Employee lifecycle management (hire to retire)
- Payroll processing with multi-jurisdiction tax calculation
- Benefits administration and open enrollment
- Time and attendance tracking with PTO management
- Recruitment pipeline and applicant tracking (ATS)
- Performance reviews and goal management
- Organizational chart and reporting structure
- Employee self-service portal with document management

## Architecture

```
apps/
├── hr-portal/               # HR admin dashboard (Next.js)
├── employee-portal/         # Employee self-service (Next.js)
├── recruiter-portal/        # ATS and hiring management
├── payroll-dashboard/       # Payroll processing and reporting
├── admin-portal/            # Platform admin (universal)
├── billing-dashboard/       # Subscription billing (universal)

packages/
├── employee-core/           # Employee data models and lifecycle
├── payroll-core/            # Payroll calculation engine
├── tax-core/                # Multi-jurisdiction tax withholding
├── benefits-core/           # Benefits plans and enrollment
├── pto-core/                # PTO accrual and tracking
├── time-tracking-core/      # Clock-in/out and timesheet
├── recruitment-core/        # ATS, job postings, applicants
├── performance-core/        # Reviews, goals, competencies
├── org-chart-core/          # Organizational hierarchy
├── document-core/           # Employee document management
├── compliance-core/         # Labor law compliance engine
├── auth-core/               # Authentication (universal)
├── billing-core/            # Stripe billing (universal)
├── tenant-core/             # Multi-tenancy (universal)
├── audit-core/              # Audit trail (universal)

services/
├── employee-api/            # Employee management service (Hono)
├── payroll-api/             # Payroll processing service
├── benefits-api/            # Benefits administration service
├── recruitment-api/         # ATS and hiring service
├── time-api/                # Time tracking service
├── compliance-api/          # Labor law compliance service
```

## Compliance Standards

| Standard  | Requirements                                                      |
| --------- | ----------------------------------------------------------------- |
| **GDPR**  | Employee data protection, right to erasure, data minimization     |
| **SOX**   | Payroll controls, segregation of duties, audit trail              |
| **FLSA**  | Fair Labor Standards Act — overtime, minimum wage, record-keeping |
| **ERISA** | Employee Retirement Income Security Act — benefits compliance     |
| **ACA**   | Affordable Care Act — employer mandate, 1095-C reporting          |
| **EEO**   | Equal Employment Opportunity — non-discrimination tracking        |
| **SOC2**  | Security controls, access logging, incident response              |

## Multi-Tenancy

Each tenant represents a distinct employer organization:

- **Database isolation**: Row-level security with `tenant_id` on every table
- **Tenant routing**: Subdomain (`acme.hrcloud.com`), header, or JWT claim
- **Payroll isolation**: Tax jurisdictions, pay schedules, and benefit plans are tenant-scoped
- **Role hierarchy**: Tenant-specific org chart drives approval chains and data visibility
- **Regulatory scope**: Each tenant configures applicable labor law jurisdictions

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
    paySchedule: tenant.paySchedule,
    taxJurisdictions: tenant.taxJurisdictions,
    benefitsEligibilityRules: tenant.benefitsEligibilityRules,
  };
}
```

## Tech Stack

| Layer         | Technology           | Purpose                           |
| ------------- | -------------------- | --------------------------------- |
| **Frontend**  | Next.js 15           | HR portals and dashboards         |
| **UI**        | Sera UI              | Component library                 |
| **API**       | Hono                 | REST + RPC API services           |
| **Database**  | PostgreSQL 16        | Employee data, payroll records    |
| **Ledger**    | TigerBeetle          | Payroll journal entries           |
| **Cache**     | Redis 7              | Session, rate limiting, PTO cache |
| **Search**    | Meilisearch          | Employee and candidate search     |
| **Analytics** | ClickHouse           | Workforce analytics, headcount    |
| **Auth**      | Clerk + Cerbos       | RBAC with org-chart hierarchy     |
| **Billing**   | Stripe               | SaaS subscription + per-employee  |
| **Infra**     | AWS ECS + Cloudflare | Compute + edge routing            |

## Observability

| Dimension      | Tool / Pattern             | Details                                         |
| -------------- | -------------------------- | ----------------------------------------------- |
| **Logging**    | Structured JSON (pino)     | Every payroll run, hire event, benefit change   |
| **Tracing**    | OpenTelemetry + Axiom      | Distributed traces across payroll pipeline      |
| **Metrics**    | Prometheus + Grafana       | Payroll processing time, recruitment funnel     |
| **Alerting**   | Grafana Alerts + PagerDuty | Failed payroll runs, tax calc errors            |
| **Audit**      | Immutable audit log        | SOX: payroll approval chain, compensation edits |
| **Dashboards** | Grafana                    | Headcount trends, turnover, benefits cost       |

```typescript
// Structured log for payroll processing
logger.info({
  service: "payroll-api",
  event: "payroll_run_completed",
  tenant_id: ctx.tenantId,
  pay_period: run.period,
  employee_count: run.employeeCount,
  gross_total: run.grossTotal,
  net_total: run.netTotal,
  tax_withheld: run.taxWithheld,
  processed_by: ctx.userId,
  approved_by: run.approvedBy,
  request_id: ctx.requestId,
  trace_id: ctx.traceId,
});
```

## Health & Readiness Endpoints

Every service exposes structured health checks:

```typescript
// services/payroll-api/src/routes/health.ts
app.get("/health", async (c) => {
  const checks = {
    status: "healthy",
    service: "payroll-api",
    version: process.env.APP_VERSION,
    uptime_seconds: process.uptime(),
    checks: {
      database: await checkPostgres(),
      ledger: await checkTigerBeetle(),
      cache: await checkRedis(),
      tax_engine: await checkTaxService(),
    },
    timestamp: new Date().toISOString(),
  };

  const isHealthy = Object.values(checks.checks).every(
    (check) => check.status === "ok",
  );

  return c.json(checks, isHealthy ? 200 : 503);
});

app.get("/ready", async (c) => {
  const ready =
    (await checkPostgres()).status === "ok" &&
    (await checkTaxService()).status === "ok";
  return c.json({ ready }, ready ? 200 : 503);
});
```

## Failure Fingerprinting & Incident Response

All errors produce structured, fingerprinted JSON for automated triage:

```typescript
interface HRFailureEvent {
  fingerprint: string; // SHA256 of service + error_code + stack_signature
  service: "employee-api" | "payroll-api" | "benefits-api" | "recruitment-api";
  severity: "critical" | "high" | "medium" | "low";
  error_code: string; // e.g., "PAYROLL_TAX_CALC_FAILED", "BENEFIT_ENROLLMENT_EXPIRED"
  tenant_id: string;
  pay_period?: string;
  message: string;
  stack_trace: string;
  context: {
    employee_id?: string;
    payroll_run_id?: string;
    benefit_plan_id?: string;
  };
  timestamp: string;
}

// Fingerprint generation
function fingerprint(error: HRFailureEvent): string {
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

| Anti-Pattern                             | Prevention                                                    |
| ---------------------------------------- | ------------------------------------------------------------- |
| Floating-point payroll calculations      | Use integer cents/minor units; TigerBeetle enforces           |
| Running payroll without tax table sync   | Assert tax tables freshness before every payroll run          |
| PTO accrual without cap enforcement      | Max accrual cap checked on every accrual event                |
| Hardcoded tax brackets                   | Tax tables loaded from tax-core, updated quarterly            |
| Missing I-9/W-4 before payroll           | Pre-payroll assertion: all employees have valid tax documents |
| Benefits changes outside open enrollment | Qualifying life event (QLE) required for mid-year changes     |

### MEMORY.md Template

```markdown
## HR Payroll Lessons Learned

### Incident: Payroll Run Double-Processed (2025-05-20)

- **Root cause**: Retry logic re-submitted payroll after timeout
- **Fix**: Idempotency key on payroll runs, dedup at ledger layer
- **Prevention**: Every payroll run has unique idempotency_key, checked before processing

### Incident: Benefits Deduction Calculated on Gross Instead of Pre-Tax (2025-08-11)

- **Root cause**: Deduction order was not enforced — post-tax deductions ran first
- **Fix**: Deduction waterfall with explicit ordering (pre-tax -> tax -> post-tax)
- **Prevention**: Deduction order assertions in payroll-core, tested for all plans
```

## Billing & Monetization

| Tier             | Price           | Features                                              |
| ---------------- | --------------- | ----------------------------------------------------- |
| **Starter**      | $6/employee/mo  | Core HR, time tracking, PTO, employee portal          |
| **Professional** | $12/employee/mo | + Payroll, benefits admin, ATS, performance reviews   |
| **Enterprise**   | $22/employee/mo | + Multi-entity, API, custom workflows, SSO, analytics |
| **Platform**     | Custom          | White-label, dedicated infra, SLA, implementation     |

### Usage Metering

```typescript
// Metered dimensions
const meters = {
  active_employees: "gauge", // Employees on payroll
  payroll_runs: "count", // Payroll cycles processed
  job_postings: "count", // Active job listings
  api_calls: "count", // External API calls
  document_storage_gb: "gauge", // Employee document storage
};
```

### Billing Events

- `subscription.created` — New tenant onboarded
- `usage.employee_activated` — New employee added to payroll
- `usage.payroll_processed` — Payroll run completed (metered)
- `usage.job_posted` — Job listing published (metered overage)
- `subscription.upgraded` — Tier upgrade (feature unlock)

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain hr-payroll --name "PeopleOps" \
  --compliance "GDPR,SOX,FLSA,ACA,SOC2"

# 2. Create domain packages
pnpm create @code-engine/package employee-core
pnpm create @code-engine/package payroll-core
pnpm create @code-engine/package benefits-core
pnpm create @code-engine/package recruitment-core
pnpm create @code-engine/package tax-core

# 3. Start development
pnpm dev

# 4. Run compliance checks
pnpm test:compliance -- --standard flsa,aca
```
