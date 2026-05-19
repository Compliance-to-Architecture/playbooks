# Hotel & Hospitality Management Platform — Code Engine Example

> Built with the Coding Engine. From zero to production-grade hospitality platform with unified property management, revenue optimization, and guest experience personalization.

## What This Builds

A comprehensive hotel and hospitality management platform with:

- **Property Management System (PMS)** — Reservations, check-in/check-out, room assignments, folio management
- **Revenue Management** — Dynamic pricing, demand forecasting, rate parity, channel optimization
- **Guest Experience** — Profile management, loyalty programs, personalized offers, mobile key
- **Housekeeping Operations** — Room status tracking, task assignment, inspection checklists, supply management
- **Food & Beverage** — POS integration, menu management, room service, banquet/event catering
- **Channel Manager** — OTA distribution (Booking.com, Expedia), direct booking engine, rate sync
- **Concierge & Activities** — Local experiences, transportation, spa bookings, guest requests
- **Multi-Property Management** — Portfolio dashboards, cross-property reporting, centralized rate management

## Architecture

```
apps/
├── front-desk/                # Front desk operations (Next.js 15)
├── guest-portal/              # Guest-facing app + mobile key
├── revenue-dashboard/         # Revenue management workspace
├── housekeeping-app/          # Housekeeping mobile interface
├── admin-portal/              # Platform administration (Next.js 15)
└── docs/                      # API documentation (VitePress)

packages/
├── reservation-core/          # Booking engine + availability
├── room-core/                 # Room inventory + assignments
├── guest-core/                # Guest profiles + preferences
├── revenue-core/              # Pricing engine + forecasting
├── housekeeping-core/         # Task management + room status
├── fnb-core/                  # Food & beverage operations
├── channel-core/              # OTA distribution + rate sync
├── loyalty-core/              # Points, tiers, rewards
├── payment-core/              # PCI-compliant payment processing
├── auth-core/                 # Authentication + RBAC (universal)
├── billing-core/              # Stripe billing integration (universal)
├── tenant-core/               # Multi-tenancy isolation (universal)
└── audit-core/                # Audit trail (universal)

services/
├── reservation-api/           # Booking lifecycle (Hono)
├── guest-api/                 # Guest profile management
├── revenue-api/               # Dynamic pricing engine
├── housekeeping-api/          # Task orchestration
├── channel-api/               # OTA sync + distribution
└── payment-api/               # Payment processing + PCI
```

## Compliance Standards

| Standard        | Requirements                                                              |
| --------------- | ------------------------------------------------------------------------- |
| **PCI-DSS**     | Cardholder data encryption, tokenization, network segmentation, SAQ       |
| **GDPR**        | Guest consent, data portability, right to erasure, cross-border transfers |
| **ADA**         | Accessible booking, room descriptions, assistive device compatibility     |
| **PSD2/SCA**    | Strong Customer Authentication for European card payments                 |
| **Local Tax**   | Automated tourist tax, city tax, VAT calculation per jurisdiction         |
| **Fire/Safety** | Room occupancy tracking for emergency evacuation compliance               |

## Multi-Tenancy

Each hotel property or hotel group operates as an isolated tenant:

- **Database isolation**: Row-level security with `tenant_id`; payment data in PCI-scoped encrypted tables
- **Tenant resolution**: Subdomain (`grandhotel.hospitality-platform.com`) or custom domain
- **Property hierarchy**: Tenant -> Property Group -> Individual Property -> Room Types -> Rooms
- **Currency & locale**: Per-tenant currency, date format, timezone, language configuration
- **Channel credentials**: Per-tenant OTA API keys stored in encrypted vault
- **Branding**: White-label guest portal with property-specific theming, logos, imagery

