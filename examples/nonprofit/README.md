# Nonprofit & Grant Management Platform — Code Engine Example

> Built with the Coding Engine. From zero to production-grade nonprofit platform with donor management, grant lifecycle tracking, impact reporting, and volunteer coordination.

## What This Builds

A comprehensive nonprofit management platform with:

- **Donor Management (CRM)** — Contact records, giving history, segmentation, stewardship tracking
- **Grant Applications** — Application builder, submission portal, review workflows, compliance tracking
- **Impact Reporting** — Outcomes measurement, logic models, beneficiary tracking, funder reports
- **Volunteer Management** — Recruitment, scheduling, hours tracking, skills matching, recognition
- **Fundraising Campaigns** — Online giving, peer-to-peer, events, recurring donations, pledge management
- **Financial Stewardship** — Fund accounting, restricted/unrestricted tracking, budget-to-actual reporting
- **Communications Hub** — Email campaigns, donor acknowledgments, impact newsletters, social sharing
- **Board & Governance** — Meeting management, document repository, compliance calendar, voting

## Architecture

```
apps/
├── staff-portal/              # Nonprofit staff workspace (Next.js 15)
├── donor-portal/              # Donor-facing engagement portal
├── volunteer-portal/          # Volunteer self-service portal
├── grant-portal/              # Grantor/grantee application portal
├── admin-portal/              # Platform administration (Next.js 15)
└── docs/                      # API documentation (VitePress)

packages/
├── donor-core/                # Donor CRM + giving history
├── grant-core/                # Grant lifecycle management
├── impact-core/               # Outcomes + beneficiary tracking
├── volunteer-core/            # Volunteer scheduling + hours
├── fundraising-core/          # Campaign + donation processing
├── fund-accounting-core/      # Restricted fund tracking
├── communication-core/        # Email campaigns + acknowledgments
├── governance-core/           # Board management + compliance
├── payment-core/              # PCI-compliant donation processing
├── auth-core/                 # Authentication + RBAC (universal)
├── billing-core/              # Stripe billing integration (universal)
├── tenant-core/               # Multi-tenancy isolation (universal)
└── audit-core/                # Audit trail (universal)

services/
├── donor-api/                 # Donor management service (Hono)
├── grant-api/                 # Grant application lifecycle
├── impact-api/                # Impact measurement + reporting
├── fundraising-api/           # Donation processing + campaigns
├── volunteer-api/             # Volunteer coordination
└── reporting-api/             # Financial + impact reports
```

## Compliance Standards

| Standard         | Requirements                                                              |
| ---------------- | ------------------------------------------------------------------------- |
| **IRS 990**      | Annual return data preparation, schedule support, public disclosure       |
| **GDPR**         | Donor consent, data portability, right to erasure, cross-border transfers |
| **PCI-DSS**      | Donation payment card tokenization, encryption, SAQ compliance            |
| **FASB ASC 958** | Not-for-profit financial statements, contribution accounting              |
| **SOC2**         | Security controls, audit trails, vendor management                        |
| **CAN-SPAM**     | Email marketing compliance, unsubscribe handling, sender identification   |

## Multi-Tenancy

Each nonprofit organization operates as an isolated tenant:

- **Database isolation**: Row-level security with `tenant_id`; donor PII encrypted per-tenant
- **Tenant resolution**: Subdomain (`hopefoundation.nonprofit-platform.org`) or custom domain
- **Fund isolation**: Each tenant has independent fund accounting with restricted/unrestricted tracking
- **Payment processing**: Per-tenant Stripe Connect accounts for donation processing
- **Branding**: White-label donor portal with custom branding, colors, imagery, and domain
- **Data sovereignty**: Per-tenant configurable data residency for international nonprofits

```typescript
// Tenant-scoped donor query with giving history
const getDonors = async (tenantId: string, filters: DonorFilters) => {
  assert(tenantId, "Tenant ID required for donor queries");

  return db.donor.findMany({
    where: {
      tenant_id: tenantId,
      consent_status: "active",
      ...buildSegmentFilter(filters),
    },
    include: {
      giving_history: {
        orderBy: { date: "desc" },
        take: filters.recentGiftsLimit ?? 10,
      },
    },
  });
};
```

## Tech Stack

| Layer         | Technology              | Purpose                                      |
| ------------- | ----------------------- | -------------------------------------------- |
| Frontend      | Next.js 15, Sera UI     | Staff portal, donor portal                   |
| API Framework | Hono                    | Lightweight, edge-ready API services         |
| Database      | PostgreSQL 16           | Primary data store with RLS                  |
| Cache         | Redis 7                 | Session state, rate limiting                 |
| Search        | Meilisearch             | Donor search, grant search, volunteer match  |
| Queue         | BullMQ                  | Email campaigns, receipt generation, reports |
| Payments      | Stripe Connect          | Donation processing + fund disbursement      |
| Email         | SES + SendGrid          | Acknowledgments, campaigns, notifications    |
| Documents     | S3                      | Grant documents, receipts, board materials   |
| Auth          | Clerk + custom RBAC     | Identity + role-based access                 |
| Billing       | Stripe                  | Platform subscription billing                |
| Monitoring    | OpenTelemetry + Grafana | Distributed tracing, metrics                 |
| Edge          | Cloudflare Workers      | Donation page CDN, rate limiting             |

## Observability

Full-stack observability for nonprofit operations:

- **Distributed Tracing**: OpenTelemetry traces across donor-api, fundraising-api, grant-api
- **Metrics**: Donations/day, campaign conversion rate, volunteer hours, grant pipeline, donor retention
- **Structured Logging**: JSON logs with `tenant_id`, `donor_token`, `campaign_id`, `grant_id`, severity
- **Dashboards**: Grafana — Donation Pipeline, Grant Lifecycle, Volunteer Activity, System Health
- **Alerting**: PagerDuty — payment processing failures, email delivery issues, grant deadline approaching
- **SLOs**: 99.95% donation page uptime, < 2s donation confirmation, < 24hr receipt delivery

