# Enterprise Resource Planning & Accounting Platform — Code Engine Example

> Built with the Coding Engine. Full-suite ERP with double-entry accounting, financial reporting, and multi-entity consolidation.

## What This Builds

A SOX-compliant enterprise resource planning and accounting platform with:

- General Ledger (GL) with double-entry bookkeeping and chart of accounts
- Accounts Payable (AP) and Accounts Receivable (AR) automation
- Financial reporting (balance sheet, income statement, cash flow)
- Journal entry management with approval workflows
- Multi-entity consolidation and intercompany transactions
- Fixed asset tracking with depreciation schedules
- Budget planning, variance analysis, and forecasting
- Tax calculation engine with multi-jurisdiction support

## Architecture

```
apps/
├── accounting-portal/       # Accountant/controller dashboard (Next.js)
├── ap-portal/               # Vendor invoice management
├── ar-portal/               # Customer billing and collections
├── reporting-dashboard/     # Financial reporting and analytics
├── admin-portal/            # Platform admin (universal)
├── billing-dashboard/       # Subscription billing (universal)

packages/
├── gl-core/                 # General ledger engine, chart of accounts
├── ap-core/                 # Accounts payable processing
├── ar-core/                 # Accounts receivable and invoicing
├── journal-core/            # Journal entry creation and approval
├── reporting-core/          # Financial statement generation
├── consolidation-core/      # Multi-entity consolidation
├── fixed-asset-core/        # Asset lifecycle and depreciation
├── budget-core/             # Budget planning and variance
├── tax-core/                # Tax calculation engine
├── audit-trail-core/        # SOX-compliant audit logging
├── auth-core/               # Authentication (universal)
├── billing-core/            # Stripe billing (universal)
├── tenant-core/             # Multi-tenancy (universal)

services/
├── ledger-api/              # GL and journal entry service (Hono)
├── ap-api/                  # Accounts payable service
├── ar-api/                  # Accounts receivable service
├── reporting-api/           # Financial reporting service
├── consolidation-api/       # Multi-entity consolidation service
├── tax-api/                 # Tax calculation service
```

## Compliance Standards

| Standard    | Requirements                                                    |
| ----------- | --------------------------------------------------------------- |
| **SOX**     | Internal controls, segregation of duties, audit trail, sign-off |
| **GAAP**    | US Generally Accepted Accounting Principles                     |
| **IFRS**    | International Financial Reporting Standards                     |
| **SOC2**    | Security controls, access logging, incident response            |
| **ASC 606** | Revenue recognition standards                                   |
| **GDPR**    | Vendor/customer PII protection, data retention                  |

## Multi-Tenancy

Each tenant represents a distinct organization or business entity:

