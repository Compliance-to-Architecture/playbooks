# Energy Trading Platform — Code Engine Example

> Built with the Coding Engine. Enterprise-grade energy commodity trading.

## What This Builds

A regulated energy trading platform with:

- Real-time energy market data feeds
- Trade execution + order management
- Position management + P&L tracking
- Risk management + limits
- Regulatory reporting (REMIT, EMIR)
- Settlement + invoicing
- Carbon credit tracking

## Architecture

```
apps/
├── trading-dashboard/      # Trader workstation (Next.js)
├── risk-dashboard/         # Risk management view
├── operations-portal/      # Back-office operations
├── admin-portal/           # Platform admin (universal)
├── compliance-portal/      # Regulatory reporting

packages/
├── market-data-core/       # Real-time price feeds
├── order-management-core/  # Order lifecycle
├── position-core/          # Position tracking + P&L
├── risk-core/              # VaR, limits, exposure
├── settlement-core/        # Trade settlement
├── carbon-credit-core/     # Carbon credit tracking
├── remit-reporting-core/   # REMIT regulatory reporting
├── emir-reporting-core/    # EMIR trade reporting
├── counterparty-core/      # Counterparty management

services/
├── trading-api/            # Trade execution engine
├── market-data-api/        # Price feed aggregation
├── risk-api/               # Real-time risk calculations
├── settlement-api/         # Settlement processing
├── reporting-api/          # Regulatory report generation
```

## Compliance Standards

| Standard     | Requirements                                |
| ------------ | ------------------------------------------- |
| **REMIT**    | EU energy market integrity, trade reporting |
| **EMIR**     | European derivatives reporting              |
| **MiFID II** | Trading transparency, best execution        |
| **NERC CIP** | Critical infrastructure cybersecurity       |
| **SOC2**     | Security controls                           |

## Key Integrations

- **ICE/CME** — Exchange connectivity
- **Reuters/Bloomberg** — Market data feeds
- **Stripe** — Platform billing
- **TigerBeetle** — Double-entry trade accounting
- **ClickHouse** — Time-series analytics for trading data

## Getting Started

```bash
npx coding-engine init --domain energy --name "EnergyTrading" --compliance "REMIT,EMIR,MiFID2,SOC2"
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
