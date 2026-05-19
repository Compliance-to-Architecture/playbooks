# Architecture Pipeline Skill

> **Enforcement**: suggest
> **Triggers**: PRD, ERD, ARD, ADR, schema, architecture document, requirements document, entity relationship, decision record
> **Pattern**: pipeline (4 gated phases — PRD → ERD → ARD → Schema)

You are running an architecture documentation pipeline that generates the full compliance-traceable artifact chain: **PRD → ERD → ARD → Schema**. Execute each phase in order. Do NOT skip phases or proceed if the current phase fails or the user has not confirmed.

For regulated industries (finance, healthcare, legal), this chain IS the product — every design decision must be traceable from business requirement to deployed code.

## Phase 1 — PRD (Product Requirements Document)

Generate a structured PRD from the user's feature description.

### Input Required

Ask the user:

1. "What feature or system are you building? Describe in 1-3 sentences."
2. "Who are the users? (developers, business users, end consumers, admins)"
3. "Are there compliance requirements? (SOC2, GDPR, AAOIFI, PSD2, HIPAA, ISO 27001)"
4. "What are the hard constraints? (latency, uptime, data residency, budget)"

### PRD Template

```markdown
# PRD: {Feature Name}

> Version: 1.0
> Author: {agent}
> Date: {YYYY-MM-DD}
> Status: Draft

## 1. Problem Statement

{One paragraph describing the problem this feature solves.}

## 2. Users & Personas

| Persona | Role | Technical Level | Primary Goal |
|---------|------|-----------------|--------------|
| {name} | {role} | {low/medium/high} | {goal} |

## 3. Functional Requirements

### FR-1: {Requirement Title}
- **Description**: {what the system must do}
- **Acceptance Criteria**:
  - [ ] {testable criterion 1}
  - [ ] {testable criterion 2}
- **Priority**: {P0/P1/P2}

### FR-2: {Requirement Title}
{repeat for each requirement}

## 4. Non-Functional Requirements

| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| NFR-1 | Performance | p99 latency | < {N}ms |
| NFR-2 | Availability | Uptime SLA | {N}% |
| NFR-3 | Security | Encryption | AES-256 at rest, TLS 1.3 in transit |
| NFR-4 | Compliance | Standards | {list} |

## 5. Data Requirements

| Entity | Description | PII | Retention |
|--------|-------------|-----|-----------|
| {entity} | {what it represents} | {yes/no} | {duration} |

## 6. Integration Points

| System | Direction | Protocol | Purpose |
|--------|-----------|----------|---------|
| {system} | {inbound/outbound/bidirectional} | {REST/gRPC/event} | {purpose} |

## 7. Compliance Traceability

| Standard | Requirement ID | How This Feature Satisfies It |
|----------|---------------|-------------------------------|
| {standard} | {clause} | {explanation} |

## 8. Out of Scope

- {explicitly excluded item 1}
- {explicitly excluded item 2}

## 9. Open Questions

- [ ] {question that needs resolution}
```

### Compliance-Specific Sections

For **Islamic Finance (AAOIFI/IFSB)** projects, add:

```markdown
## Shariah Compliance

| AAOIFI Standard | Requirement | Implementation |
|-----------------|-------------|----------------|
| SS-{N} | {requirement from standard} | {how the feature implements it} |

### Shariah Board Governance
- **Fatwa Reference**: {reference number or "pending"}
- **Annual Audit Requirement**: {yes/no + scope}
- **Prohibited Elements**: {list of riba, gharar, maysir checks required}
```

For **Healthcare (HIPAA)** projects, add PHI handling table.
For **Financial (PSD2/PCI)** projects, add SCA and data handling requirements.

**Gate**: Do NOT proceed to Phase 2 until the user confirms the PRD.

---

## Phase 2 — ERD (Entity Relationship Diagram)

Generate database schema and entity relationships from the confirmed PRD.

### Extraction Process

1. Read all entities from PRD Section 5 (Data Requirements)
2. Identify relationships from functional requirements
3. Add audit fields to every entity (created_at, updated_at, created_by)
4. Add tenant_id to every entity (multi-tenant by default)
5. Tag PII fields from PRD data classification

### ERD Output Format

#### Prisma Schema (Machine-Readable)

```prisma
// Generated from PRD: {Feature Name}
// Date: {YYYY-MM-DD}

model {EntityName} {
  id        String   @id @default(cuid())
  tenantId  String   @map("tenant_id")
  // ... fields from PRD
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  createdBy String   @map("created_by")

  // Relations
  {relation} {RelatedEntity} @relation(fields: [{fk}], references: [id])

  // Indexes
  @@index([tenantId])
  @@map("{table_name}")
}
```

#### Relationship Table (Human-Readable)

