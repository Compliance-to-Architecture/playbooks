# Compliance Framework Skill

> **Enforcement**: suggest
> **Triggers**: compliance, SOC2, GDPR, HIPAA, PCI, audit, regulation, privacy, data-protection, evidence

## Overview

Universal compliance patterns applicable across regulated industries. Maps to specific standards based on domain (finance → PSD2/SOC2, healthcare → HIPAA, legal → GDPR, energy → NERC).

## Compliance Standards by Industry

| Industry | Standards | Key Requirements |
|----------|-----------|-----------------|
| **Finance** | SOC2, PSD2, PCI-DSS, ISO 27001 | Audit trails, SCA, encryption, ISMS |
| **Healthcare** | HIPAA, HITECH, SOC2 | PHI protection, BAA, access controls |
| **Legal** | GDPR, SOC2, eIDAS | Data minimization, right to erasure, e-signatures |
| **Energy** | NERC CIP, SOC2, ISO 27001 | Critical infrastructure protection |
| **General SaaS** | SOC2, GDPR, ISO 27001 | Security controls, privacy, ISMS |
| **Islamic Finance** | AAOIFI, IFSB, SOC2, PSD2 | Shariah governance, prudential standards |

## Audit Trail Pattern

```typescript
// packages/audit-core/src/audit-trail.ts

interface AuditEntry {
  id: string;
  timestamp: string;
  tenantId: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  changes?: { field: string; before: unknown; after: unknown }[];
  ipAddress: string;
  userAgent: string;
  result: "success" | "failure" | "denied";
  reason?: string;
}

// Middleware that automatically logs all API operations
function auditMiddleware() {
  return async (c: Context, next: () => Promise<void>) => {
    const startTime = Date.now();
    await next();

    await auditLog.record({
      tenantId: c.get("tenantId"),
      userId: c.get("userId"),
      action: `${c.req.method} ${c.req.path}`,
      resource: extractResource(c.req.path),
      resourceId: extractResourceId(c.req.path),
      ipAddress: c.req.header("x-forwarded-for") ?? "unknown",
      userAgent: c.req.header("user-agent") ?? "unknown",
      result: c.res.status < 400 ? "success" : "failure",
      duration_ms: Date.now() - startTime,
    });
  };
}
```

## Data Classification

```typescript
// packages/compliance-core/src/classification.ts

type DataClassification = "public" | "internal" | "confidential" | "restricted";

interface ClassifiedField {
  field: string;
  classification: DataClassification;
  piiType?: "name" | "email" | "phone" | "address" | "ssn" | "dob" | "financial";
  retentionDays: number;
  encryptAtRest: boolean;
  maskInLogs: boolean;
}

// Define per-model data classification
const USER_FIELDS: ClassifiedField[] = [
  { field: "email", classification: "confidential", piiType: "email", retentionDays: 365, encryptAtRest: true, maskInLogs: true },
  { field: "name", classification: "confidential", piiType: "name", retentionDays: 365, encryptAtRest: true, maskInLogs: true },
  { field: "phone", classification: "restricted", piiType: "phone", retentionDays: 365, encryptAtRest: true, maskInLogs: true },
  { field: "role", classification: "internal", retentionDays: -1, encryptAtRest: false, maskInLogs: false },
];
```

## Evidence Pack Generation

```typescript
// packages/compliance-core/src/evidence.ts

interface EvidencePack {
  standard: string;
  generatedAt: string;
  period: { from: string; to: string };
  controls: Array<{
    controlId: string;
    description: string;
    status: "pass" | "fail" | "not_applicable";
    evidence: Array<{
      type: "log" | "config" | "screenshot" | "report";
      description: string;
      uri: string;
    }>;
  }>;
}

async function generateSOC2Evidence(period: { from: Date; to: Date }): Promise<EvidencePack> {
  return {
    standard: "SOC2 Type II",
    generatedAt: new Date().toISOString(),
    period: { from: period.from.toISOString(), to: period.to.toISOString() },
    controls: [
      {
        controlId: "CC6.1",
        description: "Logical and physical access controls",
        status: "pass",
        evidence: [
          { type: "config", description: "Cerbos ABAC policies", uri: "/policies/" },
          { type: "log", description: "Access control audit logs", uri: "/logs/access/" },
        ],
      },
      {
        controlId: "CC7.2",
        description: "System monitoring",
        status: "pass",
        evidence: [
          { type: "config", description: "Health check configuration", uri: "/infra/monitoring/" },
          { type: "report", description: "Uptime report", uri: "/reports/uptime/" },
        ],
      },
    ],
  };
}
```

## GDPR Data Subject Requests

