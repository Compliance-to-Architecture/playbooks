# Telehealth & Remote Care Platform — Code Engine Example

> Built with the Coding Engine. From zero to production-grade telehealth platform with HIPAA-compliant virtual visits, remote patient monitoring, and integrated prescription management.

## What This Builds

A comprehensive telehealth platform with:

- **Virtual Visit Engine** — HD video consultations with screen sharing, waiting rooms, and recording
- **Remote Patient Monitoring** — Real-time vitals ingestion from wearables and medical devices
- **E-Prescriptions** — EPCS-compliant electronic prescribing with pharmacy routing
- **Intelligent Scheduling** — Provider availability, timezone handling, urgency-based queuing
- **Patient Portal** — Secure messaging, document uploads, visit history, care plans
- **Clinical Decision Support** — Symptom triage, drug interaction checks, care pathway recommendations
- **Insurance Verification** — Real-time eligibility checks, prior authorization, co-pay calculation
- **Care Coordination** — Referral management, multi-provider collaboration, handoff tracking

## Architecture

```
apps/
├── patient-portal/            # Patient-facing app (Next.js 15)
├── provider-dashboard/        # Clinician workspace (Next.js 15)
├── admin-portal/              # Platform administration (Next.js 15)
├── pharmacy-portal/           # Pharmacy integration dashboard
└── docs/                      # API documentation (VitePress)

packages/
├── visit-core/                # Virtual visit session management
├── monitoring-core/           # Remote patient monitoring engine
├── prescription-core/         # E-prescribing + EPCS compliance
├── scheduling-core/           # Appointment scheduling + availability
├── patient-core/              # Patient records + demographics
├── clinical-core/             # Clinical decision support logic
├── insurance-core/            # Eligibility verification + claims
├── messaging-core/            # Secure patient-provider messaging
├── auth-core/                 # Authentication + RBAC (universal)
├── billing-core/              # Stripe billing integration (universal)
├── tenant-core/               # Multi-tenancy isolation (universal)
├── audit-core/                # HIPAA audit trail (universal)
└── hipaa-core/                # HIPAA compliance engine

services/
├── visit-api/                 # Video visit orchestration (Hono)
├── monitoring-api/            # Vitals ingestion + alerting
├── prescription-api/          # Rx routing + PDMP integration
├── scheduling-api/            # Appointment lifecycle service
├── insurance-api/             # Eligibility + prior auth service
└── notification-api/          # SMS/email/push notifications
```

## Compliance Standards

| Standard       | Requirements                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **HIPAA**      | PHI encryption at rest (AES-256) and in transit (TLS 1.3), BAA tracking, minimum necessary access, breach notification within 60 days |
| **HITECH**     | EHR meaningful use, patient right to access, accounting of disclosures                                                                |
| **HL7 FHIR**   | R4 resources for Patient, Encounter, MedicationRequest, Observation                                                                   |
| **SOC2**       | Security controls, audit logging, incident response, vendor management                                                                |
| **EPCS**       | DEA-compliant electronic prescribing for controlled substances                                                                        |
| **State Laws** | Per-state telehealth licensure, informed consent, prescribing rules                                                                   |

## Multi-Tenancy

Each healthcare organization (clinic, hospital system, practice group) operates as an isolated tenant:

- **Database isolation**: Row-level security with `tenant_id` on every table; PHI columns encrypted per-tenant with unique KEKs
- **Tenant resolution**: Subdomain (`clinic.telehealth.app`) or `X-Tenant-ID` header or JWT `tenant_id` claim
- **Data residency**: Tenant-configurable region pinning for state/country data sovereignty
- **Feature flags**: Per-tenant feature enablement (e.g., e-prescribing, RPM, pharmacy portal)
- **Branding**: White-label support — logos, colors, custom domains per tenant
- **BAA tracking**: Each tenant has tracked Business Associate Agreements with effective dates and renewal alerts

