# Webhook Patterns

> Reliable webhook delivery with retry backoff, HMAC signature verification, idempotency keys, and dead-letter queues for guaranteed event processing.

## Core Principles

1. **At-Least-Once Delivery** — Webhooks must be retried with exponential backoff until acknowledged, accepting that consumers may receive duplicates, so every handler must be idempotent by design.
2. **Cryptographic Signature Verification** — Every outbound webhook carries an HMAC-SHA256 signature computed over the raw body; consumers must verify before processing to prevent spoofing and tampering.
3. **Idempotency by Default** — Every webhook event carries a unique idempotency key; consumers record processed keys and skip duplicates to ensure exactly-once side effects despite at-least-once delivery.

## Patterns

### Pattern 1: HMAC Signature Verification

Sign outbound payloads with a shared secret and provide a verification function that consumers run before processing any webhook.

```typescript
import crypto from "node:crypto";

function signWebhookPayload(payload: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex");
}

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = signWebhookPayload(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex"),
  );
}

app.post("/webhooks/incoming", async (req, res) => {
  const sig = req.headers["x-webhook-signature"] as string;
  if (!verifyWebhookSignature(req.rawBody, sig, WEBHOOK_SECRET)) {
    return res.status(401).json({ error: "Invalid signature" });
  }
  await processEvent(req.body);
  res.status(200).json({ received: true });
});
```

### Pattern 2: Exponential Backoff Retry Queue

Queue failed deliveries with exponential backoff and jitter, capping retries at a maximum count before routing to a dead-letter queue.

```typescript
interface WebhookJob {
  id: string;
  url: string;
  payload: string;
  attempt: number;
  maxAttempts: number;
}

function calculateBackoff(attempt: number): number {
  const baseMs = 1000;
  const maxMs = 3600_000;
  const exponential = baseMs * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(exponential + jitter, maxMs);
}

async function deliverWebhook(job: WebhookJob): Promise<void> {
  const response = await fetch(job.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Webhook-Id": job.id },
    body: job.payload,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok && job.attempt < job.maxAttempts) {
    const delay = calculateBackoff(job.attempt);
    await retryQueue.schedule(job.id, { ...job, attempt: job.attempt + 1 }, delay);
  } else if (!response.ok) {
    await deadLetterQueue.push(job);
  }
}
```

### Pattern 3: Idempotent Event Processing

Record processed idempotency keys in a persistent store to skip duplicate deliveries and guarantee exactly-once side effects.

```typescript
async function handleWebhookEvent(event: WebhookEvent): Promise<void> {
  const alreadyProcessed = await db.processedWebhooks.findUnique({
    where: { idempotencyKey: event.idempotencyKey },
  });
  if (alreadyProcessed) {
    logger.info({ key: event.idempotencyKey }, "Duplicate webhook skipped");
    return;
  }
  await db.$transaction(async (tx) => {
    await tx.processedWebhooks.create({
      data: { idempotencyKey: event.idempotencyKey, processedAt: new Date() },
    });
    await applyBusinessLogic(tx, event);
  });
}

async function cleanupOldKeys(): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await db.processedWebhooks.deleteMany({ where: { processedAt: { lt: cutoff } } });
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|-------------|-------------|-----------------|
| Processing webhooks without signature verification | Any attacker can forge events and trigger unauthorized business logic | HMAC-SHA256 verify every payload before processing |
| Fixed retry intervals without backoff | Overwhelms failing endpoints and wastes resources on sustained outages | Exponential backoff with jitter and maximum retry cap |
| Relying on delivery order for correctness | Network and retry conditions guarantee out-of-order arrival | Use event timestamps or sequence numbers; make handlers order-independent |
| No idempotency key tracking | Retried deliveries cause duplicate charges, emails, or state mutations | Record processed keys in a transaction alongside business logic |

## Implementation Checklist

- [ ] HMAC-SHA256 signatures computed and attached to every outbound webhook
- [ ] Exponential backoff with jitter implemented for failed deliveries (max 8 retries)
- [ ] Dead-letter queue configured for permanently failed deliveries with alerting
- [ ] Idempotency keys stored per event and checked before processing
- [ ] Webhook endpoint returns 200 within 10 seconds to prevent sender timeouts

## References

- [Standard Webhooks Specification](https://www.standardwebhooks.com/)
- [Stripe Webhook Best Practices](https://docs.stripe.com/webhooks/best-practices)
- [AWS EventBridge Retry Policies](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-dlq.html)
