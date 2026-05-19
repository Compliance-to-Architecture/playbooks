# Asset Management Platform — Code Engine Example

> Built with the Coding Engine. Enterprise asset lifecycle management.

## What This Builds

An enterprise asset management platform for tracking and optimizing physical and digital assets:

- Asset registry with hierarchical categorization
- Lifecycle tracking (acquisition → deployment → maintenance → decommission)
- Depreciation calculations (straight-line, declining balance, units of production)
- Warranty & contract management
- Location tracking & GIS integration
- Barcode/QR code scanning for mobile field workers
- Compliance tracking (ISO 55000, IFRS 16, ASC 842)
- Predictive analytics for replacement planning
- Total cost of ownership (TCO) analysis
- Multi-site, multi-organization support

## Architecture

```
apps/
├── asset-portal/           # Asset registry & lifecycle dashboard
├── field-app/              # Mobile-first field worker app (PWA)
├── analytics-dashboard/    # TCO, depreciation, utilization analytics
├── procurement-portal/     # Asset procurement & vendor management
├── admin-portal/           # Platform admin (universal)

packages/
├── asset-registry-core/    # Asset CRUD, hierarchy, classification
├── lifecycle-core/         # State machine for asset lifecycle
├── depreciation-core/      # Depreciation calculation engine
├── location-core/          # GIS integration, floor plans, zones
├── barcode-core/           # QR/barcode generation & scanning
├── warranty-core/          # Warranty & service contract tracking
├── procurement-core/       # Purchase orders, vendor management
├── compliance-core/        # ISO 55000, IFRS 16, ASC 842
├── analytics-core/         # TCO, utilization, replacement planning
├── import-export-core/     # Bulk import/export (CSV, Excel, ERP sync)

services/
├── asset-api/              # Asset registry service
├── lifecycle-api/          # Lifecycle state transitions
├── analytics-api/          # Asset analytics & reporting
├── integration-api/        # ERP/CMMS/IoT integration gateway
├── mobile-api/             # Mobile field worker API (offline-first)
```

## Key Patterns

### Asset Lifecycle State Machine

```typescript
// packages/lifecycle-core/src/state-machine.ts

type AssetState =
  | "requested"
  | "approved"
  | "procured"
  | "received"
  | "deployed"
  | "in_service"
  | "under_maintenance"
  | "idle"
  | "decommissioned"
  | "disposed";

interface AssetTransition {
  from: AssetState;
  to: AssetState;
  requires: string[]; // Required approvals or conditions
  triggers: string[]; // Side effects (notifications, ledger entries)
}

const TRANSITIONS: AssetTransition[] = [
  {
    from: "requested",
    to: "approved",
    requires: ["manager_approval"],
    triggers: ["notify_procurement"],
  },
  {
    from: "approved",
    to: "procured",
    requires: ["po_created"],
    triggers: ["create_po", "update_budget"],
  },
  {
    from: "procured",
    to: "received",
    requires: ["delivery_confirmed"],
    triggers: ["update_inventory", "start_warranty"],
  },
  {
    from: "received",
    to: "deployed",
    requires: ["location_assigned"],
    triggers: ["update_location", "assign_custodian"],
  },
  {
    from: "deployed",
    to: "in_service",
    requires: ["commissioning_complete"],
    triggers: ["start_depreciation"],
  },
  {
    from: "in_service",
    to: "under_maintenance",
    requires: ["work_order_created"],
    triggers: ["notify_maintenance"],
  },
  {
    from: "under_maintenance",
    to: "in_service",
    requires: ["work_order_closed"],
    triggers: ["update_maintenance_log"],
  },
  {
    from: "in_service",
    to: "decommissioned",
    requires: ["decommission_approved"],
    triggers: ["stop_depreciation", "notify_finance"],
  },
  {
    from: "decommissioned",
    to: "disposed",
    requires: ["disposal_method_selected"],
    triggers: ["record_disposal", "update_ledger"],
  },
];
```

### Depreciation Engine

```typescript
// packages/depreciation-core/src/calculator.ts

interface DepreciationSchedule {
  assetId: string;
  method:
    | "straight_line"
    | "declining_balance"
    | "units_of_production"
    | "sum_of_years";
  cost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  startDate: string;
  periods: DepreciationPeriod[];
}

function calculateStraightLine(
  cost: number,
  salvage: number,
  months: number,
): number {
  return (cost - salvage) / months;
}

function calculateDecliningBalance(bookValue: number, rate: number): number {
  return bookValue * rate;
}
```

## Data Stack

- **PostgreSQL** — Asset registry, lifecycle, relationships
- **Redis** — Session state, barcode lookup cache
- **S3/R2** — Asset photos, documents, manuals
- **ClickHouse** — Utilization analytics, TCO time-series

## Compliance Standards

