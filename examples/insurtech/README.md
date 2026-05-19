# Insurance Technology Platform — Code Engine Example

> Built with the Coding Engine. Full-stack InsurTech with policy management, claims processing, underwriting, and agent portal.

## What This Builds

A compliance-ready insurance technology platform with:

- Policy management with quoting, binding, endorsements, and renewals
- Claims processing with FNOL, adjudication, and settlement workflows
- Underwriting engine with risk scoring and automated decisioning
- Actuarial analytics with loss ratio, combined ratio, and reserve analysis
- Agent/broker portal with commission tracking and book management
- Customer self-service portal with policy documents and claims filing
- Reinsurance treaty management and bordereau reporting
- Regulatory filing and state compliance automation

## Architecture

```
apps/
├── customer-portal/         # Policyholder self-service (Next.js)
├── agent-portal/            # Agent/broker management dashboard
├── claims-portal/           # Claims adjuster workspace
├── underwriting-portal/     # Underwriting and risk assessment
├── actuarial-dashboard/     # Actuarial analytics and reporting
├── admin-portal/            # Platform admin (universal)
├── billing-dashboard/       # Subscription billing (universal)

packages/
├── policy-core/             # Policy lifecycle: quote, bind, endorse, renew
├── claims-core/             # Claims lifecycle: FNOL to settlement
├── underwriting-core/       # Risk scoring and decision engine
├── rating-core/             # Premium rating and calculation
├── actuarial-core/          # Loss reserves, IBNR, triangles
├── agent-core/              # Agent profiles, licensing, commissions
├── reinsurance-core/        # Treaty management, cessions, bordereaux
├── document-core/           # Policy docs, declarations, ID cards
├── compliance-core/         # State filings, rate approvals, NAIC
├── fraud-detection-core/    # Claims fraud scoring and SIU referral
├── auth-core/               # Authentication (universal)
├── billing-core/            # Stripe billing (universal)
├── tenant-core/             # Multi-tenancy (universal)
├── audit-core/              # Audit trail (universal)

services/
├── policy-api/              # Policy management service (Hono)
├── claims-api/              # Claims processing service
├── underwriting-api/        # Underwriting and rating service
├── actuarial-api/           # Actuarial analytics service
├── agent-api/               # Agent management service
├── compliance-api/          # Regulatory filing service
```

## Compliance Standards

| Standard                       | Requirements                                                 |
| ------------------------------ | ------------------------------------------------------------ |
| **SOC2**                       | Security controls, access logging, incident response         |
| **HIPAA**                      | Protected health information in health/life insurance claims |
| **State Insurance Regs**       | Rate filing, form approval, market conduct, licensing        |
| **NAIC Model Laws**            | National Association of Insurance Commissioners standards    |
| **GDPR**                       | Policyholder data protection (EU operations)                 |
| **IFRS 17**                    | Insurance contract accounting standards                      |
| **SAP (Statutory Accounting)** | State statutory financial reporting                          |

## Multi-Tenancy

Each tenant represents a distinct insurance carrier or MGA:

