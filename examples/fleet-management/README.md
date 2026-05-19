# Fleet & Vehicle Management Platform — Code Engine Example

> Built with the Coding Engine. From zero to production-grade fleet management platform with real-time vehicle tracking, driver compliance, and predictive maintenance.

## What This Builds

A comprehensive fleet and vehicle management platform with:

- **Vehicle Tracking** — Real-time GPS tracking, geofencing, route optimization, trip history
- **Driver Management** — CDL verification, hours of service (HOS), safety scorecards, training records
- **Fuel Management** — Fuel card integration, consumption analytics, theft detection, fuel tax reporting
- **Maintenance Management** — Preventive schedules, work orders, parts inventory, predictive diagnostics
- **DOT Compliance** — ELD integration, DVIR (Driver Vehicle Inspection Reports), audit readiness
- **Dispatch & Routing** — Load assignment, route planning, ETA calculation, customer notifications
- **Cost Analytics** — TCO per vehicle, cost-per-mile, depreciation tracking, budget forecasting
- **IFTA Reporting** — Interstate fuel tax calculation, quarterly filing, jurisdiction tracking

## Architecture

```
apps/
├── dispatcher-console/        # Fleet dispatcher workspace (Next.js 15)
├── driver-app/                # Driver mobile app (React Native / PWA)
├── maintenance-portal/        # Shop manager interface (Next.js 15)
├── admin-portal/              # Platform administration (Next.js 15)
├── customer-portal/           # Shipper/customer tracking portal
└── docs/                      # API documentation (VitePress)

packages/
├── vehicle-core/              # Vehicle inventory + lifecycle
├── tracking-core/             # GPS data processing + geofencing
├── driver-core/               # Driver records + CDL management
├── hos-core/                  # Hours of Service engine + ELD
├── fuel-core/                 # Fuel tracking + IFTA calculations
├── maintenance-core/          # Maintenance scheduling + work orders
├── dispatch-core/             # Load assignment + routing
├── compliance-core/           # DOT/FMCSA compliance engine
├── telematics-core/           # OBD-II/J1939 data parsing
├── auth-core/                 # Authentication + RBAC (universal)
├── billing-core/              # Stripe billing integration (universal)
├── tenant-core/               # Multi-tenancy isolation (universal)
└── audit-core/                # Audit trail (universal)

services/
├── tracking-api/              # GPS ingestion + geofencing (Hono)
├── driver-api/                # Driver management + HOS
├── maintenance-api/           # Work order orchestration
├── fuel-api/                  # Fuel data + IFTA reporting
├── dispatch-api/              # Route planning + load management
└── compliance-api/            # DOT audit + reporting
```

## Compliance Standards

| Standard        | Requirements                                                        |
| --------------- | ------------------------------------------------------------------- |
| **DOT/FMCSA**   | Federal Motor Carrier Safety Regulations, CSA scores, safety audits |
| **ELD Mandate** | Electronic Logging Device compliance, HOS recording, data transfer  |
| **IFTA**        | Interstate Fuel Tax Agreement quarterly reporting, fuel tax credits |
| **DVIR**        | Driver Vehicle Inspection Reports, pre-trip/post-trip documentation |
| **SOC2**        | Security controls, data protection, audit trails                    |
| **GDPR**        | Driver location data consent (EU operations), data retention        |

## Multi-Tenancy

Each fleet operator, trucking company, or logistics provider operates as an isolated tenant:

- **Database isolation**: Row-level security with `tenant_id`; GPS data in tenant-partitioned time-series tables
- **Tenant resolution**: Subdomain (`swiftlogistics.fleet-platform.com`) or API key
- **Fleet hierarchy**: Tenant -> Division -> Terminal -> Vehicle Group -> Vehicle
- **ELD data**: Per-tenant ELD data segregation with DOT-compliant retention (6 months minimum)
- **Integrations**: Per-tenant fuel card APIs, telematics providers, dispatch system connectors
- **Regulatory config**: Per-tenant DOT number, MC number, USDOT authority, jurisdiction list

