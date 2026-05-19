# Agentic AI Product — Code Engine Example

> Built with the Coding Engine. Autonomous AI workforce for enterprises.

## What This Builds

An agentic AI product where AI agents autonomously perform business tasks:

- Document processing agents (invoices, contracts, receipts)
- Customer support agents (ticket triage, resolution, escalation)
- Data entry agents (form filling, data extraction, validation)
- Research agents (market research, competitive analysis)
- Code review agents (PR review, security audit, style check)
- Compliance agents (policy checking, audit evidence)
- Scheduling agents (meeting coordination, resource allocation)

## Architecture

```
apps/
├── command-center/         # Agent fleet management dashboard
├── task-queue/             # Task assignment & monitoring
├── results-viewer/         # Agent output review & approval
├── customer-portal/        # Customer-facing agent interactions
├── admin-portal/           # Platform admin (universal)

packages/
├── task-router-core/       # Intelligent task routing to agents
├── document-ai-core/       # OCR, extraction, classification
├── conversation-core/      # Multi-turn conversation management
├── action-core/            # Real-world action execution (email, API calls)
├── quality-core/           # Output quality scoring & validation
├── feedback-core/          # Human feedback loop for improvement
├── guardrails-core/        # Safety guardrails & content filtering
├── cost-optimizer-core/    # Model selection for cost/quality tradeoff
├── replay-core/            # Task replay & debugging
├── sla-core/               # SLA tracking per task type

services/
├── orchestrator-api/       # Central task orchestration
├── document-ai-api/        # Document processing pipeline
├── conversation-api/       # Customer conversation management
├── quality-api/            # Quality assurance pipeline
├── feedback-api/           # Feedback collection & training
```

## Key Patterns

### Task Router (Cost-Optimized Model Selection)

```typescript
// packages/cost-optimizer-core/src/router.ts

interface TaskClassification {
  complexity: "simple" | "moderate" | "complex";
  domain: string;
  requiresTools: boolean;
  sensitiveData: boolean;
}

function selectModel(task: TaskClassification): ModelConfig {
  // Simple tasks → cheap model (Haiku)
  if (task.complexity === "simple" && !task.requiresTools) {
    return { model: "claude-haiku-4-5", maxTokens: 1024 };
  }
  // Moderate tasks → balanced model (Sonnet)
  if (task.complexity === "moderate") {
    return { model: "claude-sonnet-4-6", maxTokens: 4096 };
  }
  // Complex tasks → best model (Opus)
  return { model: "claude-opus-4-6", maxTokens: 8192 };
}
```

### Quality Assurance Pipeline

```typescript
// packages/quality-core/src/qa.ts

interface QualityCheck {
  accuracy: number; // 0-1 factual accuracy score
  completeness: number; // 0-1 task completion score
  safety: number; // 0-1 safety/guardrail score
  latency_ms: number;
  cost_usd: number;
}

async function evaluateOutput(
  task: Task,
  output: AgentOutput,
): Promise<QualityCheck> {
  // 1. Automated checks
  const safety = await checkGuardrails(output);
  const completeness = await checkCompleteness(task, output);

  // 2. If below threshold, escalate to human review
  if (safety < 0.95 || completeness < 0.7) {
    await escalateToHuman(task, output, { safety, completeness });
  }

  return {
    accuracy: 0,
    completeness,
    safety,
    latency_ms: output.duration,
    cost_usd: output.cost,
  };
}
```

## Compliance Standards

| Standard      | Requirements                                       |
| ------------- | -------------------------------------------------- |
| **EU AI Act** | Risk classification, human oversight, transparency |
| **SOC2**      | Security controls, audit trails                    |
| **GDPR**      | Data processing agreements, consent management     |
| **ISO 42001** | AI Management System standard                      |

## Getting Started

```bash
npx coding-engine init --domain agentic-ai --name "AgentForce" --compliance "SOC2,GDPR,AI-Act"
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
