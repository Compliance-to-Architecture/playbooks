# FinOps Platform — Code Engine Example

> Built with the Coding Engine. Cloud cost optimization & financial operations.

## What This Builds

An enterprise FinOps platform for cloud cost management:

- Multi-cloud cost aggregation (AWS, GCP, Azure, Cloudflare)
- Real-time cost dashboards & anomaly detection
- Budget management & alerting
- Resource right-sizing recommendations
- Reserved instance / savings plan optimization
- Showback & chargeback reporting
- Unit economics tracking (cost per customer, per API call)
- Forecasting & trend analysis
- Waste detection (idle resources, orphaned storage)

## Architecture

```
apps/
├── finops-dashboard/       # Cost analytics & visualization (Next.js)
├── budget-manager/         # Budget creation & tracking
├── optimization-hub/       # Right-sizing & savings recommendations
├── chargeback-portal/      # Team/project cost allocation
├── admin-portal/           # Platform admin (universal)

packages/
├── cost-aggregator-core/   # Multi-cloud cost data ingestion
├── anomaly-detection-core/ # Cost spike detection (ML-based)
├── budget-core/            # Budget tracking & alerting
├── rightsizing-core/       # Resource optimization engine
├── savings-core/           # RI/SP recommendation engine
├── chargeback-core/        # Cost allocation & showback
├── forecast-core/          # Cost forecasting models
├── waste-detection-core/   # Idle resource detection
├── unit-economics-core/    # Per-unit cost calculation
├── tagging-core/           # Resource tagging governance
├── policy-core/            # Cost governance policies

services/
├── ingestion-api/          # Cost data pipeline (CUR, billing exports)
├── analytics-api/          # ClickHouse-backed analytics
├── recommendation-api/     # Optimization recommendations
├── alerting-api/           # Budget alerts & anomaly notifications
├── forecast-api/           # Cost forecasting service
```

## Key Patterns

### Multi-Cloud Cost Ingestion

```typescript
// packages/cost-aggregator-core/src/ingest.ts

interface CostRecord {
  provider: "aws" | "gcp" | "azure" | "cloudflare";
  accountId: string;
  service: string;
  resource: string;
  region: string;
  usageType: string;
  amount: number;
  currency: string;
  date: string;
  tags: Record<string, string>;
}

// Ingest AWS Cost & Usage Report
async function ingestAWSCUR(
  s3Bucket: string,
  prefix: string,
): Promise<CostRecord[]> {
  const manifest = await s3.getObject({
    Bucket: s3Bucket,
    Key: `${prefix}/manifest.json`,
  });
  // Parse CUR Parquet files and normalize to CostRecord format
}

// Ingest GCP Billing Export
async function ingestGCPBilling(
  bigqueryDataset: string,
): Promise<CostRecord[]> {
  // Query BigQuery billing export and normalize
}
```

### Anomaly Detection

```typescript
// packages/anomaly-detection-core/src/detector.ts

async function detectAnomalies(
  service: string,
  window: number = 30, // days of history
): Promise<AnomalyResult[]> {
  const history = await getCostHistory(service, window);
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const stddev = Math.sqrt(
    history.reduce((sum, val) => sum + (val - mean) ** 2, 0) / history.length,
  );

  const todayCost = await getTodayCost(service);
  const zScore = (todayCost - mean) / stddev;

  if (Math.abs(zScore) > 2.5) {
    return [
      {
        service,
        todayCost,
        expectedCost: mean,
        deviation: zScore,
        severity: zScore > 3.5 ? "critical" : "high",
      },
    ];
  }
  return [];
}
```

## Data Stack

- **ClickHouse** — Cost time-series analytics (billions of records)
- **PostgreSQL** — Budgets, policies, user data
- **Redis** — Real-time cost aggregation cache
- **S3** — Raw CUR/billing data storage

## Compliance Standards

| Standard              | Requirements                  |
| --------------------- | ----------------------------- |
| **SOC2**              | Access controls, audit trails |
| **FinOps Foundation** | Crawl/Walk/Run maturity model |
| **ISO 27001**         | Information security          |

## Getting Started

```bash
npx coding-engine init --domain finops --name "CloudCostIQ" --compliance "SOC2,ISO27001"
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