| Standard      | Requirements                                        |
| ------------- | --------------------------------------------------- |
| **ISO 55000** | Asset management system, risk-based decision making |
| **IFRS 16**   | Lease accounting, right-of-use assets               |
| **ASC 842**   | Lease classification, disclosure requirements       |
| **SOC2**      | Access controls, audit trails                       |

## Getting Started

```bash
npx coding-engine init --domain asset-management --name "AssetTrack" --compliance "ISO55000,IFRS16"
```

## Health & Readiness Endpoints

Every service MUST expose structured health check endpoints:

| Endpoint              | Purpose         | Response                                                                                   |
| --------------------- | --------------- | ------------------------------------------------------------------------------------------ |
| `GET /health`         | Liveness probe  | `{ "status": "ok", "service": "<name>", "version": "<semver>", "timestamp": "<ISO>" }`     |
| `GET /health/ready`   | Readiness probe | `{ "status": "ready", "dependencies": { "database": "connected", "cache": "connected" } }` |
| `GET /health/startup` | Startup probe   | `{ "status": "started", "uptime_seconds": 42 }`                                            |

### Implementation Pattern

```typescript
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: config.serviceName,
    version: config.version,
    timestamp: new Date().toISOString(),
  });
});

app.get("/health/ready", async (c) => {
  const db = await checkDatabase();
  const cache = await checkCache();
  const status = db && cache ? "ready" : "degraded";
  return c.json(
    {
      status,
      dependencies: {
        database: db ? "connected" : "disconnected",
        cache: cache ? "connected" : "disconnected",
      },
    },
    status === "ready" ? 200 : 503,
  );
});
```

Health checks are consumed by:

- **Kubernetes**: liveness/readiness/startup probes
- **AWS ECS**: container health checks
- **Load balancers**: target group health checks
- **Monitoring**: uptime dashboards and alerting

## Failure Fingerprinting & Incident Response

All errors produce structured, machine-readable JSON with fingerprints for deduplication:

### Error Schema

```typescript
interface StructuredError {
  fingerprint: string; // SHA-256 hash for deduplication
  severity: "critical" | "high" | "medium" | "low";
  service: string;
  environment: string;
  message: string;
  stack_trace: string;
  timestamp: string;
  request_id: string;
  trace_id: string;
  context: Record<string, unknown>;
  cause_chain: string[];
}
```

### Fingerprint Generation

```typescript
import { createHash } from "crypto";

function generateFingerprint(error: Error, service: string): string {
  const normalized = `${service}:${error.constructor.name}:${error.message.replace(/[0-9a-f-]{36}/g, "<UUID>")}`;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
```

### Incident Response Pipeline

1. **Detection**: Error captured by structured logger → fingerprinted
2. **Deduplication**: Same fingerprint within 24h window → increment counter (no duplicate alerts)
3. **Escalation**: 3+ occurrences of same fingerprint → escalate to `critical` severity
4. **Fix PR**: Auto-generated fix branch `fix/<service>/<fingerprint>` with context bundle
5. **Verification**: CI validates fix → auto-merge if tests pass
6. **Resolution**: Fingerprint marked resolved, added to known-issues registry

## Anti-Pattern Prevention & Memory

### Never Repeat Mistakes

Every session MUST check `MEMORY.md` before starting work. Known anti-patterns are engineering defects if repeated:

```bash
# Session start — mandatory
cat .claude/memory/MEMORY.md 2>/dev/null || echo "No memory file — create one"
```

### Known Anti-Patterns Registry

| Anti-Pattern                | Prevention                                      | Detection                                       |
| --------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| Mock data in production     | Zero Mock Data policy — all data from real APIs | `grep -r "mockData\|MOCK_\|fakeName" src/`      |
| Hardcoded secrets           | Environment variables + secret manager          | `grep -r "sk_live\|password.*=.*['\"]" src/`    |
| Missing health endpoints    | Health check middleware on every service        | CI check: every service has `/health` route     |
| Orphan files after refactor | Delete old files in same commit as new          | `codemap refs` — unreferenced files = orphans   |
| Duplicate implementations   | One canonical implementation per feature        | `codemap where <symbol>` — multiple = duplicate |
| Cascading workflow triggers | Max depth 2 for workflow chains                 | Audit `workflow_run` triggers quarterly         |

### Memory File Template

```markdown
# MEMORY.md — Project Memory

## Resolved Issues

<!-- Each resolved issue with root cause and fix -->

## Known Anti-Patterns

<!-- Patterns that caused incidents — NEVER repeat -->

## Architectural Decisions

<!-- Key decisions with rationale (link to ADRs) -->

## Lessons Learned

<!-- Session-by-session learnings -->
```

### Incident Documentation

Every production incident generates a document:

```
docs/incidents/
├── YYYY-MM-DD-<short-description>.md
└── INCIDENT_TEMPLATE.md
```

Each incident includes: root cause analysis, fix applied, prevention steps, fingerprint for future detection.
