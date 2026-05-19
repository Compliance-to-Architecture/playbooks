# API Design & SDK Generation Skill

> **Enforcement**: suggest
> **Triggers**: api, endpoint, route, openapi, swagger, sdk, rest, graphql, webhook, rate-limit

## Overview

Enterprise API design patterns covering RESTful design, OpenAPI specifications, SDK generation, versioning, rate limiting, pagination, and webhook delivery.

## API Design Principles

### Resource Naming
```
GET    /api/v1/{resource}           # List (with pagination)
POST   /api/v1/{resource}           # Create
GET    /api/v1/{resource}/{id}      # Read
PUT    /api/v1/{resource}/{id}      # Full update
PATCH  /api/v1/{resource}/{id}      # Partial update
DELETE /api/v1/{resource}/{id}      # Delete
POST   /api/v1/{resource}/{id}/{action}  # Custom action
```

### Response Envelope
```typescript
interface ApiResponse<T> {
  data: T;
  meta?: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
  links?: {
    self: string;
    next?: string;
    prev?: string;
    first: string;
    last: string;
  };
}

interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
    requestId: string;
    documentation?: string;
  };
}
```

### Pagination
```typescript
// Cursor-based pagination (recommended for large datasets)
async function listWithCursor(params: {
  cursor?: string;
  limit: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
}): Promise<{ items: T[]; nextCursor?: string; hasMore: boolean }> {
  const limit = Math.min(params.limit, 100);
  const items = await db.findMany({
    take: limit + 1,
    cursor: params.cursor ? { id: params.cursor } : undefined,
    orderBy: { [params.sortBy]: params.sortOrder },
  });

  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  return {
    items,
    nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
    hasMore,
  };
}
```

### Rate Limiting
```typescript
// packages/service-core/src/rate-limit.ts
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";

const rateLimitMiddleware = rateLimiter({
  windowMs: 60 * 1000,     // 1 minute
  limit: 100,               // 100 requests per window
  keyGenerator: (c) => c.get("tenantId") ?? c.req.header("x-forwarded-for") ?? "anonymous",
  message: { error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests" } },
});
```

### Versioning
```typescript
// API versioning via URL path (recommended)
app.route("/api/v1", v1Routes);
app.route("/api/v2", v2Routes);

// Deprecation header
app.use("/api/v1/*", async (c, next) => {
  await next();
  c.header("Deprecation", "true");
  c.header("Sunset", "2026-12-31");
  c.header("Link", '</api/v2>; rel="successor-version"');
});
```

### SDK Generation
```bash
# Generate TypeScript SDK from OpenAPI spec
npx openapi-typescript-codegen --input openapi.yaml --output packages/sdk/src/generated

# Generate Go SDK
openapi-generator-cli generate -i openapi.yaml -g go -o packages/sdk-go/

# Generate Python SDK
openapi-generator-cli generate -i openapi.yaml -g python -o packages/sdk-python/
```

### Webhook Delivery
```typescript
// packages/webhook-core/src/delivery.ts

interface WebhookDelivery {
  eventType: string;
  payload: Record<string, unknown>;
  targetUrl: string;
  secret: string;
  retryPolicy: { maxRetries: number; backoffMs: number[] };
}

async function deliverWebhook(delivery: WebhookDelivery): Promise<void> {
  const body = JSON.stringify(delivery.payload);
  const signature = createHmac("sha256", delivery.secret)
    .update(body)
    .digest("hex");

  for (let attempt = 0; attempt <= delivery.retryPolicy.maxRetries; attempt++) {
    try {
      const response = await fetch(delivery.targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": `sha256=${signature}`,
          "X-Webhook-Event": delivery.eventType,
          "X-Webhook-Timestamp": String(Date.now()),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) return;
      if (response.status >= 400 && response.status < 500) return; // Don't retry client errors
    } catch {
      // Retry on network errors
    }

    if (attempt < delivery.retryPolicy.maxRetries) {
      await sleep(delivery.retryPolicy.backoffMs[attempt] ?? 30_000);
    }
  }
}
```

## Core Principles

- **Resource-Oriented Design**: Model every API around nouns (resources), not verbs. Use HTTP methods (GET, POST, PUT, PATCH, DELETE) to express intent, keeping URLs stable across versions.
- **Consistent Error Shape**: All errors return the same `ApiError` envelope with a machine-readable `code`, human-readable `message`, `requestId` for tracing, and optional `documentation` link.
- **Versioning by URL Path**: Embed the major version in the path (`/api/v1/`). Deprecate old versions with `Deprecation` and `Sunset` headers before removal; never break existing callers silently.
- **Idempotency by Default**: All write operations accept an `Idempotency-Key` header. Store results for at least 24 hours so retries return the same response without side effects.
- **OpenAPI as Contract**: The OpenAPI spec is the single source of truth for request/response shapes. Generate SDKs, validation middleware, and documentation from it — never let code drift from the spec.

