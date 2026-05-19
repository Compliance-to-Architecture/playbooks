# Caching Strategies

> Redis patterns, CDN caching, cache invalidation, stampede prevention, write-through/write-behind, and TTL strategies for low-latency data access.

## Core Principles

1. **Cache Is Not a Database** — Caches are ephemeral. Any cached value can be evicted at any time. The system must function correctly (slower, not broken) when cache is empty or unavailable.
2. **Invalidation Is the Hard Problem** — Setting a value in cache is easy. Knowing when to remove or update it is where bugs live. Prefer TTL-based expiry over manual invalidation when consistency requirements allow.
3. **Stampede Prevention Is Mandatory** — When a popular cache key expires, hundreds of requests hit the database simultaneously. Every cache implementation must handle this with locks, probabilistic early expiry, or stale-while-revalidate.
4. **Cache Close to the Consumer** — Layer caches: browser cache > CDN edge > application cache > database query cache. Each layer reduces load on the layer below.
5. **Monitor Hit Rates Religiously** — A cache with <80% hit rate is wasting memory. Track hit/miss ratios per key pattern and adjust TTLs and strategies accordingly.

## Patterns

### Pattern 1: Cache-Aside with Stampede Lock

```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
const LOCK_TTL_MS = 5000;

async function getWithCache<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl_seconds: number = 300,
): Promise<T> {
  // Try cache first
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  // Acquire lock to prevent stampede
  const lockKey = `lock:${key}`;
  const acquired = await redis.set(lockKey, '1', 'PX', LOCK_TTL_MS, 'NX');

  if (!acquired) {
    // Another process is fetching — wait and retry
    await new Promise(r => setTimeout(r, 100));
    const retried = await redis.get(key);
    if (retried) return JSON.parse(retried);
    // Fallback to direct fetch if still missing
  }

  try {
    const data = await fetchFn();
    await redis.set(key, JSON.stringify(data), 'EX', ttl_seconds);
    return data;
  } finally {
    await redis.del(lockKey);
  }
}

// Usage
const tenant = await getWithCache(
  `tenant:${tenantId}`,
  () => db.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
  600, // 10 minute TTL
);
```

### Pattern 2: Write-Through Cache

Update cache synchronously with database writes to keep cache fresh.

```typescript
async function updateTenantSettings(
  tenantId: string,
  settings: TenantSettings,
): Promise<TenantSettings> {
  // Write to database
  const updated = await db.tenantSettings.update({
    where: { tenantId },
    data: settings,
  });

  // Write to cache (synchronous — consistency guarantee)
  await redis.set(
    `tenant-settings:${tenantId}`,
    JSON.stringify(updated),
    'EX', 3600,
  );

  return updated;
}
```

### Pattern 3: CDN Cache Headers

```typescript
// Hono middleware for cache control
app.get('/api/v1/rails/catalog', async (c) => {
  const catalog = await getRailCatalog();

  return c.json(catalog, 200, {
    'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    'CDN-Cache-Control': 'max-age=3600',
    'Surrogate-Key': 'rail-catalog',
    'ETag': computeETag(catalog),
  });
});

// Purge on update
async function invalidateCatalogCache(): Promise<void> {
  await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}` },
    body: JSON.stringify({ tags: ['rail-catalog'] }),
  });
}
```

### Pattern 4: Multi-Layer Cache

```typescript
class TieredCache<T> {
  constructor(
    private l1: Map<string, { value: T; expires: number }>, // In-memory
    private l2: Redis,                                        // Redis
    private ttl_l1_ms: number = 30_000,                       // 30s local
    private ttl_l2_s: number = 300,                           // 5min Redis
  ) {}

  async get(key: string, fetchFn: () => Promise<T>): Promise<T> {
    // L1: In-memory
    const l1Entry = this.l1.get(key);
    if (l1Entry && l1Entry.expires > Date.now()) return l1Entry.value;

    // L2: Redis
    const l2Value = await this.l2.get(key);
    if (l2Value) {
      const parsed = JSON.parse(l2Value) as T;
      this.l1.set(key, { value: parsed, expires: Date.now() + this.ttl_l1_ms });
      return parsed;
    }

    // L3: Origin
    const value = await fetchFn();
    this.l1.set(key, { value, expires: Date.now() + this.ttl_l1_ms });
    await this.l2.set(key, JSON.stringify(value), 'EX', this.ttl_l2_s);
    return value;
  }
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|---|---|---|
| Caching without TTL | Stale data forever, memory leak | Always set TTL, even if long (24h) |
| Cache-then-forget | No monitoring, unknown hit rates | Track hit/miss metrics per key pattern |
| Serializing entire object graphs | Wastes memory, slow serialization | Cache only needed fields, normalize |
| Using cache as primary store | Data loss on eviction or restart | Cache is always secondary to database |
| Per-request cache invalidation | Thundering herd on invalidate | Use TTL expiry or stale-while-revalidate |
| Same TTL for everything | Hot data evicted too soon, cold data cached too long | TTL based on access frequency and staleness tolerance |

## Implementation Checklist

- [ ] Implement cache-aside with stampede protection (locking or probabilistic)
- [ ] Set appropriate TTLs per data type (config: long, user data: medium, listings: short)
- [ ] Configure CDN cache headers for public endpoints
- [ ] Add cache hit/miss rate monitoring per key prefix
- [ ] Implement graceful degradation when cache is unavailable
- [ ] Set up cache eviction alerts (memory pressure)
- [ ] Use cache key namespacing with version prefix for safe schema changes
- [ ] Document cache invalidation triggers for each cached entity

## References

- [Redis Best Practices](https://redis.io/docs/management/optimization/)
- [Cloudflare Cache Rules](https://developers.cloudflare.com/cache/)
- [Cache Stampede Prevention](https://en.wikipedia.org/wiki/Cache_stampede)
- [HTTP Caching - MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
