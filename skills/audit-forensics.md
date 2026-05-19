# Audit & Forensics

> Immutable audit trails, chain of custody tracking, forensic query capabilities, and SOX/SOC2 compliance for regulated environments.

## Core Principles

1. **Immutability** — Audit records are append-only and cryptographically chained; once written, no record can be modified or deleted, ensuring tamper-evident logs that satisfy regulatory evidence requirements.
2. **Chain of Custody** — Every data mutation records who performed the action, what changed, when it occurred, why it was authorized, and which system processed it, forming an unbroken custody chain from creation to current state.
3. **Forensic Queryability** — Audit data is indexed and structured for efficient temporal queries, enabling investigators to reconstruct the exact state of any resource at any point in time within the retention window.

## Patterns

### Pattern 1: Cryptographically Chained Audit Log

Each audit entry includes a hash of the previous entry, creating a tamper-evident chain that can be verified independently to detect any unauthorized modifications.

```typescript
interface AuditEntry {
  id: string;
  timestamp: Date;
  actor: { userId: string; role: string; ip: string };
  action: string;
  resource: { type: string; id: string };
  changes: { field: string; before: unknown; after: unknown }[];
  previousHash: string;
  hash: string;
}

function createAuditEntry(
  actor: AuditEntry["actor"],
  action: string,
  resource: AuditEntry["resource"],
  changes: AuditEntry["changes"],
  previousHash: string,
): AuditEntry {
  const entry: Omit<AuditEntry, "hash"> = {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    actor,
    action,
    resource,
    changes,
    previousHash,
  };
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(entry))
    .digest("hex");
  return { ...entry, hash };
}
```

### Pattern 2: Point-in-Time State Reconstruction

Query the audit trail to reconstruct the exact state of any resource at a specific timestamp by replaying changes from the initial creation event forward.

```typescript
async function reconstructStateAt<T>(
  resourceType: string,
  resourceId: string,
  targetTime: Date,
): Promise<T> {
  const entries = await db.auditLog.findMany({
    where: {
      resourceType,
      resourceId,
      timestamp: { lte: targetTime },
    },
    orderBy: { timestamp: "asc" },
  });
  if (entries.length === 0) {
    throw new Error(`No audit trail for ${resourceType}/${resourceId}`);
  }
  let state: Record<string, unknown> = {};
  for (const entry of entries) {
    for (const change of entry.changes) {
      state[change.field] = change.after;
    }
  }
  return state as T;
}
```

### Pattern 3: SOC2 Compliance Evidence Export

Generate structured evidence packs that map audit entries to SOC2 control objectives, producing auditor-ready reports with attestation metadata.

```typescript
interface EvidencePack {
  controlId: string;
  controlDescription: string;
  period: { from: Date; to: Date };
  entries: AuditEntry[];
  attestation: { generatedAt: Date; generatedBy: string; hash: string };
}

async function generateSOC2Evidence(
  controlId: string,
  period: { from: Date; to: Date },
): Promise<EvidencePack> {
  const controlMap: Record<string, { description: string; actions: string[] }> = {
    "CC6.1": { description: "Logical access controls", actions: ["login", "logout", "role.change"] },
    "CC7.2": { description: "System change management", actions: ["deploy", "config.update", "migration"] },
    "CC8.1": { description: "Change authorization", actions: ["approval.grant", "approval.deny"] },
  };
  const control = controlMap[controlId];
  const entries = await db.auditLog.findMany({
    where: { action: { in: control.actions }, timestamp: { gte: period.from, lte: period.to } },
    orderBy: { timestamp: "asc" },
  });
  const pack: EvidencePack = {
    controlId,
    controlDescription: control.description,
    period,
    entries,
    attestation: { generatedAt: new Date(), generatedBy: "system", hash: "" },
  };
  pack.attestation.hash = crypto.createHash("sha256").update(JSON.stringify(pack)).digest("hex");
  return pack;
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|-------------|-------------|-----------------|
| Mutable audit log records | Undermines the entire purpose of audit trails; regulators reject editable logs | Append-only storage with cryptographic chaining and write-once policies |
| Logging only successful actions | Failed access attempts and denied operations are critical forensic signals | Log all attempts with outcome status (success, denied, error) |
| Storing audit logs in the same database as application data | Application bugs or breaches can corrupt both operational and audit data | Separate audit storage with independent access controls and backups |
| No retention policy or lifecycle management | Unbounded log growth increases cost; missing logs fail compliance audits | Define retention periods per regulation (SOX: 7 years, SOC2: 1 year minimum) |

## Implementation Checklist

- [ ] Append-only audit table with cryptographic hash chain and write-once enforcement
- [ ] Every data mutation records actor, action, resource, changes, and authorization context
- [ ] Point-in-time reconstruction queries verified against known snapshots
- [ ] SOC2/SOX evidence pack generation automated with control-to-action mappings
- [ ] Audit log integrity verification job runs daily and alerts on chain breaks

## References

- [AICPA SOC2 Trust Services Criteria](https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services)
- [NIST SP 800-92 Guide to Computer Security Log Management](https://csrc.nist.gov/pubs/sp/800/92/final)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
