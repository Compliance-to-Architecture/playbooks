import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { MetricsCollector } from "../core/engine-metrics/metrics";

describe("MetricsCollector", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ce-metrics-"));
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates metrics with empty defaults", () => {
    const collector = new MetricsCollector(tmpDir);
    const metrics = collector.getMetrics();

    expect(metrics.schema_version).toBe("1.0");
    expect(metrics.sessions.total).toBe(0);
    expect(metrics.failures.total_ingested).toBe(0);
    expect(metrics.pull_requests.total_created).toBe(0);
  });

  it("records sessions", () => {
    const collector = new MetricsCollector(tmpDir);

    collector.recordSession("started");
    expect(collector.getMetrics().sessions.active).toBe(1);
    expect(collector.getMetrics().sessions.total).toBe(1);

    collector.recordSession("completed");
    expect(collector.getMetrics().sessions.active).toBe(0);
    expect(collector.getMetrics().sessions.completed).toBe(1);
  });

  it("records failures with success rate calculation", () => {
    const collector = new MetricsCollector(tmpDir);

    collector.recordFailure(true, false); // fixed
    collector.recordFailure(false, true); // escalated
    collector.recordFailure(false, false); // ignored

    const metrics = collector.getMetrics();
    expect(metrics.failures.total_ingested).toBe(3);
    expect(metrics.failures.auto_fixed).toBe(1);
    expect(metrics.failures.escalated).toBe(1);
    expect(metrics.failures.ignored).toBe(1);
    expect(metrics.failures.fix_success_rate).toBeCloseTo(1 / 3);
  });

  it("records PR actions", () => {
    const collector = new MetricsCollector(tmpDir);

    collector.recordPR("created");
    collector.recordPR("auto_merged");

    const metrics = collector.getMetrics();
    expect(metrics.pull_requests.total_created).toBe(1);
    expect(metrics.pull_requests.auto_merged).toBe(1);
  });

  it("records skill activations", () => {
    const collector = new MetricsCollector(tmpDir);

    collector.recordSkillActivation("codemap", false);
    collector.recordSkillActivation("codemap", false);
    collector.recordSkillActivation("islamic-finance", true);

    const metrics = collector.getMetrics();
    expect(metrics.skills.total_activations).toBe(3);
    expect(metrics.skills.activations_by_skill["codemap"]).toBe(2);
    expect(metrics.skills.blocked_by_guardrail).toBe(1);
  });

  it("records agent delegations", () => {
    const collector = new MetricsCollector(tmpDir);

    collector.recordAgentDelegation("architect", false);
    collector.recordAgentDelegation("code-reviewer", true);

    const metrics = collector.getMetrics();
    expect(metrics.agents.total_delegations).toBe(2);
    expect(metrics.agents.parallel_delegations).toBe(1);
  });

  it("maintains history with max 30 entries", () => {
    const collector = new MetricsCollector(tmpDir);

    for (let i = 0; i < 35; i++) {
      collector.addHistoryEntry({
        date: `2024-01-${String(i + 1).padStart(2, "0")}`,
        failures_ingested: i,
        failures_fixed: i,
        prs_created: 1,
        prs_merged: 1,
      });
    }

    expect(collector.getMetrics().history).toHaveLength(30);
  });

  it("saves and loads from disk", () => {
    const collector1 = new MetricsCollector(tmpDir);
    collector1.recordSession("started");
    collector1.recordFailure(true, false);
    collector1.save();

    const collector2 = new MetricsCollector(tmpDir);
    const metrics = collector2.getMetrics();

    expect(metrics.sessions.total).toBe(1);
    expect(metrics.failures.auto_fixed).toBe(1);
  });
});
