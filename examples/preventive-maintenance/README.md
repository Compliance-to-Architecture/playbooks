# Preventive Maintenance Platform — Code Engine Example

> Built with the Coding Engine. Predictive and preventive maintenance operations.

## What This Builds

An enterprise preventive maintenance platform for equipment reliability:

- Work order management (preventive, corrective, predictive)
- Maintenance scheduling (calendar, meter-based, condition-based)
- Equipment hierarchy & criticality analysis
- Spare parts inventory management
- IoT sensor integration for condition monitoring
- Failure mode analysis (FMEA/RCA)
- Technician dispatching & mobile app
- KPI dashboards (MTBF, MTTR, OEE, availability)
- Compliance tracking (OSHA, FDA 21 CFR Part 11)
- Integration with SCADA/PLC systems

## Architecture

```
apps/
├── maintenance-hub/        # Work order management & scheduling
├── technician-app/         # Mobile field technician app (PWA)
├── monitoring-dashboard/   # Real-time equipment monitoring
├── parts-manager/          # Spare parts inventory & procurement
├── admin-portal/           # Platform admin (universal)

packages/
├── work-order-core/        # Work order CRUD, workflow, approvals
├── scheduling-core/        # PM scheduling engine (calendar, meter, condition)
├── equipment-core/         # Equipment registry, hierarchy, criticality
├── parts-core/             # Spare parts inventory, reorder points
├── sensor-core/            # IoT sensor data ingestion & alerting
├── failure-analysis-core/  # FMEA, RCA, failure pattern recognition
├── dispatch-core/          # Technician assignment & route optimization
├── kpi-core/               # MTBF, MTTR, OEE calculations
├── compliance-core/        # OSHA, FDA, regulatory tracking
├── integration-core/       # SCADA/PLC/BMS protocol adapters

services/
├── maintenance-api/        # Work order & scheduling service
├── monitoring-api/         # Sensor data processing & alerting
├── parts-api/              # Inventory management service
├── dispatch-api/           # Technician dispatch service
├── analytics-api/          # KPI computation & reporting
```

## Key Patterns

### Maintenance Scheduling Engine

```typescript
// packages/scheduling-core/src/scheduler.ts

interface MaintenanceSchedule {
  id: string;
  equipmentId: string;
  type: "calendar" | "meter" | "condition";
  // Calendar-based
  intervalDays?: number;
  // Meter-based
  meterType?: "hours" | "cycles" | "miles" | "units_produced";
  meterInterval?: number;
  // Condition-based
  sensorId?: string;
  threshold?: { metric: string; operator: "gt" | "lt" | "eq"; value: number };
  // Common
  procedure: string;
  estimatedDurationMinutes: number;
  requiredSkills: string[];
  requiredParts: { partId: string; quantity: number }[];
  priority: "critical" | "high" | "medium" | "low";
}

async function generateWorkOrders(
  schedules: MaintenanceSchedule[],
): Promise<WorkOrder[]> {
  const workOrders: WorkOrder[] = [];

  for (const schedule of schedules) {
    if (schedule.type === "calendar") {
      const lastCompleted = await getLastCompletedDate(schedule.id);
      const daysSince = daysBetween(lastCompleted, new Date());
      if (daysSince >= (schedule.intervalDays ?? 0)) {
        workOrders.push(createWorkOrder(schedule));
      }
    }

    if (schedule.type === "meter") {
      const currentReading = await getMeterReading(
        schedule.equipmentId,
        schedule.meterType!,
      );
      const lastReading = await getLastServiceReading(schedule.id);
      if (currentReading - lastReading >= (schedule.meterInterval ?? 0)) {
        workOrders.push(createWorkOrder(schedule));
      }
    }

    if (schedule.type === "condition") {
      const sensorValue = await getSensorReading(schedule.sensorId!);
      if (evaluateThreshold(sensorValue, schedule.threshold!)) {
        workOrders.push(createWorkOrder(schedule, "condition_triggered"));
      }
    }
  }

  return workOrders;
}
```

### KPI Calculations

```typescript
// packages/kpi-core/src/metrics.ts

interface EquipmentKPIs {
  mtbf_hours: number; // Mean Time Between Failures
  mttr_hours: number; // Mean Time To Repair
  availability: number; // % uptime
  oee: number; // Overall Equipment Effectiveness
  pm_compliance: number; // % of PMs completed on time
}

function calculateMTBF(totalUptime: number, failureCount: number): number {
  return failureCount > 0 ? totalUptime / failureCount : totalUptime;
}

function calculateOEE(
  availability: number,
  performance: number,
  quality: number,
): number {
  return availability * performance * quality;
}
```

## Data Stack

- **PostgreSQL** — Work orders, equipment, parts inventory
- **InfluxDB/ClickHouse** — Time-series sensor data
- **Redis** — Real-time sensor alerts, dispatch queue
- **S3/R2** — Procedures, manuals, photos, inspection reports
- **MQTT** — IoT sensor data ingestion

## Compliance Standards

| Standard               | Requirements                                   |
| ---------------------- | ---------------------------------------------- |
| **OSHA**               | Equipment safety, lockout/tagout procedures    |
| **FDA 21 CFR Part 11** | Electronic records, audit trails (pharma/food) |
| **ISO 14224**          | Reliability data collection & analysis         |
| **ISO 55000**          | Asset management system alignment              |

## Getting Started

```bash
npx coding-engine init --domain preventive-maintenance --name "MaintainPro" --compliance "OSHA,ISO14224"
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

## Billing & Monetization

### Subscription Tiers

| Tier           | Limits                                                                            | Price      |
| -------------- | --------------------------------------------------------------------------------- | ---------- |
| **Free**       | 1,000 API calls/month, 1 user, community support                                  | $0/month   |
| **Pro**        | 50,000 API calls/month, 10 users, email support, analytics                        | $49/month  |
| **Business**   | 500,000 API calls/month, unlimited users, priority support, SSO, audit logs       | $199/month |
| **Enterprise** | Unlimited, dedicated infrastructure, SLA, compliance reports, custom integrations | Custom     |

### Usage Metering

All API calls are metered via Stripe Usage Records:

```typescript
await stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
  quantity: 1,
  timestamp: Math.floor(Date.now() / 1000),
  action: "increment",
});
```

### Billing Events

| Event                    | Trigger         | Action                             |
| ------------------------ | --------------- | ---------------------------------- |
| `subscription.created`   | New signup      | Provision tenant resources         |
| `subscription.updated`   | Plan change     | Adjust resource limits             |
| `subscription.deleted`   | Cancellation    | Schedule data retention + cleanup  |
| `invoice.payment_failed` | Payment failure | Grace period → downgrade → suspend |
| `usage_record.created`   | API call        | Increment usage counter            |
