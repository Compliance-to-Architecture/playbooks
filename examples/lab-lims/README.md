# Laboratory Information Management System — Code Engine Example

> Built with the Coding Engine. From zero to production-grade LIMS with sample lifecycle tracking, instrument integration, validated results management, and regulatory-compliant chain of custody.

## What This Builds

A comprehensive laboratory information management system with:

- **Sample Tracking** — Accessioning, barcoding, storage location, chain of custody, disposal
- **Instrument Integration** — Bidirectional instrument communication, data capture, calibration tracking
- **Results Management** — Data entry, calculations, validation rules, out-of-spec handling, approval workflows
- **Chain of Custody** — Tamper-evident audit trail, custody transfer logging, legal defensibility
- **Quality Control** — Control charts, Levey-Jennings, Westgard rules, proficiency testing
- **Reporting** — Certificate of Analysis (CoA), regulatory reports, custom templates, batch reporting
- **Inventory Management** — Reagent tracking, lot management, expiry alerts, reorder automation
- **Method Management** — SOPs, method validation, measurement uncertainty, accreditation tracking

## Architecture

```
apps/
├── analyst-workstation/       # Lab analyst workspace (Next.js 15)
├── supervisor-dashboard/      # Lab supervisor/QA interface
├── sample-reception/          # Sample intake portal (Next.js 15)
├── admin-portal/              # Platform administration (Next.js 15)
├── client-portal/             # Client results access portal
└── docs/                      # API documentation (VitePress)

packages/
├── sample-core/               # Sample lifecycle management
├── instrument-core/           # Instrument communication + data
├── results-core/              # Results calculation + validation
├── custody-core/              # Chain of custody engine
├── qc-core/                   # Quality control + Westgard rules
├── reporting-core/            # CoA generation + templates
├── inventory-core/            # Reagent + consumable tracking
├── method-core/               # SOP + method validation
├── accreditation-core/        # ISO 17025 compliance engine
├── auth-core/                 # Authentication + RBAC (universal)
├── billing-core/              # Stripe billing integration (universal)
├── tenant-core/               # Multi-tenancy isolation (universal)
└── audit-core/                # 21 CFR Part 11 audit trail (universal)

services/
├── sample-api/                # Sample lifecycle service (Hono)
├── instrument-api/            # Instrument data ingestion
├── results-api/               # Results processing + validation
├── qc-api/                    # QC monitoring + alerting
├── reporting-api/             # Report generation + delivery
└── inventory-api/             # Reagent + supply management
```

## Compliance Standards

| Standard               | Requirements                                                      |
| ---------------------- | ----------------------------------------------------------------- |
| **ISO 17025**          | General requirements for testing and calibration lab competence   |
| **GLP**                | Good Laboratory Practice — study plans, raw data, final reports   |
| **FDA 21 CFR Part 11** | Electronic records, electronic signatures, audit trails           |
| **CLIA**               | Clinical Laboratory Improvement Amendments — quality, proficiency |
| **ISO 15189**          | Medical laboratories — quality and competence requirements        |
| **SOC2**               | Security controls, data integrity, system availability            |

## Multi-Tenancy

Each laboratory, testing organization, or lab network operates as an isolated tenant:

- **Database isolation**: Row-level security with `tenant_id`; results data encrypted per tenant
- **Tenant resolution**: Subdomain (`envirolab.lims-platform.com`) or API key
- **Lab hierarchy**: Tenant -> Lab Site -> Department -> Section -> Bench
- **Instrument isolation**: Instruments registered per-tenant; data streams segregated
- **Method library**: Per-tenant method definitions with shared reference method templates
- **Accreditation scope**: Per-tenant accreditation body, scope of tests, certificate tracking
- **Data integrity**: 21 CFR Part 11 compliant — no record deletion, all changes tracked with reason codes

