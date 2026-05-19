# ETL Pipelines

> Extract-Transform-Load, data pipelines, Airflow, dbt, incremental processing, data quality checks, and pipeline orchestration for reliable data engineering.

## Core Principles

1. **Idempotency Is Non-Negotiable** — Every pipeline step must produce the same result when run multiple times with the same input. Use UPSERT, MERGE, or partition-based replacement instead of INSERT. A failed pipeline re-run must not corrupt data.
2. **Incremental Over Full Refresh** — Process only new or changed data. Full table scans on every run do not scale. Track high watermarks (timestamps, sequence numbers) to identify delta.
3. **Schema as Contract** — Define input and output schemas explicitly. Validate data against schemas at every stage boundary. Schema drift must be detected and alerted, not silently propagated.
4. **Observability at Every Stage** — Track row counts, null rates, schema violations, processing time, and data freshness at each pipeline step. A pipeline without metrics is a pipeline you cannot debug.
5. **Separation of Orchestration and Transformation** — Orchestration tools (Airflow, Dagster) schedule and coordinate. Transformation tools (dbt, SQL, Spark) process data. Do not put business logic in DAG definitions.

## Patterns

### Pattern 1: Incremental Load with Watermark

```typescript
interface WatermarkState {
  table: string;
  lastProcessedAt: Date;
  lastProcessedId: string;
  rowsProcessed: number;
}

async function incrementalExtract(
  source: string,
  watermarkKey: string,
): Promise<Record<string, unknown>[]> {
  const watermark = await redis.get(`watermark:${watermarkKey}`);
  const state: WatermarkState = watermark
    ? JSON.parse(watermark)
    : { table: source, lastProcessedAt: new Date(0), lastProcessedId: '', rowsProcessed: 0 };

  const rows = await sourceDb.query(
    `SELECT * FROM ${source}
     WHERE updated_at > $1 OR (updated_at = $1 AND id > $2)
     ORDER BY updated_at, id
     LIMIT 10000`,
    [state.lastProcessedAt, state.lastProcessedId]
  );

  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    state.lastProcessedAt = last.updated_at;
    state.lastProcessedId = last.id;
    state.rowsProcessed += rows.length;
    await redis.set(`watermark:${watermarkKey}`, JSON.stringify(state));
  }

  return rows;
}
```

### Pattern 2: dbt Transformation Models

> **Note**: This pattern requires dbt (`pip install dbt-core`), a separate SQL transformation tool. The template syntax below is a reference for teams using dbt — it is not required by this skill.

```sql
-- models/marts/contract_metrics.sql
{{ config(
    materialized='incremental',
    unique_key='contract_id',
    on_schema_change='sync_all_columns'
) }}

WITH source_contracts AS (
    SELECT
        id AS contract_id,
        tenant_id,
        contract_type,
        status,
        total_value,
        created_at,
        updated_at
    FROM {{ ref('stg_contracts') }}
    {% if is_incremental() %}
    WHERE updated_at > (SELECT MAX(updated_at) FROM {{ this }})
    {% endif %}
),

payment_stats AS (
    SELECT
        contract_id,
        COUNT(*) AS payment_count,
        SUM(amount) AS total_paid,
        MAX(paid_at) AS last_payment_at
    FROM {{ ref('stg_payments') }}
    GROUP BY contract_id
)

SELECT
    c.contract_id,
    c.tenant_id,
    c.contract_type,
    c.status,
    c.total_value,
    COALESCE(p.total_paid, 0) AS total_paid,
    c.total_value - COALESCE(p.total_paid, 0) AS outstanding_balance,
    COALESCE(p.payment_count, 0) AS payment_count,
    p.last_payment_at,
    c.created_at,
    c.updated_at
FROM source_contracts c
LEFT JOIN payment_stats p ON c.contract_id = p.contract_id
```

### Pattern 3: Data Quality Checks

