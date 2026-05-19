# Security Operations Center Platform — Code Engine Example

> Built with the Coding Engine. From zero to production-grade SOC platform with real-time threat detection, automated incident response, and unified vulnerability management.

## What This Builds

A comprehensive cybersecurity operations platform with:

- **SIEM Engine** — Log ingestion, correlation rules, real-time event analysis at scale
- **Threat Detection** — ML-based anomaly detection, IOC matching, MITRE ATT&CK mapping
- **Incident Response** — Automated playbooks, case management, evidence collection, chain of custody
- **Vulnerability Management** — Scanner integration, risk scoring (CVSS/EPSS), remediation tracking
- **Compliance Dashboard** — Continuous compliance monitoring, evidence generation, audit readiness
- **Threat Intelligence** — Feed aggregation, IOC enrichment, threat actor profiling
- **Asset Inventory** — CMDB integration, attack surface mapping, exposure scoring
- **Reporting & Analytics** — Executive dashboards, trend analysis, MTTD/MTTR metrics

## Architecture

```
apps/
├── analyst-console/           # SOC analyst workspace (Next.js 15)
├── executive-dashboard/       # CISO/executive reporting (Next.js 15)
├── admin-portal/              # Platform administration (Next.js 15)
├── threat-intel-portal/       # Threat intelligence management
└── docs/                      # API documentation (VitePress)

packages/
├── siem-core/                 # Log parsing, normalization, correlation
├── detection-core/            # Detection rules engine + ML models
├── incident-core/             # Case management + playbook execution
├── vuln-core/                 # Vulnerability lifecycle management
├── threat-intel-core/         # IOC feeds, enrichment, scoring
├── asset-core/                # Asset inventory + attack surface
├── compliance-core/           # Compliance framework mapping
├── playbook-core/             # SOAR playbook definitions
├── auth-core/                 # Authentication + RBAC (universal)
├── billing-core/              # Stripe billing integration (universal)
├── tenant-core/               # Multi-tenancy isolation (universal)
└── audit-core/                # Audit trail (universal)

services/
├── ingestion-api/             # Log/event ingestion pipeline (Hono)
├── correlation-api/           # Event correlation + alerting
├── incident-api/              # Incident lifecycle management
├── vuln-api/                  # Vulnerability scan orchestration
├── intel-api/                 # Threat intelligence aggregation
└── reporting-api/             # Analytics + report generation
```

## Compliance Standards

| Standard         | Requirements                                                            |
| ---------------- | ----------------------------------------------------------------------- |
| **SOC2 Type II** | Security controls, monitoring, incident response, change management     |
| **ISO 27001**    | ISMS framework, risk assessment, control objectives, internal audits    |
| **NIST CSF**     | Identify, Protect, Detect, Respond, Recover framework alignment         |
| **MITRE ATT&CK** | Technique coverage mapping, detection gap analysis, threat modeling     |
| **GDPR**         | Log data minimization, PII handling in security events, DPO access      |
| **PCI-DSS**      | Log retention (1 year), file integrity monitoring, IDS/IPS requirements |

## Multi-Tenancy

Each managed security customer operates as an isolated tenant:

- **Database isolation**: Dedicated schemas per tenant; log data in tenant-partitioned ClickHouse tables
- **Tenant resolution**: Subdomain (`acme.soc-platform.io`) or API key with embedded `tenant_id`
- **Log segregation**: Ingestion pipelines tag and route logs to tenant-specific partitions; no cross-tenant log leakage
- **Detection rules**: Tenant-specific custom rules layered on top of shared community detection rules
- **Data retention**: Per-tenant configurable retention (30 days to 7 years) with automated lifecycle policies
- **RBAC**: Tenant-scoped roles — SOC Analyst, Incident Commander, Compliance Officer, Read-Only Auditor

```typescript
// Tenant-scoped log query
const queryLogs = async (tenantId: string, query: LogQuery) => {
  assert(tenantId, "Tenant ID is required for all log queries");
  assert(
    query.timeRange.end - query.timeRange.start <= MAX_QUERY_WINDOW_MS,
    `Query window exceeds maximum of ${MAX_QUERY_WINDOW_MS}ms`,
  );

  return clickhouse.query({
    query: `SELECT * FROM security_events
            WHERE tenant_id = {tenantId: String}
            AND timestamp BETWEEN {start: DateTime} AND {end: DateTime}
            ORDER BY timestamp DESC
            LIMIT {limit: UInt32}`,
    params: {
      tenantId,
      start: query.timeRange.start,
      end: query.timeRange.end,
      limit: query.limit ?? 1000,
    },
  });
};
```