```typescript
// Tenant-scoped sample query with chain of custody
const getSamples = async (tenantId: string, filters: SampleFilters) => {
  assert(tenantId, "Tenant ID required for sample queries");
  assert(filters.dateRange.end > filters.dateRange.start, "Invalid date range");

  return db.sample.findMany({
    where: {
      tenant_id: tenantId,
      status: filters.status,
      received_at: {
        gte: filters.dateRange.start,
        lte: filters.dateRange.end,
      },
    },
    include: {
      custody_chain: { orderBy: { transferred_at: "asc" } },
      tests: { include: { results: true } },
    },
    take: Math.min(filters.limit ?? 50, MAX_SAMPLE_QUERY_SIZE),
  });
};
```

## Tech Stack

| Layer          | Technology              | Purpose                                       |
| -------------- | ----------------------- | --------------------------------------------- |
| Frontend       | Next.js 15, Sera UI     | Analyst workstation, supervisor dashboard     |
| API Framework  | Hono                    | Lightweight, edge-ready API services          |
| Database       | PostgreSQL 16           | Primary data store with RLS                   |
| Cache          | Redis 7                 | Session state, instrument status cache        |
| Search         | Meilisearch             | Sample search, method search, reagent lookup  |
| Queue          | BullMQ                  | Instrument data processing, report generation |
| Object Storage | S3                      | Raw instrument files, CoA PDFs, attachments   |
| Instrument I/O | Serial/TCP/HL7          | Bidirectional instrument communication        |
| PDF Generation | Puppeteer / PDFKit      | Certificate of Analysis generation            |
| Auth           | Clerk + custom RBAC     | Identity + role-based access                  |
| Billing        | Stripe                  | Subscription + usage-based billing            |
| Monitoring     | OpenTelemetry + Grafana | Distributed tracing, metrics                  |
| Edge           | Cloudflare Workers      | API routing, client portal CDN                |

## Observability

Full-stack observability for laboratory operations:

- **Distributed Tracing**: OpenTelemetry traces across sample-api, instrument-api, results-api
- **Metrics**: Samples/day, turnaround time, out-of-spec rate, QC pass rate, instrument uptime
- **Structured Logging**: JSON logs with `tenant_id`, `sample_id`, `test_id`, `analyst_id`, severity
- **Dashboards**: Grafana — Sample Pipeline, QC Control Charts, Instrument Status, Turnaround Time
- **Alerting**: PagerDuty — QC failure (Westgard violation), instrument offline, results pending review > SLA
- **SLOs**: 99.9% API uptime, < 5min instrument data capture, < 1hr QC violation notification

```typescript
logger.info({
  service: "results-api",
  event: "result.validated",
  tenant_id: tenant.id,
  sample_id: sample.id,
  test_code: test.code,
  analyst_id: analyst.id,
  reviewer_id: reviewer.id,
  result_value: result.value,
  result_unit: result.unit,
  in_spec: result.inSpec,
  trace_id: span.traceId,
  timestamp: new Date().toISOString(),
});
```

## Health & Readiness Endpoints

Every service exposes standardized health checks:

```typescript
// services/sample-api/src/routes/health.ts
import { Hono } from "hono";

const health = new Hono();

health.get("/health", async (c) => {
  const checks = {
    status: "healthy",
    service: "sample-api",
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
    checkInstrumentConnections(),
    checkQCRulesLoaded(),
  ]);
  const isReady = ready.every((r) => r.ok);
  return c.json({ ready: isReady, details: ready }, isReady ? 200 : 503);
});
```

## Failure Fingerprinting & Incident Response

All failures produce fingerprinted, structured error events:

```typescript
// packages/sample-core/src/errors.ts
interface LIMSFailure {
  fingerprint: string;
  service: string;
  severity: "critical" | "high" | "medium" | "low";
  category:
    | "sample"
    | "instrument"
    | "results"
    | "qc"
    | "compliance"
    | "infrastructure";
  tenant_id: string;
  data_integrity_impact: boolean; // Triggers 21 CFR Part 11 review
  error_code: string; // e.g., "INSTRUMENT_COMM_FAIL", "QC_WESTGARD_VIOLATION"
  message: string;
  stack_trace: string;
  context: {
    sample_id?: string;
    instrument_id?: string;
    test_code?: string;
    batch_id?: string;
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

**Incident pipeline**: Failure detected -> Fingerprint generated -> Deduplicated -> If `data_integrity_impact: true`, trigger 21 CFR Part 11 deviation investigation -> Auto-create fix PR or escalate -> Track in `/docs/incidents/`.

## Anti-Pattern Prevention & Memory

| Anti-Pattern                        | Prevention                                                      |
| ----------------------------------- | --------------------------------------------------------------- |
| Deleting or overwriting lab records | 21 CFR Part 11: no deletion, append-only with reason codes      |
| Results entered without QC passing  | QC gate check mandatory before result entry for each batch      |
| Instrument data without calibration | Calibration status check before accepting instrument data       |
| Chain of custody gaps               | Custody transfer requires both sender and receiver confirmation |
| Reagents used past expiry           | Expiry check at point-of-use; expired reagents block tests      |
| Electronic signatures without auth  | Two-factor authentication required for all e-signatures         |

**MEMORY.md template**:

```markdown
## Known Issues

- [ ] HL7 v2.x parser fails on non-standard segment delimiters — add configurable parser
- [ ] Westgard 10x rule triggers false positives with high-precision instruments — tune thresholds

## Resolved Incidents

- [INC-001] Instrument data lost during network outage — added local buffer with retry
- [INC-002] CoA PDF generation timeout at > 500 analytes — implemented streaming PDF builder
```

## Billing & Monetization

**Subscription Tiers**:

| Tier         | Samples/mo | Instruments | Users     | Price     |
| ------------ | ---------- | ----------- | --------- | --------- |
| Small Lab    | 1,000      | 5           | 10        | $499/mo   |
| Regional Lab | 10,000     | 25          | 50        | $1,999/mo |
| Enterprise   | Unlimited  | Unlimited   | Unlimited | Custom    |

**Usage Metering** (Stripe Meters):

- `lims.samples.accessioned` — Billed per sample above tier
- `lims.tests.executed` — Individual test executions
- `lims.reports.generated` — CoA and custom report generation
- `lims.storage.gb` — Raw data and document storage

**Billing Events**:

```typescript
await stripe.billing.meterEvents.create({
  event_name: "lims.samples.accessioned",
  payload: {
    stripe_customer_id: tenant.stripeCustomerId,
    value: "1",
    sample_type: sample.type,
    lab_site: sample.labSiteId,
  },
});
```

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain laboratory --name "LabOS" \
  --compliance "ISO17025,GLP,FDA-21CFR11,CLIA"

# 2. Create domain packages
pnpm create @code-engine/package sample-core
pnpm create @code-engine/package instrument-core
pnpm create @code-engine/package results-core
pnpm create @code-engine/package qc-core

# 3. Start development
pnpm install
pnpm dev

# 4. Run compliance checks
pnpm run compliance:iso17025
pnpm run compliance:21cfr11-audit
```

## Timeline

| Phase                  | Duration     | Deliverable                              |
| ---------------------- | ------------ | ---------------------------------------- |
| Setup + Auth           | 2 days       | Auth, multi-tenancy, 21 CFR Part 11      |
| Sample Lifecycle       | 5 days       | Accessioning, tracking, chain of custody |
| Instrument Integration | 5 days       | Bidirectional comm, calibration tracking |
| Results & QC           | 5 days       | Validation, Westgard rules, approvals    |
| Reporting              | 3 days       | CoA generation, custom templates         |
| Inventory              | 3 days       | Reagent tracking, expiry management      |
| Compliance + Launch    | 3 days       | ISO 17025 evidence packs, validation     |
| **Total**              | **~5 weeks** | Production-ready LIMS platform           |