## Patterns

- **Cursor-Based Pagination**: Prefer cursor pagination over offset pagination for large or real-time datasets; offset pagination skips or duplicates rows when records are inserted during traversal.
- **Tenant-Keyed Rate Limiting**: Key rate limits on `tenantId` (from JWT or header) rather than IP address to prevent shared-IP false positives and allow per-plan tier limits.
- **HMAC Webhook Signatures**: Sign all outgoing webhook payloads with `sha256=<hmac>` so receivers can verify authenticity. Include a timestamp header and reject payloads older than 5 minutes to prevent replay attacks.
- **Exponential Backoff with Jitter**: Retry failed webhook deliveries using exponential backoff (`100ms, 500ms, 2s, 10s, 30s`) with random jitter to prevent thundering-herd on the target server.
- **SDK Generation from Spec**: Run `openapi-typescript-codegen` in CI to keep client SDKs in sync with the spec. Fail the build if the generated output differs from the committed SDK.

## Anti-Patterns

- **Verbs in Resource URLs**: `/api/v1/getContracts` or `/api/v1/createUser` breaks REST conventions and makes URLs unstable. Use `/api/v1/contracts` + HTTP method instead.
- **Returning 200 for Errors**: Never return HTTP 200 with `{ "success": false }` in the body. Use proper 4xx/5xx status codes so clients and proxies can distinguish success from failure.
- **Unbounded List Endpoints**: Returning all records without pagination limits causes OOM errors and timeouts at scale. Always enforce a `limit` cap (e.g., max 100) and require cursor/page parameters.
- **Breaking Changes Without Versioning**: Removing fields, renaming properties, or changing types in an existing version breaks all clients. Introduce a new version and deprecate, never mutate in place.
- **Storing Idempotency Keys Forever**: Keeping idempotency records indefinitely wastes storage. Set a TTL (24–48 hours) and document it in the API reference.

## Checklist

- [ ] All endpoints follow `GET/POST/PUT/PATCH/DELETE /api/v{n}/{resource}[/{id}]` naming
- [ ] All responses use the `ApiResponse<T>` or `ApiError` envelope
- [ ] Pagination enforced on all list endpoints with a documented max `limit`
- [ ] Rate limiting configured per tenant with tier-appropriate limits
- [ ] API version declared in URL path; deprecated versions emit `Deprecation` and `Sunset` headers
- [ ] Webhook payloads signed with HMAC-SHA256 and include a timestamp
- [ ] OpenAPI spec committed and SDK generated from it in CI
- [ ] Idempotency keys accepted on all mutating endpoints

## Review Protocol (tool-wrapper pattern)

When reviewing API code, apply this checklist systematically:

### Step 1: Load Rules
Load the checklist above and the conventions from this skill file.

### Step 2: Check Code Against Each Rule
For every route file, middleware, or API handler under review:

1. Read the file completely before commenting
2. Check each convention from the Principles and Patterns sections
3. Check each item from the Checklist section

### Step 3: Report Violations
For each violation found, produce a structured finding:

```markdown
| Rule | Location | Severity | Issue | Fix |
|------|----------|----------|-------|-----|
| {checklist item or convention name} | `{file}:{line}` | error/warning/info | {what is wrong and WHY} | {specific code fix} |
```

**Severity classification:**
- **error**: Breaks API contract, causes client failures, security risk (MUST fix)
- **warning**: Inconsistency, missing best practice, future maintenance risk (SHOULD fix)
- **info**: Style improvement, optimization opportunity (CONSIDER fixing)

### Step 4: Score
Rate the API code 1-10:
- **9-10**: Production-ready, follows all conventions
- **7-8**: Minor issues, safe to ship with noted improvements
- **5-6**: Significant gaps, needs revision before production
- **1-4**: Fundamental problems, needs redesign

## References

- [OpenAPI Specification 3.1](https://spec.openapis.org/oas/v3.1.0)
- [RFC 7807 — Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc7807)
- [Stripe API Design Principles](https://stripe.com/docs/api)
- [Google API Design Guide](https://cloud.google.com/apis/design)
- [openapi-typescript-codegen](https://github.com/ferdikoomen/openapi-typescript-codegen)