```typescript
interface QualityCheck {
  name: string;
  query: string;
  assertion: (result: any) => boolean;
  severity: 'warning' | 'error' | 'critical';
}

const checks: QualityCheck[] = [
  {
    name: 'no_null_tenant_ids',
    query: 'SELECT COUNT(*) as cnt FROM contracts WHERE tenant_id IS NULL',
    assertion: (r) => r.cnt === 0,
    severity: 'critical',
  },
  {
    name: 'row_count_not_decreasing',
    query: `SELECT
      (SELECT COUNT(*) FROM contracts) >= (SELECT row_count FROM pipeline_metadata WHERE table_name = 'contracts')
      AS valid`,
    assertion: (r) => r.valid === true,
    severity: 'error',
  },
  {
    name: 'freshness_under_1_hour',
    query: `SELECT EXTRACT(EPOCH FROM NOW() - MAX(updated_at)) / 3600 AS hours_stale FROM contracts`,
    assertion: (r) => r.hours_stale < 1,
    severity: 'warning',
  },
];

async function runQualityChecks(checks: QualityCheck[]): Promise<QualityReport> {
  const results = [];
  for (const check of checks) {
    const result = await db.raw(check.query);
    const passed = check.assertion(result.rows[0]);
    results.push({ name: check.name, passed, severity: check.severity });
    if (!passed && check.severity === 'critical') {
      throw new Error(`Critical quality check failed: ${check.name}`);
    }
  }
  return { checks: results, passRate: results.filter(r => r.passed).length / results.length };
}
```

### Pattern 4: Airflow DAG Structure

> **Note**: This pattern requires Apache Airflow (`pip install apache-airflow`), a separate orchestration platform. The structure below is a reference for teams using Airflow — it is not required by this skill.

```python
from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime, timedelta

default_args = {
    'owner': 'data-team',
    'retries': 3,
    'retry_delay': timedelta(minutes=5),
    'execution_timeout': timedelta(hours=1),
}

with DAG(
    'contract_analytics_pipeline',
    default_args=default_args,
    schedule_interval='@hourly',
    start_date=datetime(2025, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=['analytics', 'contracts'],
) as dag:

    extract = PythonOperator(
        task_id='extract_contracts',
        python_callable=extract_contracts_incremental,
    )

    transform = PythonOperator(
        task_id='transform_metrics',
        python_callable=run_dbt_models,
        op_kwargs={'models': 'marts.contract_metrics'},
    )

    quality = PythonOperator(
        task_id='quality_checks',
        python_callable=run_quality_checks,
    )

    load = PythonOperator(
        task_id='load_to_clickhouse',
        python_callable=load_to_analytics,
    )

    extract >> transform >> quality >> load
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|---|---|---|
| Full table reload every run | Does not scale, wastes compute | Incremental loads with watermark tracking |
| Business logic in DAG files | Untestable, tightly coupled to orchestrator | Logic in separate modules, DAGs for orchestration only |
| No data validation between stages | Corrupt data propagates downstream silently | Schema validation and quality checks at every boundary |
| INSERT without deduplication | Duplicate rows on re-run | UPSERT, MERGE, or partition replacement |
| No alerting on pipeline failures | Silent data staleness | Alert on failure, monitor data freshness |
| Manual backfills without idempotency | Corrupted data, duplicate records | Idempotent pipelines with partition-based reprocessing |

## Implementation Checklist

- [ ] Implement incremental extraction with watermark tracking
- [ ] Define input/output schemas for all pipeline stages
- [ ] Add data quality checks with severity levels
- [ ] Set up pipeline monitoring (row counts, latency, freshness)
- [ ] Configure retry policies with exponential backoff
- [ ] Implement idempotent load strategies (UPSERT/MERGE)
- [ ] Create alerting for pipeline failures and data staleness
- [ ] Document pipeline SLAs (freshness, completeness, accuracy)

## References

- [dbt Documentation](https://docs.getdbt.com/)
- [Apache Airflow](https://airflow.apache.org/docs/)
- [Dagster Documentation](https://docs.dagster.io/)
- [Data Quality Fundamentals](https://www.oreilly.com/library/view/data-quality-fundamentals/9781098112035/)
