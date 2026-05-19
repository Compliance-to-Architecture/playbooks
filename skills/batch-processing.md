# Batch Processing

> Design resilient job queues with idempotent operations, checkpointing, and intelligent retry strategies.

## Core Principles

1. **Idempotency First** — Every job must produce the same result regardless of how many times it executes. Use idempotency keys derived from job input to deduplicate processing and prevent side-effect duplication.
2. **Checkpoint and Resume** — Long-running jobs must persist progress at regular intervals so they can resume from the last checkpoint after failures, not restart from scratch.
3. **Backpressure Awareness** — Producers must respect queue depth limits. When consumers fall behind, apply backpressure upstream rather than unboundedly growing queues and exhausting memory.
4. **Observability by Default** — Every job emits structured events for enqueue, start, progress, completion, and failure. Track queue depth, processing latency, and error rates as first-class metrics.

## Patterns

### Pattern 1: BullMQ Job Queue with Retry

Define jobs with explicit retry strategies, backoff, and dead-letter handling.

```typescript
import { Queue, Worker, QueueEvents } from "bullmq";
import { Redis } from "ioredis";

const connection = new Redis(process.env.REDIS_URL);

const invoiceQueue = new Queue("invoice-generation", {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: { age: 604800 },
  },
});

const worker = new Worker("invoice-generation", async (job) => {
  const { tenantId, invoiceId } = job.data;
  await job.updateProgress(10);
  const lineItems = await fetchLineItems(tenantId, invoiceId);
  await job.updateProgress(50);
  const pdf = await generatePdf(lineItems);
  await job.updateProgress(90);
  await storePdf(invoiceId, pdf);
  return { invoiceId, size: pdf.length };
}, { connection, concurrency: 10 });
```

### Pattern 2: Idempotent Processing with Deduplication

Prevent duplicate side effects using idempotency keys stored atomically with results.

```typescript
async function processPayment(job: Job<PaymentJob>): Promise<void> {
  const idempotencyKey = `payment:${job.data.orderId}:${job.data.amount}`;

  const existing = await redis.get(idempotencyKey);
  if (existing) {
    job.log(`Skipping duplicate: ${idempotencyKey}`);
    return JSON.parse(existing);
  }

  const result = await paymentGateway.charge({
    amount: job.data.amount,
    currency: job.data.currency,
    metadata: { idempotencyKey },
  });

  await redis.set(idempotencyKey, JSON.stringify(result), "EX", 86400 * 7);
  return result;
}
```

### Pattern 3: Checkpointed Batch with Chunking

Process large datasets in chunks, persisting progress after each chunk.

```typescript
async function processLargeExport(job: Job<ExportJob>): Promise<void> {
  const { exportId, totalRecords } = job.data;
  const chunkSize = 500;
  const checkpoint = await getCheckpoint(exportId);
  let offset = checkpoint?.offset ?? 0;

  while (offset < totalRecords) {
    const records = await db.query(
      `SELECT * FROM transactions ORDER BY id LIMIT $1 OFFSET $2`,
      [chunkSize, offset]
    );
    if (records.length === 0) break;

    await writeToOutputFile(exportId, records);
    offset += records.length;
    await saveCheckpoint(exportId, { offset, updatedAt: new Date() });
    await job.updateProgress(Math.round((offset / totalRecords) * 100));
  }

  await finalizeExport(exportId);
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|---|---|---|
| Unbounded retries | Poison messages retry forever, wasting resources | Set max attempts with dead-letter queue |
| No idempotency keys | Duplicate processing causes double charges or emails | Derive keys from input, check before execute |
| In-memory queues | Jobs lost on process restart | Use persistent queue (BullMQ/Redis, SQS) |
| Giant monolith jobs | One failure restarts hours of work | Chunk work with checkpoints |
| Polling without backoff | Hammers the queue when empty | Use blocking pop or exponential backoff |

## Implementation Checklist

- [ ] Define job schemas with Zod validation on enqueue and dequeue
- [ ] Configure retry strategy with exponential backoff and max attempts
- [ ] Implement idempotency key generation from job input hash
- [ ] Add checkpointing for jobs processing more than 100 items
- [ ] Set up dead-letter queue with alerting for failed jobs
- [ ] Emit structured metrics: queue depth, processing time, error rate
- [ ] Add graceful shutdown handling (drain in-flight jobs before exit)

## References

- [BullMQ Documentation](https://docs.bullmq.io/)
- [Idempotency Patterns](https://stripe.com/docs/api/idempotent_requests)
- [AWS SQS Best Practices](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-best-practices.html)
- [Designing Reliable Job Queues](https://blog.bullmq.io/)
