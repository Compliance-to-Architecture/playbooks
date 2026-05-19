# Document Control Platform — Code Engine Example

> Built with the Coding Engine. Enterprise document management & compliance.

## What This Builds

An enterprise document control system for regulated industries:

- Document lifecycle management (draft → review → approve → release → retire)
- Version control with full audit trail
- Controlled document distribution
- Electronic signatures (21 CFR Part 11 compliant)
- Document classification & metadata tagging
- Automated review cycles & approval workflows
- Change control management (ECN/ECO)
- Training record tracking (read & understood)
- Regulatory submission packages
- Full-text search with OCR for scanned documents
- Retention policies & legal holds

## Architecture

```
apps/
├── document-portal/        # Document browsing, search, checkout
├── review-center/          # Document review & approval workflow
├── training-tracker/       # Training assignments & compliance
├── submission-builder/     # Regulatory submission assembly
├── admin-portal/           # Platform admin (universal)

packages/
├── document-core/          # Document CRUD, versions, metadata
├── workflow-core/          # Review/approval workflow engine
├── signature-core/         # Electronic & digital signatures
├── classification-core/    # Document types, categories, tags
├── distribution-core/      # Controlled copy distribution
├── change-control-core/    # ECN/ECO change management
├── training-core/          # Training assignments, records, quizzes
├── retention-core/         # Retention schedules, legal holds
├── search-core/            # Full-text search, OCR integration
├── submission-core/        # Regulatory submission packaging

services/
├── document-api/           # Document management service
├── workflow-api/           # Workflow orchestration service
├── signature-api/          # E-signature service
├── search-api/             # Search & indexing service
├── training-api/           # Training management service
```

## Key Patterns

### Document Lifecycle

```typescript
// packages/document-core/src/lifecycle.ts

type DocStatus =
  | "draft"
  | "in_review"
  | "pending_approval"
  | "approved"
  | "released"
  | "effective"
  | "superseded"
  | "obsolete"
  | "archived";

interface ControlledDocument {
  id: string;
  documentNumber: string; // e.g., "SOP-QA-001"
  title: string;
  type:
    | "sop"
    | "policy"
    | "specification"
    | "form"
    | "manual"
    | "drawing"
    | "report";
  version: string; // Semantic: "1.0", "1.1", "2.0"
  revision: number; // Auto-increment per version
  status: DocStatus;
  classification: "public" | "internal" | "confidential" | "restricted";
  department: string;
  owner: string;
  author: string;
  effectiveDate?: Date;
  expirationDate?: Date;
  retentionYears: number;
  reviewCycleMonths: number; // Periodic review requirement
  nextReviewDate?: Date;
  changeHistory: ChangeRecord[];
  signatures: SignatureRecord[];
  trainingRequired: boolean;
  relatedDocuments: string[];
}

interface ChangeRecord {
  version: string;
  date: Date;
  author: string;
  description: string;
  changeType: "minor" | "major"; // Minor = same version, Major = new version
  sections: string[]; // Sections changed
}
```

### Approval Workflow

```typescript
// packages/workflow-core/src/approval.ts

interface ApprovalWorkflow {
  documentId: string;
  stages: ApprovalStage[];
  currentStage: number;
  status: "active" | "completed" | "rejected" | "cancelled";
}

interface ApprovalStage {
  name: string;
  type: "sequential" | "parallel" | "any_one";
  approvers: Approver[];
  deadline: Date;
  escalation?: { afterHours: number; escalateTo: string };
}

interface Approver {
  userId: string;
  role: "reviewer" | "approver" | "quality_approver";
  decision?: "approved" | "rejected" | "approved_with_comments";
  comments?: string;
  signature?: SignatureRecord;
  decidedAt?: Date;
}

// 21 CFR Part 11 compliant signature
interface SignatureRecord {
  userId: string;
  fullName: string;
  meaning: "authored" | "reviewed" | "approved" | "verified";
  timestamp: Date;
  method: "password" | "biometric" | "certificate";
  ipAddress: string;
  deviceFingerprint: string;
}
```

## Data Stack

- **PostgreSQL** — Documents, workflows, signatures, training
- **Meilisearch** — Full-text document search
- **S3/R2** — Document file storage (versioned)
- **Redis** — Workflow state, notification queue

## Compliance Standards

| Standard               | Requirements                        |
| ---------------------- | ----------------------------------- |
| **FDA 21 CFR Part 11** | Electronic records & signatures     |
| **ISO 9001**           | Quality management document control |
| **ISO 13485**          | Medical device quality system       |
| **GxP**                | Good practice documentation         |
| **SOX**                | Financial document retention        |
| **GDPR**               | Data retention & right to erasure   |

## Getting Started

```bash
npx coding-engine init --domain document-control --name "DocVault" --compliance "FDA-21CFR11,ISO9001,GDPR"
```

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

## Billing & Monetization

### Subscription Tiers

| Tier           | Limits                                                                            | Price      |
| -------------- | --------------------------------------------------------------------------------- | ---------- |
| **Free**       | 1,000 API calls/month, 1 user, community support                                  | $0/month   |
| **Pro**        | 50,000 API calls/month, 10 users, email support, analytics                        | $49/month  |
| **Business**   | 500,000 API calls/month, unlimited users, priority support, SSO, audit logs       | $199/month |
| **Enterprise** | Unlimited, dedicated infrastructure, SLA, compliance reports, custom integrations | Custom     |

### Usage Metering

All API calls are metered via Stripe Usage Records:

```typescript
await stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
  quantity: 1,
  timestamp: Math.floor(Date.now() / 1000),
  action: "increment",
});
```

### Billing Events

| Event                    | Trigger         | Action                             |
| ------------------------ | --------------- | ---------------------------------- |
| `subscription.created`   | New signup      | Provision tenant resources         |
| `subscription.updated`   | Plan change     | Adjust resource limits             |
| `subscription.deleted`   | Cancellation    | Schedule data retention + cleanup  |
| `invoice.payment_failed` | Payment failure | Grace period → downgrade → suspend |
| `usage_record.created`   | API call        | Increment usage counter            |
