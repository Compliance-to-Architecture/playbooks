# Analytics & Reporting

> Event tracking, funnel analysis, cohort analysis, and real-time dashboards powered by ClickHouse for high-throughput analytical workloads.

## Core Principles

1. **Event-First Architecture** — All user interactions and system events are captured as immutable, timestamped events with structured metadata before any aggregation or reporting occurs.
2. **Separation of Ingestion and Query** — Write-optimized ingestion pipelines (append-only, batched inserts) are decoupled from read-optimized query engines (materialized views, pre-aggregated tables) to serve both real-time and historical analytics.
3. **Privacy-Aware Collection** — Every tracked event respects user consent preferences, anonymizes PII before storage, and supports retroactive deletion to comply with GDPR right-to-erasure requirements.

## Patterns

### Pattern 1: Structured Event Tracking

Capture user and system events with a standardized schema that supports arbitrary properties while enforcing required fields for consistent downstream analysis.

```typescript
interface AnalyticsEvent {
  eventId: string;
  eventName: string;
  timestamp: Date;
  userId: string | null;
  sessionId: string;
  tenantId: string;
  properties: Record<string, string | number | boolean>;
}

class EventTracker {
  private buffer: AnalyticsEvent[] = [];
  private readonly flushInterval = 5000;
  private readonly maxBufferSize = 500;

  track(event: Omit<AnalyticsEvent, "eventId" | "timestamp">): void {
    this.buffer.push({
      ...event,
      eventId: crypto.randomUUID(),
      timestamp: new Date(),
    });
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.maxBufferSize);
    await clickhouse.insert({ table: "events", values: batch });
  }
}
```

### Pattern 2: Funnel Analysis Query

Define multi-step conversion funnels using ClickHouse's windowFunnel function to measure drop-off rates between sequential user actions.

```typescript
async function analyzeFunnel(
  tenantId: string,
  steps: string[],
  windowSeconds: number,
  dateRange: { from: Date; to: Date },
): Promise<FunnelResult[]> {
  const stepConditions = steps
    .map((s, i) => `event_name = '${s}'`)
    .join(", ");
  const query = `
    SELECT
      level,
      count() AS users
    FROM (
      SELECT
        user_id,
        windowFunnel(${windowSeconds})(timestamp, ${stepConditions}) AS level
      FROM events
      WHERE tenant_id = {tenantId: String}
        AND timestamp BETWEEN {from: DateTime} AND {to: DateTime}
      GROUP BY user_id
    )
    GROUP BY level
    ORDER BY level
  `;
  return clickhouse.query({ query, params: { tenantId, ...dateRange } });
}
```

### Pattern 3: Cohort Retention Analysis

Group users by their signup week and measure retention across subsequent periods to identify engagement trends and churn patterns.

```typescript
async function cohortRetention(
  tenantId: string,
  periods: number,
): Promise<CohortRow[]> {
  const query = `
    SELECT
      toStartOfWeek(first_seen) AS cohort_week,
      dateDiff('week', first_seen, event_week) AS period,
      uniqExact(user_id) AS active_users
    FROM (
      SELECT
        user_id,
        min(timestamp) OVER (PARTITION BY user_id) AS first_seen,
        toStartOfWeek(timestamp) AS event_week
      FROM events
      WHERE tenant_id = {tenantId: String}
        AND timestamp >= now() - INTERVAL {periods: UInt32} WEEK
    )
    GROUP BY cohort_week, period
    HAVING period <= {periods: UInt32}
    ORDER BY cohort_week, period
  `;
  return clickhouse.query({ query, params: { tenantId, periods } });
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|-------------|-------------|-----------------|
| Tracking events synchronously in request path | Adds latency to every user action and couples app availability to analytics | Buffer events client-side, flush asynchronously in batches |
| Storing raw PII in analytics tables | GDPR deletion requests require scanning entire event history | Anonymize or pseudonymize at ingestion; store PII mapping separately |
| Running ad-hoc queries on the ingestion table | Full table scans on append-only tables are slow and block inserts | Use materialized views and pre-aggregated rollup tables for queries |
| No event schema versioning | Schema changes break downstream dashboards and ETL pipelines silently | Include schema_version field; maintain backward-compatible evolution |

## Implementation Checklist

- [ ] Standardized event schema defined with required fields and typed properties
- [ ] Client-side event buffer with batch flush (max 500 events or 5-second interval)
- [ ] ClickHouse materialized views created for funnel, cohort, and time-series rollups
- [ ] PII anonymization applied at ingestion with separate identity mapping table
- [ ] Dashboard queries read from pre-aggregated tables, never raw event streams

## References

- [ClickHouse Funnel Analysis (windowFunnel)](https://clickhouse.com/docs/en/sql-reference/aggregate-functions/parametric-functions#windowfunnel)
- [Event Tracking Best Practices (Segment)](https://segment.com/academy/collecting-data/naming-conventions-for-clean-data/)
- [Cohort Analysis Methodology (Amplitude)](https://amplitude.com/blog/cohort-analysis)
