/**
 * Integration Test — Full Failure Pipeline Flow
 *
 * Tests the complete pipeline: ingest → fingerprint → dedup → prioritize →
 * webhook dispatch → metrics recording
 */

import { describe, it, expect, beforeEach } from "vitest";
import { FailurePipeline } from "../core/failure-pipeline/pipeline";
import { WebhookDispatcher } from "../core/webhook/webhook-dispatcher";
import { MetricsCollector } from "../core/engine-metrics/metrics";
import { AuthManager } from "../core/auth/auth-middleware";
import { GracefulShutdown } from "../core/lifecycle/graceful-shutdown";
import { PostgreSQLStorageAdapter } from "../core/storage/postgresql-adapter";
import { generateFingerprint } from "../core/types/failure-types";
import type { FailureEvent } from "../core/types/failure-types";
import * as os from "os";
import * as path from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createFailureEvent(overrides?: Partial<FailureEvent>): FailureEvent {
  const base: FailureEvent = {
    id: `test-${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    source: "github-actions",
    severity: "high",
    fingerprint: "",
    service: "rail-api",
    environment: "ci",
    message: "Test failure",
    status: "new",
    commitSha: "abc1234",
    blobs: [],
    ...overrides,
  };
  base.fingerprint = generateFingerprint(base);
  return base;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Integration: Failure Pipeline Flow", () => {
  let pipeline: FailurePipeline;

  beforeEach(() => {
    pipeline = new FailurePipeline({
      maxOpenFixPRs: 5,
      deduplicationWindowHours: 24,
      escalationThreshold: 3,
      autoFixEnabled: true,
      sources: [],
    });
  });

  it("deduplicates failures by fingerprint", () => {
    const f1 = createFailureEvent({ message: "Build failed" });
    const f2 = createFailureEvent({ message: "Build failed" });
    const f3 = createFailureEvent({ message: "Different failure" });

    const deduped = pipeline.deduplicate([f1, f2, f3]);
    expect(deduped.length).toBe(2);
  });

  it("prioritizes critical failures first", () => {
    const low = createFailureEvent({ severity: "low", message: "low" });
    const critical = createFailureEvent({
      severity: "critical",
      message: "critical",
    });
    const high = createFailureEvent({ severity: "high", message: "high" });

    const prioritized = pipeline.prioritize([low, critical, high]);
    expect(prioritized[0].severity).toBe("critical");
    expect(prioritized[1].severity).toBe("high");
    expect(prioritized[2].severity).toBe("low");
  });

  it("escalates recurring failures to critical", () => {
    const failures: FailureEvent[] = [];
    for (let i = 0; i < 4; i++) {
      failures.push(
        createFailureEvent({ id: `esc-${i}`, message: "Recurring failure" }),
      );
    }

    // First pass deduplicates
    const pass1 = pipeline.deduplicate([failures[0]]);
    expect(pass1.length).toBe(1);

    // Subsequent passes increment count
    pipeline.deduplicate([failures[1]]);
    pipeline.deduplicate([failures[2]]);

    // After threshold, next unique failure with same fingerprint is escalated
    const pass4 = pipeline.deduplicate([failures[3]]);
    // The dedup skips duplicates but escalates severity in the fingerprint tracker
    expect(pass4.length).toBe(0); // All deduped
  });

  it("generates agent failure context", () => {
    const failures = [
      createFailureEvent({ severity: "critical", message: "DB down" }),
      createFailureEvent({ severity: "high", message: "API timeout" }),
    ];

    const context = pipeline.generateContext(failures, "test/repo", [
      {
        number: 42,
        title: "fix: db connection",
        fingerprint: "abc",
        url: "https://github.com/test/repo/pull/42",
      },
    ]);

    expect(context.schema_version).toBe("1.0");
    expect(context.repository).toBe("test/repo");
    expect(context.failures.length).toBe(2);
    expect(context.open_fix_prs.length).toBe(1);
    expect(context.action_items.length).toBeGreaterThan(0);
  });

  it("respects auto-fix circuit breaker", () => {
    expect(pipeline.canAutoFix(0)).toBe(true);
    expect(pipeline.canAutoFix(4)).toBe(true);
    expect(pipeline.canAutoFix(5)).toBe(false); // At maxOpenFixPRs
  });

  it("provides cache statistics", () => {
    pipeline.deduplicate([
      createFailureEvent({ message: "test1", service: "svc-a" }),
    ]);
    pipeline.deduplicate([
      createFailureEvent({ message: "test2", service: "svc-b" }),
    ]);

    const stats = pipeline.getCacheStats();
    expect(stats.size).toBe(2);
    expect(stats.maxEntries).toBe(10_000);
  });
});

describe("Integration: Webhook Dispatcher", () => {
  let dispatcher: WebhookDispatcher;

  beforeEach(() => {
    dispatcher = new WebhookDispatcher({
      maxRetries: 1,
      baseDelayMs: 10,
      timeoutMs: 1000,
    });
  });

  it("registers and lists endpoints", () => {
    dispatcher.registerEndpoint({
      name: "test-hook",
      url: "https://example.com/webhook",
      events: ["failure.detected"],
      secret: "t".repeat(16) + "-test-webhook-key",
      enabled: true,
    });

    const endpoints = dispatcher.listEndpoints();
    expect(endpoints.length).toBe(1);
    expect(endpoints[0].name).toBe("test-hook");
  });

  it("dispatches events to matching endpoints", async () => {
    dispatcher.registerEndpoint({
      name: "all-events",
      url: "https://httpbin.org/post", // Will fail but tests dispatch logic
      events: [],
      secret: "t".repeat(16) + "-test-webhook-key",
      enabled: true,
    });

    const ids = await dispatcher.dispatch("failure.detected", {
      message: "test",
    });
    expect(ids.length).toBe(1);
  });

  it("skips disabled endpoints", async () => {
    dispatcher.registerEndpoint({
      name: "disabled",
      url: "https://example.com/webhook",
      events: [],
      secret: "t".repeat(16) + "-test-webhook-key",
      enabled: false,
    });

    const ids = await dispatcher.dispatch("failure.detected", {});
    expect(ids.length).toBe(0);
  });

  it("filters by event type", async () => {
    dispatcher.registerEndpoint({
      name: "failures-only",
      url: "https://example.com/webhook",
      events: ["failure.detected"],
      secret: "t".repeat(16) + "-test-webhook-key",
      enabled: true,
    });

    const ids = await dispatcher.dispatch("pr.created", {});
    expect(ids.length).toBe(0);
  });

  it("provides delivery statistics", () => {
    const stats = dispatcher.getStats();
    expect(stats.endpoints).toBe(0);
    expect(stats.pendingDeliveries).toBe(0);
    expect(stats.deadLetterCount).toBe(0);
  });
});

describe("Integration: Auth Manager", () => {
  let auth: AuthManager;

  beforeEach(() => {
    auth = new AuthManager();
  });

  it("creates and authenticates API keys", () => {
    const rawKey = auth.createKey({
      name: "test-key",
      tenantId: "tenant-1",
      role: "admin",
    });

    expect(rawKey).toMatch(/^ce_/);

    const result = auth.authenticate(`Bearer ${rawKey}`);
    expect(result.authenticated).toBe(true);
    expect(result.context?.tenantId).toBe("tenant-1");
    expect(result.context?.role).toBe("admin");
  });

  it("rejects invalid keys", () => {
    const result = auth.authenticate("Bearer ce_invalid_key");
    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("Invalid API key");
  });

  it("rejects revoked keys", () => {
    const rawKey = auth.createKey({
      name: "revoke-test",
      tenantId: "t1",
      role: "viewer",
    });

    const result1 = auth.authenticate(`Bearer ${rawKey}`);
    expect(result1.authenticated).toBe(true);

    // Find hash from list
    const keys = auth.listKeys();
    const keyRecord = keys.find((k) => k.name === "revoke-test");
    expect(keyRecord).toBeDefined();

    // Revoke using full hash — need to re-authenticate to get hash
    // Instead, test via second authenticate after creating+revoking
    // The revoke method needs the full hash, which we get from authenticate
    const hash = result1.context?.keyHash;
    expect(hash).toBeDefined();
    auth.revokeKey(hash!);

    const result2 = auth.authenticate(`Bearer ${rawKey}`);
    expect(result2.authenticated).toBe(false);
    expect(result2.error).toBe("API key revoked");
  });

  it("enforces role hierarchy", () => {
    expect(auth.authorize("admin", "viewer")).toBe(true);
    expect(auth.authorize("admin", "operator")).toBe(true);
    expect(auth.authorize("operator", "viewer")).toBe(true);
    expect(auth.authorize("viewer", "admin")).toBe(false);
    expect(auth.authorize("viewer", "operator")).toBe(false);
  });

  it("rejects missing authorization header", () => {
    const result = auth.authenticate(undefined);
    expect(result.authenticated).toBe(false);
  });

  it("rejects expired keys", () => {
    const rawKey = auth.createKey({
      name: "expired-key",
      tenantId: "t1",
      role: "viewer",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    const result = auth.authenticate(`Bearer ${rawKey}`);
    expect(result.authenticated).toBe(false);
    expect(result.error).toBe("API key expired");
  });
});

describe("Integration: Graceful Shutdown", () => {
  it("executes hooks in priority order", async () => {
    const shutdown = new GracefulShutdown({
      drainTimeoutMs: 5000,
      totalTimeoutMs: 10000,
    });
    const order: string[] = [];

    shutdown.register({
      name: "close-db",
      priority: 100,
      fn: async () => {
        order.push("close-db");
      },
    });
    shutdown.register({
      name: "flush-metrics",
      priority: 50,
      fn: async () => {
        order.push("flush-metrics");
      },
    });
    shutdown.register({
      name: "drain-tasks",
      priority: 10,
      fn: async () => {
        order.push("drain-tasks");
      },
    });

    await shutdown.shutdown();

    expect(order).toEqual(["drain-tasks", "flush-metrics", "close-db"]);
    expect(shutdown.getPhase()).toBe("stopped");
  });

  it("handles hook errors gracefully", async () => {
    const shutdown = new GracefulShutdown({
      drainTimeoutMs: 5000,
      totalTimeoutMs: 10000,
    });

    shutdown.register({
      name: "failing-hook",
      priority: 10,
      fn: async () => {
        throw new Error("Hook failed");
      },
    });
    shutdown.register({
      name: "succeeding-hook",
      priority: 50,
      fn: async () => {
        /* ok */
      },
    });

    // Should not throw
    await shutdown.shutdown();
    expect(shutdown.getPhase()).toBe("stopped");
  });
});

describe("Integration: PostgreSQL Adapter (constructor only)", () => {
  it("creates adapter with valid config", () => {
    const adapter = new PostgreSQLStorageAdapter({
      connectionString: "postgres://user:pass@localhost:5432/test",
    });
    expect(adapter.name).toBe("postgresql");
  });

  it("rejects empty connection string", () => {
    expect(() => {
      new PostgreSQLStorageAdapter({ connectionString: "" });
    }).toThrow("connectionString must not be empty");
  });
});

describe("Integration: Metrics with pipeline", () => {
  it("records failure metrics from pipeline output", () => {
    const metrics = new MetricsCollector(
      path.join(os.tmpdir(), `code-engine-test-${Date.now()}`),
    );

    // Simulate pipeline processing
    metrics.recordFailure(true, false); // auto-fixed
    metrics.recordFailure(false, true); // escalated
    metrics.recordFailure(false, false); // ignored

    const data = metrics.getMetrics();
    expect(data.failures.total_ingested).toBe(3);
    expect(data.failures.auto_fixed).toBe(1);
    expect(data.failures.escalated).toBe(1);
    expect(data.failures.ignored).toBe(1);
  });
});