```typescript
// Tenant context middleware
const tenantMiddleware = async (c: Context, next: Next) => {
  const tenantId = resolveTenant(c.req);
  assert(tenantId, "Tenant resolution failed");
  const tenant = await tenantStore.get(tenantId);
  assert(tenant?.status === "active", `Tenant ${tenantId} is not active`);
  assert(tenant.baaStatus === "signed", `Tenant ${tenantId} missing BAA`);
  c.set("tenant", tenant);
  await next();
};
```

## Tech Stack

| Layer          | Technology              | Purpose                                   |
| -------------- | ----------------------- | ----------------------------------------- |
| Frontend       | Next.js 15, Sera UI     | Patient portal, provider dashboard        |
| API Framework  | Hono                    | Lightweight, edge-ready API services      |
| Video          | Twilio Video / Daily    | HIPAA-eligible video infrastructure       |
| Database       | PostgreSQL 16           | Primary data store with RLS               |
| Cache          | Redis 7                 | Session state, presence, rate limiting    |
| Search         | Meilisearch             | Patient/provider search                   |
| Queue          | BullMQ                  | Async job processing (Rx routing, alerts) |
| Object Storage | S3 (encrypted)          | Medical documents, visit recordings       |
| Auth           | Clerk + custom RBAC     | Identity + role-based access              |
| Billing        | Stripe                  | Subscription + usage-based billing        |
| Monitoring     | OpenTelemetry + Grafana | Distributed tracing, metrics, dashboards  |
| Edge           | Cloudflare Workers      | Routing, geo-resolution, rate limiting    |

## Observability

Full-stack observability for clinical-grade reliability:

- **Distributed Tracing**: OpenTelemetry traces across visit-api, monitoring-api, prescription-api with correlation IDs
- **Metrics**: Prometheus-format metrics — visit latency p50/p95/p99, vitals ingestion rate, Rx routing time
- **Structured Logging**: JSON logs with `patient_id` (tokenized), `provider_id`, `visit_id`, `tenant_id`, severity
- **Dashboards**: Grafana dashboards — Active Visits, RPM Alert Funnel, Prescription Fulfillment, System Health
- **Alerting**: PagerDuty integration — video infrastructure degradation, vitals pipeline lag, HIPAA audit anomalies
- **SLOs**: 99.95% video uptime, < 2s visit join latency, < 500ms API p95, < 30s vitals processing

```typescript
// Structured log example
logger.info({
  service: "visit-api",
  event: "visit.started",
  visit_id: visit.id,
  tenant_id: tenant.id,
  provider_id: provider.id,
  patient_token: tokenize(patient.id), // Never log raw patient IDs
  visit_type: "synchronous_video",
  trace_id: span.traceId,
  timestamp: new Date().toISOString(),
});
```

## Health & Readiness Endpoints

Every service exposes standardized health checks:

```typescript
// services/visit-api/src/routes/health.ts
import { Hono } from "hono";

const health = new Hono();

health.get("/health", async (c) => {
  const checks = {
    status: "healthy",
    service: "visit-api",
    version: process.env.APP_VERSION,
    timestamp: new Date().toISOString(),
    checks: {
      database: await checkPostgres(),
      redis: await checkRedis(),
      video_provider: await checkTwilioVideo(),
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
    checkVideoProviderCredentials(),
    checkEncryptionKeys(),
  ]);
  const isReady = ready.every((r) => r.ok);
  return c.json({ ready: isReady, details: ready }, isReady ? 200 : 503);
});

async function checkPostgres(): Promise<HealthCheck> {
  try {
    const start = performance.now();
    await db.$queryRaw`SELECT 1`;
    return { status: "up", latency_ms: Math.round(performance.now() - start) };
  } catch (error) {
    return { status: "down", error: error.message };
  }
}
```

## Failure Fingerprinting & Incident Response

All failures produce machine-readable, fingerprinted error events:

