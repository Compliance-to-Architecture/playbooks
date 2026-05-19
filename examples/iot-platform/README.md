# IoT Device Management Platform — Code Engine Example

> Built with the Coding Engine. From zero to production-grade IoT platform with device provisioning, telemetry ingestion at scale, edge computing, and OTA firmware updates.

## What This Builds

A comprehensive IoT device management platform with:

- **Device Provisioning** — Zero-touch enrollment, certificate management, device registry, fleet grouping
- **Telemetry Ingestion** — High-throughput data pipeline, protocol translation (MQTT/CoAP/HTTP), time-series storage
- **Edge Computing** — Edge function deployment, local data processing, offline operation, edge-to-cloud sync
- **OTA Updates** — Firmware distribution, staged rollouts, rollback capability, update verification
- **Alerts & Rules Engine** — Threshold-based alerts, complex event processing, notification routing
- **Digital Twin** — Device state modeling, simulation, predictive maintenance, what-if analysis
- **Device Security** — X.509 certificates, secure boot validation, anomaly detection, credential rotation
- **Fleet Analytics** — Device health scoring, connectivity metrics, utilization dashboards, cost analysis

## Architecture

```
apps/
├── fleet-console/             # Fleet management workspace (Next.js 15)
├── device-explorer/           # Individual device deep-dive
├── rules-editor/              # Alert rules + automation builder
├── admin-portal/              # Platform administration (Next.js 15)
├── developer-portal/          # SDK docs + API playground
└── docs/                      # API documentation (VitePress)

packages/
├── device-core/               # Device registry + lifecycle
├── telemetry-core/            # Data ingestion + processing
├── edge-core/                 # Edge function runtime
├── ota-core/                  # Firmware update management
├── rules-core/                # Alert rules engine
├── twin-core/                 # Digital twin modeling
├── security-core/             # Device authentication + certificates
├── protocol-core/             # MQTT/CoAP/HTTP protocol adapters
├── analytics-core/            # Fleet analytics + health scoring
├── auth-core/                 # Authentication + RBAC (universal)
├── billing-core/              # Stripe billing integration (universal)
├── tenant-core/               # Multi-tenancy isolation (universal)
└── audit-core/                # Audit trail (universal)

services/
├── registry-api/              # Device provisioning + management (Hono)
├── ingestion-api/             # Telemetry data pipeline
├── edge-api/                  # Edge function deployment
├── ota-api/                   # Firmware update orchestration
├── rules-api/                 # Alert evaluation + notification
└── analytics-api/             # Fleet metrics + reporting
```

## Compliance Standards

| Standard            | Requirements                                                         |
| ------------------- | -------------------------------------------------------------------- |
| **SOC2**            | Security controls, data integrity, system availability, audit trails |
| **ISO 27001**       | Information security management, risk assessment, access controls    |
| **GDPR**            | Device-collected personal data consent, data minimization, erasure   |
| **FCC**             | Radio frequency compliance, device certification, interference rules |
| **IEC 62443**       | Industrial automation security, network segmentation, zone modeling  |
| **ETSI EN 303 645** | Consumer IoT security baseline, default passwords, update mechanisms |

## Multi-Tenancy

Each IoT solution provider, manufacturer, or enterprise operates as an isolated tenant:

- **Database isolation**: Row-level security with `tenant_id`; telemetry in tenant-partitioned time-series tables
- **Tenant resolution**: API key with embedded `tenant_id` or JWT claim
- **Device namespace**: Tenant-scoped device IDs prevent cross-tenant collision
- **MQTT topics**: Tenant-prefixed topic hierarchy (`{tenant_id}/devices/{device_id}/telemetry`)
- **Certificate authority**: Per-tenant intermediate CA for device certificate issuance
- **Data retention**: Per-tenant configurable retention (7 days to 5 years) with lifecycle policies
- **Edge isolation**: Per-tenant edge function sandboxes with resource quotas

