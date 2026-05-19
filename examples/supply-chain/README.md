# Supply Chain & Logistics Platform — Code Engine Example

> Built with the Coding Engine. End-to-end supply chain management with warehouse operations, shipment tracking, and demand planning.

## What This Builds

A SOC2-compliant supply chain and logistics platform with:

- Warehouse management system (WMS) with bin location tracking
- Real-time shipment tracking with carrier integration
- Demand planning and inventory optimization
- Procurement and purchase order management
- Fleet management and route optimization
- Supplier relationship management and scorecarding
- Customs and trade compliance document generation
- Supply chain analytics and KPI dashboards

## Architecture

```
apps/
├── operations-portal/       # Warehouse operations dashboard (Next.js)
├── logistics-portal/        # Shipment and fleet management
├── procurement-portal/      # Purchase orders and supplier management
├── planning-portal/         # Demand planning and forecasting
├── admin-portal/            # Platform admin (universal)
├── billing-dashboard/       # Subscription billing (universal)

packages/
├── warehouse-core/          # WMS: bins, zones, pick/pack/ship
├── shipment-core/           # Shipment lifecycle and tracking
├── carrier-core/            # Carrier integrations (FedEx, UPS, DHL)
├── demand-core/             # Demand forecasting and planning
├── inventory-core/          # Stock optimization and reorder points
├── procurement-core/        # Purchase orders, RFQ, sourcing
├── supplier-core/           # Supplier profiles and scorecards
├── fleet-core/              # Vehicle tracking and route optimization
├── customs-core/            # Trade compliance, HS codes, duties
├── barcode-core/            # Barcode/RFID scanning and labeling
├── auth-core/               # Authentication (universal)
├── billing-core/            # Stripe billing (universal)
├── tenant-core/             # Multi-tenancy (universal)
├── audit-core/              # Audit trail (universal)

services/
├── warehouse-api/           # WMS operations service (Hono)
├── shipment-api/            # Shipment tracking service
├── procurement-api/         # Purchase order service
├── demand-api/              # Demand planning service
├── fleet-api/               # Fleet management service
├── customs-api/             # Trade compliance service
```

## Compliance Standards

| Standard               | Requirements                                                 |
| ---------------------- | ------------------------------------------------------------ |
| **SOC2**               | Access controls, audit trails, encryption, incident response |
| **C-TPAT**             | Customs-Trade Partnership Against Terrorism                  |
| **CTPAT/AEO**          | Authorized Economic Operator, trusted trader programs        |
| **ITAR/EAR**           | Export controls for restricted goods                         |
| **FDA 21 CFR Part 11** | Electronic records for food/pharma supply chains             |
| **GS1**                | Global barcode and product identification standards          |
| **ISO 28000**          | Supply chain security management                             |

## Multi-Tenancy

Each tenant represents a distinct logistics operation or 3PL client:

- **Database isolation**: Row-level security with `tenant_id` on every table
- **Tenant routing**: Subdomain (`acme.scmcloud.com`), header, or JWT claim
- **Warehouse scope**: Each tenant manages its own warehouses, zones, and bin locations
- **Carrier accounts**: Tenant-specific carrier credentials and rate agreements
- **Compliance scope**: Each tenant configures applicable trade compliance jurisdictions

```typescript
// packages/tenant-core/src/middleware.ts
async function resolveTenant(c: Context): Promise<TenantContext> {
  const tenantId =
    extractFromSubdomain(c.req.url) ||
    c.req.header("X-Tenant-ID") ||
    extractFromJWT(c);

  assert(tenantId !== undefined, "Tenant resolution failed");

  const tenant = await getTenantConfig(tenantId);
  assert(tenant.status === "active", `Tenant ${tenantId} is not active`);

  return {
    tenantId,
    warehouses: tenant.warehouseIds,
    carrierAccounts: tenant.carrierAccounts,
    defaultUOM: tenant.defaultUnitOfMeasure,
    tradeComplianceRegions: tenant.tradeRegions,
  };
}
```

## Tech Stack

| Layer          | Technology           | Purpose                             |
| -------------- | -------------------- | ----------------------------------- |
| **Frontend**   | Next.js 15           | Operations portals and dashboards   |
| **UI**         | Sera UI              | Component library                   |
| **API**        | Hono                 | REST + RPC API services             |
| **Database**   | PostgreSQL 16        | Orders, inventory, shipments        |
| **Ledger**     | TigerBeetle          | Inventory value accounting          |
| **Cache**      | Redis 7              | Session, rate limiting, stock cache |
| **Search**     | Meilisearch          | Product, SKU, shipment search       |
| **Analytics**  | ClickHouse           | Supply chain KPIs, demand analysis  |
| **Geospatial** | PostGIS              | Fleet tracking, route optimization  |
| **Auth**       | Clerk + Cerbos       | RBAC with warehouse-level access    |
| **Billing**    | Stripe               | SaaS subscription + usage metering  |
| **Infra**      | AWS ECS + Cloudflare | Compute + edge routing              |

## Observability

| Dimension      | Tool / Pattern             | Details                                        |
| -------------- | -------------------------- | ---------------------------------------------- |
| **Logging**    | Structured JSON (pino)     | Every shipment event, pick, pack, receive      |
| **Tracing**    | OpenTelemetry + Axiom      | Distributed traces across WMS pipeline         |
| **Metrics**    | Prometheus + Grafana       | Order fill rate, on-time delivery, dwell time  |
| **Alerting**   | Grafana Alerts + PagerDuty | Stockouts, delayed shipments, carrier failures |
| **Audit**      | Immutable audit log        | Chain of custody for regulated goods           |
| **Dashboards** | Grafana                    | Warehouse utilization, carrier performance     |