```markdown
## Entity Relationships

| From | Relationship | To | Cardinality | FK Location |
|------|-------------|-----|-------------|-------------|
| {Entity A} | has many | {Entity B} | 1:N | Entity B.entityAId |
| {Entity C} | belongs to | {Entity D} | N:1 | Entity C.entityDId |
```

#### Data Classification Table

```markdown
## Data Classification

| Entity | Field | Classification | Encryption | Masking |
|--------|-------|---------------|------------|---------|
| User | email | PII | At rest | Logs |
| Contract | amount | Financial | At rest + transit | Never |
```

#### ERD Diagram Command

```bash
# Generate visual ERD using Liam
npx @liam-hq/cli erd build --input prisma/schema.prisma --output docs/architecture/erd/
```

**Gate**: Do NOT proceed to Phase 3 until the user confirms the ERD.

---

## Phase 3 — ARD (Architecture Decision Records)

Generate ADRs for significant design decisions identified during PRD and ERD phases.

### When to Generate an ARD

Generate an ARD for each decision that:

- Chooses between two or more viable alternatives
- Has long-term consequences that are hard to reverse
- Affects multiple services or components
- Has compliance implications
- Deviates from existing patterns in the codebase

### ARD Template

```markdown
# ARD-{NNN}: {Decision Title}

> Status: Proposed | Accepted | Deprecated | Superseded
> Date: {YYYY-MM-DD}
> Deciders: {who made this decision}
> Supersedes: {ARD-NNN if applicable}

## Context

{What is the issue that we're seeing that is motivating this decision?
What are the forces at play (technical, business, compliance)?}

## Decision

{What is the change that we're proposing and/or doing?
State the decision in one clear sentence, then elaborate.}

## Alternatives Considered

### Alternative 1: {Name}
- **Pros**: {list}
- **Cons**: {list}
- **Why rejected**: {reason}

### Alternative 2: {Name}
- **Pros**: {list}
- **Cons**: {list}
- **Why rejected**: {reason}

## Consequences

### Positive
- {positive consequence 1}
- {positive consequence 2}

### Negative
- {negative consequence 1 — and how we mitigate it}

### Neutral
- {neutral consequence — things that change but are neither good nor bad}

## Compliance Impact

| Standard | Impact | Mitigation |
|----------|--------|------------|
| {standard} | {how this decision affects compliance} | {what we do about it} |
```

### Common ARD Topics for Each Feature

Generate at minimum these ARDs:

1. **Data Storage**: Why this database/table structure? (references ERD from Phase 2)
2. **API Design**: REST vs GraphQL vs gRPC? Sync vs async?
3. **Authentication/Authorization**: How access is controlled for this feature
4. **Multi-Tenancy**: How tenant isolation is achieved
5. **Compliance**: How regulatory requirements are met (references PRD Section 7)

**Gate**: Do NOT proceed to Phase 4 until the user confirms the ARDs.

---

## Phase 4 — Schemas (API + Event + Validation)

Generate implementation-ready schemas from the confirmed PRD, ERD, and ARDs.

### Schema Types to Generate

#### 1. OpenAPI Schema (API Contract)

```yaml
# Generated from PRD: {Feature Name}
openapi: "3.1.0"
info:
  title: "{Feature Name} API"
  version: "1.0.0"

paths:
  /api/v1/{resource}:
    post:
      summary: "Create {resource}"
      operationId: "create{Resource}"
      tags: ["{domain}"]
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/Create{Resource}Request"
      responses:
        "201":
          description: "Created"
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/{Resource}Response"
        "400":
          $ref: "#/components/responses/ValidationError"
        "401":
          $ref: "#/components/responses/Unauthorized"
        "403":
          $ref: "#/components/responses/Forbidden"

components:
  schemas:
    Create{Resource}Request:
      type: object
      required: [{required_fields}]
      properties:
        # ... from ERD entity fields
    {Resource}Response:
      type: object
      properties:
        # ... from ERD entity fields + computed
```

#### 2. Zod Validation Schema (Runtime)

```typescript
// Generated from PRD: {Feature Name}
import { z } from "zod";

export const create{Resource}Schema = z.object({
  // Required fields from ERD
  name: z.string().min(1).max(255),
  amount: z.number().positive(),
  currency: z.string().length(3), // ISO 4217

  // Optional fields
  description: z.string().max(2000).optional(),

  // Tenant-scoped (injected by middleware, not user-provided)
  // tenantId: injected from auth context
});

export type Create{Resource}Input = z.infer<typeof create{Resource}Schema>;

export const {resource}ResponseSchema = z.object({
  id: z.string().cuid(),
  ...create{Resource}Schema.shape,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type {Resource}Response = z.infer<typeof {resource}ResponseSchema>;
```