```typescript
// Tenant-scoped device registry query
const getDevices = async (tenantId: string, filters: DeviceFilters) => {
  assert(tenantId, "Tenant ID required for device queries");

  const devices = await db.device.findMany({
    where: {
      tenant_id: tenantId,
      status: filters.status,
      group_id: filters.groupId,
      firmware_version: filters.firmwareVersion,
    },
    include: {
      latest_telemetry: true,
      certificates: { where: { revoked: false } },
      active_alerts: { where: { acknowledged: false } },
    },
    take: Math.min(filters.limit ?? 100, MAX_DEVICE_QUERY_SIZE),
  });
  return devices;
};
```

## Tech Stack

| Layer          | Technology               | Purpose                               |
| -------------- | ------------------------ | ------------------------------------- |
| Frontend       | Next.js 15, Sera UI      | Fleet console, device explorer        |
| API Framework  | Hono                     | Lightweight, edge-ready API services  |
| Database       | PostgreSQL 16            | Device registry, rules, configuration |
| Time Series    | TimescaleDB / ClickHouse | High-volume telemetry storage         |
| Cache          | Redis 7                  | Device state, session, rate limiting  |
| Message Broker | EMQX / Mosquitto         | MQTT broker for device communication  |
| Queue          | Kafka / BullMQ           | Telemetry pipeline, alert processing  |
| Object Storage | S3                       | Firmware binaries, device logs        |
| Edge Runtime   | Cloudflare Workers       | Edge functions, protocol translation  |
| Auth           | Clerk + custom RBAC      | Human identity + device certificates  |
| Billing        | Stripe                   | Subscription + usage-based billing    |
| Monitoring     | OpenTelemetry + Grafana  | Platform observability                |

## Observability

Full-stack observability for IoT operations:

- **Distributed Tracing**: OpenTelemetry traces across ingestion-api, rules-api, ota-api
- **Metrics**: Connected devices, messages/sec, ingestion latency, OTA success rate, alert volume
- **Structured Logging**: JSON logs with `tenant_id`, `device_id`, `firmware_version`, severity
- **Dashboards**: Grafana — Fleet Health Map, Telemetry Pipeline, OTA Rollout, Alert Funnel
- **Alerting**: PagerDuty — ingestion pipeline lag > 30s, OTA failure rate > 5%, broker overload
- **SLOs**: 99.95% MQTT broker uptime, < 5s message-to-store latency, < 1hr OTA delivery

```typescript
logger.info({
  service: "ingestion-api",
  event: "telemetry.ingested",
  tenant_id: tenant.id,
  device_id: device.id,
  device_type: device.type,
  protocol: "mqtt",
  payload_bytes: message.byteLength,
  data_points: parsedPoints.length,
  trace_id: span.traceId,
  timestamp: new Date().toISOString(),
});
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
      database: await checkPostgres(),
      timeseries: await checkTimescaleDB(),
      redis: await checkRedis(),
      mqtt_broker: await checkMQTTBroker(),
      kafka: await checkKafkaProducer(),
    },
  };
  const allHealthy = Object.values(checks.checks).every(
    (c) => c.status === "up",
  );
  return c.json(checks, allHealthy ? 200 : 503);
});

health.get("/ready", async (c) => {
  const ready = await Promise.all([
    checkDatabaseMigrations(),
    checkMQTTTopicsReady(),
    checkKafkaConsumerGroups(),
  ]);
  const isReady = ready.every((r) => r.ok);
  return c.json({ ready: isReady, details: ready }, isReady ? 200 : 503);
});
```

## Failure Fingerprinting & Incident Response

All failures produce fingerprinted, structured error events:

```typescript
// packages/device-core/src/errors.ts
interface IoTFailure {
  fingerprint: string;
  service: string;
  severity: "critical" | "high" | "medium" | "low";
  category:
    | "ingestion"
    | "device"
    | "ota"
    | "security"
    | "edge"
    | "infrastructure";
  tenant_id: string;
  error_code: string; // e.g., "DEVICE_AUTH_FAIL", "OTA_ROLLBACK_TRIGGERED"
  message: string;
  stack_trace: string;
  context: {
    device_id?: string;
    device_count_affected?: number;
    firmware_version?: string;
    protocol?: string;
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

**Incident pipeline**: Failure detected -> Fingerprint generated -> Deduplicated -> If `category === "security"` and device auth anomaly, trigger security review + credential rotation -> Auto-create fix PR or escalate -> Track in `/docs/incidents/`.

## Anti-Pattern Prevention & Memory

| Anti-Pattern                           | Prevention                                                        |
| -------------------------------------- | ----------------------------------------------------------------- |
| Device credentials in plaintext        | X.509 certificates stored in HSM; TPM-backed on device side       |
| Telemetry flooding from rogue device   | Per-device rate limiting; anomaly detection auto-throttle         |
| OTA update bricking devices            | Staged rollout (1% -> 10% -> 100%); automatic rollback on failure |
| Single MQTT topic for all devices      | Tenant/device-scoped topic hierarchy; ACL enforcement             |
| Unbounded telemetry retention          | Per-tenant retention policies with automated lifecycle cleanup    |
| Edge functions with no resource limits | CPU/memory quotas per edge function; timeout enforcement          |

**MEMORY.md template**:

```markdown
## Known Issues

- [ ] EMQX shared subscription rebalancing causes 2s message gap — add client-side buffer
- [ ] CoAP-to-MQTT bridge drops binary payloads > 64KB — implement chunking

## Resolved Incidents

- [INC-001] OTA update bricked 50 devices — added firmware integrity check pre-flash
- [INC-002] Cross-tenant telemetry leak via wildcard MQTT subscription — enforced ACLs
```

## Billing & Monetization

**Subscription Tiers**:

| Tier       | Devices   | Messages/mo | Storage   | Price   |
| ---------- | --------- | ----------- | --------- | ------- |
| Prototype  | 100       | 1M          | 10 GB     | $99/mo  |
| Growth     | 10,000    | 100M        | 500 GB    | $999/mo |
| Enterprise | Unlimited | Unlimited   | Unlimited | Custom  |

**Usage Metering** (Stripe Meters):

- `iot.messages.ingested` — Telemetry messages per million
- `iot.devices.active` — Monthly active devices
- `iot.ota.deployments` — OTA firmware deployments
- `iot.storage.gb` — Telemetry and firmware storage

**Billing Events**:

```typescript
await stripe.billing.meterEvents.create({
  event_name: "iot.messages.ingested",
  payload: {
    stripe_customer_id: tenant.stripeCustomerId,
    value: String(messageBatchCount),
    protocol: "mqtt",
  },
});
```

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain iot --name "DeviceOS" \
  --compliance "SOC2,ISO27001,GDPR,FCC"

# 2. Create domain packages
pnpm create @code-engine/package device-core
pnpm create @code-engine/package telemetry-core
pnpm create @code-engine/package ota-core
pnpm create @code-engine/package security-core

# 3. Start development
pnpm install
pnpm dev

# 4. Run compliance checks
pnpm run compliance:soc2
pnpm run compliance:device-security-audit
```

## Timeline

| Phase               | Duration     | Deliverable                               |
| ------------------- | ------------ | ----------------------------------------- |
| Setup + Auth        | 2 days       | Auth, multi-tenancy, certificate infra    |
| Device Registry     | 4 days       | Provisioning, grouping, certificate mgmt  |
| Telemetry Pipeline  | 5 days       | MQTT ingestion, time-series storage       |
| OTA Updates         | 4 days       | Firmware distribution, staged rollouts    |
| Rules & Alerts      | 4 days       | Rules engine, notification routing        |
| Edge Computing      | 3 days       | Edge function deployment + runtime        |
| Compliance + Launch | 3 days       | Security audit, penetration test, go-live |
| **Total**           | **~5 weeks** | Production-ready IoT platform             |