- **Database isolation**: Row-level security with `tenant_id` on every table
- **Tenant routing**: Subdomain (`acme.insurecloud.com`), header, or JWT claim
- **Product scope**: Lines of business, rating algorithms, and forms are tenant-scoped
- **Regulatory scope**: Each tenant configures licensed states and applicable regulations
- **Commission config**: Tenant-specific agent commission schedules and hierarchies

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
    linesOfBusiness: tenant.linesOfBusiness,
    licensedStates: tenant.licensedStates,
    ratingEngineVersion: tenant.ratingEngineVersion,
    reinsuranceTreaties: tenant.reinsuranceTreatyIds,
  };
}
```

## Tech Stack

| Layer         | Technology           | Purpose                                 |
| ------------- | -------------------- | --------------------------------------- |
| **Frontend**  | Next.js 15           | Insurance portals and dashboards        |
| **UI**        | Sera UI              | Component library                       |
| **API**       | Hono                 | REST + RPC API services                 |
| **Database**  | PostgreSQL 16        | Policies, claims, agents                |
| **Ledger**    | TigerBeetle          | Premium accounting, claims reserves     |
| **Cache**     | Redis 7              | Session, rate limiting, quote cache     |
| **Search**    | Meilisearch          | Policy and claims search                |
| **Analytics** | ClickHouse           | Actuarial triangles, loss analytics     |
| **ML**        | Python + XGBoost     | Fraud detection, risk scoring           |
| **Auth**      | Clerk + Cerbos       | RBAC: agent, underwriter, adjuster      |
| **Billing**   | Stripe               | Platform subscription + premium billing |
| **Infra**     | AWS ECS + Cloudflare | Compute + edge routing                  |

## Observability

| Dimension      | Tool / Pattern             | Details                                         |
| -------------- | -------------------------- | ----------------------------------------------- |
| **Logging**    | Structured JSON (pino)     | Every policy event, claim action, rating call   |
| **Tracing**    | OpenTelemetry + Axiom      | Distributed traces across underwriting pipeline |
| **Metrics**    | Prometheus + Grafana       | Claims frequency, loss ratio, quote-to-bind     |
| **Alerting**   | Grafana Alerts + PagerDuty | Fraud alerts, SLA breaches, reserve warnings    |
| **Audit**      | Immutable audit log        | Regulatory: underwriting decisions, claim notes |
| **Dashboards** | Grafana                    | Loss ratio trends, claims pipeline, agent KPIs  |

```typescript
// Structured log for claims processing
logger.info({
  service: "claims-api",
  event: "claim_status_changed",
  tenant_id: ctx.tenantId,
  claim_id: claim.id,
  policy_id: claim.policyId,
  claimant_id: claim.claimantId,
  from_status: previousStatus,
  to_status: newStatus,
  reserve_amount: claim.reserveAmount,
  adjuster_id: claim.adjusterId,
  request_id: ctx.requestId,
  trace_id: ctx.traceId,
});
```

## Health & Readiness Endpoints

Every service exposes structured health checks:

```typescript
// services/policy-api/src/routes/health.ts
app.get("/health", async (c) => {
  const checks = {
    status: "healthy",
    service: "policy-api",
    version: process.env.APP_VERSION,
    uptime_seconds: process.uptime(),
    checks: {
      database: await checkPostgres(),
      ledger: await checkTigerBeetle(),
      cache: await checkRedis(),
      rating_engine: await checkRatingService(),
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
    (await checkRatingService()).status === "ok";
  return c.json({ ready }, ready ? 200 : 503);
});
```

## Failure Fingerprinting & Incident Response

All errors produce structured, fingerprinted JSON for automated triage:

```typescript
interface InsurTechFailureEvent {
  fingerprint: string; // SHA256 of service + error_code + stack_signature
  service: "policy-api" | "claims-api" | "underwriting-api" | "actuarial-api";
  severity: "critical" | "high" | "medium" | "low";
  error_code: string; // e.g., "RATING_ENGINE_TIMEOUT", "CLAIM_RESERVE_EXCEEDED", "FRAUD_SCORE_UNAVAILABLE"
  tenant_id: string;
  message: string;
  stack_trace: string;
  context: {
    policy_id?: string;
    claim_id?: string;
    quote_id?: string;
    line_of_business?: string;
  };
  timestamp: string;
}

// Fingerprint generation
function fingerprint(error: InsurTechFailureEvent): string {
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

| Anti-Pattern                        | Prevention                                               |
| ----------------------------------- | -------------------------------------------------------- |
| Premium calculation with floats     | Use integer minor units; rating-core enforces            |
| Claim paid without reserve set      | Assert reserve >= payment before disbursement            |
| Policy bound without underwriting   | Binding requires underwriting decision status = APPROVED |
| Hardcoded rating factors            | Rating factors loaded from versioned rating tables       |
| Missing agent license check         | License validation per state before policy issuance      |
| HIPAA-protected data in claims logs | PHI fields masked in structured logs, audit-only access  |

### MEMORY.md Template

```markdown
## InsurTech Lessons Learned

### Incident: Duplicate Claim Payments After Adjuster Retry (2025-07-20)

- **Root cause**: Payment endpoint lacked idempotency key
- **Fix**: Claim payment uses claim_id + payment_sequence as idempotency key
- **Prevention**: All payment mutations require idempotency key, checked at ledger

### Incident: Rating Engine Returned Wrong Premium for New State (2025-09-05)

- **Root cause**: State rating table not loaded after new state launch
- **Fix**: Rating table load includes assertion that all licensed states have tables
- **Prevention**: Pre-deploy check: licensed_states.every(s => ratingTableExists(s))
```

## Billing & Monetization

| Tier             | Price     | Features                                              |
| ---------------- | --------- | ----------------------------------------------------- |
| **Starter**      | $999/mo   | 1 line of business, 5,000 policies, basic claims      |
| **Professional** | $2,999/mo | 3 lines, 50,000 policies, underwriting, actuarial     |
| **Enterprise**   | $7,999/mo | Unlimited lines, reinsurance, API, fraud detection    |
| **Platform**     | Custom    | White-label, dedicated infra, SLA, regulatory support |

### Usage Metering

```typescript
// Metered dimensions
const meters = {
  policies_in_force: "gauge", // Active policies
  claims_processed: "count", // Claims through adjudication
  quotes_generated: "count", // Rating engine invocations
  api_calls: "count", // External API calls
  documents_generated: "count", // Policy docs, ID cards generated
};
```

### Billing Events

- `subscription.created` — New carrier/MGA onboarded
- `usage.policy_bound` — Policy issued (metered)
- `usage.claim_processed` — Claim through adjudication (metered)
- `usage.quote_generated` — Quote calculated (metered overage)
- `subscription.upgraded` — Tier upgrade (lines of business added)

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain insurtech --name "InsureCloud" \
  --compliance "SOC2,HIPAA,NAIC,IFRS17"

# 2. Create domain packages
pnpm create @code-engine/package policy-core
pnpm create @code-engine/package claims-core
pnpm create @code-engine/package underwriting-core
pnpm create @code-engine/package rating-core
pnpm create @code-engine/package actuarial-core

# 3. Start development
pnpm dev

# 4. Run compliance checks
pnpm test:compliance -- --standard soc2,hipaa
```
