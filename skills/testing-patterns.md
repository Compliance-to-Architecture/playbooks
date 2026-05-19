# Testing Patterns Skill

> **Enforcement**: suggest
> **Triggers**: test, e2e, integration, unit, coverage, vitest, playwright, fixture

## Overview

Enterprise testing patterns covering unit tests, integration tests, E2E tests, and test data management.

## Test Pyramid

```
        /  E2E Tests  \          ~5% — Critical user flows
       / Integration   \        ~15% — API, DB, service tests
      /   Unit Tests     \      ~80% — Business logic, utilities
```

## Unit Testing (Vitest)

```typescript
// packages/billing-core/src/__tests__/subscription.test.ts
import { describe, it, expect } from "vitest";
import { calculateProration } from "../proration";

describe("calculateProration", () => {
  it("calculates correct proration for mid-month upgrade", () => {
    const result = calculateProration({
      currentAmount: 1000,
      newAmount: 2000,
      daysRemaining: 15,
      totalDays: 30,
    });

    expect(result.credit).toBe(500);    // 15/30 * 1000
    expect(result.charge).toBe(1000);   // 15/30 * 2000
    expect(result.netCharge).toBe(500); // charge - credit
  });

  it("handles zero days remaining", () => {
    const result = calculateProration({
      currentAmount: 1000,
      newAmount: 2000,
      daysRemaining: 0,
      totalDays: 30,
    });

    expect(result.netCharge).toBe(0);
  });
});
```

## Integration Testing

```typescript
// services/api/src/__tests__/contracts.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestApp, createTestDatabase } from "@project/test-utils";

describe("Contracts API", () => {
  let app: TestApp;
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
    app = await createTestApp({ database: db });
  });

  afterAll(async () => {
    await db.cleanup();
    await app.close();
  });

  it("creates a contract and returns 201", async () => {
    const res = await app.request("/api/v1/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
      body: JSON.stringify({ type: "standard", name: "Test Contract" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBeDefined();
    expect(body.data.name).toBe("Test Contract");
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/v1/contracts");
    expect(res.status).toBe(401);
  });
});
```

## E2E Testing (Playwright)

```typescript
// e2e/tests/login.spec.ts
import { test, expect } from "@playwright/test";

test("user can login and see dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.fill("[name=email]", "test@example.com");
  await page.fill("[name=password]", "testpassword");
  await page.click("button[type=submit]");

  await expect(page).toHaveURL("/dashboard");
  await expect(page.locator("h1")).toContainText("Dashboard");
});
```

## Test Data Management

```typescript
// packages/seed-data/src/fixtures.ts
export const testTenant = {
  id: "test-tenant-001",
  name: "Test Organization",
  subdomain: "test",
  plan: "professional",
};

export const testUser = {
  id: "test-user-001",
  email: "admin@test.com",
  role: "tenant_admin",
  tenantId: testTenant.id,
};

// Factory pattern for dynamic test data
export function createTestContract(overrides = {}) {
  return {
    id: `contract-${Math.random().toString(36).slice(2)}`,
    tenantId: testTenant.id,
    type: "standard",
    status: "draft",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}
```

## Core Principles

- **Test the behavior, not the implementation**: Tests should verify observable outcomes (return values, side effects, API responses), not internal method calls or private state
- **Isolation between test cases**: Each test must set up its own state and clean up afterward; no test should depend on the execution order or side effects of another
- **Deterministic and repeatable**: Tests must produce the same result on every run; avoid reliance on wall-clock time, random values without seeds, or external network calls
- **Test at the right level**: Unit tests for pure logic, integration tests for service boundaries and database interactions, E2E tests for critical user journeys only
- **Factory over fixtures**: Use factory functions with sensible defaults and overrides instead of static fixture files that become stale and brittle

## Patterns

- **Factory pattern with overrides**: Create test data factories (`createTestContract({ status: "active" })`) that produce valid defaults and accept partial overrides
- **Test database per suite**: Spin up an isolated database (or schema) per integration test suite to prevent cross-suite data pollution
- **Arrange-Act-Assert structure**: Every test follows three phases: set up preconditions, execute the action, assert the expected outcome
- **Snapshot testing for API contracts**: Use snapshot tests on API response shapes to catch unintended schema changes between releases
- **Parallel test execution**: Structure tests so they can run concurrently without shared mutable state; use unique tenant/user IDs per test

## Anti-Patterns

- **Testing implementation details**: Asserting on internal method calls, private variables, or mock call counts couples tests to implementation and makes refactoring painful
- **Shared mutable state between tests**: Using a single database row or global variable across tests creates flaky, order-dependent failures
- **Over-mocking**: Replacing every dependency with mocks produces tests that verify the mocking framework, not the actual behavior
- **No assertions in tests**: Tests that execute code without assertions (or with only `expect(true).toBe(true)`) provide false confidence
- **E2E tests for edge cases**: Using slow, expensive E2E tests to cover input validation or error handling that belongs in unit tests

## Checklist

- [ ] Unit tests cover all business logic functions with edge cases (zero, null, boundary values)
- [ ] Integration tests verify API endpoints with real database and authentication
- [ ] E2E tests cover the top 3-5 critical user journeys (login, core workflow, payment)
- [ ] Test data uses factory functions, not hardcoded fixture files
- [ ] CI runs all tests with coverage reporting and fails below threshold

## References

- [Vitest documentation](https://vitest.dev/)
- [Playwright E2E testing](https://playwright.dev/docs/intro)
- [Testing Library guiding principles](https://testing-library.com/docs/guiding-principles)
- [Martin Fowler — Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
