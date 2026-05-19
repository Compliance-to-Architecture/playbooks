# Rate Limiting

> Token bucket, sliding window, and distributed rate limiting with per-tenant quotas, graceful degradation, and fair-use enforcement.

## Core Principles

1. **Multi-Tier Enforcement** — Rate limits apply at multiple layers (edge/CDN, API gateway, per-service) with decreasing thresholds, so no single bypass point can overwhelm downstream systems.
2. **Tenant-Aware Quotas** — Each tenant has independently configurable rate limits based on their subscription tier, preventing noisy-neighbor effects where one tenant's traffic degrades service for others.
3. **Graceful Degradation** — When limits are exceeded, respond with structured 429 responses including `Retry-After` headers and remaining quota information so clients can implement intelligent backoff.

## Patterns

### Pattern 1: Token Bucket Algorithm

Implement a token bucket that refills at a steady rate, allowing short bursts while enforcing sustained throughput limits with O(1) time complexity per check.

```typescript
interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number;
}

function consumeToken(bucket: TokenBucket): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.refillRate);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    return { allowed: false, remaining: 0 };
  }
  bucket.tokens -= 1;
  return { allowed: true, remaining: Math.floor(bucket.tokens) };
}

function createBucket(capacity: number, refillPerSecond: number): TokenBucket {
  return { tokens: capacity, lastRefill: Date.now(), capacity, refillRate: refillPerSecond };
}
```

### Pattern 2: Distributed Sliding Window with Redis

Use Redis sorted sets to implement a sliding window counter that works across multiple service instances with atomic operations.

```typescript
async function slidingWindowCheck(
  redis: Redis,
  key: string,
  windowMs: number,
  maxRequests: number,
): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
  const now = Date.now();
  const windowStart = now - windowMs;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now, `${now}:${crypto.randomUUID()}`);
  pipeline.zcard(key);
  pipeline.pexpire(key, windowMs);
  const results = await pipeline.exec();

  const currentCount = results![2]![1] as number;
  const allowed = currentCount <= maxRequests;
  const remaining = Math.max(0, maxRequests - currentCount);
  const retryAfterMs = allowed ? 0 : windowMs;

  if (!allowed) {
    await redis.zrem(key, `${now}:${crypto.randomUUID()}`);
  }
  return { allowed, remaining, retryAfterMs };
}
```

### Pattern 3: Per-Tenant Rate Limit Middleware

Apply tenant-specific rate limits loaded from configuration, returning standard rate limit headers and structured error responses on throttle.

```typescript
function rateLimitMiddleware(config: Record<string, { windowMs: number; maxRequests: number }>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tenantId = req.headers["x-tenant-id"] as string;
    const tier = await getTenantTier(tenantId);
    const limits = config[tier] ?? config["default"];
    const key = `ratelimit:${tenantId}:${req.path}`;

    const result = await slidingWindowCheck(redis, key, limits.windowMs, limits.maxRequests);

    res.setHeader("X-RateLimit-Limit", limits.maxRequests);
    res.setHeader("X-RateLimit-Remaining", result.remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil((Date.now() + limits.windowMs) / 1000));

    if (!result.allowed) {
      res.setHeader("Retry-After", Math.ceil(result.retryAfterMs / 1000));
      return res.status(429).json({
        error: "RATE_LIMIT_EXCEEDED",
        message: `Rate limit exceeded. Retry after ${Math.ceil(result.retryAfterMs / 1000)}s.`,
        retryAfterMs: result.retryAfterMs,
      });
    }
    next();
  };
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|-------------|-------------|-----------------|
| In-memory-only rate limiting in multi-instance deploys | Each instance tracks independently; total throughput is N times the intended limit | Use distributed state (Redis sorted sets or atomic counters) shared across instances |
| Global rate limit without tenant isolation | One high-traffic tenant exhausts the quota for all others | Per-tenant buckets with tier-based configuration and noisy-neighbor isolation |
| 429 response without Retry-After header | Clients cannot determine when to retry and resort to aggressive polling | Always include Retry-After header and remaining quota in rate limit responses |
| Rate limiting only at the API gateway | Internal service-to-service calls bypass limits and can cascade failures | Apply limits at edge, gateway, and per-service layers with decreasing thresholds |

## Implementation Checklist

- [ ] Sliding window or token bucket algorithm deployed with distributed state (Redis)
- [ ] Per-tenant rate limits configurable by subscription tier with sensible defaults
- [ ] Standard rate limit headers (X-RateLimit-Limit, Remaining, Reset, Retry-After) on all responses
- [ ] Graceful 429 responses with structured JSON body and retry guidance
- [ ] Rate limit metrics exported to monitoring (throttle count by tenant, endpoint, tier)

## References

- [IETF Rate Limit Header Fields (RFC 9110)](https://www.rfc-editor.org/rfc/rfc9110#field.retry-after)
- [Stripe Rate Limiting Design](https://stripe.com/blog/rate-limiters)
- [Cloudflare Rate Limiting Best Practices](https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/)