```typescript
// packages/compliance-core/src/dsr.ts

type DSRType = "access" | "erasure" | "rectification" | "portability" | "restriction";

async function handleDataSubjectRequest(params: {
  type: DSRType;
  subjectEmail: string;
  tenantId: string;
  requestedBy: string;
}): Promise<DSRResult> {
  switch (params.type) {
    case "access":
      return exportUserData(params.subjectEmail, params.tenantId);
    case "erasure":
      return eraseUserData(params.subjectEmail, params.tenantId);
    case "portability":
      return exportPortableData(params.subjectEmail, params.tenantId);
    case "rectification":
      return { status: "manual_review_required" };
    case "restriction":
      return restrictProcessing(params.subjectEmail, params.tenantId);
  }
}

## Core Principles

- **Compliance by Design, Not Retrofit**: Audit trails, data classification, encryption, and consent management must be built into the data model and API layer from day one. Bolting compliance on after launch requires costly schema rewrites and historical data remediation.
- **Immutable Audit Trail**: Every state change to sensitive resources must produce an append-only audit record. Records must never be updated or deleted; apply retention policies via archiving, not deletion.
- **Data Minimization**: Collect only the fields required for the stated processing purpose. Classify every field at schema design time (`public`, `internal`, `confidential`, `restricted`) and enforce masking in logs.
- **Evidence-Pack Automation**: Generate compliance evidence packs programmatically from live system state. Manual screenshot-based evidence is unreliable, unverifiable, and fails SOC2 Type II audits.
- **Standard-Specific Controls**: Map each compliance requirement to an explicit engineering control. CC6.1 → Cerbos ABAC; CC7.2 → health check monitoring; GDPR Art. 17 → erasure DSR handler. No compliance requirement is met by documentation alone.

## Patterns

- **Middleware Audit Logger**: Attach an `auditMiddleware()` to all API routes that automatically records `who`, `what`, `when`, `result`, and `ip` for every request. Avoid per-endpoint audit calls that are easy to forget.
- **GDPR DSR Handler per Request Type**: Implement each DSR type (`access`, `erasure`, `portability`, `rectification`, `restriction`) as a distinct async function with its own audit record and 30-day SLA timer.
- **Control-to-Evidence Mapping**: For each SOC2 or ISO 27001 control, store a reference to the automated evidence source (config file path, log query, or report endpoint). The evidence pack generator reads this map at audit time.
- **Consent Ledger**: Store consent grants as immutable events with `grantedAt`, `purpose`, `lawfulBasis`, and `withdrawnAt`. Never overwrite; always append. Query the latest record per subject for current consent status.
- **Data Residency Tags on Tenants**: Store `dataResidency: "EU" | "US" | "APAC"` on each tenant record and enforce it at the database routing layer. Prevent cross-region data leakage by rejecting writes to non-resident shards.

## Anti-Patterns

- **Mutable Audit Records**: Allowing `UPDATE` or `DELETE` on audit log tables means audit trails can be falsified. Use append-only tables with row-level `INSERT`-only permissions for the application role.
- **Unclassified PII in Logs**: Logging full email addresses, phone numbers, or financial account numbers in plaintext violates GDPR and SOC2. Mask PII fields (show only last 4 digits, hash or truncate) before writing to any log system.
- **Single Erasure Call Without Cascade**: Deleting a user record without cascading to all related tables (activity logs, billing records, session tokens, backups) leaves orphan PII that still violates the right to erasure.
- **Evidence Packs Produced Only at Audit Time**: If evidence is collected manually at the audit, it will be incomplete, inconsistent, or fabricated. Evidence must be continuously generated so the audit window contains a full year of records.
- **Conflating Data Retention with Data Deletion**: Retention policies define how long data is kept; erasure requests delete specific subject data. These are separate mechanisms — implementing only one while ignoring the other fails both GDPR and SOC2.

## Checklist

- [ ] Every API endpoint covered by `auditMiddleware()` — no unauthenticated mutations
- [ ] All PII fields classified in schema (`classification`, `piiType`, `maskInLogs`)
- [ ] GDPR DSR handlers implemented for all 5 request types with 30-day SLA tracking
- [ ] Evidence pack generated programmatically for each compliance standard in scope
- [ ] Audit log table is append-only; application role has `INSERT` permission only
- [ ] Data residency tag on each tenant enforced at storage layer
- [ ] Consent grants stored as immutable ledger events
- [ ] SOC2 / ISO 27001 control IDs mapped to specific engineering controls and evidence URIs

## References

- [SOC2 Trust Services Criteria (AICPA)](https://www.aicpa.org/resources/article/soc-2-trust-services-criteria)
- [GDPR Full Text — EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj)
- [AAOIFI Shariah Standards](https://aaoifi.com/shariah-standards/)
- [IFSB Prudential Standards](https://www.ifsb.org/published_ifsb_standards.php)
- [ISO 27001:2022 Controls Reference](https://www.iso.org/standard/82875.html)
```