#### 3. Event Envelope Schema (Async Communication)

```typescript
// Generated from PRD: {Feature Name}
// ISO 20022 compatible event envelope

export interface {Resource}CreatedEvent {
  /** Event metadata */
  metadata: {
    eventId: string;        // CUID
    eventType: "{resource}.created";
    version: "1.0";
    timestamp: string;      // ISO 8601
    source: string;         // service name
    tenantId: string;
    correlationId: string;  // request trace ID
  };

  /** Event payload — matches {Resource}Response */
  payload: {
    id: string;
    // ... fields from ERD
  };

  /** Compliance fields */
  compliance: {
    dataClassification: "internal" | "confidential" | "restricted";
    retentionDays: number;
    auditRequired: boolean;
  };
}
```

#### 4. Cerbos Policy Schema (Authorization)

```yaml
# Generated from PRD: {Feature Name}
apiVersion: api.cerbos.dev/v1
resourcePolicy:
  version: "default"
  resource: "{resource}"
  rules:
    - actions: ["create", "read"]
      effect: EFFECT_ALLOW
      roles: ["tenant_admin", "operator"]
      condition:
        match:
          expr: request.resource.attr.tenantId == request.principal.attr.tenantId

    - actions: ["update", "delete"]
      effect: EFFECT_ALLOW
      roles: ["tenant_admin"]
      condition:
        match:
          expr: request.resource.attr.tenantId == request.principal.attr.tenantId

    - actions: ["read"]
      effect: EFFECT_ALLOW
      roles: ["viewer"]
      condition:
        match:
          expr: request.resource.attr.tenantId == request.principal.attr.tenantId
```

### Output File Structure

```
docs/architecture/{feature}/
├── PRD-{feature}.md           # Phase 1 output
├── ERD-{feature}.prisma       # Phase 2 output (schema)
├── ERD-{feature}.md           # Phase 2 output (relationships)
├── ARD-001-{decision}.md      # Phase 3 outputs
├── ARD-002-{decision}.md
├── openapi-{feature}.yaml     # Phase 4 output
├── schemas/
│   ├── {resource}.schema.ts   # Zod validation
│   └── {resource}.events.ts   # Event envelopes
└── policies/
    └── {resource}.yaml        # Cerbos policy
```

**Gate**: Review all generated schemas against the PRD acceptance criteria. Every FR must have a corresponding API endpoint. Every entity must have a corresponding schema.

---

## Quality Checklist

After all 4 phases, run this checklist:

```markdown
## Architecture Pipeline Quality Report

### Traceability
- [ ] Every FR in PRD has a corresponding API endpoint in OpenAPI schema
- [ ] Every entity in PRD has a corresponding model in ERD
- [ ] Every design decision has an ARD
- [ ] Every compliance requirement in PRD has a traceability entry

### Completeness
- [ ] PRD covers all functional and non-functional requirements
- [ ] ERD includes all entities, relationships, and indexes
- [ ] ARDs cover data storage, API design, auth, multi-tenancy, compliance
- [ ] Schemas include OpenAPI, Zod, events, and Cerbos policies

### Compliance
- [ ] PII fields identified and classified in ERD
- [ ] Encryption requirements specified for sensitive fields
- [ ] Audit trail fields present on all entities (created_at, updated_at, created_by)
- [ ] Tenant isolation enforced in all schemas and policies
- [ ] Regulatory standard traceability complete (AAOIFI/GDPR/SOC2/etc.)

### Consistency
- [ ] Entity names consistent across PRD, ERD, schemas
- [ ] Field names use snake_case in DB, camelCase in API
- [ ] All timestamps are ISO 8601
- [ ] All IDs are CUID format
```

## Anti-Patterns

- **Skipping PRD**: Never generate ERD/schemas without confirmed requirements. You will model the wrong domain.
- **ERD without relationships**: A list of tables is not an ERD. Relationships and cardinality are the point.
- **ARDs without alternatives**: An ADR that says "we chose X" without listing what else was considered is not a decision record — it's a description.
- **Schemas without validation**: OpenAPI without Zod means runtime validation is missing. Generate both.
- **Copy-paste compliance**: Don't add "SOC2 compliant" without specifying which control and how. Auditors reject generic claims.

## Principles

- **Requirements before design**: PRD gates ERD. No modeling without confirmed requirements.
- **Decisions are first-class artifacts**: ARDs are as important as code. They answer "why" for auditors and future developers.
- **Schemas are contracts**: Once published, schemas are promises to consumers. Design carefully.
- **Compliance is structural**: Built into every entity (audit fields, tenant isolation, PII tagging), not bolted on afterward.
- **One source of truth per artifact**: PRD in `docs/architecture/{feature}/`, not scattered across Notion/Jira/Slack.
