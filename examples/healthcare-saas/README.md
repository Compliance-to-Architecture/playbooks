# Healthcare SaaS Platform — Code Engine Example

> Built with the Coding Engine. From zero to production-grade healthcare platform.

## What This Builds

A HIPAA-compliant healthcare SaaS platform with:

- Patient portal + provider dashboard
- Electronic Health Records (EHR) management
- Appointment scheduling + telehealth
- Insurance claims processing
- Lab results + prescription management
- HIPAA compliance engine with audit trails

## Architecture

```
apps/
├── provider-portal/        # Healthcare provider dashboard (Next.js)
├── patient-dashboard/      # Patient-facing portal (Next.js)
├── admin-portal/           # Platform admin (universal)
├── billing-dashboard/      # Billing management (universal)
└── developer-portal/       # API docs for integrations

packages/
├── patient-core/           # Patient data models + CRUD
├── ehr-core/               # Electronic health records
├── scheduling-core/        # Appointment booking
├── claims-core/            # Insurance claims processing
├── prescription-core/      # Rx management
├── lab-results-core/       # Lab result ingestion
├── hipaa-core/             # HIPAA compliance engine
├── telehealth-core/        # Video consultation
├── auth-core/              # Authentication (universal)
├── billing-core/           # Stripe billing (universal)
├── tenant-core/            # Multi-tenancy (universal)
└── audit-core/             # Audit trail (universal)

services/
├── patient-api/            # Patient data service (Hono)
├── scheduling-api/         # Appointment service
├── claims-api/             # Claims processing service
├── telehealth-api/         # Video + messaging service
└── compliance-api/         # HIPAA compliance checks
```

## Compliance Standards

| Standard     | Requirements                                              |
| ------------ | --------------------------------------------------------- |
| **HIPAA**    | PHI encryption, BAA, access controls, breach notification |
| **HITECH**   | EHR meaningful use, patient access rights                 |
| **SOC2**     | Security controls, audit trails, incident response        |
| **HL7 FHIR** | Healthcare data interoperability standard                 |

## Domain Skills

```json
{
  "hipaa-compliance": {
    "type": "guardrail",
    "enforcement": "block",
    "promptTriggers": [
      { "keywords": ["patient", "PHI", "health", "medical", "HIPAA"] }
    ]
  },
  "fhir-interop": {
    "type": "domain",
    "enforcement": "suggest",
    "promptTriggers": [
      { "keywords": ["FHIR", "HL7", "interoperability", "EHR"] }
    ]
  }
}
```

## Domain Agents

| Agent                     | Purpose                            |
| ------------------------- | ---------------------------------- |
| `hipaa-compliance-expert` | HIPAA/HITECH compliance validation |
| `ehr-specialist`          | EHR data models and HL7 FHIR       |
| `claims-processor`        | Insurance claims lifecycle         |
| `telehealth-architect`    | Video/messaging infrastructure     |

## Key Integrations

- **Epic/Cerner** — EHR system connectors via FHIR API
- **Stripe** — Patient billing, insurance co-pays
- **Twilio** — Telehealth video, SMS appointment reminders
- **DocuSign** — Consent forms, BAAs
- **AWS HealthLake** — FHIR-compliant data store

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain healthcare --name "HealthPlatform" --compliance "HIPAA,SOC2,HITECH"

# 2. Create domain packages
pnpm create @code-engine/package patient-core
pnpm create @code-engine/package ehr-core
pnpm create @code-engine/package hipaa-core

# 3. Start building
claude "Build the patient management API with HIPAA-compliant audit trails"
```

## Timeline

| Phase        | Duration     | Deliverable                     |
| ------------ | ------------ | ------------------------------- |
| Setup + Auth | 2 days       | Auth, multi-tenancy, billing    |
| Patient Core | 5 days       | Patient CRUD, EHR models        |
| Scheduling   | 3 days       | Appointment booking + reminders |
| Claims       | 5 days       | Insurance claims processing     |
| Telehealth   | 4 days       | Video consultations             |
| Compliance   | 3 days       | HIPAA evidence packs, audit     |
| **Total**    | **~4 weeks** | Production-ready                |

## Health & Readiness Endpoints

Every service MUST expose structured health check endpoints:

| Endpoint              | Purpose         | Response                                                                                   |
| --------------------- | --------------- | ------------------------------------------------------------------------------------------ |
| `GET /health`         | Liveness probe  | `{ "status": "ok", "service": "<name>", "version": "<semver>", "timestamp": "<ISO>" }`     |
| `GET /health/ready`   | Readiness probe | `{ "status": "ready", "dependencies": { "database": "connected", "cache": "connected" } }` |
| `GET /health/startup` | Startup probe   | `{ "status": "started", "uptime_seconds": 42 }`                                            |

### Implementation Pattern

```typescript
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: config.serviceName,
    version: config.version,
    timestamp: new Date().toISOString(),
  });
});

