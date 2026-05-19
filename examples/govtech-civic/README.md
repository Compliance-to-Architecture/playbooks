# Government Technology & Civic Services Platform — Code Engine Example

> Built with the Coding Engine. Full-stack GovTech with permitting, licensing, case management, and citizen portal.

## What This Builds

A FedRAMP-ready government technology and civic services platform with:

- Online permitting and licensing with workflow automation
- Case management for constituent service requests
- Public records management with FOIA request processing
- Citizen self-service portal with application tracking
- Government employee workspace with queue management
- Payment processing for fees, fines, and taxes
- Document management with records retention policies
- Reporting and transparency dashboards for public accountability

## Architecture

```
apps/
├── citizen-portal/          # Citizen self-service (Next.js)
├── employee-portal/         # Government employee workspace
├── clerk-portal/            # Clerk/processor application review
├── public-records-portal/   # Public records and FOIA requests
├── admin-portal/            # Platform admin (universal)
├── billing-dashboard/       # Subscription billing (universal)

packages/
├── permit-core/             # Permit types, applications, workflow
├── license-core/            # License issuance, renewal, revocation
├── case-core/               # Case lifecycle, assignment, escalation
├── records-core/            # Public records, FOIA, retention
├── payment-core/            # Fee collection, fines, tax payments
├── workflow-core/           # Configurable approval workflows
├── document-core/           # Document upload, classification, storage
├── notification-core/       # Email, SMS, push notifications
├── reporting-core/          # Transparency reports, KPI dashboards
├── accessibility-core/      # ADA/Section 508 compliance engine
├── identity-core/           # Citizen identity verification
├── auth-core/               # Authentication (universal)
├── billing-core/            # Stripe billing (universal)
├── tenant-core/             # Multi-tenancy (universal)
├── audit-core/              # Audit trail (universal)

services/
├── permit-api/              # Permitting service (Hono)
├── license-api/             # Licensing service
├── case-api/                # Case management service
├── records-api/             # Public records and FOIA service
├── payment-api/             # Fee and payment service
├── workflow-api/            # Workflow engine service
```

## Compliance Standards

| Standard            | Requirements                                                  |
| ------------------- | ------------------------------------------------------------- |
| **FedRAMP**         | Federal Risk and Authorization Management Program             |
| **FISMA**           | Federal Information Security Modernization Act                |
| **ADA/Section 508** | Accessibility requirements for government digital services    |
| **FOIA**            | Freedom of Information Act request processing                 |
| **CJIS**            | Criminal Justice Information Services security policy         |
| **SOC2**            | Security controls, access logging, incident response          |
| **NIST 800-53**     | Security and privacy controls for federal information systems |
| **Section 889**     | Prohibited telecommunications equipment restrictions          |

## Multi-Tenancy

Each tenant represents a distinct government agency or jurisdiction:

- **Database isolation**: Row-level security with `tenant_id` on every table; option for schema-level isolation for higher-security agencies
- **Tenant routing**: Subdomain (`permits.springfield.gov`), custom domain, or JWT claim
- **Jurisdiction scope**: Permit types, fee schedules, and workflows are tenant-scoped
- **Regulatory config**: Each tenant configures applicable federal, state, and local regulations
- **Data sovereignty**: Tenant data stored in jurisdiction-specific regions when required

```typescript
// packages/tenant-core/src/middleware.ts
async function resolveTenant(c: Context): Promise<TenantContext> {
  const tenantId =
    extractFromCustomDomain(c.req.url) ||
    extractFromSubdomain(c.req.url) ||
    c.req.header("X-Tenant-ID") ||
    extractFromJWT(c);

  assert(tenantId !== undefined, "Tenant resolution failed");

  const tenant = await getTenantConfig(tenantId);
  assert(tenant.status === "active", `Tenant ${tenantId} is not active`);

  return {
    tenantId,
    jurisdictionType: tenant.jurisdictionType,
    feeSchedule: tenant.feeScheduleId,
    retentionPolicy: tenant.recordsRetentionPolicy,
    dataRegion: tenant.dataResidencyRegion,
  };
}
```

## Tech Stack

| Layer         | Technology        | Purpose                               |
| ------------- | ----------------- | ------------------------------------- |
| **Frontend**  | Next.js 15        | Citizen and employee portals          |
| **UI**        | Sera UI           | Component library (WCAG 2.1 AA)       |
| **API**       | Hono              | REST + RPC API services               |
| **Database**  | PostgreSQL 16     | Applications, cases, records          |
| **Ledger**    | TigerBeetle       | Fee collection, revenue accounting    |
| **Cache**     | Redis 7           | Session, rate limiting, queue state   |
| **Search**    | Meilisearch       | Public records and application search |
| **Analytics** | ClickHouse        | Service delivery KPIs, wait times     |
| **Storage**   | AWS S3            | Documents, attachments, records       |
| **Auth**      | Clerk + Cerbos    | RBAC: citizen, clerk, reviewer, admin |
| **Payments**  | Stripe / Pay.gov  | Fee and fine collection               |
| **Infra**     | AWS GovCloud + CF | FedRAMP-authorized compute            |

## Observability

