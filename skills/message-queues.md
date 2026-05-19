# Message Queues

> Kafka, SQS, RabbitMQ, pub/sub patterns, dead letter queues, exactly-once delivery, and backpressure handling for reliable async communication.

## Core Principles

1. **At-Least-Once by Default** — Design consumers to be idempotent. Exactly-once delivery is expensive and often unnecessary when consumers handle duplicates gracefully.
2. **Dead Letter Queues Are Mandatory** — Every queue must have a DLQ. Messages that fail after retries must be captured, not silently dropped. Monitor DLQ depth as a critical metric.
3. **Backpressure Over Unbounded Buffering** — When consumers fall behind, apply backpressure (slow producers, reject, or buffer with limits) rather than letting queues grow without bound.
4. **Schema Evolution Is a Contract** — Message schemas are API contracts. Use schema registries (Avro, Protobuf) with backward compatibility guarantees. Never break consumers with schema changes.
5. **Ordering Guarantees Cost Performance** — Global ordering is expensive. Use partition keys to guarantee ordering only where business logic requires it (per-tenant, per-entity).

## Patterns

### Pattern 1: Transactional Outbox

Guarantee that database writes and message publishing are atomic without distributed transactions.

```typescript
// 1. Write to database AND outbox in same transaction
await prisma.$transaction(async (tx) => {
  const order = await tx.order.create({ data: orderData });
  await tx.outboxEvent.create({
    data: {
      aggregateId: order.id,
      aggregateType: 'Order',
      eventType: 'OrderCreated',
      payload: JSON.stringify(order),
      published: false,
    },
  });
});

// 2. Background poller publishes outbox events
async function publishOutboxEvents() {
  const events = await prisma.outboxEvent.findMany({
    where: { published: false },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  for (const event of events) {
    await kafka.producer.send({
      topic: `${event.aggregateType}.${event.eventType}`,
      messages: [{ key: event.aggregateId, value: event.payload }],
    });
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { published: true, publishedAt: new Date() },
    });
  }
}
```

### Pattern 2: Consumer Idempotency

Track processed message IDs to handle duplicates safely.

```typescript
async function handleMessage(message: Message): Promise<void> {
  const messageId = message.headers['message-id'];
  assert(messageId, 'Message must have an ID');

  // Check if already processed
  const existing = await redis.get(`processed:${messageId}`);
  if (existing) {
    logger.info({ messageId }, 'Duplicate message, skipping');
    return;
  }

  // Process the message
  await processBusinessLogic(message.body);

  // Mark as processed with TTL (7 days)
  await redis.set(`processed:${messageId}`, '1', 'EX', 604800);
}
```

### Pattern 3: Dead Letter Queue with Alerting

```typescript
// SQS DLQ configuration
const queueConfig = {
  QueueName: 'order-processing',
  Attributes: {
    RedrivePolicy: JSON.stringify({
      deadLetterTargetArn: dlqArn,
      maxReceiveCount: '3', // Move to DLQ after 3 failures
    }),
    VisibilityTimeout: '300', // 5 min processing window
    MessageRetentionPeriod: '1209600', // 14 days
  },
};

// Monitor DLQ depth
async function checkDlqDepth(): Promise<void> {
  const attrs = await sqs.getQueueAttributes({
    QueueUrl: dlqUrl,
    AttributeNames: ['ApproximateNumberOfMessages'],
  });
  const depth = parseInt(attrs.Attributes?.ApproximateNumberOfMessages ?? '0');
  if (depth > 0) {
    await alerting.send({
      severity: depth > 100 ? 'critical' : 'warning',
      message: `DLQ has ${depth} unprocessed messages`,
      queue: 'order-processing-dlq',
    });
  }
}
```

### Pattern 4: Partition-Based Ordering

```typescript
// Kafka: Use tenant_id as partition key for per-tenant ordering
await producer.send({
  topic: 'contract-events',
  messages: [{
    key: contract.tenantId, // Same tenant always goes to same partition
    value: JSON.stringify(event),
    headers: {
      'event-type': 'ContractCreated',
      'correlation-id': correlationId,
      'timestamp': Date.now().toString(),
    },
  }],
});
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|---|---|---|
| Fire-and-forget without DLQ | Lost messages with no recovery path | Always configure DLQ with monitoring |
| Synchronous processing disguised as async | Adds latency without decoupling benefit | Use queues only for genuinely async work |
| Giant messages (>256KB) | Slow serialization, memory pressure, queue limits | Store payload in S3/R2, pass reference in message |
| No schema validation on consume | Corrupt data propagates through system | Validate against schema before processing |
| Unbounded retry loops | Consumer stuck retrying forever, blocking queue | Exponential backoff with max retries, then DLQ |
| Mixing concerns in one topic | Consumers must filter irrelevant messages | One topic per event type or bounded context |

## Implementation Checklist

- [ ] Configure DLQ for every queue with max receive count of 3-5
- [ ] Implement consumer idempotency via message ID tracking
- [ ] Set up schema registry for message contracts
- [ ] Add monitoring for queue depth, consumer lag, and DLQ depth
- [ ] Implement transactional outbox for database-to-queue consistency
- [ ] Configure visibility timeout > expected processing time
- [ ] Set message retention period appropriate to business needs
- [ ] Add correlation IDs to all messages for distributed tracing

## References

- [Kafka Documentation](https://kafka.apache.org/documentation/)
- [AWS SQS Best Practices](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-best-practices.html)
- [Transactional Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html)
- [CloudEvents Specification](https://cloudevents.io/)