app.get("/health/ready", async (c) => {
  const db = await checkDatabase();
  const cache = await checkCache();
  const status = db && cache ? "ready" : "degraded";
  return c.json(
    {
      status,
      dependencies: {
        database: db ? "connected" : "disconnected",
        cache: cache ? "connected" : "disconnected",
      },
    },
    status === "ready" ? 200 : 503,
  );
});
```

Health checks are consumed by:

- **Kubernetes**: liveness/readiness/startup probes
- **AWS ECS**: container health checks
- **Load balancers**: target group health checks
- **Monitoring**: uptime dashboards and alerting

## Failure Fingerprinting & Incident Response

All errors produce structured, machine-readable JSON with fingerprints for deduplication:

### Error Schema

```typescript
interface StructuredError {
  fingerprint: string; // SHA-256 hash for deduplication
  severity: "critical" | "high" | "medium" | "low";
  service: string;
  environment: string;
  message: string;
  stack_trace: string;
  timestamp: string;
  request_id: string;
  trace_id: string;
  context: Record<string, unknown>;
  cause_chain: string[];
}
```

### Fingerprint Generation

```typescript
import { createHash } from "crypto";

function generateFingerprint(error: Error, service: string): string {
  const normalized = `${service}:${error.constructor.name}:${error.message.replace(/[0-9a-f-]{36}/g, "<UUID>")}`;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
```

### Incident Response Pipeline

1. **Detection**: Error captured by structured logger → fingerprinted
2. **Deduplication**: Same fingerprint within 24h window → increment counter (no duplicate alerts)
3. **Escalation**: 3+ occurrences of same fingerprint → escalate to `critical` severity
4. **Fix PR**: Auto-generated fix branch `fix/<service>/<fingerprint>` with context bundle
5. **Verification**: CI validates fix → auto-merge if tests pass
6. **Resolution**: Fingerprint marked resolved, added to known-issues registry

## Anti-Pattern Prevention & Memory

### Never Repeat Mistakes

Every session MUST check `MEMORY.md` before starting work. Known anti-patterns are engineering defects if repeated:

```bash
# Session start — mandatory
cat .claude/memory/MEMORY.md 2>/dev/null || echo "No memory file — create one"
```

### Known Anti-Patterns Registry

| Anti-Pattern                | Prevention                                      | Detection                                       |
| --------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| Mock data in production     | Zero Mock Data policy — all data from real APIs | `grep -r "mockData\|MOCK_\|fakeName" src/`      |
| Hardcoded secrets           | Environment variables + secret manager          | `grep -r "sk_live\|password.*=.*['\"]" src/`    |
| Missing health endpoints    | Health check middleware on every service        | CI check: every service has `/health` route     |
| Orphan files after refactor | Delete old files in same commit as new          | `codemap refs` — unreferenced files = orphans   |
| Duplicate implementations   | One canonical implementation per feature        | `codemap where <symbol>` — multiple = duplicate |
| Cascading workflow triggers | Max depth 2 for workflow chains                 | Audit `workflow_run` triggers quarterly         |

### Memory File Template

```markdown
# MEMORY.md — Project Memory

## Resolved Issues

<!-- Each resolved issue with root cause and fix -->

## Known Anti-Patterns

<!-- Patterns that caused incidents — NEVER repeat -->

## Architectural Decisions

<!-- Key decisions with rationale (link to ADRs) -->

## Lessons Learned

<!-- Session-by-session learnings -->
```

### Incident Documentation

Every production incident generates a document:

```
docs/incidents/
├── YYYY-MM-DD-<short-description>.md
└── INCIDENT_TEMPLATE.md
```

Each incident includes: root cause analysis, fix applied, prevention steps, fingerprint for future detection.