```typescript
logger.info({
  service: "fundraising-api",
  event: "donation.processed",
  tenant_id: tenant.id,
  campaign_id: campaign.id,
  donor_token: tokenize(donor.id),
  amount_cents: donation.amountCents,
  currency: donation.currency,
  recurring: donation.isRecurring,
  fund: donation.fundDesignation,
  trace_id: span.traceId,
  timestamp: new Date().toISOString(),
});
```

## Health & Readiness Endpoints

Every service exposes standardized health checks:

```typescript
// services/fundraising-api/src/routes/health.ts
import { Hono } from "hono";

const health = new Hono();

health.get("/health", async (c) => {
  const checks = {
    status: "healthy",
    service: "fundraising-api",
    version: process.env.APP_VERSION,
    timestamp: new Date().toISOString(),
    checks: {
      database: await checkPostgres(),
      redis: await checkRedis(),
      stripe: await checkStripeConnection(),
      email: await checkSESConnection(),
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
    checkEmailTemplatesLoaded(),
  ]);
  const isReady = ready.every((r) => r.ok);
  return c.json({ ready: isReady, details: ready }, isReady ? 200 : 503);
});
```

## Failure Fingerprinting & Incident Response

All failures produce fingerprinted, structured error events:

```typescript
// packages/fundraising-core/src/errors.ts
interface NonprofitFailure {
  fingerprint: string;
  service: string;
  severity: "critical" | "high" | "medium" | "low";
  category:
    | "donation"
    | "grant"
    | "communication"
    | "compliance"
    | "infrastructure";
  tenant_id: string;
  donor_data_involved: boolean;
  error_code: string; // e.g., "DONATION_DECLINED", "RECEIPT_DELIVERY_FAIL"
  message: string;
  stack_trace: string;
  context: {
    campaign_id?: string;
    amount_cents?: number;
    grant_id?: string;
    email_batch_id?: string;
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

**Incident pipeline**: Failure detected -> Fingerprint generated -> Deduplicated -> If `category === "donation"` and payment failure, trigger P1 escalation -> Auto-create fix PR or escalate -> Track in `/docs/incidents/`.

## Anti-Pattern Prevention & Memory

| Anti-Pattern                          | Prevention                                                    |
| ------------------------------------- | ------------------------------------------------------------- |
| Storing raw credit card numbers       | PCI tokenization via Stripe; no card data touches application |
| Donor data shared without consent     | GDPR consent flags on all donor records; opt-in sharing only  |
| Restricted funds used unrestricted    | Fund accounting enforces designation; alerts on misallocation |
| Tax receipts with incorrect amounts   | Receipt generation reconciles with payment processor records  |
| Email campaigns without unsubscribe   | CAN-SPAM compliance enforced; unsubscribe link mandatory      |
| Grant reports missing required fields | Report template validation before submission                  |

**MEMORY.md template**:

```markdown
## Known Issues

- [ ] Stripe Connect onboarding flow times out for international nonprofits — extend timeout
- [ ] IRS 990 Schedule B generation incomplete for crypto donations — add digital asset support

## Resolved Incidents

- [INC-001] Donor receipts showing wrong amount after refund — fixed with receipt reissuance flow
- [INC-002] Restricted fund balance went negative — added fund balance assertion before disbursement
```

## Billing & Monetization

**Subscription Tiers**:

| Tier       | Contacts  | Users     | Campaigns/mo | Price   |
| ---------- | --------- | --------- | ------------ | ------- |
| Grassroots | 1,000     | 5         | 5            | $79/mo  |
| Growth     | 10,000    | 25        | Unlimited    | $299/mo |
| Enterprise | Unlimited | Unlimited | Unlimited    | Custom  |

**Usage Metering** (Stripe Meters):

- `nonprofit.donations.processed` — Platform fee per donation processed
- `nonprofit.emails.sent` — Email campaign volume
- `nonprofit.grants.managed` — Active grant applications tracked
- `nonprofit.storage.gb` — Document storage volume

**Billing Events**:

```typescript
await stripe.billing.meterEvents.create({
  event_name: "nonprofit.donations.processed",
  payload: {
    stripe_customer_id: tenant.stripeCustomerId,
    value: "1",
    amount_cents: String(donation.amountCents),
  },
});
```

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain nonprofit --name "ImpactOS" \
  --compliance "IRS-990,GDPR,PCI-DSS"

# 2. Create domain packages
pnpm create @code-engine/package donor-core
pnpm create @code-engine/package grant-core
pnpm create @code-engine/package impact-core
pnpm create @code-engine/package fundraising-core

# 3. Start development
pnpm install
pnpm dev

# 4. Run compliance checks
pnpm run compliance:pci
pnpm run compliance:gdpr-donor-consent
```

## Timeline

| Phase               | Duration     | Deliverable                         |
| ------------------- | ------------ | ----------------------------------- |
| Setup + Auth        | 2 days       | Auth, multi-tenancy, Stripe Connect |
| Donor CRM           | 4 days       | Contact management, giving history  |
| Fundraising         | 4 days       | Campaigns, online giving, receipts  |
| Grant Management    | 4 days       | Applications, review, compliance    |
| Impact Reporting    | 3 days       | Outcomes tracking, funder reports   |
| Volunteer Mgmt      | 3 days       | Scheduling, hours, skills matching  |
| Compliance + Launch | 3 days       | IRS 990 prep, PCI audit, go-live    |
| **Total**           | **~5 weeks** | Production-ready nonprofit platform |