## Tech Stack

| Layer         | Technology              | Purpose                                   |
| ------------- | ----------------------- | ----------------------------------------- |
| Frontend      | Next.js 15, Sera UI     | Analyst console, executive dashboard      |
| API Framework | Hono                    | Lightweight, edge-ready API services      |
| Event Store   | ClickHouse              | High-volume security event analytics      |
| Database      | PostgreSQL 16           | Cases, assets, rules, configuration       |
| Cache         | Redis 7                 | Alert dedup, session state, rate limiting |
| Queue         | Kafka / BullMQ          | Log ingestion pipeline, alert routing     |
| Search        | Meilisearch             | IOC search, case search, asset lookup     |
| ML Pipeline   | Python + ONNX           | Anomaly detection, behavioral analysis    |
| Auth          | Clerk + custom RBAC     | Identity + role-based access              |
| Billing       | Stripe                  | Subscription + usage-based billing        |
| Monitoring    | OpenTelemetry + Grafana | Platform observability                    |
| Edge          | Cloudflare Workers      | Log receiver endpoints, rate limiting     |

## Observability

Full-stack observability for the platform itself (meta-monitoring):

- **Distributed Tracing**: OpenTelemetry traces across ingestion, correlation, alerting pipelines
- **Metrics**: Ingestion EPS (events/sec), correlation rule match rate, alert volume, MTTD, MTTR
- **Structured Logging**: JSON logs with `tenant_id`, `rule_id`, `incident_id`, severity, trace correlation
- **Dashboards**: Grafana — Ingestion Pipeline Health, Detection Coverage, Incident Funnel, Platform SLOs
- **Alerting**: PagerDuty — ingestion lag > 60s, correlation engine backpressure, storage approaching limits
- **SLOs**: 99.9% ingestion availability, < 30s event-to-alert latency, < 5min MTTD for critical threats

```typescript
// Ingestion pipeline metrics
const metrics = {
  events_ingested_total: new Counter({
    name: "soc_events_ingested_total",
    labels: ["tenant", "source"],
  }),
  ingestion_latency_ms: new Histogram({
    name: "soc_ingestion_latency_ms",
    buckets: [10, 50, 100, 500, 1000],
  }),
  correlation_matches: new Counter({
    name: "soc_correlation_matches_total",
    labels: ["rule_id", "severity"],
  }),
  active_incidents: new Gauge({
    name: "soc_active_incidents",
    labels: ["tenant", "severity"],
  }),
};
```

## Health & Readiness Endpoints

Every service exposes standardized health checks:

```typescript
// services/ingestion-api/src/routes/health.ts
import { Hono } from "hono";

const health = new Hono();

health.get("/health", async (c) => {
  const checks = {
    status: "healthy",
    service: "ingestion-api",
    version: process.env.APP_VERSION,
    timestamp: new Date().toISOString(),
    checks: {
      clickhouse: await checkClickHouse(),
      kafka: await checkKafkaProducer(),
      redis: await checkRedis(),
      postgres: await checkPostgres(),
    },
  };
  const allHealthy = Object.values(checks.checks).every(
    (c) => c.status === "up",
  );
  return c.json(checks, allHealthy ? 200 : 503);
});

health.get("/ready", async (c) => {
  const ready = await Promise.all([
    checkClickHouseTables(),
    checkCorrelationRulesLoaded(),
    checkKafkaTopicsExist(),
  ]);
  const isReady = ready.every((r) => r.ok);
  return c.json({ ready: isReady, details: ready }, isReady ? 200 : 503);
});
```

## Failure Fingerprinting & Incident Response

All platform failures produce fingerprinted, structured error events:

```typescript
// packages/siem-core/src/errors.ts
interface SOCPlatformFailure {
  fingerprint: string;
  service: string;
  severity: "critical" | "high" | "medium" | "low";
  category:
    | "ingestion"
    | "detection"
    | "correlation"
    | "storage"
    | "integration";
  tenant_id: string;
  error_code: string; // e.g., "INGESTION_LAG", "RULE_COMPILE_FAIL"
  message: string;
  stack_trace: string;
  context: {
    events_affected?: number;
    rule_id?: string;
    source_type?: string;
  };
  timestamp: string;
  trace_id: string;
}

function generateFingerprint(error: Error, service: string): string {
  const normalized =
    error.stack
      ?.split("\n")
      .slice(0, 5)
      .map((line) => line.replace(/:\d+:\d+/g, ":0:0"))
      .join("\n") ?? error.message;
  return createHash("sha256")
    .update(`${service}:${normalized}`)
    .digest("hex")
    .slice(0, 16);
}
```

**Incident pipeline**: Platform failure detected -> Fingerprint generated -> Deduplicated -> If `category === "ingestion"` and EPS drops > 50%, trigger P1 escalation -> Auto-create fix PR or escalate -> Track in `/docs/incidents/`.

## Anti-Pattern Prevention & Memory

| Anti-Pattern                       | Prevention                                                              |
| ---------------------------------- | ----------------------------------------------------------------------- |
| Logging sensitive customer data    | PII scrubber in ingestion pipeline; blocked at schema level             |
| Unbounded log queries              | Mandatory time range + limit on all ClickHouse queries                  |
| Alert fatigue from noisy rules     | Alert tuning scores; auto-suppress rules with > 95% false positive rate |
| Single-threaded ingestion          | Kafka partitioned by tenant; horizontal scaling per partition           |
| Detection rules without test cases | Rule CI pipeline requires >=1 true positive + 1 true negative test      |
| Hardcoded IOC lists                | Dynamic threat intel feeds with automated staleness expiry              |

**MEMORY.md template**:

```markdown
## Known Issues

- [ ] ClickHouse MergeTree partitions need manual optimization above 10TB
- [ ] Sigma rule converter handles 80% of rules — complex OR chains need manual review

## Resolved Incidents

- [INC-001] Ingestion pipeline OOM at 50K EPS — fixed with backpressure + batch sizing
- [INC-002] Cross-tenant log leak via shared Kafka topic — fixed with tenant-partitioned topics
```

## Billing & Monetization

**Subscription Tiers**:

| Tier         | EPS      | Retention | Assets    | Price     |
| ------------ | -------- | --------- | --------- | --------- |
| Starter      | 1,000    | 30 days   | 500       | $2,499/mo |
| Professional | 10,000   | 90 days   | 5,000     | $9,999/mo |
| Enterprise   | 100,000+ | 1 year+   | Unlimited | Custom    |

**Usage Metering** (Stripe Meters):

- `soc.events.ingested` — Billed per million events above tier
- `soc.storage.gb` — Log storage beyond retention tier
- `soc.incidents.managed` — Incident case management volume
- `soc.scans.executed` — Vulnerability scan executions

**Billing Events**:

```typescript
await stripe.billing.meterEvents.create({
  event_name: "soc.events.ingested",
  payload: {
    stripe_customer_id: tenant.stripeCustomerId,
    value: String(eventBatchCount),
    source_type: sourceType,
  },
});
```

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain cybersecurity --name "SOCPlatform" \
  --compliance "SOC2,ISO27001,NIST-CSF"

# 2. Create domain packages
pnpm create @code-engine/package siem-core
pnpm create @code-engine/package detection-core
pnpm create @code-engine/package incident-core
pnpm create @code-engine/package threat-intel-core

# 3. Start development
pnpm install
pnpm dev

# 4. Run security validation
pnpm run compliance:soc2
pnpm run detection:coverage-report
```

## Timeline

| Phase               | Duration     | Deliverable                             |
| ------------------- | ------------ | --------------------------------------- |
| Setup + Auth        | 2 days       | Auth, multi-tenancy, audit trail        |
| Ingestion Pipeline  | 5 days       | Log parsing, normalization, ClickHouse  |
| Detection Engine    | 5 days       | Correlation rules, ML anomaly detection |
| Incident Response   | 4 days       | Case management, playbooks, evidence    |
| Vuln Management     | 4 days       | Scanner integration, risk scoring       |
| Threat Intel        | 3 days       | Feed aggregation, IOC enrichment        |
| Compliance + Launch | 3 days       | Framework mapping, evidence packs       |
| **Total**           | **~5 weeks** | Production-ready SOC platform           |
