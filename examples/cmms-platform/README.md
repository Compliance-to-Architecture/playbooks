# CMMS Platform — Code Engine Example

> Built with the Coding Engine. Computerized Maintenance Management System.

## What This Builds

A full-featured CMMS (Computerized Maintenance Management System) for facilities and equipment management:

- Facility & building management (multi-site)
- Equipment registry with QR code asset tags
- Work request portal (tenant/occupant self-service)
- Work order lifecycle (request → approve → assign → execute → close)
- Preventive maintenance scheduling
- Vendor & contractor management
- Parts & inventory with auto-reorder
- Floor plan integration (indoor mapping)
- Budget tracking & cost allocation
- Mobile-first technician experience
- SLA tracking & escalation

## Architecture

```
apps/
├── facility-portal/        # Facility manager dashboard
├── request-portal/         # Tenant/occupant work request submission
├── technician-app/         # Mobile technician app (PWA, offline-capable)
├── vendor-portal/          # Vendor/contractor self-service
├── admin-portal/           # Platform admin (universal)

packages/
├── facility-core/          # Sites, buildings, floors, spaces
├── work-request-core/      # Request submission, categorization, routing
├── work-order-core/        # WO lifecycle, assignments, checklists
├── pm-schedule-core/       # Preventive maintenance calendars
├── inventory-core/         # Parts, stockrooms, reorder points, receipts
├── vendor-core/            # Vendor registry, contracts, insurance tracking
├── floor-plan-core/        # Indoor mapping, equipment placement
├── budget-core/            # Cost centers, budgets, actuals vs planned
├── sla-core/               # SLA definitions, tracking, escalation rules
├── reporting-core/         # Standard reports, custom report builder

services/
├── facility-api/           # Facility management service
├── work-order-api/         # Work order processing service
├── inventory-api/          # Parts & inventory service
├── vendor-api/             # Vendor management service
├── notification-api/       # Email, SMS, push notification service
```

## Key Patterns

### Work Order Lifecycle

```typescript
// packages/work-order-core/src/lifecycle.ts

type WOStatus =
  | "requested"
  | "approved"
  | "scheduled"
  | "assigned"
  | "in_progress"
  | "on_hold"
  | "completed"
  | "verified"
  | "closed"
  | "cancelled";

interface WorkOrder {
  id: string;
  requestId?: string;
  type: "corrective" | "preventive" | "emergency" | "inspection" | "project";
  priority: "emergency" | "urgent" | "high" | "medium" | "low";
  status: WOStatus;
  facilityId: string;
  locationId: string; // Building > Floor > Space
  equipmentId?: string;
  description: string;
  assignedTo: string[]; // Technician IDs
  vendorId?: string; // External vendor if outsourced
  estimatedHours: number;
  actualHours: number;
  partsUsed: { partId: string; quantity: number; cost: number }[];
  laborCost: number;
  totalCost: number;
  slaDeadline?: Date;
  checklist: { item: string; completed: boolean; completedBy?: string }[];
  attachments: string[]; // Photos, documents
  createdAt: Date;
  completedAt?: Date;
}

// SLA escalation rules
interface SLARule {
  priority: string;
  responseTimeMinutes: number; // Time to acknowledge
  resolutionTimeMinutes: number; // Time to complete
  escalationChain: string[]; // User IDs for escalation
}

const SLA_RULES: SLARule[] = [
  {
    priority: "emergency",
    responseTimeMinutes: 15,
    resolutionTimeMinutes: 120,
    escalationChain: ["supervisor", "manager", "director"],
  },
  {
    priority: "urgent",
    responseTimeMinutes: 60,
    resolutionTimeMinutes: 480,
    escalationChain: ["supervisor", "manager"],
  },
  {
    priority: "high",
    responseTimeMinutes: 240,
    resolutionTimeMinutes: 1440,
    escalationChain: ["supervisor"],
  },
  {
    priority: "medium",
    responseTimeMinutes: 480,
    resolutionTimeMinutes: 4320,
    escalationChain: [],
  },
  {
    priority: "low",
    responseTimeMinutes: 1440,
    resolutionTimeMinutes: 10080,
    escalationChain: [],
  },
];
```

### Inventory Auto-Reorder

```typescript
// packages/inventory-core/src/reorder.ts

interface PartInventory {
  partId: string;
  partNumber: string;
  description: string;
  stockroom: string;
  quantityOnHand: number;
  quantityReserved: number; // Reserved for scheduled WOs
  reorderPoint: number;
  reorderQuantity: number;
  leadTimeDays: number;
  preferredVendorId: string;
  unitCost: number;
}

async function checkReorderPoints(
  stockroom: string,
): Promise<PurchaseRequisition[]> {
  const parts = await getPartsByStockroom(stockroom);
  const requisitions: PurchaseRequisition[] = [];

  for (const part of parts) {
    const available = part.quantityOnHand - part.quantityReserved;
    if (available <= part.reorderPoint) {
      requisitions.push({
        partId: part.partId,
        vendorId: part.preferredVendorId,
        quantity: part.reorderQuantity,
        estimatedCost: part.reorderQuantity * part.unitCost,
        urgency: available <= 0 ? "critical" : "standard",
      });
    }
  }

  return requisitions;
}
```

## Data Stack

- **PostgreSQL** — Work orders, facilities, inventory, vendors
- **Redis** — Real-time WO status, notification queue
- **S3/R2** — Attachments, floor plans, manuals
- **ClickHouse** — Maintenance analytics, cost reporting

## Compliance Standards

| Standard             | Requirements                   |
| -------------------- | ------------------------------ |
| **SOC2**             | Access controls, audit trails  |
| **OSHA**             | Safety compliance tracking     |
| **Joint Commission** | Healthcare facility compliance |
| **APPA**             | Educational facility standards |

## Getting Started

```bash
npx coding-engine init --domain cmms --name "FacilityHub" --compliance "SOC2,OSHA"
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
