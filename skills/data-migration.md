# Data Migration

> Zero-downtime migrations, backward compatibility, rollback strategies, seed data, data validation, and schema versioning for safe database evolution.

## Core Principles

1. **Expand-Contract Pattern** — Never remove or rename columns in a single step. First add the new column (expand), migrate data, update all consumers, then remove the old column (contract). Each step is a separate deployment.
2. **Every Migration Must Be Reversible** — Write both `up` and `down` migrations. If a migration cannot be reversed (destructive), document it explicitly and require manual approval.
3. **Zero-Downtime Is Non-Negotiable** — Production migrations must complete while the application serves traffic. No maintenance windows for schema changes. Use online DDL tools for large tables.
4. **Validate Before and After** — Run data validation queries before migration (preconditions) and after (postconditions). Catch data corruption at the migration boundary, not in production traffic.
5. **Seed Data Is Not Mock Data** — Seed data provides realistic initial state for development and testing. It must be versioned, idempotent, and representative of production patterns.

## Patterns

### Pattern 1: Expand-Contract Migration

```typescript
// Step 1: EXPAND — Add new column (backward compatible)
// Migration: 20250301_add_contract_status_v2.ts
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('contracts')
    .addColumn('status_v2', 'varchar(50)')
    .execute();

  // Backfill in batches
  let lastId = '';
  while (true) {
    const batch = await db.selectFrom('contracts')
      .select(['id', 'status'])
      .where('id', '>', lastId)
      .orderBy('id')
      .limit(1000)
      .execute();

    if (batch.length === 0) break;

    for (const row of batch) {
      await db.updateTable('contracts')
        .set({ status_v2: mapStatusToV2(row.status) })
        .where('id', '=', row.id)
        .execute();
    }
    lastId = batch[batch.length - 1].id;
  }
}

// Step 2: Update all consumers to read from status_v2
// Step 3: CONTRACT — Remove old column (separate migration, separate deploy)
export async function up_contract(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('contracts')
    .dropColumn('status')
    .execute();
  await db.schema.alterTable('contracts')
    .renameColumn('status_v2', 'status')
    .execute();
}
```

### Pattern 2: Batch Data Migration with Checkpointing

```typescript
interface MigrationCheckpoint {
  lastProcessedId: string;
  totalProcessed: number;
  startedAt: Date;
  status: 'running' | 'completed' | 'failed';
}

async function migrateInBatches(
  batchSize: number = 1000,
  checkpointKey: string = 'migration:contract-status-v2',
): Promise<void> {
  // Resume from checkpoint
  const checkpoint = await redis.get(checkpointKey);
  let state: MigrationCheckpoint = checkpoint
    ? JSON.parse(checkpoint)
    : { lastProcessedId: '', totalProcessed: 0, startedAt: new Date(), status: 'running' };

  while (state.status === 'running') {
    const batch = await db.selectFrom('contracts')
      .select(['id', 'status'])
      .where('id', '>', state.lastProcessedId)
      .where('status_v2', 'is', null)
      .orderBy('id')
      .limit(batchSize)
      .execute();

    if (batch.length === 0) {
      state.status = 'completed';
      break;
    }

    await db.transaction().execute(async (tx) => {
      for (const row of batch) {
        await tx.updateTable('contracts')
          .set({ status_v2: mapStatusToV2(row.status) })
          .where('id', '=', row.id)
          .execute();
      }
    });

    state.lastProcessedId = batch[batch.length - 1].id;
    state.totalProcessed += batch.length;
    await redis.set(checkpointKey, JSON.stringify(state));

    logger.info({ processed: state.totalProcessed }, 'Migration progress');
  }
}
```

### Pattern 3: Idempotent Seed Data

```typescript
async function seedTenantData(): Promise<void> {
  const seeds = [
    { id: 'seed-tenant-001', name: 'Demo Bank', plan: 'enterprise' },
    { id: 'seed-tenant-002', name: 'Test Credit Union', plan: 'standard' },
  ];

  for (const seed of seeds) {
    await db.insertInto('tenants')
      .values(seed)
      .onConflict((oc) => oc.column('id').doUpdateSet({
        name: seed.name,
        plan: seed.plan,
      }))
      .execute();
  }
}
```

### Pattern 4: Pre/Post Migration Validation

```typescript
async function validateMigration(): Promise<ValidationResult> {
  const checks = [
    {
      name: 'no_null_status_v2',
      query: `SELECT COUNT(*) as cnt FROM contracts WHERE status_v2 IS NULL`,
      expected: (r: any) => r.cnt === 0,
    },
    {
      name: 'status_mapping_valid',
      query: `SELECT COUNT(*) as cnt FROM contracts WHERE status_v2 NOT IN ('active','draft','terminated')`,
      expected: (r: any) => r.cnt === 0,
    },
    {
      name: 'row_count_preserved',
      query: `SELECT (SELECT COUNT(*) FROM contracts) = (SELECT COUNT(*) FROM contracts WHERE status_v2 IS NOT NULL) as matched`,
      expected: (r: any) => r.matched === true,
    },
  ];

  const results = [];
  for (const check of checks) {
    const result = await db.raw(check.query);
    const passed = check.expected(result.rows[0]);
    results.push({ name: check.name, passed });
    if (!passed) logger.error({ check: check.name }, 'Validation failed');
  }
  return { checks: results, allPassed: results.every(r => r.passed) };
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|---|---|---|
| ALTER TABLE on large table without online DDL | Locks table for minutes/hours, downtime | Use pg_repack, pt-online-schema-change, or gh-ost |
| Dropping column in same deploy as code change | Old code instances crash on missing column | Expand-contract across separate deploys |
| No down migration | Cannot rollback if migration causes issues | Always write reversible migrations |
| Migrating all rows in one transaction | Locks entire table, OOM on large datasets | Batch with checkpointing (1000-5000 rows per batch) |
| Manual SQL in production | No audit trail, no rollback, human error | Versioned migration files run by tooling |
| Seed data in migration files | Seeds run in every environment including production | Separate seed scripts from schema migrations |

## Implementation Checklist

- [ ] Implement expand-contract pattern for all breaking schema changes
- [ ] Write both up and down for every migration
- [ ] Add pre/post validation queries to migration scripts
- [ ] Use batch processing with checkpointing for data migrations
- [ ] Create idempotent seed data scripts (upsert, not insert)
- [ ] Test migrations against production-sized datasets before deploying
- [ ] Set up migration dry-run capability in staging
- [ ] Document irreversible migrations with explicit approval requirements

## References

- [Prisma Migrations](https://www.prisma.io/docs/orm/prisma-migrate)
- [Expand-Contract Pattern](https://www.tim-wellhausen.de/papers/ExpandAndContract.html)
- [gh-ost: Online Schema Migrations](https://github.com/github/gh-ost)
- [Zero-Downtime Postgres Migrations](https://benchling.engineering/move-fast-and-migrate-things-how-we-automated-migrations-in-postgres-d60aba0fc3d4)