| Dimension      | Tool / Pattern                   | Details                                        |
| -------------- | -------------------------------- | ---------------------------------------------- |
| **Logging**    | Structured JSON (pino)           | Every application, case action, payment        |
| **Tracing**    | OpenTelemetry + Axiom            | Distributed traces across workflow pipeline    |
| **Metrics**    | Prometheus + Grafana             | Processing time, backlog size, SLA compliance  |
| **Alerting**   | Grafana Alerts + PagerDuty       | SLA breach warnings, payment failures          |
| **Audit**      | Immutable audit log (FIPS 140-2) | Federal: all access to PII and case records    |
| **Dashboards** | Grafana                          | Service delivery metrics, transparency reports |

```typescript
// Structured log for permit application
logger.info({
  service: "permit-api",
  event: "permit_application_submitted",
  tenant_id: ctx.tenantId,
  application_id: application.id,
  permit_type: application.permitType,
  applicant_id: application.applicantId,
  status: "submitted",
  fee_amount: application.feeAmount,
  assigned_reviewer: application.reviewerId,
  request_id: ctx.requestId,
  trace_id: ctx.traceId,
});
```

## Health & Readiness Endpoints

Every service exposes structured health checks:

```typescript
// services/permit-api/src/routes/health.ts
app.get("/health", async (c) => {
  const checks = {
    status: "healthy",
    service: "permit-api",
    version: process.env.APP_VERSION,
    uptime_seconds: process.uptime(),
    checks: {
      database: await checkPostgres(),
      ledger: await checkTigerBeetle(),
      cache: await checkRedis(),
      document_store: await checkS3(),
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
    (await checkS3()).status === "ok";
  return c.json({ ready }, ready ? 200 : 503);
});
```

## Failure Fingerprinting & Incident Response

All errors produce structured, fingerprinted JSON for automated triage:

```typescript
interface GovTechFailureEvent {
  fingerprint: string; // SHA256 of service + error_code + stack_signature
  service:
    | "permit-api"
    | "license-api"
    | "case-api"
    | "records-api"
    | "payment-api";
  severity: "critical" | "high" | "medium" | "low";
  error_code: string; // e.g., "WORKFLOW_STUCK", "FOIA_DEADLINE_BREACH", "PAYMENT_GATEWAY_DOWN"
  tenant_id: string;
  message: string;
  stack_trace: string;
  context: {
    application_id?: string;
    case_id?: string;
    foia_request_id?: string;
    payment_id?: string;
  };
  timestamp: string;
}

// Fingerprint generation
function fingerprint(error: GovTechFailureEvent): string {
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

| Anti-Pattern                              | Prevention                                                       |
| ----------------------------------------- | ---------------------------------------------------------------- |
| PII in public records response            | Redaction engine runs before any public-facing API response      |
| FOIA request exceeding statutory deadline | SLA countdown with escalation at 50%, 75%, 90% of deadline       |
| Payment processed without receipt         | Receipt generation is atomic with payment — same transaction     |
| Inaccessible forms (missing labels)       | Section 508 lint on form publish, blocks if violations found     |
| Workflow stuck in review with no assignee | Auto-escalation after configurable idle period                   |
| Records deleted before retention expires  | Retention policy enforced at database level, hard delete blocked |

### MEMORY.md Template

```markdown
## GovTech Civic Lessons Learned

### Incident: FOIA Response Included Unredacted SSNs (2025-05-15)

- **Root cause**: Redaction engine did not cover scanned PDF attachments
- **Fix**: OCR + regex redaction on all document types before FOIA release
- **Prevention**: Redaction pipeline covers text, PDF, scanned images, and attachments

### Incident: Permit Workflow Stuck for 30 Days (2025-07-20)

- **Root cause**: Reviewer left the agency, case not reassigned
- **Fix**: Auto-reassignment when reviewer account is deactivated
- **Prevention**: Deactivation hook triggers case reassignment for all open items
```

## Billing & Monetization

| Tier             | Price      | Features                                             |
| ---------------- | ---------- | ---------------------------------------------------- |
| **Starter**      | $2,999/mo  | 1 agency, 5 permit types, citizen portal             |
| **Professional** | $7,999/mo  | 5 agencies, unlimited permits, case management, FOIA |
| **Enterprise**   | $14,999/mo | Unlimited agencies, API, analytics, FedRAMP, SSO     |
| **Platform**     | Custom     | Dedicated infra, ATO support, SLA, implementation    |

### Usage Metering

```typescript
// Metered dimensions
const meters = {
  applications_processed: "count", // Permit/license applications processed
  cases_managed: "gauge", // Active cases in system
  foia_requests: "count", // FOIA requests processed
  payments_collected: "count", // Fee/fine payments processed
  api_calls: "count", // External API calls
  storage_gb: "gauge", // Document and records storage
};
```

### Billing Events

- `subscription.created` — New agency onboarded
- `usage.application_processed` — Permit/license application processed (metered)
- `usage.foia_completed` — FOIA request fulfilled (metered)
- `transaction.fee_collected` — Government fee collected (platform fee)
- `subscription.upgraded` — Tier upgrade (agency count increase)

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain govtech-civic --name "CivicCloud" \
  --compliance "FedRAMP,FISMA,ADA,FOIA,SOC2"

# 2. Create domain packages
pnpm create @code-engine/package permit-core
pnpm create @code-engine/package license-core
pnpm create @code-engine/package case-core
pnpm create @code-engine/package records-core
pnpm create @code-engine/package workflow-core

# 3. Start development
pnpm dev

# 4. Run compliance checks
pnpm test:compliance -- --standard fedramp,section508
```
