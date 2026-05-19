# Development Patterns

Code patterns, conventions, and guardrails used across the IOF Code Engine.

## TigerStyle Coding Standard

Every function in this codebase follows TigerStyle:

```typescript
// PATTERN: Function template (≤ 70 lines, ≥ 2 assertions)
export async function processContract(
  contract: Contract,
  tenantId: string,
): Promise<ContractResult> {
  // Assertions (input validation)
  assert(contract !== null, "Contract must not be null");
  assert(tenantId.length > 0, "Tenant ID must not be empty");
  assert(
    isValidContractType(contract.type),
    `Invalid contract type: ${contract.type}`,
  );

  // Business logic (bounded, explicit)
  const MAX_ITEMS = 1000;
  const items = contract.lineItems.slice(0, MAX_ITEMS);

  for (let i = 0; i < items.length && i < MAX_ITEMS; i++) {
    const item = items[i];
    assert(item !== undefined, `Item at index ${i} is undefined`);
    // Process item...
  }

  // Output assertions
  const result = await saveContract(contract);
  assert(result.id !== undefined, "Contract save must return an ID");

  return result;
}
```

## API Route Pattern (Hono)

```typescript
// services/rail-api/src/routes/{resource}.ts
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

const app = new Hono();

// Schema (Zod validation at boundaries)
const CreateSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["MURABAHA", "IJARAH", "SUKUK"]),
  tenantId: z.string().uuid(),
});

// Route (explicit, bounded)
app.post("/", zValidator("json", CreateSchema), async (c) => {
  const body = c.req.valid("json");
  const tenant = c.get("tenant");
  assert(tenant.id === body.tenantId, "Tenant mismatch");

  const result = await contractService.create(body);
  return c.json({ data: result }, 201);
});

// List (paginated, bounded)
app.get("/", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20"), 100);
  const offset = parseInt(c.req.query("offset") ?? "0");
  assert(limit > 0 && limit <= 100, "Limit must be 1-100");
  assert(offset >= 0, "Offset must be non-negative");

  const results = await contractService.list({ limit, offset });
  return c.json({ data: results.items, total: results.total });
});

export default app;
```

## Package Pattern

```typescript
// packages/{name}/src/index.ts
// Single entry point, explicit exports

export { ContractService } from "./service";
export { ContractSchema, type Contract } from "./schema";
export { ContractError } from "./errors";
// No default exports. Named exports only.
```

## Frontend App Pattern (Next.js 15)

```typescript
// apps/{name}/src/pages/{resource}/index.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ResourcePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["resource"],
    queryFn: () => fetch("/api/v1/resource").then((r) => r.json()),
  });

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorState error={error} />;
  if (!data?.length) return <EmptyState />;

  return (
    <div className="grid gap-4">
      {data.map((item) => (
        <Card key={item.id}>
          <CardHeader>
            <CardTitle>{item.name}</CardTitle>
          </CardHeader>
          <CardContent>{/* Render item data */}</CardContent>
        </Card>
      ))}
    </div>
  );
}
```

## Event Envelope Pattern

```typescript
// Cross-service communication
interface EventEnvelope<T> {
  id: string;
  type: string;
  source: string;
  tenantId: string;
  timestamp: string;
  data: T;
  metadata: {
    correlationId: string;
    causationId: string;
    version: number;
  };
}
```

## Error Handling Pattern

```typescript
// packages/errors/src/index.ts
export class IOFError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "IOFError";
  }
}

// Usage: throw specific error classes
throw new NotFoundError("Contract", contractId);
throw new ValidationError("Invalid amount", { amount });
throw new AuthorizationError("Insufficient permissions", { resource, action });
```

## Multi-Tenant Data Access Pattern

```typescript
// Always scope queries to tenant
async function findContracts(tenantId: string, filters: Filters) {
  assert(tenantId, "Tenant ID required for all queries");

  return db.contract.findMany({
    where: {
      tenantId, // ALWAYS first condition
      ...filters,
    },
  });
}
```

## Structured Logger Pattern

```typescript
import { logger } from "@iof/structured-logger";

logger.info("Contract created", {
  service: "rail-api",
  tenantId: tenant.id,
  contractId: result.id,
  rail: "murabaha",
  requestId: c.get("requestId"),
});
```

## Test Pattern

```typescript
import { describe, it, expect } from "vitest";

describe("ContractService", () => {
  it("creates a valid contract", async () => {
    const input = makeContract({ type: "MURABAHA" });
    const result = await service.create(input);

    expect(result.id).toBeDefined();
    expect(result.type).toBe("MURABAHA");
    expect(result.shariahGovernance).toBeDefined();
  });

  it("rejects invalid contract type", async () => {
    const input = makeContract({ type: "INVALID" });
    await expect(service.create(input)).rejects.toThrow(ValidationError);
  });
});
```

## Git Workflow Pattern

```bash
# Branch naming
claude/<description>-<session-id>

# Commit messages (conventional commits)
feat: add sukuk wakalah rail with full Shariah compliance
fix: resolve tenant resolution race condition in edge worker
chore: update codemap index after package restructuring
docs: add API explorer endpoint documentation

# Pre-commit checklist
pnpm format:check    # Must pass
pnpm lint            # Must pass
pnpm typecheck       # Must pass
```
