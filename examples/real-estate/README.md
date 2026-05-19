# Real Estate & Property Technology Platform — Code Engine Example

> Built with the Coding Engine. Full-stack PropTech with listings, tenant portal, lease management, and property operations.

## What This Builds

A compliance-ready real estate and property technology platform with:

- Property listings with search, filtering, and virtual tour integration
- Tenant portal with rent payments, maintenance requests, and lease documents
- Lease management with automated renewals and escalation clauses
- Maintenance and work order tracking with vendor dispatch
- Virtual tour hosting with 3D walkthrough integration
- Property analytics with occupancy, revenue, and expense tracking
- Owner/investor portal with financial reporting and distributions
- Agent/broker tools with CRM, showings, and commission tracking

## Architecture

```
apps/
├── listing-portal/          # Public property search and listings (Next.js)
├── tenant-portal/           # Tenant self-service (rent, maintenance)
├── property-manager-portal/ # Property management dashboard
├── owner-portal/            # Owner/investor financial reporting
├── agent-portal/            # Agent CRM and showing management
├── admin-portal/            # Platform admin (universal)
├── billing-dashboard/       # Subscription billing (universal)

packages/
├── listing-core/            # Property listings, MLS integration
├── lease-core/              # Lease creation, terms, renewals
├── tenant-mgmt-core/        # Tenant screening, communication
├── rent-core/               # Rent collection and payment processing
├── maintenance-core/        # Work orders, vendor dispatch
├── virtual-tour-core/       # 3D tour hosting and embedding
├── property-analytics-core/ # Occupancy, NOI, cap rate calculations
├── owner-reporting-core/    # Distribution statements, 1099 generation
├── agent-crm-core/          # Agent contacts, showings, commissions
├── compliance-core/         # Fair Housing, RESPA compliance engine
├── auth-core/               # Authentication (universal)
├── billing-core/            # Stripe billing (universal)
├── tenant-core/             # Multi-tenancy (universal)
├── audit-core/              # Audit trail (universal)

services/
├── listing-api/             # Property search and listing service (Hono)
├── lease-api/               # Lease management service
├── rent-api/                # Rent collection service
├── maintenance-api/         # Work order and dispatch service
├── analytics-api/           # Property analytics service
├── owner-api/               # Owner reporting and distribution service
```

## Compliance Standards

| Standard                  | Requirements                                                  |
| ------------------------- | ------------------------------------------------------------- |
| **Fair Housing**          | Non-discrimination in listings, advertising, tenant screening |
| **RESPA**                 | Real Estate Settlement Procedures Act, kickback prohibition   |
| **SOC2**                  | Security controls, access logging, incident response          |
| **GDPR**                  | Tenant/applicant data protection, right to erasure            |
| **State Landlord-Tenant** | Jurisdiction-specific lease requirements, security deposits   |
| **ADA/FHA**               | Accessibility requirements for listings and portals           |
| **SAR/BSA**               | Suspicious activity reporting for large transactions          |

## Multi-Tenancy

Each tenant represents a property management company or brokerage:

- **Database isolation**: Row-level security with `tenant_id` on every table
- **Tenant routing**: Subdomain (`acme.propcloud.com`), custom domain, or JWT claim
- **Property scope**: Properties, leases, and tenants are scoped to the management company
- **Payment config**: Tenant-specific payment gateway credentials and trust accounts
- **Jurisdiction rules**: Each tenant configures applicable state/local landlord-tenant laws

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
    jurisdictions: tenant.jurisdictions,
    trustAccountId: tenant.trustAccountId,
    listingSyndication: tenant.syndicationTargets,
    lateFeePolicies: tenant.lateFeePolicies,
  };
}
```

## Tech Stack

| Layer         | Technology           | Purpose                               |
| ------------- | -------------------- | ------------------------------------- |
| **Frontend**  | Next.js 15           | Portals with SSR for listing SEO      |
| **UI**        | Sera UI              | Component library                     |
| **API**       | Hono                 | REST + RPC API services               |
| **Database**  | PostgreSQL 16        | Properties, leases, tenants           |
| **Ledger**    | TigerBeetle          | Trust accounting, rent ledger         |
| **Cache**     | Redis 7              | Session, listing cache, rate limiting |
| **Search**    | Meilisearch          | Property search with geo-filtering    |
| **Analytics** | ClickHouse           | Occupancy trends, financial reporting |
| **Storage**   | Cloudflare R2        | Property photos and tour assets       |
| **Auth**      | Clerk + Cerbos       | RBAC: owner, manager, tenant, agent   |
| **Payments**  | Stripe               | Rent collection, ACH transfers        |
| **Infra**     | AWS ECS + Cloudflare | Compute + edge routing                |

## Observability

| Dimension      | Tool / Pattern             | Details                                        |
| -------------- | -------------------------- | ---------------------------------------------- |
| **Logging**    | Structured JSON (pino)     | Every lease event, rent payment, work order    |
| **Tracing**    | OpenTelemetry + Axiom      | Distributed traces across lease/rent pipeline  |
| **Metrics**    | Prometheus + Grafana       | Occupancy rate, collection rate, response time |
| **Alerting**   | Grafana Alerts + PagerDuty | Failed rent charges, overdue work orders       |
| **Audit**      | Immutable audit log        | Fair Housing: listing change log, screening    |
| **Dashboards** | Grafana                    | Portfolio NOI, vacancy trends, maintenance SLA |

```typescript
// Structured log for rent payment
logger.info({
  service: "rent-api",
  event: "rent_payment_received",
  tenant_id: ctx.tenantId,
  property_id: payment.propertyId,
  unit_id: payment.unitId,
  resident_id: payment.residentId,
  amount: payment.amount,
  payment_method: payment.method,
  lease_id: payment.leaseId,
  request_id: ctx.requestId,
  trace_id: ctx.traceId,
});
```

## Health & Readiness Endpoints

Every service exposes structured health checks:

```typescript
// services/lease-api/src/routes/health.ts
app.get("/health", async (c) => {
  const checks = {
    status: "healthy",
    service: "lease-api",
    version: process.env.APP_VERSION,
    uptime_seconds: process.uptime(),
    checks: {
      database: await checkPostgres(),
      ledger: await checkTigerBeetle(),
      cache: await checkRedis(),
      payment_gateway: await checkStripe(),
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
    (await checkTigerBeetle()).status === "ok";
  return c.json({ ready }, ready ? 200 : 503);
});
```

## Failure Fingerprinting & Incident Response

All errors produce structured, fingerprinted JSON for automated triage:

```typescript
interface RealEstateFailureEvent {
  fingerprint: string; // SHA256 of service + error_code + stack_signature
  service: "listing-api" | "lease-api" | "rent-api" | "maintenance-api";
  severity: "critical" | "high" | "medium" | "low";
  error_code: string; // e.g., "RENT_CHARGE_FAILED", "LEASE_RENEWAL_CONFLICT", "TRUST_ACCOUNT_IMBALANCE"
  tenant_id: string;
  message: string;
  stack_trace: string;
  context: {
    property_id?: string;
    lease_id?: string;
    unit_id?: string;
    work_order_id?: string;
  };
  timestamp: string;
}

// Fingerprint generation
function fingerprint(error: RealEstateFailureEvent): string {
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

| Anti-Pattern                           | Prevention                                                  |
| -------------------------------------- | ----------------------------------------------------------- |
| Commingling trust and operating funds  | Separate trust account ledger, enforced in TigerBeetle      |
| Fair Housing violation in listing text | NLP filter on listing descriptions before publish           |
| Lease renewal without notice period    | Assertion: renewal trigger only after notice period elapsed |
| Security deposit exceeding state limit | Jurisdiction-aware deposit cap enforced in lease-core       |
| Late fee applied before grace period   | Grace period assertion checked before late fee calculation  |
| Missing tenant screening consent       | FCRA consent required before screening API call             |

### MEMORY.md Template

```markdown
## Real Estate Lessons Learned

### Incident: Trust Account Out-of-Balance After Refund (2025-07-15)

- **Root cause**: Security deposit refund debited operating account instead of trust
- **Fix**: Refund routing enforced through trust account ledger
- **Prevention**: All trust transactions require trust_account_id assertion

### Incident: Lease Auto-Renewed Without Required 60-Day Notice (2025-09-01)

- **Root cause**: Notice period check used calendar days instead of business days
- **Fix**: Notice period calculation uses jurisdiction-specific rules
- **Prevention**: Jurisdiction config includes notice_type (calendar vs business days)
```

## Billing & Monetization

| Tier             | Price      | Features                                               |
| ---------------- | ---------- | ------------------------------------------------------ |
| **Starter**      | $1/unit/mo | Up to 50 units, rent collection, maintenance tracking  |
| **Professional** | $2/unit/mo | Up to 500 units, lease management, owner reporting     |
| **Enterprise**   | $3/unit/mo | Unlimited units, virtual tours, API, analytics, SSO    |
| **Platform**     | Custom     | White-label, dedicated infra, SLA, custom integrations |

### Usage Metering

```typescript
// Metered dimensions
const meters = {
  units_managed: "gauge", // Active rental units
  rent_payments_processed: "count", // Rent transactions processed
  maintenance_orders: "count", // Work orders created
  listings_published: "count", // Active property listings
  api_calls: "count", // External API calls
  storage_gb: "gauge", // Photo and document storage
};
```

### Billing Events

- `subscription.created` — New property management company onboarded
- `usage.rent_collected` — Rent payment processed (platform fee)
- `usage.listing_published` — Property listing activated (metered)
- `subscription.units_added` — Unit count increased
- `subscription.upgraded` — Tier upgrade (feature unlock)

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain real-estate --name "PropCloud" \
  --compliance "FairHousing,RESPA,SOC2,GDPR"

# 2. Create domain packages
pnpm create @code-engine/package listing-core
pnpm create @code-engine/package lease-core
pnpm create @code-engine/package rent-core
pnpm create @code-engine/package maintenance-core
pnpm create @code-engine/package property-analytics-core

# 3. Start development
pnpm dev

# 4. Run compliance checks
pnpm test:compliance -- --standard fair-housing,respa
```