- **Database isolation**: Row-level security with `tenant_id` on every table
- **Tenant routing**: Resolved via subdomain (`acme.erpcloud.com`), header (`X-Tenant-ID`), or JWT claim
- **Data separation**: GL chart of accounts, fiscal calendars, and reporting periods are tenant-scoped
- **Multi-entity within tenant**: A single tenant can manage multiple legal entities with intercompany elimination
- **Tenant-scoped fiscal year**: Each tenant defines its own fiscal year start, period close schedule, and reporting currency

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
    baseCurrency: tenant.baseCurrency,
    fiscalYearStart: tenant.fiscalYearStart,
    chartOfAccountsId: tenant.chartOfAccountsId,
  };
}
```

## Tech Stack

| Layer         | Technology           | Purpose                             |
| ------------- | -------------------- | ----------------------------------- |
| **Frontend**  | Next.js 15           | Accounting portals and dashboards   |
| **UI**        | Sera UI              | Component library                   |
| **API**       | Hono                 | REST + RPC API services             |
| **Database**  | PostgreSQL 16        | Transactional data, GL entries      |
| **Ledger**    | TigerBeetle          | Double-entry accounting engine      |
| **Cache**     | Redis 7              | Session, rate limiting, GL balances |
| **Search**    | Meilisearch          | Account/vendor/customer search      |
| **Analytics** | ClickHouse           | Financial reporting aggregations    |
| **Auth**      | Clerk + Cerbos       | RBAC with SOX segregation of duties |
| **Billing**   | Stripe               | SaaS subscription + usage metering  |
| **Infra**     | AWS ECS + Cloudflare | Compute + edge routing              |

## Observability

| Dimension      | Tool / Pattern                    | Details                                        |
| -------------- | --------------------------------- | ---------------------------------------------- |
| **Logging**    | Structured JSON (pino)            | Every GL entry, approval, and period close     |
| **Tracing**    | OpenTelemetry + Axiom             | Distributed traces across ledger/AP/AR calls   |
| **Metrics**    | Prometheus + Grafana              | Journal entry throughput, period close latency |
| **Alerting**   | Grafana Alerts + PagerDuty        | Failed reconciliations, out-of-balance GL      |
| **Audit**      | Immutable audit log (append-only) | SOX compliance: who changed what, when, why    |
| **Dashboards** | Grafana                           | GL health, AP aging, AR collection rates       |

```typescript
// Structured log for every GL mutation
logger.info({
  service: "ledger-api",
  event: "journal_entry_posted",
  tenant_id: ctx.tenantId,
  journal_id: entry.id,
  debit_total: entry.debitTotal,
  credit_total: entry.creditTotal,
  posted_by: ctx.userId,
  approved_by: entry.approvedBy,
  period: entry.fiscalPeriod,
  request_id: ctx.requestId,
  trace_id: ctx.traceId,
});
```

## Health & Readiness Endpoints

Every service exposes structured health checks:

```typescript
// services/ledger-api/src/routes/health.ts
app.get("/health", async (c) => {
  const checks = {
    status: "healthy",
    service: "ledger-api",
    version: process.env.APP_VERSION,
    uptime_seconds: process.uptime(),
    checks: {
      database: await checkPostgres(),
      ledger_engine: await checkTigerBeetle(),
      cache: await checkRedis(),
      search: await checkMeilisearch(),
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
    (await checkTigerBeetle()).status === "ok";
  return c.json({ ready }, ready ? 200 : 503);
});
```

## Failure Fingerprinting & Incident Response

All errors produce structured, fingerprinted JSON for automated triage:

```typescript
interface ERPFailureEvent {
  fingerprint: string; // SHA256 of service + error_code + stack_signature
  service: "ledger-api" | "ap-api" | "ar-api" | "reporting-api";
  severity: "critical" | "high" | "medium" | "low";
  error_code: string; // e.g., "GL_OUT_OF_BALANCE", "PERIOD_ALREADY_CLOSED"
  tenant_id: string;
  fiscal_period?: string;
  message: string;
  stack_trace: string;
  context: {
    journal_id?: string;
    account_code?: string;
    amount?: number;
  };
  timestamp: string;
}

// Fingerprint generation
function fingerprint(error: ERPFailureEvent): string {
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

| Anti-Pattern                        | Prevention                                                     |
| ----------------------------------- | -------------------------------------------------------------- |
| Floating-point currency math        | Use integer cents/minor units everywhere; TigerBeetle enforces |
| Unbalanced journal entries          | Assert `debit_total === credit_total` before persist           |
| Period close without reconciliation | Block close until all sub-ledgers reconcile to GL              |
| Hardcoded chart of accounts         | Chart of accounts is tenant-configurable, never hardcoded      |
| Missing audit trail                 | Every GL mutation logged to append-only audit table            |
| Single-approver journal entries     | SOX requires dual approval for entries above threshold         |

### MEMORY.md Template

```markdown
## ERP Accounting Lessons Learned

### Incident: GL Out-of-Balance After Bulk Import (2025-03-15)

- **Root cause**: Bulk import bypassed journal entry validation
- **Fix**: All imports route through journal-core validation
- **Prevention**: Assert balance check on every write path, no exceptions

### Incident: Fiscal Period Closed Prematurely (2025-04-02)

- **Root cause**: Cron job closed period without checking pending approvals
- **Fix**: Period close requires zero pending entries assertion
- **Prevention**: Pre-close checklist enforced in consolidation-core
```

## Billing & Monetization

| Tier             | Price     | Features                                            |
| ---------------- | --------- | --------------------------------------------------- |
| **Starter**      | $149/mo   | 1 entity, 5 users, GL + AP/AR, basic reports        |
| **Professional** | $499/mo   | 5 entities, 25 users, consolidation, budgets, tax   |
| **Enterprise**   | $1,499/mo | Unlimited entities, SSO, custom reports, API access |
| **Platform**     | Custom    | White-label, dedicated infra, SLA, onboarding       |

### Usage Metering

```typescript
// Metered dimensions
const meters = {
  journal_entries_posted: "count", // Per journal entry posted
  reports_generated: "count", // Financial reports rendered
  api_calls: "count", // External API calls
  entities_managed: "gauge", // Active legal entities
  storage_gb: "gauge", // Document/attachment storage
};
```

### Billing Events

- `subscription.created` — New tenant onboarded
- `usage.journal_entry` — Journal entry posted (metered)
- `usage.report_generated` — Financial report rendered (metered)
- `subscription.upgraded` — Tier upgrade (entity limit increase)

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain erp-accounting --name "LedgerCloud" \
  --compliance "SOX,GAAP,IFRS,SOC2"

# 2. Create domain packages
pnpm create @code-engine/package gl-core
pnpm create @code-engine/package ap-core
pnpm create @code-engine/package ar-core
pnpm create @code-engine/package journal-core
pnpm create @code-engine/package reporting-core

# 3. Start development
pnpm dev

# 4. Run compliance checks
pnpm test:compliance -- --standard sox
```
