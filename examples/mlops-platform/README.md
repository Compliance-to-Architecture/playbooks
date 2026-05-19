# MLOps Platform — Code Engine Example

> Built with the Coding Engine. End-to-end machine learning operations.

## What This Builds

An enterprise MLOps platform for ML lifecycle management:

- Model registry & versioning
- Feature store
- Training pipeline orchestration
- Experiment tracking
- Model serving & inference API
- A/B testing & canary deployments
- Model monitoring (drift, performance, fairness)
- Data lineage & governance
- GPU resource management
- Cost tracking per model/experiment

## Architecture

```
apps/
├── ml-studio/              # Experiment management & model builder
├── model-registry/         # Model catalog & versioning
├── monitoring-dashboard/   # Model performance & drift monitoring
├── feature-store-ui/       # Feature discovery & management
├── admin-portal/           # Platform admin (universal)

packages/
├── model-registry-core/    # Model versioning, metadata, artifacts
├── feature-store-core/     # Feature computation, storage, serving
├── pipeline-core/          # Training pipeline DAG orchestration
├── experiment-core/        # Experiment tracking & comparison
├── serving-core/           # Model serving (batch + real-time)
├── drift-detection-core/   # Data & concept drift monitoring
├── fairness-core/          # Bias detection & fairness metrics
├── lineage-core/           # Data & model lineage tracking
├── gpu-scheduler-core/     # GPU resource allocation
├── cost-tracking-core/     # Per-experiment cost tracking

services/
├── registry-api/           # Model registry service
├── feature-api/            # Feature serving API
├── pipeline-api/           # Training pipeline orchestration
├── serving-api/            # Model inference gateway
├── monitoring-api/         # Model monitoring & alerting
```

## Key Patterns

### Model Registry

```typescript
// packages/model-registry-core/src/registry.ts

interface ModelVersion {
  modelId: string;
  version: string;
  framework: "pytorch" | "tensorflow" | "sklearn" | "xgboost" | "onnx";
  metrics: Record<string, number>; // accuracy, f1, latency
  artifactUri: string; // S3 path to model artifacts
  datasetVersion: string;
  trainingConfig: Record<string, unknown>;
  stage: "development" | "staging" | "production" | "archived";
  createdBy: string;
  createdAt: Date;
}

async function promoteModel(
  modelId: string,
  version: string,
  toStage: string,
): Promise<void> {
  // 1. Run validation checks
  const model = await getModelVersion(modelId, version);
  assert(model.metrics.accuracy > 0.85, "Accuracy below threshold");

  // 2. Run fairness checks
  const fairness = await checkFairness(modelId, version);
  assert(fairness.disparateImpact < 0.2, "Fairness check failed");

  // 3. Promote
  await updateStage(modelId, version, toStage);

  // 4. If promoting to production, deploy
  if (toStage === "production") {
    await deployModel(modelId, version, { strategy: "canary", weight: 10 });
  }
}
```

### Drift Detection

```typescript
// packages/drift-detection-core/src/monitor.ts

interface DriftReport {
  modelId: string;
  timestamp: Date;
  dataDrift: { feature: string; psiScore: number; drifted: boolean }[];
  conceptDrift: {
    metric: string;
    baseline: number;
    current: number;
    degraded: boolean;
  }[];
  recommendation: "retrain" | "investigate" | "no_action";
}

async function checkDrift(modelId: string): Promise<DriftReport> {
  const baseline = await getBaselineDistribution(modelId);
  const current = await getCurrentDistribution(modelId);

  // Population Stability Index (PSI) for each feature
  const dataDrift = baseline.features.map((feature) => {
    const psi = calculatePSI(feature.baseline, feature.current);
    return { feature: feature.name, psiScore: psi, drifted: psi > 0.2 };
  });

  return {
    modelId,
    timestamp: new Date(),
    dataDrift,
    conceptDrift: [],
    recommendation: "no_action",
  };
}
```

## Compliance Standards

| Standard      | Requirements                         |
| ------------- | ------------------------------------ |
| **EU AI Act** | Model documentation, risk assessment |
| **SOC2**      | Data access controls, audit trails   |
| **GDPR**      | Data lineage, right to explanation   |
| **ISO 42001** | AI management system                 |

## Getting Started

```bash
npx coding-engine init --domain mlops --name "MLPlatform" --compliance "SOC2,GDPR,AI-Act"
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