```typescript
// packages/hipaa-core/src/errors.ts
interface TelehealthFailure {
  fingerprint: string; // SHA-256 of normalized stack
  service: string; // visit-api, monitoring-api, etc.
  severity: "critical" | "high" | "medium" | "low";
  category: "video" | "data" | "compliance" | "integration" | "infrastructure";
  tenant_id: string;
  phi_involved: boolean; // Triggers HIPAA breach assessment
  error_code: string; // e.g., "VISIT_JOIN_FAILED", "RPM_INGEST_TIMEOUT"
  message: string;
  stack_trace: string;
  context: Record<string, unknown>;
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

**Incident pipeline**: Failure detected -> Fingerprint generated -> Deduplicated against existing incidents -> If `phi_involved: true`, trigger HIPAA Breach Assessment workflow -> Auto-create fix PR or escalate to on-call -> Track resolution in `/docs/incidents/`.

## Anti-Pattern Prevention & Memory

| Anti-Pattern                        | Prevention                                                        |
| ----------------------------------- | ----------------------------------------------------------------- |
| Logging raw PHI                     | Tokenization middleware; lint rule blocks `.patient_name` in logs |
| Video recordings without consent    | `recording_consent` flag required before session start            |
| Missing BAA for tenant              | Tenant middleware asserts `baaStatus === "signed"`                |
| Hardcoded provider credentials      | All secrets via SSM Parameter Store; rotation enforced            |
| Prescription without identity proof | EPCS two-factor authentication enforced at Rx signing             |
| Synchronous vitals processing       | Queue-based ingestion with backpressure; never block API thread   |

**MEMORY.md template** (stored at project root):

```markdown
## Known Issues

- [ ] Twilio Video SDK v2.x has reconnection bug on Safari — use polyfill
- [ ] State telehealth laws change quarterly — review compliance-map on schedule

## Resolved Incidents

- [INC-001] Visit recordings stored unencrypted — fixed with S3 SSE-KMS
- [INC-002] RPM alerts firing for stale device data — added staleness check
```

## Billing & Monetization

**Subscription Tiers**:

| Tier         | Visits/mo | RPM Devices | Providers | Price     |
| ------------ | --------- | ----------- | --------- | --------- |
| Starter      | 200       | 50          | 5         | $499/mo   |
| Professional | 1,000     | 500         | 25        | $1,999/mo |
| Enterprise   | Unlimited | Unlimited   | Unlimited | Custom    |

**Usage Metering** (Stripe Meters):

- `telehealth.visit.minutes` — Billed per video minute beyond tier allowance
- `telehealth.rpm.datapoints` — Billed per vitals data point ingested
- `telehealth.prescriptions` — Billed per e-prescription routed
- `telehealth.storage.gb` — Medical document and recording storage

**Billing Events**:

```typescript
await stripe.billing.meterEvents.create({
  event_name: "telehealth.visit.minutes",
  payload: {
    stripe_customer_id: tenant.stripeCustomerId,
    value: String(visitDurationMinutes),
    visit_id: visit.id,
  },
});
```

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain telehealth --name "TeleCare" \
  --compliance "HIPAA,HITECH,SOC2,HL7-FHIR"

# 2. Create domain packages
pnpm create @code-engine/package visit-core
pnpm create @code-engine/package monitoring-core
pnpm create @code-engine/package prescription-core
pnpm create @code-engine/package hipaa-core

# 3. Start development
pnpm install
pnpm dev

# 4. Run compliance checks
pnpm run compliance:hipaa
pnpm run audit:phi-access
```

## Timeline

| Phase               | Duration     | Deliverable                               |
| ------------------- | ------------ | ----------------------------------------- |
| Setup + Auth        | 2 days       | Auth, multi-tenancy, HIPAA audit trail    |
| Virtual Visits      | 5 days       | Video engine, waiting room, recordings    |
| Remote Monitoring   | 5 days       | Vitals ingestion, alerting, dashboards    |
| E-Prescriptions     | 4 days       | EPCS compliance, pharmacy routing         |
| Scheduling          | 3 days       | Availability, timezone, reminders         |
| Insurance           | 3 days       | Eligibility, prior auth, co-pay           |
| Compliance + Launch | 3 days       | Evidence packs, penetration test, go-live |
| **Total**           | **~5 weeks** | Production-ready telehealth platform      |