```typescript
// Tenant-scoped vehicle query with location
const getVehicles = async (tenantId: string, filters: VehicleFilters) => {
  assert(tenantId, "Tenant ID required for vehicle queries");

  const vehicles = await db.vehicle.findMany({
    where: {
      tenant_id: tenantId,
      status: filters.status ?? "active",
      division_id: filters.divisionId,
    },
    include: {
      latest_position: true,
      current_driver: true,
      active_alerts: { where: { resolved: false } },
    },
  });
  assert(
    vehicles.length <= MAX_FLEET_QUERY_SIZE,
    `Query returned ${vehicles.length} vehicles, exceeds max ${MAX_FLEET_QUERY_SIZE}`,
  );
  return vehicles;
};
```

## Tech Stack

| Layer         | Technology              | Purpose                                  |
| ------------- | ----------------------- | ---------------------------------------- |
| Frontend      | Next.js 15, Sera UI     | Dispatcher console, maintenance portal   |
| API Framework | Hono                    | Lightweight, edge-ready API services     |
| Database      | PostgreSQL 16           | Primary data store with RLS              |
| Time Series   | TimescaleDB             | GPS positions, telematics, fuel data     |
| Cache         | Redis 7                 | Vehicle positions, session state         |
| Search        | Meilisearch             | Vehicle search, driver search            |
| Queue         | BullMQ                  | GPS ingestion, alert processing, reports |
| Maps          | Mapbox / Google Maps    | Route visualization, geofencing          |
| IoT           | MQTT + AWS IoT Core     | Telematics device communication          |
| Auth          | Clerk + custom RBAC     | Identity + role-based access             |
| Billing       | Stripe                  | Subscription + usage-based billing       |
| Monitoring    | OpenTelemetry + Grafana | Distributed tracing, metrics             |
| Edge          | Cloudflare Workers      | API routing, rate limiting               |

## Observability

Full-stack observability for fleet operations:

- **Distributed Tracing**: OpenTelemetry traces across tracking-api, dispatch-api, compliance-api
- **Metrics**: Vehicles tracked, GPS update frequency, HOS violations, maintenance backlog, fuel efficiency
- **Structured Logging**: JSON logs with `tenant_id`, `vehicle_id`, `driver_id`, `trip_id`, severity
- **Dashboards**: Grafana — Fleet Map, HOS Compliance, Fuel Analytics, Maintenance Pipeline
- **Alerting**: PagerDuty — GPS device offline > 30min, HOS violation imminent, geofence breach
- **SLOs**: 99.9% tracking API uptime, < 15s GPS-to-map latency, < 5s dispatch assignment

```typescript
logger.info({
  service: "tracking-api",
  event: "vehicle.position_updated",
  tenant_id: tenant.id,
  vehicle_id: vehicle.id,
  driver_id: driver.id,
  lat: position.lat,
  lng: position.lng,
  speed_mph: position.speed,
  heading: position.heading,
  odometer_miles: position.odometer,
  trace_id: span.traceId,
  timestamp: new Date().toISOString(),
});
```

## Health & Readiness Endpoints

Every service exposes standardized health checks:

```typescript
// services/tracking-api/src/routes/health.ts
import { Hono } from "hono";

const health = new Hono();

health.get("/health", async (c) => {
  const checks = {
    status: "healthy",
    service: "tracking-api",
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
    checkGeofenceRulesLoaded(),
  ]);
  const isReady = ready.every((r) => r.ok);
  return c.json({ ready: isReady, details: ready }, isReady ? 200 : 503);
});
```

## Failure Fingerprinting & Incident Response

All failures produce fingerprinted, structured error events:

```typescript
// packages/tracking-core/src/errors.ts
interface FleetFailure {
  fingerprint: string;
  service: string;
  severity: "critical" | "high" | "medium" | "low";
  category:
    | "tracking"
    | "compliance"
    | "maintenance"
    | "dispatch"
    | "infrastructure";
  tenant_id: string;
  error_code: string; // e.g., "GPS_DEVICE_OFFLINE", "HOS_VIOLATION"
  message: string;
  stack_trace: string;
  context: {
    vehicle_id?: string;
    driver_id?: string;
    dot_number?: string;
    compliance_impact?: boolean;
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

**Incident pipeline**: Failure detected -> Fingerprint generated -> Deduplicated -> If `compliance_impact: true`, trigger DOT compliance alert -> Auto-create fix PR or escalate -> Track in `/docs/incidents/`.

## Anti-Pattern Prevention & Memory

| Anti-Pattern                           | Prevention                                                   |
| -------------------------------------- | ------------------------------------------------------------ |
| GPS polling draining device battery    | Adaptive polling: 10s moving, 5min stationary, 30min parked  |
| HOS data gaps during connectivity loss | Local ELD buffer with store-and-forward; DOT-compliant sync  |
| Fuel theft undetected                  | Anomaly detection on fuel level drops vs. distance traveled  |
| Driver location tracked off-duty       | Personal conveyance mode stops location logging per FMCSA    |
| Maintenance overdue without alert      | Escalating notification chain: 7d, 3d, 1d, overdue           |
| IFTA data missing for jurisdictions    | GPS breadcrumb validation against jurisdiction boundary data |

**MEMORY.md template**:

```markdown
## Known Issues

- [ ] J1939 parser fails on pre-2010 engine protocols — add legacy fallback
- [ ] IFTA quarterly report generation times out for > 500 vehicles — implement pagination

## Resolved Incidents

- [INC-001] GPS positions 6hrs stale due to MQTT broker failover — added health check
- [INC-002] HOS violations miscalculated across timezone boundaries — fixed clock logic
```

## Billing & Monetization

**Subscription Tiers**:

| Tier        | Vehicles  | Drivers   | GPS Updates  | Price     |
| ----------- | --------- | --------- | ------------ | --------- |
| Small Fleet | 25        | 30        | 30s interval | $399/mo   |
| Regional    | 200       | 250       | 15s interval | $1,499/mo |
| Enterprise  | Unlimited | Unlimited | 10s interval | Custom    |

**Usage Metering** (Stripe Meters):

- `fleet.gps.updates` — GPS position updates per million
- `fleet.eld.drivers` — Active ELD-connected drivers
- `fleet.ifta.reports` — IFTA quarterly report generation
- `fleet.maintenance.workorders` — Work orders processed

**Billing Events**:

```typescript
await stripe.billing.meterEvents.create({
  event_name: "fleet.gps.updates",
  payload: {
    stripe_customer_id: tenant.stripeCustomerId,
    value: String(gpsBatchCount),
    vehicle_count: String(activeVehicles),
  },
});
```

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain fleet --name "FleetOS" \
  --compliance "DOT,FMCSA,ELD,IFTA"

# 2. Create domain packages
pnpm create @code-engine/package vehicle-core
pnpm create @code-engine/package tracking-core
pnpm create @code-engine/package hos-core
pnpm create @code-engine/package fuel-core

# 3. Start development
pnpm install
pnpm dev

# 4. Run compliance checks
pnpm run compliance:dot
pnpm run compliance:eld-audit
```

## Timeline

| Phase               | Duration     | Deliverable                           |
| ------------------- | ------------ | ------------------------------------- |
| Setup + Auth        | 2 days       | Auth, multi-tenancy, telematics setup |
| Vehicle Tracking    | 5 days       | GPS ingestion, geofencing, map UI     |
| Driver & HOS        | 5 days       | HOS engine, ELD integration, CDL mgmt |
| Fuel Management     | 3 days       | Fuel tracking, IFTA calculation       |
| Maintenance         | 4 days       | Work orders, predictive scheduling    |
| Dispatch & Routing  | 3 days       | Load management, route optimization   |
| Compliance + Launch | 3 days       | DOT audit prep, ELD certification     |
| **Total**           | **~5 weeks** | Production-ready fleet platform       |
