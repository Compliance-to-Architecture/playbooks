import { describe, it, expect, vi } from "vitest";
import {
  FailurePipeline,
  FailureStore,
} from "../core/failure-pipeline/pipeline";
import type {
  EscalationHook,
  ResolutionRecord,
} from "../core/failure-pipeline/pipeline";
import type { FailureEvent } from "../core/types/failure-types";

function makeFailure(overrides: Partial<FailureEvent> = {}): FailureEvent {
  return {
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    source: "github-actions",
    severity: "high",
    fingerprint: `fp-${Math.random().toString(36).slice(2, 10)}`,
    service: "test-service",
    environment: "ci",
    message: "Test failure",
    status: "new",
    commitSha: "abc1234",
    blobs: [],
    ...overrides,
  };
}

describe("FailurePipeline", () => {
  const config = {
    maxOpenFixPRs: 3,
    deduplicationWindowHours: 24,
    escalationThreshold: 3,
    autoFixEnabled: true,
    sources: [],
  };

  describe("deduplicate", () => {
    it("removes duplicate fingerprints", () => {
      const pipeline = new FailurePipeline(config);
      const fp = "same-fingerprint";

      const failures = [
        makeFailure({ fingerprint: fp }),
        makeFailure({ fingerprint: fp }),
        makeFailure({ fingerprint: "different" }),
      ];

      const deduped = pipeline.deduplicate(failures);
      expect(deduped).toHaveLength(2);
    });

    it("escalates recurring failures", () => {
      const pipeline = new FailurePipeline({
        ...config,
        escalationThreshold: 2,
      });
      const fp = "recurring-fp";

      // First occurrence
      pipeline.deduplicate([makeFailure({ fingerprint: fp })]);

      // Second occurrence (should escalate)
      const result = pipeline.deduplicate([
        makeFailure({ fingerprint: fp, severity: "medium" }),
      ]);

      // The failure was deduplicated (skipped) since it's within the window
      // but the internal counter was incremented
      expect(result).toHaveLength(0);
    });
  });

  describe("prioritize", () => {
    it("sorts by severity (critical first)", () => {
      const pipeline = new FailurePipeline(config);

      const failures = [
        makeFailure({ severity: "low" }),
        makeFailure({ severity: "critical" }),
        makeFailure({ severity: "medium" }),
        makeFailure({ severity: "high" }),
      ];

      const sorted = pipeline.prioritize(failures);
      expect(sorted[0].severity).toBe("critical");
      expect(sorted[1].severity).toBe("high");
      expect(sorted[2].severity).toBe("medium");
      expect(sorted[3].severity).toBe("low");
    });
  });

  describe("generateContext", () => {
    it("produces agent-ingestable context", () => {
      const pipeline = new FailurePipeline(config);
      const failures = [
        makeFailure({ severity: "critical", service: "auth-api" }),
        makeFailure({ severity: "high", service: "rail-api" }),
      ];

      const context = pipeline.generateContext(failures, "org/repo", []);

      expect(context.schema_version).toBe("1.0");
      expect(context.repository).toBe("org/repo");
      expect(context.failures).toHaveLength(2);
      expect(context.action_items.length).toBeGreaterThan(0);
      expect(context.action_items[0]).toContain("critical");
    });
  });

  describe("canAutoFix", () => {
    it("allows auto-fix when under PR limit", () => {
      const pipeline = new FailurePipeline(config);
      expect(pipeline.canAutoFix(0)).toBe(true);
      expect(pipeline.canAutoFix(2)).toBe(true);
    });

    it("blocks auto-fix when at PR limit", () => {
      const pipeline = new FailurePipeline(config);
      expect(pipeline.canAutoFix(3)).toBe(false);
      expect(pipeline.canAutoFix(5)).toBe(false);
    });

    it("blocks auto-fix when disabled", () => {
      const pipeline = new FailurePipeline({
        ...config,
        autoFixEnabled: false,
      });
      expect(pipeline.canAutoFix(0)).toBe(false);
    });
  });

  describe("dead letter queue", () => {
    it("adds failures to dead letter queue", () => {
      const pipeline = new FailurePipeline(config);
      const failure = makeFailure({ fingerprint: "dl-fp-1" });

      pipeline.addToDeadLetter(failure, "max attempts exceeded");

      const queue = pipeline.getDeadLetterQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].reason).toBe("max attempts exceeded");
      expect(queue[0].attempts).toBe(1);
    });

    it("increments attempts for existing dead letter entries", () => {
      const pipeline = new FailurePipeline(config);
      const failure = makeFailure({ fingerprint: "dl-fp-2" });

      pipeline.addToDeadLetter(failure, "attempt 1");
      pipeline.addToDeadLetter(failure, "attempt 2");

      const queue = pipeline.getDeadLetterQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].attempts).toBe(2);
      expect(queue[0].reason).toBe("attempt 2");
    });

    it("shouldDeadLetter returns true after max attempts", () => {
      const pipeline = new FailurePipeline({
        ...config,
        maxFixAttempts: 2,
      });
      const failure = makeFailure({ fingerprint: "dl-fp-3" });

      pipeline.addToDeadLetter(failure, "fail 1");
      expect(pipeline.shouldDeadLetter("dl-fp-3")).toBe(false);

      pipeline.addToDeadLetter(failure, "fail 2");
      expect(pipeline.shouldDeadLetter("dl-fp-3")).toBe(true);
    });

    it("removes from dead letter queue", () => {
      const pipeline = new FailurePipeline(config);
      const failure = makeFailure({ fingerprint: "dl-fp-4" });

      pipeline.addToDeadLetter(failure, "test");
      expect(pipeline.removeFromDeadLetter("dl-fp-4")).toBe(true);
      expect(pipeline.getDeadLetterQueue()).toHaveLength(0);
      expect(pipeline.removeFromDeadLetter("nonexistent")).toBe(false);
    });
  });

  describe("resolution tracking", () => {
    it("records and retrieves resolutions", () => {
      const pipeline = new FailurePipeline(config);
      const record: ResolutionRecord = {
        fingerprint: "res-fp-1",
        resolvedByPr: "#100",
        resolvedAt: new Date().toISOString(),
        summary: "Fixed lockfile",
        commitSha: "abc123",
      };

      pipeline.recordResolution(record);

      expect(pipeline.getResolutions()).toHaveLength(1);
      expect(pipeline.isResolved("res-fp-1")).toBeDefined();
      expect(pipeline.isResolved("nonexistent")).toBeUndefined();
    });

    it("deduplicates resolutions by fingerprint", () => {
      const pipeline = new FailurePipeline(config);

      pipeline.recordResolution({
        fingerprint: "res-fp-2",
        resolvedByPr: "#100",
        resolvedAt: new Date().toISOString(),
        summary: "First fix",
        commitSha: "abc",
      });
      pipeline.recordResolution({
        fingerprint: "res-fp-2",
        resolvedByPr: "#101",
        resolvedAt: new Date().toISOString(),
        summary: "Better fix",
        commitSha: "def",
      });

      expect(pipeline.getResolutions()).toHaveLength(1);
      expect(pipeline.isResolved("res-fp-2")?.resolvedByPr).toBe("#101");
    });

    it("removes from dead letter when resolved", () => {
      const pipeline = new FailurePipeline(config);
      const failure = makeFailure({ fingerprint: "res-dl-fp" });

      pipeline.addToDeadLetter(failure, "unresolvable");
      expect(pipeline.getDeadLetterQueue()).toHaveLength(1);

      pipeline.recordResolution({
        fingerprint: "res-dl-fp",
        resolvedByPr: "#200",
        resolvedAt: new Date().toISOString(),
        summary: "Fixed",
        commitSha: "xyz",
      });

      expect(pipeline.getDeadLetterQueue()).toHaveLength(0);
    });

    it("returns recent resolutions sorted by date", () => {
      const pipeline = new FailurePipeline(config);

      pipeline.recordResolution({
        fingerprint: "old",
        resolvedByPr: "#1",
        resolvedAt: "2025-01-01T00:00:00Z",
        summary: "Old fix",
        commitSha: "a",
      });
      pipeline.recordResolution({
        fingerprint: "new",
        resolvedByPr: "#2",
        resolvedAt: "2026-03-28T00:00:00Z",
        summary: "New fix",
        commitSha: "b",
      });

      const recent = pipeline.getRecentResolutions(1);
      expect(recent).toHaveLength(1);
      expect(recent[0].fingerprint).toBe("new");
    });
  });

  describe("cross-source correlation", () => {
    it("groups failures with similar error patterns", () => {
      const pipeline = new FailurePipeline(config);

      const failures = [
        makeFailure({
          fingerprint: "fp-a",
          message: "ERR_PNPM_OUTDATED_LOCKFILE in job 12345",
        }),
        makeFailure({
          fingerprint: "fp-b",
          message: "ERR_PNPM_OUTDATED_LOCKFILE in job 67890",
        }),
        makeFailure({
          fingerprint: "fp-c",
          message: "Totally different error",
        }),
      ];

      const groups = pipeline.correlateFailures(failures);
      expect(groups.length).toBeGreaterThanOrEqual(1);

      const lockfileGroup = groups.find(
        (g) =>
          g.primaryFingerprint === "fp-a" ||
          g.relatedFingerprints.includes("fp-a"),
      );
      expect(lockfileGroup).toBeDefined();
    });

    it("returns empty for unrelated failures", () => {
      const pipeline = new FailurePipeline(config);

      const failures = [
        makeFailure({ fingerprint: "fp-x", message: "Error A unique" }),
        makeFailure({ fingerprint: "fp-y", message: "Error B different" }),
      ];

      const groups = pipeline.correlateFailures(failures);
      expect(groups).toHaveLength(0);
    });
  });

  describe("escalation hooks", () => {
    it("calls hooks when failures exceed threshold", () => {
      const hookFn = vi.fn();
      const hook: EscalationHook = { onEscalation: hookFn };

      const pipeline = new FailurePipeline({
        ...config,
        escalationThreshold: 2,
        escalationHooks: [hook],
      });

      const fp = "esc-fp";
      // First occurrence — registers
      pipeline.deduplicate([makeFailure({ fingerprint: fp })]);
      // Second — triggers escalation (count=2 >= threshold=2)
      pipeline.deduplicate([makeFailure({ fingerprint: fp })]);

      expect(hookFn).toHaveBeenCalledTimes(1);
      expect(hookFn).toHaveBeenCalledWith(expect.anything(), 2);
    });

    it("dynamically adds escalation hooks", () => {
      const pipeline = new FailurePipeline({
        ...config,
        escalationThreshold: 2,
      });

      const hookFn = vi.fn();
      pipeline.addEscalationHook({ onEscalation: hookFn });

      const fp = "dyn-esc-fp";
      pipeline.deduplicate([makeFailure({ fingerprint: fp })]);
      pipeline.deduplicate([makeFailure({ fingerprint: fp })]);

      expect(hookFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("pipeline stats", () => {
    it("returns accurate statistics", () => {
      const pipeline = new FailurePipeline(config);

      pipeline.addToDeadLetter(makeFailure(), "test");
      pipeline.recordResolution({
        fingerprint: "stat-fp",
        resolvedByPr: "#1",
        resolvedAt: new Date().toISOString(),
        summary: "Fixed",
        commitSha: "abc",
      });
      pipeline.addEscalationHook({ onEscalation: () => {} });

      const stats = pipeline.getStats();
      expect(stats.deadLetterCount).toBe(1);
      expect(stats.resolutionCount).toBe(1);
      expect(stats.escalationHookCount).toBe(1);
    });
  });

  describe("generateContext with dead letter warnings", () => {
    it("includes dead letter warnings in action items", () => {
      const pipeline = new FailurePipeline(config);
      pipeline.addToDeadLetter(makeFailure(), "permanently unresolvable");

      const context = pipeline.generateContext([], "org/repo", []);
      expect(context.action_items).toContainEqual(
        expect.stringContaining("DEAD LETTER"),
      );
    });
  });
});
