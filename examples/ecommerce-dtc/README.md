# Direct-to-Consumer E-Commerce Platform — Code Engine Example

> Built with the Coding Engine. Full-stack DTC commerce with storefront, checkout, inventory, and fulfillment.

## What This Builds

A PCI-DSS compliant direct-to-consumer e-commerce platform with:

- Headless storefront with server-side rendering and edge caching
- Shopping cart with real-time inventory reservation
- Multi-step checkout with payment gateway integration
- Inventory management across warehouses and channels
- Order fulfillment, shipping label generation, and delivery tracking
- Returns and refunds processing with RMA workflow
- Product recommendations and personalization engine
- Promotions, coupons, and loyalty program management

## Architecture

```
apps/
├── storefront/              # Customer-facing shop (Next.js)
├── merchant-portal/         # Merchant dashboard and analytics
├── warehouse-portal/        # Warehouse operations and inventory
├── admin-portal/            # Platform admin (universal)
├── billing-dashboard/       # Subscription billing (universal)

packages/
├── catalog-core/            # Product catalog, variants, categories
├── cart-core/               # Shopping cart and session management
├── checkout-core/           # Checkout flow and payment processing
├── inventory-core/          # Stock levels, reservations, warehouses
├── order-core/              # Order lifecycle management
├── fulfillment-core/        # Picking, packing, shipping
├── returns-core/            # RMA, refund, exchange processing
├── recommendation-core/     # Product recommendations engine
├── promotion-core/          # Discounts, coupons, loyalty points
├── pricing-core/            # Dynamic pricing, currency conversion
├── shipping-core/           # Shipping rates and label generation
├── auth-core/               # Authentication (universal)
├── billing-core/            # Stripe billing (universal)
├── tenant-core/             # Multi-tenancy (universal)
├── audit-core/              # Audit trail (universal)

services/
├── catalog-api/             # Product management service (Hono)
├── cart-api/                # Cart and session service
├── checkout-api/            # Checkout and payment service
├── inventory-api/           # Inventory management service
├── order-api/               # Order processing service
├── fulfillment-api/         # Fulfillment and shipping service
├── recommendation-api/      # Recommendation engine service
```

## Compliance Standards

| Standard                | Requirements                                                  |
| ----------------------- | ------------------------------------------------------------- |
| **PCI-DSS**             | Card data security, tokenization, SAQ compliance              |
| **GDPR**                | Customer data protection, consent, right to erasure           |
| **CCPA**                | California consumer privacy, do-not-sell                      |
| **Consumer Protection** | Transparent pricing, cancellation rights, delivery guarantees |
| **SOC2**                | Security controls, access logging, incident response          |
| **PSD2/SCA**            | Strong Customer Authentication for EU payments                |

## Multi-Tenancy

Each tenant represents a distinct brand or merchant:

- **Database isolation**: Row-level security with `tenant_id` on every table
- **Tenant routing**: Custom domain (`shop.mybrand.com`), subdomain, or path-based
- **Catalog isolation**: Products, categories, and pricing are tenant-scoped
- **Inventory scope**: Each tenant manages its own warehouses and stock levels
- **Payment config**: Tenant-specific payment gateway credentials and currencies

```typescript
// packages/tenant-core/src/middleware.ts
async function resolveTenant(c: Context): Promise<TenantContext> {
  const tenantId =
    extractFromCustomDomain(c.req.url) ||
    extractFromSubdomain(c.req.url) ||
    c.req.header("X-Tenant-ID") ||
    extractFromJWT(c);

  assert(tenantId !== undefined, "Tenant resolution failed");

  const tenant = await getTenantConfig(tenantId);
  assert(tenant.status === "active", `Tenant ${tenantId} is not active`);

  return {
    tenantId,
    storeCurrency: tenant.storeCurrency,
    taxStrategy: tenant.taxStrategy,
    shippingZones: tenant.shippingZones,
    paymentGateway: tenant.paymentGateway,
  };
}
```

## Tech Stack

| Layer         | Technology             | Purpose                            |
| ------------- | ---------------------- | ---------------------------------- |
| **Frontend**  | Next.js 15             | Storefront with SSR + ISR          |
| **UI**        | Sera UI                | Component library                  |
| **API**       | Hono                   | REST + RPC API services            |
| **Database**  | PostgreSQL 16          | Orders, customers, catalog         |
| **Ledger**    | TigerBeetle            | Payment reconciliation, gift cards |
| **Cache**     | Redis 7                | Cart sessions, inventory locks     |
| **Search**    | Meilisearch            | Product search with faceting       |
| **Analytics** | ClickHouse             | Sales analytics, funnel conversion |
| **CDN**       | Cloudflare Images/R2   | Product images and static assets   |
| **Auth**      | Clerk + Cerbos         | Customer + merchant authentication |
| **Payments**  | Stripe                 | Checkout, subscriptions, refunds   |
| **Shipping**  | EasyPost / ShipStation | Label generation, rate shopping    |
| **Infra**     | AWS ECS + Cloudflare   | Compute + edge caching             |

## Observability

| Dimension      | Tool / Pattern             | Details                                     |
| -------------- | -------------------------- | ------------------------------------------- |
| **Logging**    | Structured JSON (pino)     | Every order, payment, shipment, return      |
| **Tracing**    | OpenTelemetry + Axiom      | Distributed traces across checkout pipeline |
| **Metrics**    | Prometheus + Grafana       | Cart abandonment, checkout latency, GMV     |
| **Alerting**   | Grafana Alerts + PagerDuty | Payment failures, inventory stockouts       |
| **Audit**      | Immutable audit log        | PCI-DSS: payment access logging             |
| **Dashboards** | Grafana                    | Real-time revenue, conversion funnel, AOV   |

