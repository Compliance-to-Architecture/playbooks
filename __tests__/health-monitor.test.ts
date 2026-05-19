import { describe, it, expect, afterEach } from "vitest";
import {
  HealthMonitor,
  createHttpHealthTarget,
} from "../core/watchdog/health-monitor";
import type { HealthTarget } from "../core/watchdog/health-monitor";

function makeTarget(
  name: string,
  status: "healthy" | "unhealthy" = "healthy",
): HealthTarget {
  return {
    name,
    category: "service",
    check: async () => ({
      status,
      latency_ms: 5,
      message: `${name} is ${status}`,
    }),
  };
}

describe("HealthMonitor", () => {
  let monitor: HealthMonitor;

  afterEach(() => {
    if (monitor) {
      monitor.stop();
    }
  });

  it("registers and checks targets", async () => {
    monitor = new HealthMonitor();
    monitor.register(makeTarget("svc-a"));
    monitor.register(makeTarget("svc-b"));

    const report = await monitor.checkAll();
    expect(report.schema_version).toBe("1.0");
    expect(report.targets).toHaveLength(2);
    expect(report.overall_status).toBe("healthy");
  });

  it("detects unhealthy services", async () => {
    monitor = new HealthMonitor();
    monitor.register(makeTarget("healthy-svc"));
    monitor.register(makeTarget("sick-svc", "unhealthy"));

    const report = await monitor.checkAll();
    // After first check, unhealthy svc has 1 failure (below default threshold of 3)
    // Run multiple checks to trigger unhealthy
    await monitor.checkAll();
    await monitor.checkAll();
    const finalReport = await monitor.checkAll();

    const sickTarget = finalReport.targets.find((t) => t.name === "sick-svc");
    expect(sickTarget).toBeDefined();
    expect(sickTarget!.status).toBe("unhealthy");
    expect(finalReport.overall_status).toBe("unhealthy");
  });

  it("notifies on status change", async () => {
    monitor = new HealthMonitor();
    const changes: Array<{ target: string; from: string; to: string }> = [];

    monitor.onStatusChange((target, oldStatus, newStatus) => {
      changes.push({ target, from: oldStatus, to: newStatus });
    });

    monitor.register(makeTarget("status-svc"));
    await monitor.checkAll();

    // First check: unknown → healthy
    expect(changes.length).toBeGreaterThan(0);
    expect(changes[0].from).toBe("unknown");
    expect(changes[0].to).toBe("healthy");
  });

  it("generates health report with history", async () => {
    monitor = new HealthMonitor();
    monitor.register(makeTarget("hist-svc"));

    await monitor.checkAll();
    await monitor.checkAll();

    const report = monitor.generateReport();
    expect(report.history.length).toBeGreaterThanOrEqual(2);
    expect(report.history[0].healthy).toBe(1);
  });

  it("rejects duplicate target names", () => {
    monitor = new HealthMonitor();
    monitor.register(makeTarget("dup"));
    expect(() => monitor.register(makeTarget("dup"))).toThrow();
  });

  it("createHttpHealthTarget produces valid target", () => {
    const target = createHttpHealthTarget({
      name: "test-api",
      url: "http://localhost:3000/health",
      category: "service",
      intervalMs: 30_000,
    });
    expect(target.name).toBe("test-api");
    expect(target.category).toBe("service");
    expect(typeof target.check).toBe("function");
  });

  it("provides audit log for remediation actions", async () => {
    monitor = new HealthMonitor();
    monitor.register({
      name: "remediate-svc",
      category: "service",
      failureThreshold: 1,
      check: async () => ({
        status: "unhealthy",
        latency_ms: 0,
        message: "down",
      }),
      remediate: async () => ({
        success: true,
        action: "restart",
        message: "Service restarted",
      }),
    });

    await monitor.checkAll();
    const log = monitor.getAuditLog();
    expect(log.some((e) => e.action.includes("remediation"))).toBe(true);
  });
});
