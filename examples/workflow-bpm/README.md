# Business Process Management Platform — Code Engine Example

> Built with the Coding Engine. From zero to production-grade BPM platform with visual process design, dynamic form building, approval chains, and process automation analytics.

## What This Builds

A comprehensive business process management platform with:

- **Process Designer** — Visual BPMN 2.0 editor, drag-and-drop workflow building, process versioning
- **Form Builder** — Dynamic form creation, conditional logic, data validation, file attachments
- **Approval Chains** — Multi-level approvals, parallel/sequential routing, delegation, escalation
- **Automation Rules** — Event-driven triggers, conditional branching, timer events, webhook integration
- **Process Analytics** — Cycle time analysis, bottleneck detection, SLA tracking, process mining
- **Case Management** — Ad-hoc workflows, case folders, decision tracking, collaboration
- **Integration Hub** — REST/webhook connectors, ERP integration, email/Slack/Teams triggers
- **Compliance Workflows** — Audit-ready processes, evidence collection, regulatory checklists

## Architecture

```
apps/
├── process-studio/            # Process designer workspace (Next.js 15)
├── task-inbox/                # User task inbox + forms (Next.js 15)
├── analytics-dashboard/       # Process analytics (Next.js 15)
├── admin-portal/              # Platform administration (Next.js 15)
├── integration-console/       # Connector management portal
└── docs/                      # API documentation (VitePress)

packages/
├── process-core/              # BPMN engine + execution runtime
├── form-core/                 # Dynamic form builder + rendering
├── approval-core/             # Approval chain + delegation logic
├── automation-core/           # Rules engine + event triggers
├── analytics-core/            # Process mining + metrics
├── case-core/                 # Case management + folders
├── connector-core/            # Integration adapters
├── notification-core/         # Multi-channel notifications
├── sla-core/                  # SLA definition + tracking
├── auth-core/                 # Authentication + RBAC (universal)
├── billing-core/              # Stripe billing integration (universal)
├── tenant-core/               # Multi-tenancy isolation (universal)
└── audit-core/                # Audit trail (universal)

services/
├── engine-api/                # Process execution engine (Hono)
├── form-api/                  # Form submission + validation
├── task-api/                  # Task assignment + completion
├── automation-api/            # Event processing + rules
├── analytics-api/             # Process metrics + reporting
└── connector-api/             # External system integration
```

## Compliance Standards

| Standard      | Requirements                                                             |
| ------------- | ------------------------------------------------------------------------ |
| **SOC2**      | Access controls, audit trails, change management, incident response      |
| **ISO 9001**  | Quality management system, process documentation, continuous improvement |
| **GDPR**      | Data subject access requests, consent workflows, data processing records |
| **ISO 27001** | Information security in process data, access control, risk management    |
| **SOX**       | Financial process controls, segregation of duties, approval evidence     |
| **HIPAA**     | Healthcare workflow PHI handling, access logging, minimum necessary      |

## Multi-Tenancy

Each organization operates as an isolated tenant:

- **Database isolation**: Row-level security with `tenant_id`; process data encrypted per tenant
- **Tenant resolution**: Subdomain (`acmecorp.bpm-platform.com`) or SSO domain mapping
- **Process isolation**: Tenant-scoped process definitions, instances, and task queues
- **Form isolation**: Per-tenant form templates, submission data, and file storage
- **Organizational structure**: Per-tenant org hierarchy for role resolution and delegation
- **Integration credentials**: Per-tenant connector configurations and API keys stored encrypted

```typescript
// Tenant-scoped process instance query
const getProcessInstances = async (
  tenantId: string,
  filters: ProcessFilters,
) => {
  assert(tenantId, "Tenant ID required for process queries");

  return db.processInstance.findMany({
    where: {
      tenant_id: tenantId,
      process_definition_id: filters.processId,
      status: filters.status,
      started_at: filters.dateRange
        ? {
            gte: filters.dateRange.start,
            lte: filters.dateRange.end,
          }
        : undefined,
    },
    include: {
      current_tasks: { where: { status: "pending" } },
      variables: true,
    },
    orderBy: { started_at: "desc" },
    take: Math.min(filters.limit ?? 50, MAX_INSTANCE_QUERY_SIZE),
  });
};
```

## Tech Stack

| Layer          | Technology              | Purpose                                  |
| -------------- | ----------------------- | ---------------------------------------- |
| Frontend       | Next.js 15, Sera UI     | Process studio, task inbox               |
| API Framework  | Hono                    | Lightweight, edge-ready API services     |
| Process Engine | Custom BPMN 2.0 runtime | Workflow execution + state management    |
| Database       | PostgreSQL 16           | Process data, forms, tasks with RLS      |
| Cache          | Redis 7                 | Task assignments, session state, locks   |
| Search         | Meilisearch             | Process search, task search, form search |
| Queue          | BullMQ                  | Timer events, async tasks, notifications |
| BPMN Editor    | bpmn.io / custom        | Visual process designer                  |
| Form Renderer  | React JSON Schema Form  | Dynamic form rendering                   |
| Auth           | Clerk + custom RBAC     | Identity + role-based access             |
| Billing        | Stripe                  | Subscription + usage-based billing       |
| Monitoring     | OpenTelemetry + Grafana | Distributed tracing, metrics             |
| Edge           | Cloudflare Workers      | API routing, webhook ingestion           |

## Observability

Full-stack observability for process operations:

- **Distributed Tracing**: OpenTelemetry traces across engine-api, task-api, automation-api
- **Metrics**: Processes started/completed, avg cycle time, task backlog, SLA compliance rate
- **Structured Logging**: JSON logs with `tenant_id`, `process_id`, `task_id`, `assignee_id`, severity
- **Dashboards**: Grafana — Process Pipeline, Task Queue Depth, SLA Compliance, Bottleneck Analysis
- **Alerting**: PagerDuty — SLA breach imminent, task queue overflow, engine execution errors
- **SLOs**: 99.9% engine uptime, < 500ms task assignment, < 2s form submission, < 1min timer accuracy