```typescript
// Property-scoped availability check
const checkAvailability = async (
  tenantId: string,
  propertyId: string,
  query: AvailabilityQuery,
) => {
  assert(tenantId, "Tenant ID required");
  assert(query.checkIn < query.checkOut, "Check-in must precede check-out");
  assert(
    query.nights <= MAX_STAY_NIGHTS,
    `Stay exceeds maximum of ${MAX_STAY_NIGHTS} nights`,
  );

  const inventory = await db.roomInventory.findMany({
    where: {
      tenant_id: tenantId,
      property_id: propertyId,
      date: { gte: query.checkIn, lt: query.checkOut },
      available: { gt: 0 },
    },
  });
  assert(inventory.length > 0, "No availability for requested dates");
  return buildAvailabilityResponse(inventory, query);
};
```

## Tech Stack

| Layer         | Technology              | Purpose                                     |
| ------------- | ----------------------- | ------------------------------------------- |
| Frontend      | Next.js 15, Sera UI     | Front desk, guest portal, dashboards        |
| API Framework | Hono                    | Lightweight, edge-ready API services        |
| Database      | PostgreSQL 16           | Primary data store with RLS                 |
| Cache         | Redis 7                 | Rate cache, session state, room status      |
| Search        | Meilisearch             | Guest search, property search               |
| Queue         | BullMQ                  | OTA sync, housekeeping tasks, notifications |
| Payments      | Stripe + Adyen          | PCI-compliant tokenization + processing     |
| Auth          | Clerk + custom RBAC     | Identity + role-based access                |
| Billing       | Stripe                  | Platform subscription billing               |
| Monitoring    | OpenTelemetry + Grafana | Distributed tracing, metrics                |
| Edge          | Cloudflare Workers      | Booking widget CDN, rate limiting           |
| IoT           | MQTT                    | Smart room controls, door locks             |

## Observability

Full-stack observability for hospitality operations:

- **Distributed Tracing**: OpenTelemetry traces across reservation-api, payment-api, channel-api
- **Metrics**: Occupancy rate, ADR (Average Daily Rate), RevPAR, booking conversion, cancellation rate
- **Structured Logging**: JSON logs with `tenant_id`, `property_id`, `reservation_id`, severity
- **Dashboards**: Grafana — Occupancy Heatmap, Revenue Pipeline, Channel Performance, System Health
- **Alerting**: PagerDuty — payment processing failures, OTA sync lag, overbooking detection
- **SLOs**: 99.95% booking engine uptime, < 1s availability check, < 3s booking confirmation

```typescript
logger.info({
  service: "reservation-api",
  event: "reservation.confirmed",
  tenant_id: tenant.id,
  property_id: property.id,
  reservation_id: reservation.id,
  room_type: reservation.roomType,
  channel: reservation.source, // "direct", "booking.com", "expedia"
  revenue: reservation.totalAmount,
  currency: property.currency,
  trace_id: span.traceId,
  timestamp: new Date().toISOString(),
});
```

## Health & Readiness Endpoints

Every service exposes standardized health checks:

```typescript
// services/reservation-api/src/routes/health.ts
import { Hono } from "hono";

const health = new Hono();

health.get("/health", async (c) => {
  const checks = {
    status: "healthy",
    service: "reservation-api",
    version: process.env.APP_VERSION,
    timestamp: new Date().toISOString(),
    checks: {
      database: await checkPostgres(),
      redis: await checkRedis(),
      payment_gateway: await checkStripeConnection(),
      channel_manager: await checkOTAConnectivity(),
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
    checkRateCacheWarmed(),
    checkPaymentTokenizer(),
  ]);
  const isReady = ready.every((r) => r.ok);
  return c.json({ ready: isReady, details: ready }, isReady ? 200 : 503);
});
```

## Failure Fingerprinting & Incident Response

All failures produce fingerprinted, structured error events:

```typescript
// packages/reservation-core/src/errors.ts
interface HospitalityFailure {
  fingerprint: string;
  service: string;
  severity: "critical" | "high" | "medium" | "low";
  category:
    | "booking"
    | "payment"
    | "channel"
    | "housekeeping"
    | "infrastructure";
  tenant_id: string;
  payment_data_involved: boolean;
  error_code: string; // e.g., "OVERBOOKING_DETECTED", "OTA_SYNC_FAILED"
  message: string;
  stack_trace: string;
  context: {
    property_id?: string;
    reservation_id?: string;
    channel?: string;
    revenue_impact?: number;
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

**Incident pipeline**: Failure detected -> Fingerprint generated -> Deduplicated -> If `category === "booking"` and overbooking, trigger P1 escalation + auto-relocate -> Auto-create fix PR or escalate -> Track in `/docs/incidents/`.

## Anti-Pattern Prevention & Memory

| Anti-Pattern                       | Prevention                                                    |
| ---------------------------------- | ------------------------------------------------------------- |
| Storing raw credit card numbers    | PCI tokenization mandatory; raw PAN never hits application DB |
| Overbooking without fallback       | Atomic inventory decrement with optimistic locking            |
| OTA rate parity violations         | Rate sync verification job runs every 15 minutes              |
| Hardcoded tax rates                | Tax calculation engine with jurisdiction-based dynamic rates  |
| Guest data retained after checkout | GDPR-compliant retention policies with automated purge        |
| Synchronous OTA updates            | Queue-based channel distribution; never block booking flow    |

**MEMORY.md template**:

```markdown
## Known Issues

- [ ] Booking.com XML API deprecated — migrate to JSON API by Q3
- [ ] Dynamic pricing model underperforms on shoulder seasons — retrain quarterly

## Resolved Incidents

- [INC-001] Overbooking on NYE due to race condition — fixed with pessimistic locking
- [INC-002] Guest PII exposed in channel sync logs — fixed with scrubber middleware
```

## Billing & Monetization

**Subscription Tiers**:

| Tier         | Rooms     | Properties | Channels  | Price   |
| ------------ | --------- | ---------- | --------- | ------- |
| Boutique     | 50        | 1          | 3         | $299/mo |
| Professional | 250       | 5          | 10        | $999/mo |
| Enterprise   | Unlimited | Unlimited  | Unlimited | Custom  |

**Usage Metering** (Stripe Meters):

- `hospitality.reservations.processed` — Billed per reservation above tier
- `hospitality.channel.syncs` — OTA distribution sync events
- `hospitality.payments.processed` — Payment transaction volume
- `hospitality.sms.sent` — Guest SMS notifications

**Billing Events**:

```typescript
await stripe.billing.meterEvents.create({
  event_name: "hospitality.reservations.processed",
  payload: {
    stripe_customer_id: tenant.stripeCustomerId,
    value: "1",
    property_id: property.id,
    channel: reservation.source,
  },
});
```

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain hospitality --name "HotelOS" \
  --compliance "PCI-DSS,GDPR,ADA"

# 2. Create domain packages
pnpm create @code-engine/package reservation-core
pnpm create @code-engine/package room-core
pnpm create @code-engine/package guest-core
pnpm create @code-engine/package revenue-core

# 3. Start development
pnpm install
pnpm dev

# 4. Run compliance checks
pnpm run compliance:pci
pnpm run compliance:gdpr-guest-data
```

## Timeline

| Phase               | Duration     | Deliverable                           |
| ------------------- | ------------ | ------------------------------------- |
| Setup + Auth        | 2 days       | Auth, multi-tenancy, PCI vault        |
| Reservation Engine  | 5 days       | Booking, availability, inventory      |
| Revenue Management  | 4 days       | Dynamic pricing, forecasting          |
| Guest Experience    | 4 days       | Profiles, loyalty, mobile key         |
| Housekeeping        | 3 days       | Task management, room status          |
| Channel Manager     | 4 days       | OTA sync, rate parity, distribution   |
| Compliance + Launch | 3 days       | PCI SAQ, GDPR audit, go-live          |
| **Total**           | **~5 weeks** | Production-ready hospitality platform |
