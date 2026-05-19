# Media & Content Management Platform — Code Engine Example

> Built with the Coding Engine. From zero to production-grade media platform with headless CMS, digital asset management, global content delivery, and creator monetization.

## What This Builds

A comprehensive media and content management platform with:

- **Headless CMS** — Structured content modeling, versioning, localization, editorial workflows
- **Digital Asset Management (DAM)** — Media library, transcoding, metadata tagging, rights management
- **Content Delivery** — Global CDN, adaptive streaming, image optimization, edge caching
- **Creator Tools** — Rich editor, collaborative editing, content scheduling, A/B testing
- **Analytics & Insights** — Content performance, audience engagement, attribution, heatmaps
- **Monetization** — Paywalls, subscriptions, ad placement, sponsored content, affiliate tracking
- **Multi-Channel Publishing** — Web, mobile, social, email, push notifications, RSS
- **Rights & Licensing** — Digital rights management, usage tracking, license expiry alerts

## Architecture

```
apps/
├── editorial-studio/          # Content editor workspace (Next.js 15)
├── media-library/             # DAM interface (Next.js 15)
├── reader-portal/             # Consumer-facing content site
├── analytics-dashboard/       # Content analytics (Next.js 15)
├── admin-portal/              # Platform administration (Next.js 15)
└── docs/                      # API documentation (VitePress)

packages/
├── content-core/              # Content modeling + versioning
├── asset-core/                # Digital asset management
├── delivery-core/             # CDN + optimization pipeline
├── editor-core/               # Rich text editor + collaboration
├── analytics-core/            # Content analytics engine
├── monetization-core/         # Paywall + subscription logic
├── publishing-core/           # Multi-channel distribution
├── rights-core/               # DRM + license management
├── seo-core/                  # SEO optimization + metadata
├── auth-core/                 # Authentication + RBAC (universal)
├── billing-core/              # Stripe billing integration (universal)
├── tenant-core/               # Multi-tenancy isolation (universal)
└── audit-core/                # Audit trail (universal)

services/
├── content-api/               # Content CRUD + workflows (Hono)
├── asset-api/                 # Media upload + transcoding
├── delivery-api/              # Content serving + caching
├── analytics-api/             # Engagement tracking + reporting
├── monetization-api/          # Paywall + billing orchestration
└── publishing-api/            # Multi-channel distribution
```

## Compliance Standards

| Standard          | Requirements                                                          |
| ----------------- | --------------------------------------------------------------------- |
| **DMCA**          | Takedown procedures, counter-notice handling, repeat infringer policy |
| **GDPR**          | User consent, data portability, right to erasure, cookie compliance   |
| **COPPA**         | Parental consent for under-13, data collection restrictions           |
| **WCAG 2.1 AA**   | Accessible content, alt text, captions, keyboard navigation           |
| **SOC2**          | Security controls, audit trails, vendor management                    |
| **Copyright Law** | Rights tracking, license enforcement, fair use documentation          |

## Multi-Tenancy

Each media organization, publisher, or brand operates as an isolated tenant:

- **Database isolation**: Row-level security with `tenant_id`; content and assets in tenant-scoped storage
- **Tenant resolution**: Subdomain (`dailynews.media-platform.com`) or custom domain
- **Content isolation**: Tenant-scoped content models, taxonomies, and editorial workflows
- **Storage**: Per-tenant S3 prefixes with separate encryption keys; storage quota enforcement
- **CDN**: Per-tenant cache purge controls, custom domains, SSL certificates
- **Branding**: White-label editorial studio with tenant-specific themes and editor configs

```typescript
// Tenant-scoped content query with published status
const getContent = async (tenantId: string, query: ContentQuery) => {
  assert(tenantId, "Tenant ID required for content queries");
  assert(query.locale, "Locale is required");

  return db.content.findMany({
    where: {
      tenant_id: tenantId,
      status: query.includeDrafts ? undefined : "published",
      locale: query.locale,
      content_type: query.contentType,
    },
    orderBy: { published_at: "desc" },
    take: Math.min(query.limit ?? 20, MAX_PAGE_SIZE),
  });
};
```

## Tech Stack

| Layer          | Technology              | Purpose                                     |
| -------------- | ----------------------- | ------------------------------------------- |
| Frontend       | Next.js 15, Sera UI     | Editorial studio, reader portal             |
| API Framework  | Hono                    | Lightweight, edge-ready API services        |
| Database       | PostgreSQL 16           | Content store, metadata, workflows          |
| Cache          | Redis 7                 | Content cache, session state, rate limiting |
| Search         | Meilisearch             | Full-text content search, faceted filters   |
| Queue          | BullMQ                  | Transcoding, publishing, analytics ETL      |
| Object Storage | S3 + R2                 | Media assets, images, video, documents      |
| CDN            | Cloudflare CDN          | Global content delivery, image optimization |
| Video          | Mux / Cloudflare Stream | Adaptive video streaming + transcoding      |
| Editor         | TipTap / ProseMirror    | Collaborative rich text editing             |
| Auth           | Clerk + custom RBAC     | Identity + role-based access                |
| Billing        | Stripe                  | Subscription + usage-based billing          |
| Monitoring     | OpenTelemetry + Grafana | Distributed tracing, metrics                |
| Edge           | Cloudflare Workers      | Content serving, paywall enforcement        |

## Observability

Full-stack observability for media operations:

