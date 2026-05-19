# Event Ticketing & Venue Management Platform — Code Engine Example

> Built with the Coding Engine. From zero to production-grade ticketing platform with high-concurrency ticket sales, venue management, and real-time attendee analytics.

## What This Builds

A comprehensive event ticketing and venue management platform with:

- **Event Creation** — Multi-format events (concerts, conferences, sports), seating charts, pricing tiers
- **Ticket Sales Engine** — High-concurrency purchasing, seat selection, waitlists, group bookings
- **Venue Management** — Capacity planning, seating maps, section configuration, accessibility seating
- **Attendee Experience** — Mobile tickets (QR/NFC), check-in, in-venue navigation, concessions ordering
- **Analytics & Insights** — Sales velocity, demographic analysis, demand forecasting, revenue attribution
- **Promoter Tools** — Promo codes, affiliate tracking, early access, presale management
- **Resale Marketplace** — Verified resale, price caps, transfer verification, anti-scalping measures
- **Settlement & Payouts** — Event settlement, promoter payouts, tax withholding, refund management

## Architecture

```
apps/
├── organizer-dashboard/       # Event organizer workspace (Next.js 15)
├── box-office/                # Box office / venue staff interface
├── attendee-app/              # Attendee-facing ticket portal (Next.js 15)
├── admin-portal/              # Platform administration (Next.js 15)
├── scanner-app/               # Ticket scanning / check-in app (PWA)
└── docs/                      # API documentation (VitePress)

packages/
├── event-core/                # Event lifecycle management
├── ticket-core/               # Ticket inventory + transactions
├── venue-core/                # Venue maps + capacity management
├── seating-core/              # Seat assignment + selection
├── checkout-core/             # Cart, pricing, payment orchestration
├── attendee-core/             # Attendee profiles + check-in
├── promo-core/                # Promo codes + affiliate tracking
├── resale-core/               # Secondary market + transfers
├── settlement-core/           # Payout calculation + disbursement
├── auth-core/                 # Authentication + RBAC (universal)
├── billing-core/              # Stripe billing integration (universal)
├── tenant-core/               # Multi-tenancy isolation (universal)
└── audit-core/                # Audit trail (universal)

services/
├── event-api/                 # Event CRUD + management (Hono)
├── ticket-api/                # Ticket sales + inventory
├── checkout-api/              # Payment processing + cart
├── checkin-api/               # Gate entry + scanning
├── analytics-api/             # Sales analytics + reporting
└── settlement-api/            # Payout + reconciliation
```

## Compliance Standards

| Standard                | Requirements                                                      |
| ----------------------- | ----------------------------------------------------------------- |
| **PCI-DSS**             | Payment card tokenization, encryption, SAQ compliance             |
| **ADA**                 | Accessible seating, companion seats, assistive listening info     |
| **GDPR**                | Attendee consent, data portability, right to erasure              |
| **Consumer Protection** | Transparent pricing, refund policies, anti-scalping measures      |
| **Local Licensing**     | Venue capacity limits, fire marshal compliance, alcohol licensing |
| **Tax Compliance**      | Entertainment tax, VAT, sales tax calculation per jurisdiction    |

## Multi-Tenancy

Each event organizer, venue, or promoter operates as an isolated tenant:

- **Database isolation**: Row-level security with `tenant_id`; payment data in PCI-scoped vault
- **Tenant resolution**: Subdomain (`liveconcerts.tickets-platform.com`) or custom domain
- **Venue hierarchy**: Tenant -> Venue -> Section -> Row -> Seat
- **Payment processing**: Per-tenant Stripe Connect accounts for ticket sales and payouts
- **Branding**: White-label ticket pages with custom branding, colors, and domain
- **Pricing rules**: Per-tenant dynamic pricing, service fee structures, tax configurations