```typescript
logger.info({
  service: "engine-api",
  event: "process.task_completed",
  tenant_id: tenant.id,
  process_instance_id: instance.id,
  process_definition: instance.definitionKey,
  task_id: task.id,
  task_name: task.name,
  assignee_id: task.assigneeId,
  duration_ms: task.completionDurationMs,
  trace_id: span.traceId,
  timestamp: new Date().toISOString(),
});
```

## Health & Readiness Endpoints

Every service exposes standardized health checks:

```typescript
// services/engine-api/src/routes/health.ts
import { Hono } from "hono";

const health = new Hono();

health.get("/health", async (c) => {
  const checks = {
    status: "healthy",
    service: "engine-api",
    version: process.env.APP_VERSION,
    timestamp: new Date().toISOString(),
    checks: {
      database: await checkPostgres(),
      redis: await checkRedis(),
      queue: await checkBullMQ(),
      search: await checkMeilisearch(),
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
    checkProcessDefinitionsLoaded(),
    checkTimerSchedulerRunning(),
  ]);
  const isReady = ready.every((r) => r.ok);
  return c.json({ ready: isReady, details: ready }, isReady ? 200 : 503);
});
```

## Failure Fingerprinting & Incident Response

All failures produce fingerprinted, structured error events:

```typescript
// packages/process-core/src/errors.ts
interface BPMFailure {
  fingerprint: string;
  service: string;
  severity: "critical" | "high" | "medium" | "low";
  category:
    | "engine"
    | "task"
    | "form"
    | "automation"
    | "integration"
    | "infrastructure";
  tenant_id: string;
  error_code: string; // e.g., "PROCESS_DEADLOCK", "SLA_BREACH"
  message: string;
  stack_trace: string;
  context: {
    process_instance_id?: string;
    process_definition?: string;
    task_id?: string;
    connector_id?: string;
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

**Incident pipeline**: Failure detected -> Fingerprint generated -> Deduplicated -> If `error_code === "PROCESS_DEADLOCK"`, trigger automatic deadlock resolution + admin alert -> Auto-create fix PR or escalate -> Track in `/docs/incidents/`.

## Anti-Pattern Prevention & Memory

| Anti-Pattern                           | Prevention                                                     |
| -------------------------------------- | -------------------------------------------------------------- |
| Process definition without tests       | Process test suite required before deployment to production    |
| Infinite loop in process execution     | Maximum token count per instance (10,000); circuit breaker     |
| Tasks assigned to inactive users       | Active directory sync; auto-reassign on user deactivation      |
| Form submissions without validation    | Server-side validation mandatory; client-side is supplementary |
| Timer events drifting over time        | Persistent timers with drift correction; no in-memory-only     |
| Approval without segregation of duties | SOX-compliant: approver cannot be same as initiator            |

**MEMORY.md template**:

```markdown
## Known Issues

- [ ] BPMN editor performance degrades with > 100 nodes — implement virtualization
- [ ] Parallel gateway join fails when one branch completes too fast — add wait barrier

## Resolved Incidents

- [INC-001] Process deadlock with circular delegation — added cycle detection
- [INC-002] Timer events lost during engine restart — migrated to persistent timer store
```

## Billing & Monetization

**Subscription Tiers**:

| Tier       | Processes | Instances/mo | Users     | Price   |
| ---------- | --------- | ------------ | --------- | ------- |
| Team       | 10        | 500          | 25        | $299/mo |
| Business   | 50        | 5,000        | 100       | $999/mo |
| Enterprise | Unlimited | Unlimited    | Unlimited | Custom  |

**Usage Metering** (Stripe Meters):

- `bpm.instances.executed` — Process instances started above tier
- `bpm.tasks.completed` — Human task completions
- `bpm.forms.submitted` — Form submission volume
- `bpm.connectors.invocations` — External connector API calls

**Billing Events**:

```typescript
await stripe.billing.meterEvents.create({
  event_name: "bpm.instances.executed",
  payload: {
    stripe_customer_id: tenant.stripeCustomerId,
    value: "1",
    process_definition: instance.definitionKey,
  },
});
```

## Getting Started

```bash
# 1. Initialize with coding engine
npx coding-engine init --domain bpm --name "FlowOS" \
  --compliance "SOC2,ISO9001,GDPR"

# 2. Create domain packages
pnpm create @code-engine/package process-core
pnpm create @code-engine/package form-core
pnpm create @code-engine/package approval-core
pnpm create @code-engine/package automation-core

# 3. Start development
pnpm install
pnpm dev

# 4. Run compliance checks
pnpm run compliance:soc2
pnpm run compliance:iso9001-process-audit
```

## Timeline

| Phase               | Duration     | Deliverable                             |
| ------------------- | ------------ | --------------------------------------- |
| Setup + Auth        | 2 days       | Auth, multi-tenancy, org hierarchy      |
| Process Engine      | 5 days       | BPMN runtime, gateways, events          |
| Process Designer    | 4 days       | Visual editor, versioning, deployment   |
| Form Builder        | 4 days       | Dynamic forms, validation, file uploads |
| Approvals & Tasks   | 3 days       | Task inbox, delegation, escalation      |
| Automation & Rules  | 3 days       | Triggers, timers, webhook integration   |
| Compliance + Launch | 3 days       | SOC2 evidence, ISO 9001 audit, go-live  |
| **Total**           | **~5 weeks** | Production-ready BPM platform           |