- **Distributed Tracing**: OpenTelemetry traces across content-api, asset-api, delivery-api
- **Metrics**: Page views, time-on-page, scroll depth, asset download count, CDN hit ratio
- **Structured Logging**: JSON logs with `tenant_id`, `content_id`, `asset_id`, `author_id`, severity
- **Dashboards**: Grafana — Content Pipeline, CDN Performance, Transcoding Queue, Monetization Funnel
- **Alerting**: PagerDuty — transcoding failures, CDN origin errors, paywall bypass attempts
- **SLOs**: 99.95% content delivery uptime, < 200ms TTFB, < 3s LCP, < 30min publish-to-live

```typescript
logger.info({
  service: "content-api",
  event: "content.published",
  tenant_id: tenant.id,
  content_id: content.id,
  content_type: content.type,
  locale: content.locale,
  channels: ["web", "rss", "push"],
  author_id: author.id,
  word_count: content.wordCount,
  trace_id: span.traceId,
  timestamp: new Date().toISOString(),
});
```

## Health & Readiness Endpoints

Every service exposes standardized health checks:

```typescript
// services/content-api/src/routes/health.ts
import { Hono } from "hono";

const health = new Hono();

health.get("/health", async (c) => {
  const checks = {
    status: "healthy",
    service: "content-api",
    version: process.env.APP_VERSION,
    timestamp: new Date().toISOString(),
    checks: {
      database: await checkPostgres(),
      redis: await checkRedis(),
      search: await checkMeilisearch(),
      storage: await checkS3Connectivity(),
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
    checkSearchIndexReady(),
    checkCDNConfiguration(),
  ]);
  const isReady = ready.every((r) => r.ok);
  return c.json({ ready: isReady, details: ready }, isReady ? 200 : 503);
});
```

## Failure Fingerprinting & Incident Response

All failures produce fingerprinted, structured error events:

```typescript
// packages/content-core/src/errors.ts
interface MediaFailure {
  fingerprint: string;
  service: string;
  severity: "critical" | "high" | "medium" | "low";
  category:
    | "content"
    | "asset"
    | "delivery"
    | "monetization"
    | "infrastructure";
  tenant_id: string;
  error_code: string; // e.g., "TRANSCODE_FAILED", "CDN_PURGE_TIMEOUT"
  message: string;
  stack_trace: string;
  context: {
    content_id?: string;
    asset_id?: string;
    cdn_region?: string;
    file_size_bytes?: number;
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

**Incident pipeline**: Failure detected -> Fingerprint generated -> Deduplicated -> If `category === "delivery"` and CDN-wide, trigger P1 escalation -> Auto-create fix PR or escalate -> Track in `/docs/incidents/`.

## Anti-Pattern Prevention & Memory

| Anti-Pattern                       | Prevention                                                   |
| ---------------------------------- | ------------------------------------------------------------ |
| Serving unoptimized images         | Mandatory image pipeline (resize, WebP/AVIF, lazy loading)   |
| Content without accessibility meta | Alt text and captions required before publish; WCAG lint     |
| Storing user data without consent  | Cookie consent banner + GDPR consent tracking on all pages   |
| CDN cache serving stale content    | Cache-buster on publish; surrogate-key-based purge           |
| COPPA violation with user tracking | Age gate check before analytics cookies; under-13 data purge |
| Rights-expired content still live  | Automated license expiry scan with auto-unpublish            |

**MEMORY.md template**:

```markdown
## Known Issues

- [ ] Video transcoding queue backs up at > 100 concurrent jobs — add auto-scaling
- [ ] Meilisearch index rebuild takes 45min at 1M docs — implement incremental updates

## Resolved Incidents

- [INC-001] CDN serving stale paywall content — fixed with surrogate key purge on publish
- [INC-002] COPPA violation via embedded third-party tracker — removed and added allow-list
```

## Billing & Monetization

**Subscription Tiers**:

| Tier         | Content Items | Storage   | API Calls/mo | Price   |
| ------------ | ------------- | --------- | ------------ | ------- |
| Starter      | 5,000         | 50 GB     | 100K         | $199/mo |
| Professional | 50,000        | 500 GB    | 1M           | $799/mo |
| Enterprise   | Unlimited     | Unlimited | Unlimited    | Custom  |

**Usage Metering** (Stripe Meters):

- `media.content.api_calls` — Content API requests above tier
- `media.storage.gb` — Media storage volume
- `media.bandwidth.gb` — CDN bandwidth consumed
- `media.transcoding.minutes` — Video transcoding minutes

**Billing Events**:

```typescript
await stripe.billing.meterEvents.create({
  event_name: "media.bandwidth.gb",
  payload: {
    stripe_customer_id: tenant.stripeCustomerId,
    value: String(bandwidthGB),
    cdn_region: region,
  },
});
```

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain media --name "MediaHub" \
  --compliance "DMCA,GDPR,COPPA,WCAG"

# 2. Create domain packages
pnpm create @code-engine/package content-core
pnpm create @code-engine/package asset-core
pnpm create @code-engine/package delivery-core
pnpm create @code-engine/package monetization-core

# 3. Start development
pnpm install
pnpm dev

# 4. Run compliance checks
pnpm run compliance:wcag
pnpm run compliance:gdpr-consent
```

## Timeline

| Phase               | Duration     | Deliverable                             |
| ------------------- | ------------ | --------------------------------------- |
| Setup + Auth        | 2 days       | Auth, multi-tenancy, storage setup      |
| Content Engine      | 5 days       | CMS, content models, editorial workflow |
| Asset Management    | 4 days       | Upload, transcoding, DAM interface      |
| Content Delivery    | 3 days       | CDN, image optimization, edge caching   |
| Creator Tools       | 4 days       | Rich editor, collaboration, scheduling  |
| Monetization        | 3 days       | Paywalls, subscriptions, ad placement   |
| Compliance + Launch | 3 days       | WCAG audit, DMCA process, go-live       |
| **Total**           | **~5 weeks** | Production-ready media platform         |