```typescript
// Structured log for order events
logger.info({
  service: "order-api",
  event: "order_placed",
  tenant_id: ctx.tenantId,
  order_id: order.id,
  customer_id: order.customerId,
  item_count: order.items.length,
  subtotal: order.subtotal,
  tax: order.tax,
  shipping_cost: order.shippingCost,
  total: order.total,
  payment_method: order.paymentMethod,
  request_id: ctx.requestId,
  trace_id: ctx.traceId,
});
```

## Health & Readiness Endpoints

Every service exposes structured health checks:

```typescript
// services/checkout-api/src/routes/health.ts
app.get("/health", async (c) => {
  const checks = {
    status: "healthy",
    service: "checkout-api",
    version: process.env.APP_VERSION,
    uptime_seconds: process.uptime(),
    checks: {
      database: await checkPostgres(),
      cache: await checkRedis(),
      payment_gateway: await checkStripe(),
      inventory_service: await checkInventoryAPI(),
    },
    timestamp: new Date().toISOString(),
  };

  const isHealthy = Object.values(checks.checks).every(
    (check) => check.status === "ok",
  );

  return c.json(checks, isHealthy ? 200 : 503);
});

app.get("/ready", async (c) => {
  const ready =
    (await checkPostgres()).status === "ok" &&
    (await checkStripe()).status === "ok";
  return c.json({ ready }, ready ? 200 : 503);
});
```

## Failure Fingerprinting & Incident Response

All errors produce structured, fingerprinted JSON for automated triage:

```typescript
interface EcommerceFailureEvent {
  fingerprint: string; // SHA256 of service + error_code + stack_signature
  service:
    | "catalog-api"
    | "cart-api"
    | "checkout-api"
    | "order-api"
    | "fulfillment-api";
  severity: "critical" | "high" | "medium" | "low";
  error_code: string; // e.g., "PAYMENT_DECLINED", "INVENTORY_OVERSOLD", "SHIPPING_RATE_UNAVAILABLE"
  tenant_id: string;
  message: string;
  stack_trace: string;
  context: {
    order_id?: string;
    cart_id?: string;
    product_id?: string;
    payment_intent_id?: string;
  };
  timestamp: string;
}

// Fingerprint generation
function fingerprint(error: EcommerceFailureEvent): string {
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

| Anti-Pattern                         | Prevention                                            |
| ------------------------------------ | ----------------------------------------------------- |
| Overselling without inventory locks  | Optimistic lock with Redis reservation on add-to-cart |
| Price displayed differs from charged | Price snapshot at cart-add, re-validated at checkout  |
| Floating-point currency math         | Use integer cents/minor units everywhere              |
| Unbounded cart item count            | Max 50 unique items per cart enforced in cart-core    |
| Missing idempotency on payment       | Payment intent ID used as idempotency key             |
| Shipping rates cached too long       | Rate cache TTL max 15 minutes, re-fetch at checkout   |

### MEMORY.md Template

```markdown
## E-Commerce DTC Lessons Learned

### Incident: Inventory Oversold During Flash Sale (2025-09-15)

- **Root cause**: Cart reservations expired mid-checkout, stock re-released
- **Fix**: Extended reservation TTL during active checkout session
- **Prevention**: Reservation heartbeat during checkout flow, 10-minute hard lock

### Incident: Duplicate Order Created on Payment Retry (2025-10-02)

- **Root cause**: Client retried after timeout, no server-side dedup
- **Fix**: Idempotency key on order creation, checked before insert
- **Prevention**: All mutation endpoints require idempotency key header
```

## Billing & Monetization

| Tier             | Price   | Features                                                 |
| ---------------- | ------- | -------------------------------------------------------- |
| **Starter**      | $29/mo  | 100 products, basic storefront, manual fulfillment       |
| **Growth**       | $79/mo  | 5,000 products, promotions, automated shipping           |
| **Professional** | $299/mo | Unlimited products, recommendations, multi-warehouse     |
| **Enterprise**   | Custom  | Custom domains, API access, white-label, dedicated infra |

### Usage Metering

```typescript
// Metered dimensions
const meters = {
  orders_processed: "count", // Orders placed
  products_listed: "gauge", // Active product listings
  bandwidth_gb: "gauge", // CDN bandwidth usage
  api_calls: "count", // External API calls
  storage_gb: "gauge", // Product image storage
};
```

### Billing Events

- `subscription.created` — New merchant onboarded
- `transaction.completed` — Order placed (platform commission)
- `usage.bandwidth` — CDN bandwidth consumed (metered overage)
- `usage.api_call` — API call made (metered overage)
- `subscription.upgraded` — Tier upgrade (product limit increase)

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain ecommerce-dtc --name "ShopDirect" \
  --compliance "PCI-DSS,GDPR,CCPA,SOC2"

# 2. Create domain packages
pnpm create @code-engine/package catalog-core
pnpm create @code-engine/package cart-core
pnpm create @code-engine/package checkout-core
pnpm create @code-engine/package inventory-core
pnpm create @code-engine/package order-core
pnpm create @code-engine/package fulfillment-core

# 3. Start development
pnpm dev

# 4. Run compliance checks
pnpm test:compliance -- --standard pci-dss
```