```typescript
// Structured log for shipment tracking
logger.info({
  service: "shipment-api",
  event: "shipment_status_updated",
  tenant_id: ctx.tenantId,
  shipment_id: shipment.id,
  tracking_number: shipment.trackingNumber,
  carrier: shipment.carrier,
  status: shipment.status,
  location: shipment.currentLocation,
  eta: shipment.estimatedDelivery,
  request_id: ctx.requestId,
  trace_id: ctx.traceId,
});
```

## Health & Readiness Endpoints

Every service exposes structured health checks:

```typescript
// services/warehouse-api/src/routes/health.ts
app.get("/health", async (c) => {
  const checks = {
    status: "healthy",
    service: "warehouse-api",
    version: process.env.APP_VERSION,
    uptime_seconds: process.uptime(),
    checks: {
      database: await checkPostgres(),
      cache: await checkRedis(),
      search: await checkMeilisearch(),
      carrier_api: await checkCarrierConnectivity(),
    },
    timestamp: new Date().toISOString(),
  };

  const isHealthy = Object.values(checks.checks).every(
    (check) => check.status === "ok",
  );

  return c.json(checks, isHealthy ? 200 : 503);
});

app.get("/ready", async (c) => {
  const ready = (await checkPostgres()).status === "ok";
  return c.json({ ready }, ready ? 200 : 503);
});
```

## Failure Fingerprinting & Incident Response

All errors produce structured, fingerprinted JSON for automated triage:

```typescript
interface SupplyChainFailureEvent {
  fingerprint: string; // SHA256 of service + error_code + stack_signature
  service: "warehouse-api" | "shipment-api" | "procurement-api" | "fleet-api";
  severity: "critical" | "high" | "medium" | "low";
  error_code: string; // e.g., "CARRIER_API_TIMEOUT", "STOCKOUT_DETECTED", "CUSTOMS_HOLD"
  tenant_id: string;
  message: string;
  stack_trace: string;
  context: {
    shipment_id?: string;
    warehouse_id?: string;
    sku?: string;
    carrier?: string;
  };
  timestamp: string;
}

// Fingerprint generation
function fingerprint(error: SupplyChainFailureEvent): string {
  const signature = `${error.service}:${error.error_code}:${stackSignature(error.stack_trace)}`;
  return crypto
    .createHash("sha256")
    .update(signature)
    .digest("hex")
    .slice(0, 16);
}
```

**Incident pipeline**: Error detected -> fingerprinted -> deduplicated -> triage (auto or human) -> fix PR -> CI validates -> deploy -> verify -> close.

## Anti-Pattern Prevention & Memory

### Known Anti-Patterns

| Anti-Pattern                       | Prevention                                                    |
| ---------------------------------- | ------------------------------------------------------------- |
| Negative inventory quantities      | Assert stock >= 0 on every mutation; TigerBeetle enforces     |
| Carrier API calls without timeout  | All carrier calls have 10s timeout + circuit breaker          |
| Unbounded shipment history queries | All queries paginated with max 100 results per page           |
| Hardcoded carrier rate tables      | Rates fetched from carrier API, cached with 15-minute TTL     |
| Pick list generated for empty bin  | Pre-pick assertion: bin stock verified before pick assignment |
| Missing chain-of-custody logging   | Every goods movement logged with timestamp, user, location    |

### MEMORY.md Template

```markdown
## Supply Chain Lessons Learned

### Incident: Phantom Inventory After Warehouse Transfer (2025-06-20)

- **Root cause**: Transfer decremented source but increment at destination failed silently
- **Fix**: Transfer is a single atomic transaction in TigerBeetle
- **Prevention**: All inventory movements are ledger transactions, never partial updates

### Incident: Carrier Rate API Outage Blocked All Shipments (2025-08-03)

- **Root cause**: No fallback when primary carrier API was down
- **Fix**: Circuit breaker with cached rates as fallback
- **Prevention**: All carrier integrations have circuit breaker + cached fallback rates
```

## Billing & Monetization

| Tier             | Price     | Features                                                |
| ---------------- | --------- | ------------------------------------------------------- |
| **Starter**      | $199/mo   | 1 warehouse, 5,000 orders/mo, basic tracking            |
| **Growth**       | $499/mo   | 3 warehouses, 25,000 orders/mo, demand planning         |
| **Professional** | $1,299/mo | 10 warehouses, unlimited orders, fleet, customs         |
| **Enterprise**   | Custom    | Unlimited warehouses, API, white-label, dedicated infra |

### Usage Metering

```typescript
// Metered dimensions
const meters = {
  orders_fulfilled: "count", // Orders picked/packed/shipped
  shipments_tracked: "count", // Active shipment tracking events
  warehouses_active: "gauge", // Active warehouse locations
  api_calls: "count", // External API calls
  storage_pallets: "gauge", // Pallet positions occupied
};
```

### Billing Events

- `subscription.created` — New tenant onboarded
- `usage.order_fulfilled` — Order shipped from warehouse (metered)
- `usage.shipment_tracked` — Tracking event processed (metered)
- `subscription.warehouse_added` — New warehouse activated
- `subscription.upgraded` — Tier upgrade (warehouse/order limits)

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain supply-chain --name "ChainOps" \
  --compliance "SOC2,ISO28000,GS1"

# 2. Create domain packages
pnpm create @code-engine/package warehouse-core
pnpm create @code-engine/package shipment-core
pnpm create @code-engine/package procurement-core
pnpm create @code-engine/package demand-core
pnpm create @code-engine/package carrier-core

# 3. Start development
pnpm dev

# 4. Run compliance checks
pnpm test:compliance -- --standard soc2
```
