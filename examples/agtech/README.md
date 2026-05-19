# Agriculture & Precision Farming Platform — Code Engine Example

> Built with the Coding Engine. From zero to production-grade agtech platform with precision farming analytics, IoT crop monitoring, and supply chain traceability.

## What This Builds

A comprehensive agriculture technology platform with:

- **Crop Monitoring** — Satellite imagery analysis, NDVI mapping, growth stage tracking, pest/disease detection
- **Precision Farming** — Variable rate application maps, soil sampling, irrigation scheduling, yield prediction
- **Supply Chain Traceability** — Farm-to-fork tracking, lot management, quality certifications, recall readiness
- **Equipment Management** — Fleet tracking, maintenance scheduling, operator logs, fuel consumption
- **Weather Intelligence** — Hyperlocal forecasts, frost alerts, spray window optimization, growing degree days
- **Financial Management** — Cost-per-acre tracking, crop insurance, commodity pricing, profit analysis
- **Marketplace** — Input purchasing, harvest sales, contract farming, price discovery
- **Compliance Reporting** — USDA organic certification, EPA pesticide records, food safety documentation

## Architecture

```
apps/
├── farm-dashboard/            # Farmer workspace (Next.js 15)
├── agronomist-portal/         # Agronomist advisory tools
├── supply-chain-portal/       # Buyer/processor traceability
├── admin-portal/              # Platform administration (Next.js 15)
├── field-app/                 # Mobile field scouting app
└── docs/                      # API documentation (VitePress)

packages/
├── crop-core/                 # Crop lifecycle + growth models
├── field-core/                # Field mapping + boundaries
├── sensor-core/               # IoT sensor data ingestion
├── imagery-core/              # Satellite/drone image processing
├── weather-core/              # Weather data integration
├── equipment-core/            # Equipment tracking + maintenance
├── supply-chain-core/         # Traceability + lot management
├── compliance-core/           # Regulatory reporting engine
├── marketplace-core/          # Trading + contract management
├── auth-core/                 # Authentication + RBAC (universal)
├── billing-core/              # Stripe billing integration (universal)
├── tenant-core/               # Multi-tenancy isolation (universal)
└── audit-core/                # Audit trail (universal)

services/
├── crop-api/                  # Crop monitoring + analytics (Hono)
├── sensor-api/                # IoT data ingestion pipeline
├── imagery-api/               # Satellite image processing
├── weather-api/               # Weather aggregation service
├── traceability-api/          # Supply chain tracking
└── marketplace-api/           # Trading + price discovery
```

## Compliance Standards

| Standard         | Requirements                                                            |
| ---------------- | ----------------------------------------------------------------------- |
| **USDA**         | Organic certification tracking, crop reporting, conservation compliance |
| **EPA**          | Pesticide application records, restricted-use chemical tracking         |
| **FSMA**         | Food Safety Modernization Act — produce safety, traceability            |
| **GlobalG.A.P.** | Good Agricultural Practices certification support                       |
| **SOC2**         | Security controls, data protection, audit trails                        |
| **EU CAP**       | Common Agricultural Policy reporting for EU farmers                     |

## Multi-Tenancy

Each farm operation, cooperative, or agribusiness operates as an isolated tenant:

- **Database isolation**: Row-level security with `tenant_id`; geospatial data partitioned per tenant
- **Tenant resolution**: Subdomain (`smithfarms.agtech-platform.com`) or API key
- **Farm hierarchy**: Tenant -> Farm -> Field -> Zone -> Sensor; arbitrary nesting depth
- **Data ownership**: Farmers own their data; explicit consent for agronomist/buyer access
- **Regional config**: Per-tenant units (acres/hectares), currency, crop calendar, regulatory jurisdiction
- **Integration keys**: Per-tenant credentials for weather APIs, satellite providers, equipment telemetry

