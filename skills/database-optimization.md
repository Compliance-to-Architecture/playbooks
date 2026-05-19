# Database Optimization

> Query optimization, indexing strategies, partitioning, read replicas, connection pooling, and N+1 prevention for high-performance data access.

## Core Principles

1. **Measure Before Optimizing** — Profile queries with EXPLAIN ANALYZE before adding indexes or restructuring. Premature optimization without data leads to bloated indexes and wasted resources.
2. **Indexes Are Not Free** — Every index speeds reads but slows writes. Maintain only indexes that serve active query patterns. Audit unused indexes quarterly.
3. **Connection Pooling Is Mandatory** — Never let application instances open unbounded connections. Use PgBouncer or application-level pooling (Prisma, Drizzle) with explicit max limits.
4. **Partition for Scale, Not Convenience** — Table partitioning adds complexity. Use it when tables exceed millions of rows with clear partition keys (date, tenant_id), not as a default.
5. **Read Replicas for Read-Heavy Workloads** — Route analytical queries, reporting, and search indexing to replicas. Keep the primary for writes and transactional reads.

## Patterns

### Pattern 1: Covering Indexes

A covering index includes all columns needed by a query, eliminating table lookups entirely.

```sql
-- Query: SELECT email, name FROM users WHERE tenant_id = ? AND status = 'active'
-- Covering index:
CREATE INDEX idx_users_tenant_status_covering
  ON users (tenant_id, status) INCLUDE (email, name);
```

The database serves the query entirely from the index without touching the heap. Monitor with `EXPLAIN (ANALYZE, BUFFERS)` to confirm index-only scans.

### Pattern 2: N+1 Prevention with DataLoader

N+1 queries are the most common performance killer. Batch related entity fetches.

```typescript
// BAD: N+1 — one query per order
const orders = await db.orders.findMany({ where: { tenantId } });
for (const order of orders) {
  order.items = await db.orderItems.findMany({ where: { orderId: order.id } });
}

// GOOD: Eager loading or DataLoader batching
const orders = await db.orders.findMany({
  where: { tenantId },
  include: { items: true },
});

// GOOD: DataLoader for GraphQL resolvers
const itemLoader = new DataLoader(async (orderIds: string[]) => {
  const items = await db.orderItems.findMany({
    where: { orderId: { in: orderIds } },
  });
  return orderIds.map(id => items.filter(i => i.orderId === id));
});
```

### Pattern 3: Connection Pool Sizing

Use the formula: `connections = (core_count * 2) + effective_spindle_count`. For cloud databases, start conservative and scale up.

```typescript
// Prisma connection pool configuration
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL },
  },
  // Pool settings via connection string:
  // ?connection_limit=20&pool_timeout=10
});

// PgBouncer config for multi-service environments
// [pgbouncer]
// pool_mode = transaction
// max_client_conn = 1000
// default_pool_size = 20
// reserve_pool_size = 5
```

### Pattern 4: Time-Based Partitioning

```sql
CREATE TABLE events (
  id UUID DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2025_q1 PARTITION OF events
  FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');
CREATE TABLE events_2025_q2 PARTITION OF events
  FOR VALUES FROM ('2025-04-01') TO ('2025-07-01');
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|---|---|---|
| SELECT * everywhere | Fetches unused columns, wastes memory and bandwidth | Select only needed columns explicitly |
| Missing WHERE on UPDATE/DELETE | Full table scan, potential data corruption | Always include WHERE clause, use transactions |
| Indexing every column | Slows writes, wastes disk, confuses planner | Index based on actual query patterns from slow query log |
| No connection limits | Exhausts database connections under load | PgBouncer or app-level pool with hard limits |
| ORM-generated queries without review | Hidden N+1, cartesian products, unnecessary JOINs | Review generated SQL with EXPLAIN, use raw queries for hot paths |
| Using OFFSET for pagination | Scans and discards rows, O(n) cost | Cursor-based pagination with indexed column |

## Implementation Checklist

- [ ] Enable slow query logging (threshold: 100ms)
- [ ] Add EXPLAIN ANALYZE to all queries in dev/staging
- [ ] Configure connection pooling with explicit limits
- [ ] Audit indexes against actual query patterns monthly
- [ ] Implement cursor-based pagination for all list endpoints
- [ ] Set up read replica routing for reporting queries
- [ ] Add query timeout (statement_timeout) to prevent runaway queries
- [ ] Monitor connection pool utilization with metrics

## References

- [PostgreSQL EXPLAIN Documentation](https://www.postgresql.org/docs/current/sql-explain.html)
- [Use The Index, Luke](https://use-the-index-luke.com/)
- [PgBouncer Configuration](https://www.pgbouncer.org/config.html)
- [Prisma Connection Management](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections)
