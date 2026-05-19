# Scaling Guide

Scale from 1 tenant to 1000 tenants.

## Scaling Matrix

| Scale      | Tenants  | ECS Tasks       | DB                          | Redis                   | Estimated Cost   |
| ---------- | -------- | --------------- | --------------------------- | ----------------------- | ---------------- |
| Starter    | 1-10     | 1 per service   | db.t3.medium                | cache.t3.micro          | $330/mo          |
| Growth     | 10-50    | 2 per service   | db.r5.large                 | cache.r5.large          | $800/mo          |
| Scale      | 50-200   | 3-5 per service | db.r5.xlarge + read replica | cache.r5.xlarge cluster | $2,500/mo        |
| Enterprise | 200-1000 | Auto-scaling    | Aurora Serverless v2        | ElastiCache cluster     | $5,000-15,000/mo |

## ECS Auto-Scaling

```yaml
# Auto-scaling policy
ScalingPolicy:
  TargetValue: 70 # CPU utilization target
  ScaleInCooldown: 300
  ScaleOutCooldown: 60
  MinCapacity: 2
  MaxCapacity: 10
```

```bash
# Configure auto-scaling
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/iof-cluster/iof-rail-api \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 10
```

## Database Scaling

### Read Replicas

```bash
# Add read replica
aws rds create-db-instance-read-replica \
  --db-instance-identifier iof-read-1 \
  --source-db-instance-identifier iof-primary
```

### Connection Pooling

```typescript
// packages/db-core/src/pool.ts
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Max connections per service
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```

## Cache Scaling

### Redis Cluster Mode

```bash
# Scale to cluster mode
aws elasticache modify-replication-group \
  --replication-group-id iof-redis \
  --num-node-groups 3 \
  --num-replicas-per-node-group 1
```

## CDN + Edge Scaling

Cloudflare handles this automatically:

- 275+ data centers globally
- Auto-scaling at edge
- DDoS protection included
- Workers auto-scale to demand

## Multi-Region

```
Primary: eu-west-1 (Ireland)
DR: eu-west-2 (London)
Edge: Cloudflare (275+ PoPs)
```

### Cross-Region Replication

```bash
# RDS cross-region read replica
aws rds create-db-instance-read-replica \
  --db-instance-identifier iof-dr-replica \
  --source-db-instance-identifier iof-primary \
  --region eu-west-2
```

## Performance Optimization

### Batch Operations

```typescript
// TigerStyle: amortize costs by batching
async function processContracts(contracts: Contract[]) {
  const BATCH_SIZE = 100;
  for (let i = 0; i < contracts.length; i += BATCH_SIZE) {
    const batch = contracts.slice(i, i + BATCH_SIZE);
    await db.contract.createMany({ data: batch });
  }
}
```

### Caching Strategy

```
L1: In-memory (service-local, TTL: 30s)
L2: Redis (shared, TTL: 5min)
L3: CDN (Cloudflare, TTL: 1hr)
L4: Database (PostgreSQL, permanent)
```

## Monitoring at Scale

```bash
# Set CloudWatch alarms
aws cloudwatch put-metric-alarm \
  --alarm-name iof-cpu-high \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold
```
