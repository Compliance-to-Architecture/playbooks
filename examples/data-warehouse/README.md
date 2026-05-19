# Data Warehouse Platform — Code Engine Example

> Built with the Coding Engine. Modern cloud data warehouse.

## What This Builds

A modern data warehouse platform with:

- Multi-source data ingestion (CDC, batch, streaming)
- Medallion architecture (Bronze → Silver → Gold)
- Semantic layer (metrics definitions, business glossary)
- Self-service analytics (SQL editor, visualizations)
- Data modeling (dbt-compatible)
- Access control & row-level security
- Query optimization & caching
- Materialized views & incremental processing
- Data sharing & marketplace

## Architecture

```
apps/
├── analytics-studio/       # SQL editor & visualization builder
├── semantic-layer/         # Metrics definitions & business glossary
├── data-explorer/          # Schema browser & data preview
├── governance-portal/      # Access control & audit
├── admin-portal/           # Platform admin (universal)

packages/
├── ingestion-core/         # CDC, batch, stream ingestion
├── storage-core/           # Columnar storage engine (ClickHouse)
├── query-engine-core/      # SQL query compilation & optimization
├── semantic-core/          # Metrics layer & business logic
├── modeling-core/          # dbt-compatible data modeling
├── caching-core/           # Query result caching
├── materialization-core/   # Materialized views & incremental
├── access-control-core/    # Column & row-level security
├── sharing-core/           # Cross-org data sharing
├── lineage-core/           # Column-level lineage

services/
├── ingestion-api/          # Data ingestion gateway
├── query-api/              # Query execution service
├── semantic-api/           # Metrics & definitions API
├── governance-api/         # Access control service
├── sharing-api/            # Data marketplace service
```

## Key Patterns

### Medallion Architecture

```
Bronze (Raw)          Silver (Cleaned)       Gold (Business)
┌──────────┐         ┌──────────────┐       ┌─────────────┐
│ Raw JSON │────────▶│ Validated,   │──────▶│ Aggregated, │
│ CSV, API │ ingest  │ Deduplicated │ model │ Business    │
│ CDC logs │         │ Typed        │       │ Ready       │
└──────────┘         └──────────────┘       └─────────────┘
```

```typescript
// packages/modeling-core/src/medallion.ts

interface ModelDefinition {
  name: string;
  layer: "bronze" | "silver" | "gold";
  materialization: "table" | "view" | "incremental";
  sql: string;
  tests: Array<{
    type: "not_null" | "unique" | "accepted_values";
    column: string;
  }>;
  freshness: { warnAfter: string; errorAfter: string };
}

// Silver layer: clean and deduplicate
const silverOrders: ModelDefinition = {
  name: "silver_orders",
  layer: "silver",
  materialization: "incremental",
  sql: `
    SELECT DISTINCT
      order_id,
      customer_id,
      toDecimal64(amount, 2) as amount,
      parseDateTimeBestEffort(created_at) as created_at
    FROM bronze_orders
    WHERE order_id IS NOT NULL
      AND amount > 0
    {% if is_incremental() %}
      AND created_at > (SELECT max(created_at) FROM {{ this }})
    {% endif %}
  `,
  tests: [
    { type: "not_null", column: "order_id" },
    { type: "unique", column: "order_id" },
  ],
  freshness: { warnAfter: "1 hour", errorAfter: "6 hours" },
};
```

### Semantic Layer

```typescript
// packages/semantic-core/src/metrics.ts

interface MetricDefinition {
  name: string;
  label: string;
  description: string;
  type: "sum" | "count" | "average" | "ratio" | "cumulative";
  expression: string;
  dimensions: string[];
  filters?: Record<string, unknown>;
  owner: string;
  certified: boolean;
}

const metrics: MetricDefinition[] = [
  {
    name: "revenue",
    label: "Total Revenue",
    description: "Sum of all completed order amounts",
    type: "sum",
    expression: "SUM(gold_orders.amount)",
    dimensions: ["date", "region", "product_category"],
    filters: { status: "completed" },
    owner: "finance-team",
    certified: true,
  },
  {
    name: "active_users",
    label: "Monthly Active Users",
    description: "Distinct users with at least one action in the last 30 days",
    type: "count",
    expression: "COUNT(DISTINCT user_id)",
    dimensions: ["date", "plan", "region"],
    owner: "product-team",
    certified: true,
  },
];
```

## Data Stack

- **ClickHouse** — Primary analytical storage (columnar, fast)
- **PostgreSQL** — Metadata, governance, user data
- **Redis** — Query caching, session state
- **S3/R2** — Raw data lake (Bronze layer)
- **Kafka/Redpanda** — Real-time streaming ingestion

## Compliance Standards

| Standard  | Requirements                                     |
| --------- | ------------------------------------------------ |
| **SOC2**  | Access controls, audit trails, encryption        |
| **GDPR**  | Data masking, right to erasure, consent tracking |
| **CCPA**  | Consumer data rights                             |
| **HIPAA** | PHI column-level encryption (if healthcare data) |

## Getting Started

```bash
npx coding-engine init --domain data-warehouse --name "DataVault" --compliance "SOC2,GDPR"
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