```typescript
// Tenant-scoped field query with geospatial bounds
const getFields = async (
  tenantId: string,
  farmId: string,
  bounds?: BoundingBox,
) => {
  assert(tenantId, "Tenant ID required for field queries");
  assert(farmId, "Farm ID required");

  const query: FieldQuery = {
    tenant_id: tenantId,
    farm_id: farmId,
  };
  if (bounds) {
    assert(isValidBBox(bounds), "Invalid bounding box coordinates");
    query.geometry = { $within: bounds };
  }
  return db.field.findMany({ where: query });
};
```

## Tech Stack

| Layer          | Technology              | Purpose                               |
| -------------- | ----------------------- | ------------------------------------- |
| Frontend       | Next.js 15, Sera UI     | Farm dashboard, field mapping         |
| API Framework  | Hono                    | Lightweight, edge-ready API services  |
| Database       | PostgreSQL 16 + PostGIS | Primary store with geospatial queries |
| Time Series    | TimescaleDB             | Sensor data, weather history          |
| Cache          | Redis 7                 | Session state, weather cache          |
| Search         | Meilisearch             | Crop search, product catalog          |
| Queue          | BullMQ                  | Image processing, sensor ingestion    |
| Object Storage | S3                      | Satellite imagery, drone photos       |
| Maps           | Mapbox / Google Maps    | Field mapping, zone visualization     |
| IoT            | MQTT + AWS IoT Core     | Sensor data collection                |
| Auth           | Clerk + custom RBAC     | Identity + role-based access          |
| Billing        | Stripe                  | Subscription + usage-based billing    |
| Monitoring     | OpenTelemetry + Grafana | Distributed tracing, metrics          |
| Edge           | Cloudflare Workers      | API routing, rate limiting            |

## Observability

Full-stack observability for agricultural reliability:

- **Distributed Tracing**: OpenTelemetry traces across sensor-api, imagery-api, crop-api
- **Metrics**: Sensor data ingestion rate, imagery processing time, API latency, field coverage
- **Structured Logging**: JSON logs with `tenant_id`, `farm_id`, `field_id`, `sensor_id`, severity
- **Dashboards**: Grafana — Sensor Pipeline Health, Imagery Processing Queue, Weather API Status
- **Alerting**: PagerDuty — sensor offline > 2hrs, imagery processing backlog, weather API failures
- **SLOs**: 99.9% API uptime, < 30min sensor-to-dashboard latency, < 1hr imagery processing

```typescript
logger.info({
  service: "sensor-api",
  event: "sensor.data_ingested",
  tenant_id: tenant.id,
  farm_id: farm.id,
  field_id: field.id,
  sensor_type: "soil_moisture",
  data_points: batch.length,
  trace_id: span.traceId,
  timestamp: new Date().toISOString(),
});
```

## Health & Readiness Endpoints

Every service exposes standardized health checks:

```typescript
// services/sensor-api/src/routes/health.ts
import { Hono } from "hono";

const health = new Hono();

health.get("/health", async (c) => {
  const checks = {
    status: "healthy",
    service: "sensor-api",
    version: process.env.APP_VERSION,
    timestamp: new Date().toISOString(),
    checks: {
      database: await checkPostgres(),
      timescale: await checkTimescaleDB(),
      redis: await checkRedis(),
      mqtt_broker: await checkMQTTConnection(),
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
    checkMQTTSubscriptions(),
    checkWeatherAPICredentials(),
  ]);
  const isReady = ready.every((r) => r.ok);
  return c.json({ ready: isReady, details: ready }, isReady ? 200 : 503);
});
```

## Failure Fingerprinting & Incident Response

All failures produce fingerprinted, structured error events:

```typescript
// packages/sensor-core/src/errors.ts
interface AgTechFailure {
  fingerprint: string;
  service: string;
  severity: "critical" | "high" | "medium" | "low";
  category:
    | "sensor"
    | "imagery"
    | "weather"
    | "traceability"
    | "infrastructure";
  tenant_id: string;
  error_code: string; // e.g., "SENSOR_OFFLINE", "IMAGERY_PROCESS_FAIL"
  message: string;
  stack_trace: string;
  context: {
    farm_id?: string;
    field_id?: string;
    sensor_id?: string;
    crop_impact?: string;
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

**Incident pipeline**: Failure detected -> Fingerprint generated -> Deduplicated -> If `category === "sensor"` and critical crop phase, trigger agronomist alert -> Auto-create fix PR or escalate -> Track in `/docs/incidents/`.

## Anti-Pattern Prevention & Memory

| Anti-Pattern                          | Prevention                                                      |
| ------------------------------------- | --------------------------------------------------------------- |
| Sensor data gaps during connectivity  | Edge buffer with store-and-forward; data reconciliation on sync |
| Imagery stored without georeference   | Mandatory EXIF/geotag validation before storage                 |
| Pesticide records missing application | Structured record required with product, rate, weather, timing  |
| Equipment GPS polling too frequent    | Adaptive polling based on movement; 15s min interval            |
| Weather data from single provider     | Multi-provider aggregation with consensus scoring               |
| Supply chain records without lot ID   | Lot assignment enforced at harvest entry; blocks downstream     |

**MEMORY.md template**:

```markdown
## Known Issues

- [ ] Sentinel-2 imagery cloud cover > 80% returns empty tiles — add fallback to radar
- [ ] MQTT broker reconnection storm after outage — implement exponential backoff

## Resolved Incidents

- [INC-001] Soil moisture sensors reporting NaN — fixed with input validation + calibration
- [INC-002] Traceability gap when lot split at processor — added split/merge tracking
```

## Billing & Monetization

**Subscription Tiers**:

| Tier       | Acres     | Sensors   | Fields    | Price   |
| ---------- | --------- | --------- | --------- | ------- |
| Small Farm | 500       | 20        | 10        | $149/mo |
| Commercial | 5,000     | 200       | 100       | $599/mo |
| Enterprise | Unlimited | Unlimited | Unlimited | Custom  |

**Usage Metering** (Stripe Meters):

- `agtech.sensor.datapoints` — Billed per 1M sensor data points above tier
- `agtech.imagery.acres` — Satellite imagery processed per acre
- `agtech.traceability.lots` — Supply chain lot tracking events
- `agtech.weather.api_calls` — Weather API query volume

**Billing Events**:

```typescript
await stripe.billing.meterEvents.create({
  event_name: "agtech.imagery.acres",
  payload: {
    stripe_customer_id: tenant.stripeCustomerId,
    value: String(processedAcres),
    imagery_type: "ndvi",
  },
});
```

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain agriculture --name "AgriOS" \
  --compliance "USDA,EPA,FSMA"

# 2. Create domain packages
pnpm create @code-engine/package crop-core
pnpm create @code-engine/package sensor-core
pnpm create @code-engine/package supply-chain-core
pnpm create @code-engine/package field-core

# 3. Start development
pnpm install
pnpm dev

# 4. Run compliance checks
pnpm run compliance:usda
pnpm run compliance:fsma-traceability
```

## Timeline

| Phase               | Duration     | Deliverable                           |
| ------------------- | ------------ | ------------------------------------- |
| Setup + Auth        | 2 days       | Auth, multi-tenancy, geospatial setup |
| Crop Monitoring     | 5 days       | Field mapping, growth tracking, NDVI  |
| Sensor Pipeline     | 4 days       | IoT ingestion, alerting, dashboards   |
| Precision Farming   | 4 days       | VRA maps, irrigation scheduling       |
| Supply Chain        | 4 days       | Lot tracking, certifications          |
| Equipment           | 3 days       | GPS tracking, maintenance scheduling  |
| Compliance + Launch | 3 days       | USDA/EPA records, FSMA audit, go-live |
| **Total**           | **~5 weeks** | Production-ready agtech platform      |
