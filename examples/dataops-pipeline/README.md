# DataOps Pipeline Platform — Code Engine Example

> Built with the Coding Engine. Automated data pipeline orchestration.

## What This Builds

An enterprise DataOps platform for data pipeline management:

- Visual pipeline builder (DAG editor)
- Multi-source data ingestion (databases, APIs, files, streams)
- Data transformation & ELT orchestration
- Data quality monitoring & validation
- Data catalog & discovery
- Schema evolution management
- Pipeline monitoring & alerting
- Data lineage tracking
- Cost optimization per pipeline
- Self-service data access

## Architecture

```
apps/
├── pipeline-studio/        # Visual DAG builder & pipeline editor
├── data-catalog/           # Data asset discovery & documentation
├── quality-dashboard/      # Data quality metrics & monitoring
├── lineage-viewer/         # Data lineage visualization
├── admin-portal/           # Platform admin (universal)

packages/
├── pipeline-engine-core/   # DAG execution engine
├── connector-core/         # Source/sink connectors (50+)
├── transform-core/         # Data transformation library
├── quality-core/           # Data quality rules & validation
├── catalog-core/           # Data catalog & metadata management
├── schema-core/            # Schema registry & evolution
├── lineage-core/           # Column-level lineage tracking
├── scheduling-core/        # Cron-based & event-driven scheduling
├── alerting-core/          # Pipeline failure & SLA alerting
├── governance-core/        # Data governance policies

services/
├── orchestrator-api/       # Pipeline orchestration service
├── connector-api/          # Data connector management
├── quality-api/            # Quality check execution
├── catalog-api/            # Metadata management service
├── lineage-api/            # Lineage graph service
```

## Key Patterns

### Pipeline DAG Engine

```typescript
// packages/pipeline-engine-core/src/dag.ts

interface PipelineNode {
  id: string;
  type: "extract" | "transform" | "load" | "quality_check" | "notification";
  config: Record<string, unknown>;
  dependencies: string[]; // Node IDs that must complete first
  retryPolicy: { maxRetries: number; backoffMs: number };
  timeout_ms: number;
}

interface Pipeline {
  id: string;
  name: string;
  nodes: PipelineNode[];
  schedule: string; // Cron expression
  owner: string;
  tags: string[];
}

class DAGExecutor {
  async execute(pipeline: Pipeline): Promise<PipelineResult> {
    const graph = this.buildGraph(pipeline.nodes);
    const completed = new Set<string>();

    while (completed.size < pipeline.nodes.length) {
      // Find ready nodes (all dependencies completed)
      const ready = pipeline.nodes.filter(
        (n) =>
          !completed.has(n.id) && n.dependencies.every((d) => completed.has(d)),
      );

      // Execute ready nodes in parallel
      await Promise.all(ready.map((node) => this.executeNode(node)));

      for (const node of ready) completed.add(node.id);
    }

    return { status: "success", nodesExecuted: completed.size };
  }
}
```

### Data Quality Rules

```typescript
// packages/quality-core/src/rules.ts

interface QualityRule {
  name: string;
  type:
    | "completeness"
    | "uniqueness"
    | "freshness"
    | "validity"
    | "consistency";
  table: string;
  column?: string;
  threshold: number;
  severity: "critical" | "warning" | "info";
}

const QUALITY_RULES: QualityRule[] = [
  {
    name: "email_completeness",
    type: "completeness",
    table: "users",
    column: "email",
    threshold: 0.99,
    severity: "critical",
  },
  {
    name: "id_uniqueness",
    type: "uniqueness",
    table: "orders",
    column: "order_id",
    threshold: 1.0,
    severity: "critical",
  },
  {
    name: "data_freshness",
    type: "freshness",
    table: "events",
    threshold: 3600,
    severity: "warning",
  }, // seconds
  {
    name: "amount_validity",
    type: "validity",
    table: "transactions",
    column: "amount",
    threshold: 0.95,
    severity: "critical",
  },
];
```

## Data Stack

- **ClickHouse** — Analytics & time-series data
- **PostgreSQL** — Pipeline metadata, catalog
- **Redis** — Pipeline state, caching
- **S3/R2** — Raw data lake storage
- **dbt** — SQL-based transformations

## Getting Started

```bash
npx coding-engine init --domain dataops --name "DataFlow" --compliance "SOC2,GDPR"
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