```typescript
// High-concurrency ticket reservation with optimistic locking
const reserveTickets = async (
  tenantId: string,
  request: ReservationRequest,
) => {
  assert(tenantId, "Tenant ID required");
  assert(
    request.quantity > 0 && request.quantity <= MAX_TICKETS_PER_ORDER,
    `Quantity must be 1-${MAX_TICKETS_PER_ORDER}`,
  );
  assert(
    request.holdExpiryMs <= MAX_HOLD_DURATION_MS,
    `Hold duration exceeds maximum of ${MAX_HOLD_DURATION_MS}ms`,
  );

  return db.$transaction(async (tx) => {
    const available = await tx.ticketInventory.findFirst({
      where: {
        tenant_id: tenantId,
        event_id: request.eventId,
        tier_id: request.tierId,
        available: { gte: request.quantity },
      },
      select: { id: true, version: true, available: true },
    });
    assert(available, "Insufficient tickets available");

    // Optimistic lock — version check prevents overselling
    const updated = await tx.ticketInventory.updateMany({
      where: { id: available.id, version: available.version },
      data: {
        available: { decrement: request.quantity },
        version: { increment: 1 },
      },
    });
    assert(updated.count === 1, "Concurrent modification — retry required");

    return createHold(tx, tenantId, request, available);
  });
};
```

## Tech Stack

| Layer         | Technology              | Purpose                                     |
| ------------- | ----------------------- | ------------------------------------------- |
| Frontend      | Next.js 15, Sera UI     | Organizer dashboard, attendee portal        |
| API Framework | Hono                    | Lightweight, edge-ready API services        |
| Database      | PostgreSQL 16           | Primary data store with RLS                 |
| Cache         | Redis 7                 | Ticket holds, seat locks, session state     |
| Search        | Meilisearch             | Event discovery, venue search               |
| Queue         | BullMQ                  | Order processing, email delivery, analytics |
| Payments      | Stripe Connect          | Ticket payments + organizer payouts         |
| Real-Time     | WebSockets / SSE        | Live seat map updates, sales ticker         |
| QR/NFC        | Custom + native APIs    | Mobile ticket verification                  |
| Auth          | Clerk + custom RBAC     | Identity + role-based access                |
| Billing       | Stripe                  | Platform subscription billing               |
| Monitoring    | OpenTelemetry + Grafana | Distributed tracing, metrics                |
| Edge          | Cloudflare Workers      | Ticket page CDN, queue-fair, rate limiting  |

## Observability

Full-stack observability for ticketing operations:

- **Distributed Tracing**: OpenTelemetry traces across ticket-api, checkout-api, checkin-api
- **Metrics**: Tickets sold/min, checkout conversion, average order value, check-in rate, refund rate
- **Structured Logging**: JSON logs with `tenant_id`, `event_id`, `order_id`, `attendee_token`, severity
- **Dashboards**: Grafana — Sales Velocity, Checkout Funnel, Check-In Rate, Settlement Pipeline
- **Alerting**: PagerDuty — payment processing errors, inventory oversell detection, check-in scanner offline
- **SLOs**: 99.99% checkout availability, < 500ms seat selection, < 2s checkout, < 200ms QR scan

```typescript
logger.info({
  service: "ticket-api",
  event: "ticket.purchased",
  tenant_id: tenant.id,
  event_id: event.id,
  order_id: order.id,
  quantity: order.quantity,
  total_cents: order.totalCents,
  currency: order.currency,
  channel: order.channel, // "web", "mobile", "box_office"
  trace_id: span.traceId,
  timestamp: new Date().toISOString(),
});
```

## Health & Readiness Endpoints

Every service exposes standardized health checks:

```typescript
// services/ticket-api/src/routes/health.ts
import { Hono } from "hono";

const health = new Hono();

health.get("/health", async (c) => {
  const checks = {
    status: "healthy",
    service: "ticket-api",
    version: process.env.APP_VERSION,
    timestamp: new Date().toISOString(),
    checks: {
      database: await checkPostgres(),
      redis: await checkRedis(),
      stripe: await checkStripeConnection(),
      queue: await checkBullMQ(),
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
    checkStripeWebhookEndpoint(),
    checkSeatMapCacheWarmed(),
  ]);
  const isReady = ready.every((r) => r.ok);
  return c.json({ ready: isReady, details: ready }, isReady ? 200 : 503);
});
```

## Failure Fingerprinting & Incident Response

All failures produce fingerprinted, structured error events:

```typescript
// packages/ticket-core/src/errors.ts
interface TicketingFailure {
  fingerprint: string;
  service: string;
  severity: "critical" | "high" | "medium" | "low";
  category: "sales" | "payment" | "checkin" | "settlement" | "infrastructure";
  tenant_id: string;
  payment_data_involved: boolean;
  error_code: string; // e.g., "OVERSELL_DETECTED", "PAYMENT_TIMEOUT"
  message: string;
  stack_trace: string;
  context: {
    event_id?: string;
    order_id?: string;
    tickets_affected?: number;
    revenue_impact_cents?: number;
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

**Incident pipeline**: Failure detected -> Fingerprint generated -> Deduplicated -> If `category === "sales"` and oversell detected, trigger P1 + automatic inventory freeze -> Auto-create fix PR or escalate -> Track in `/docs/incidents/`.

## Anti-Pattern Prevention & Memory

| Anti-Pattern                           | Prevention                                                      |
| -------------------------------------- | --------------------------------------------------------------- |
| Ticket overselling (race condition)    | Optimistic locking with version checks; Redis atomic decrements |
| Abandoned holds blocking inventory     | TTL-based hold expiry with automatic inventory release          |
| Scalper bot purchases                  | Rate limiting, CAPTCHA, queue-fair virtual waiting room         |
| Storing raw payment card data          | PCI tokenization via Stripe; no card data in application        |
| Settlement calculation errors          | Double-entry reconciliation before payout disbursement          |
| Duplicate QR codes for different seats | Cryptographic ticket ID generation with seat binding            |

**MEMORY.md template**:

```markdown
## Known Issues

- [ ] Seat map SVG rendering slow for venues > 50K seats — implement canvas renderer
- [ ] Stripe Connect onboarding fails for non-US organizers — add international support

## Resolved Incidents

- [INC-001] 200 tickets oversold during flash sale — fixed with Redis atomic inventory
- [INC-002] Check-in scanner offline during intermittent WiFi — added offline QR validation
```

## Billing & Monetization

**Subscription Tiers**:

| Tier         | Events/yr | Tickets/event | Organizers | Price   |
| ------------ | --------- | ------------- | ---------- | ------- |
| Indie        | 12        | 500           | 2          | $99/mo  |
| Professional | 100       | 10,000        | 10         | $499/mo |
| Enterprise   | Unlimited | Unlimited     | Unlimited  | Custom  |

**Usage Metering** (Stripe Meters):

- `ticketing.tickets.sold` — Platform fee per ticket sold
- `ticketing.checkins.processed` — Check-in scan volume
- `ticketing.settlements.processed` — Settlement transaction processing
- `ticketing.bandwidth.gb` — Ticket page and asset delivery

**Billing Events**:

```typescript
await stripe.billing.meterEvents.create({
  event_name: "ticketing.tickets.sold",
  payload: {
    stripe_customer_id: tenant.stripeCustomerId,
    value: String(order.quantity),
    event_id: event.id,
    face_value_cents: String(order.faceValueCents),
  },
});
```

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain ticketing --name "TicketOS" \
  --compliance "PCI-DSS,ADA,GDPR"

# 2. Create domain packages
pnpm create @code-engine/package event-core
pnpm create @code-engine/package ticket-core
pnpm create @code-engine/package venue-core
pnpm create @code-engine/package checkout-core

# 3. Start development
pnpm install
pnpm dev

# 4. Run compliance checks
pnpm run compliance:pci
pnpm run compliance:ada-seating
```

## Timeline

| Phase               | Duration     | Deliverable                            |
| ------------------- | ------------ | -------------------------------------- |
| Setup + Auth        | 2 days       | Auth, multi-tenancy, Stripe Connect    |
| Event & Venue       | 4 days       | Event CRUD, venue maps, seating        |
| Ticket Sales Engine | 5 days       | High-concurrency sales, cart, checkout |
| Attendee Experience | 4 days       | Mobile tickets, QR check-in, portal    |
| Promoter Tools      | 3 days       | Promo codes, affiliates, presales      |
| Settlement          | 3 days       | Payout calculation, reconciliation     |
| Compliance + Launch | 3 days       | PCI audit, load testing, go-live       |
| **Total**           | **~5 weeks** | Production-ready ticketing platform    |
