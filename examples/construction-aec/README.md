# Construction & Architecture/Engineering Platform — Code Engine Example

> Built with the Coding Engine. Full-stack construction management with project tracking, BIM integration, safety compliance, and bidding.

## What This Builds

An OSHA-compliant construction and AEC (Architecture, Engineering, Construction) platform with:

- Project management with Gantt scheduling, milestones, and critical path tracking
- BIM (Building Information Modeling) integration with model viewer and clash detection
- Safety management with OSHA incident reporting and toolbox talks
- Change order management with approval workflows and cost impact analysis
- Bidding and procurement with RFP creation, bid comparison, and award
- Daily logs, inspections, and field reporting with photo documentation
- Subcontractor management with prequalification and compliance tracking
- Budget tracking with cost-to-complete forecasting and earned value analysis

## Architecture

```
apps/
├── project-portal/          # Project manager dashboard (Next.js)
├── field-portal/            # Field superintendent mobile-first app
├── safety-portal/           # Safety manager workspace
├── bidding-portal/          # Bid management and procurement
├── owner-portal/            # Project owner reporting and approvals
├── admin-portal/            # Platform admin (universal)
├── billing-dashboard/       # Subscription billing (universal)

packages/
├── project-core/            # Project lifecycle, scheduling, milestones
├── bim-core/                # BIM model integration, IFC parsing
├── safety-core/             # OSHA compliance, incidents, inspections
├── change-order-core/       # Change orders, RFIs, approval workflows
├── bidding-core/            # RFP, bid packages, award management
├── daily-log-core/          # Daily reports, weather, manpower
├── inspection-core/         # Quality inspections and punch lists
├── subcontractor-core/      # Subcontractor prequalification and mgmt
├── budget-core/             # Cost tracking, EVM, forecasting
├── document-core/           # Plans, specs, submittals, RFIs
├── scheduling-core/         # CPM scheduling, resource leveling
├── auth-core/               # Authentication (universal)
├── billing-core/            # Stripe billing (universal)
├── tenant-core/             # Multi-tenancy (universal)
├── audit-core/              # Audit trail (universal)

services/
├── project-api/             # Project management service (Hono)
├── bim-api/                 # BIM model processing service
├── safety-api/              # Safety and compliance service
├── bidding-api/             # Procurement and bidding service
├── budget-api/              # Cost tracking and forecasting service
├── document-api/            # Document management service
```

## Compliance Standards

| Standard          | Requirements                                                     |
| ----------------- | ---------------------------------------------------------------- |
| **OSHA**          | Occupational Safety and Health Administration incident reporting |
| **SOC2**          | Security controls, access logging, incident response             |
| **ISO 45001**     | Occupational health and safety management systems                |
| **ISO 19650**     | BIM information management standards                             |
| **AIA**           | American Institute of Architects contract document standards     |
| **ConsensusDocs** | Construction contract document standards                         |
| **Davis-Bacon**   | Prevailing wage requirements for federal projects                |
| **EPA**           | Environmental compliance for construction sites                  |

## Multi-Tenancy

Each tenant represents a general contractor, owner, or construction firm:

- **Database isolation**: Row-level security with `tenant_id` on every table
- **Tenant routing**: Subdomain (`acme.buildcloud.com`), header, or JWT claim
- **Project scope**: Projects, budgets, and subcontractor lists are tenant-scoped
- **Safety config**: Each tenant configures OSHA reporting thresholds and safety protocols
- **Contract templates**: Tenant-specific contract and change order templates

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
    contractTypes: tenant.contractTypes,
    safetyProtocols: tenant.safetyProtocolIds,
    wageRequirements: tenant.prevailingWageConfig,
    bimStandard: tenant.bimStandard,
  };
}
```

## Tech Stack

| Layer          | Technology           | Purpose                                |
| -------------- | -------------------- | -------------------------------------- |
| **Frontend**   | Next.js 15           | Project portals and dashboards         |
| **UI**         | Sera UI              | Component library                      |
| **API**        | Hono                 | REST + RPC API services                |
| **Database**   | PostgreSQL 16        | Projects, budgets, safety records      |
| **Ledger**     | TigerBeetle          | Project cost accounting, change orders |
| **Cache**      | Redis 7              | Session, rate limiting, schedule cache |
| **Search**     | Meilisearch          | Document, submittal, RFI search        |
| **Analytics**  | ClickHouse           | Project KPIs, cost analytics, EVM      |
| **Storage**    | Cloudflare R2 / S3   | Plans, photos, BIM models              |
| **BIM Viewer** | IFC.js / xeokit      | 3D model rendering in browser          |
| **Auth**       | Clerk + Cerbos       | RBAC: PM, super, safety, sub, owner    |
| **Billing**    | Stripe               | SaaS subscription + per-project        |
| **Infra**      | AWS ECS + Cloudflare | Compute + edge routing                 |

## Observability

| Dimension      | Tool / Pattern             | Details                                          |
| -------------- | -------------------------- | ------------------------------------------------ |
| **Logging**    | Structured JSON (pino)     | Every change order, inspection, safety incident  |
| **Tracing**    | OpenTelemetry + Axiom      | Distributed traces across project pipeline       |
| **Metrics**    | Prometheus + Grafana       | Schedule variance, cost variance, SPI/CPI        |
| **Alerting**   | Grafana Alerts + PagerDuty | Safety incidents, budget overruns, schedule slip |
| **Audit**      | Immutable audit log        | Change orders, bid awards, safety sign-offs      |
| **Dashboards** | Grafana                    | Project health, safety metrics, budget burn      |

```typescript
// Structured log for safety incident
logger.info({
  service: "safety-api",
  event: "safety_incident_reported",
  tenant_id: ctx.tenantId,
  project_id: incident.projectId,
  incident_id: incident.id,
  type: incident.type,
  severity: incident.severity,
  location: incident.location,
  osha_reportable: incident.oshaReportable,
  reported_by: incident.reportedBy,
  request_id: ctx.requestId,
  trace_id: ctx.traceId,
});
```

## Health & Readiness Endpoints

Every service exposes structured health checks:

```typescript
// services/project-api/src/routes/health.ts
app.get("/health", async (c) => {
  const checks = {
    status: "healthy",
    service: "project-api",
    version: process.env.APP_VERSION,
    uptime_seconds: process.uptime(),
    checks: {
      database: await checkPostgres(),
      ledger: await checkTigerBeetle(),
      cache: await checkRedis(),
      document_store: await checkStorage(),
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
interface ConstructionFailureEvent {
  fingerprint: string; // SHA256 of service + error_code + stack_signature
  service:
    | "project-api"
    | "bim-api"
    | "safety-api"
    | "bidding-api"
    | "budget-api";
  severity: "critical" | "high" | "medium" | "low";
  error_code: string; // e.g., "BIM_PARSE_FAILED", "BUDGET_OVERRUN_THRESHOLD", "OSHA_REPORT_TIMEOUT"
  tenant_id: string;
  message: string;
  stack_trace: string;
  context: {
    project_id?: string;
    change_order_id?: string;
    incident_id?: string;
    bid_package_id?: string;
  };
  timestamp: string;
}

// Fingerprint generation
function fingerprint(error: ConstructionFailureEvent): string {
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

| Anti-Pattern                               | Prevention                                                    |
| ------------------------------------------ | ------------------------------------------------------------- |
| Change order approved without cost impact  | Cost impact analysis required before change order approval    |
| OSHA incident reported after 8-hour window | Incident timestamp assertion: must report within 8 hours      |
| BIM model uploaded without version control | Every BIM upload creates versioned snapshot, never overwrites |
| Budget updated without audit trail         | All budget mutations logged with before/after values          |
| Subcontractor on-site without insurance    | Insurance certificate validation checked before site access   |
| Daily log missing for active project day   | Alert if no daily log submitted by 6 PM on active project day |

### MEMORY.md Template

```markdown
## Construction AEC Lessons Learned

### Incident: Change Order Exceeded Contract Contingency Without Alert (2025-06-20)

- **Root cause**: Cumulative change order total not tracked against contingency
- **Fix**: Running total checked against contingency on every change order approval
- **Prevention**: Budget-core assertion: cumulative_changes <= contingency_amount

### Incident: BIM Model Clash Detection Missed Structural Conflict (2025-08-10)

- **Root cause**: Clash detection ran on outdated model version
- **Fix**: Clash detection triggers on model upload, not on schedule
- **Prevention**: BIM upload webhook triggers clash detection pipeline automatically
```

## Billing & Monetization

| Tier             | Price     | Features                                                  |
| ---------------- | --------- | --------------------------------------------------------- |
| **Starter**      | $499/mo   | 5 projects, daily logs, basic scheduling                  |
| **Professional** | $1,499/mo | 25 projects, BIM, safety, change orders, bidding          |
| **Enterprise**   | $3,999/mo | Unlimited projects, EVM analytics, API, SSO, integrations |
| **Platform**     | Custom    | White-label, dedicated infra, SLA, implementation         |

### Usage Metering

```typescript
// Metered dimensions
const meters = {
  active_projects: "gauge", // Active construction projects
  change_orders_processed: "count", // Change orders through approval
  bim_models_uploaded: "count", // BIM model uploads processed
  daily_logs_submitted: "count", // Field reports submitted
  api_calls: "count", // External API calls
  storage_gb: "gauge", // Plans, photos, BIM storage
};
```

### Billing Events

- `subscription.created` — New construction firm onboarded
- `usage.project_activated` — New project created (metered)
- `usage.bim_upload` — BIM model processed (metered overage)
- `usage.storage` — Document and model storage (metered overage)
- `subscription.upgraded` — Tier upgrade (project limit increase)

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain construction-aec --name "BuildOps" \
  --compliance "OSHA,SOC2,ISO45001"

# 2. Create domain packages
pnpm create @code-engine/package project-core
pnpm create @code-engine/package bim-core
pnpm create @code-engine/package safety-core
pnpm create @code-engine/package change-order-core
pnpm create @code-engine/package bidding-core
pnpm create @code-engine/package budget-core

# 3. Start development
pnpm dev

# 4. Run compliance checks
pnpm test:compliance -- --standard osha,iso45001
```
