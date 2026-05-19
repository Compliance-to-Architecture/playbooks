# Marketplace SaaS Platform — Code Engine Example

> Built with the Coding Engine. Multi-vendor marketplace with payments.

## What This Builds

A full marketplace platform with:

- Multi-vendor storefronts
- Product catalog + search
- Shopping cart + checkout
- Stripe Connect split payments
- Seller onboarding + KYC
- Order management + fulfillment
- Reviews + ratings
- Commission management
- Dispute resolution

## Architecture

```
apps/
├── marketplace-web/        # Buyer-facing marketplace (Next.js)
├── seller-portal/          # Seller dashboard + management
├── admin-portal/           # Platform admin (universal)
├── billing-dashboard/      # Commission + payout tracking

packages/
├── catalog-core/           # Product catalog management
├── search-core/            # Product search (Meilisearch)
├── cart-core/              # Shopping cart logic
├── checkout-core/          # Checkout flow + payment
├── marketplace-core/       # Stripe Connect integration
├── seller-core/            # Seller profiles + onboarding
├── order-core/             # Order lifecycle management
├── fulfillment-core/       # Shipping + delivery
├── review-core/            # Reviews + ratings
├── commission-core/        # Commission calculation
├── dispute-core/           # Buyer/seller dispute resolution
├── notification-core/      # Order + payout notifications

services/
├── catalog-api/            # Product management service
├── order-api/              # Order processing service
├── payment-api/            # Stripe Connect payments
├── seller-api/             # Seller management service
├── search-api/             # Search indexing service
```

## Billing Model

- **Platform fee**: Configurable commission (5-20% per transaction)
- **Seller subscriptions**: Monthly plan for seller accounts
- **Featured listings**: Pay-per-listing promotions
- **Buyer subscriptions**: Optional premium buyer membership

## Key Integrations

- **Stripe Connect** — Split payments, seller payouts
- **Meilisearch** — Product search + filtering
- **Cloudflare Images** — Product image CDN
- **ShipStation/EasyPost** — Shipping label generation
- **Sendgrid** — Transactional emails

## Getting Started

```bash
npx coding-engine init --domain marketplace --name "MarketHub" --compliance "SOC2,GDPR,PCI-DSS"
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
