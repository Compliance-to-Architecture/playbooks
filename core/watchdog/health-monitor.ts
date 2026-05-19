/**
 * Coding Engine — Health Monitor & Watchdog
 *
 * Proactive self-healing via periodic health probes on all configured
 * services, databases, caches, search engines, and external dependencies.
 *
 * Features:
 * - Configurable probe intervals per target
 * - Circuit breaker state tracking per target
 * - Health history for trend analysis
 * - Auto-remediation hooks (restart, alert, escalate)
 * - Structured health report generation
 */

import { strict as assert } from "node:assert";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export interface HealthTarget {
  /** Unique target name (e.g., "rail-api", "redis", "postgresql") */
  readonly name: string;
  /** Target category for grouping */
  readonly category:
    | "service"
    | "database"
    | "cache"
    | "search"
    | "external"
    | "worker";
  /** Health check function */
  readonly check: () => Promise<HealthCheckResult>;
  /** Probe interval in milliseconds (default: 60_000) */
  readonly intervalMs?: number;
  /** Number of consecutive failures before marking unhealthy */
  readonly failureThreshold?: number;
  /** Auto-remediation action (optional) */
  readonly remediate?: () => Promise<RemediationResult>;
}

export interface HealthCheckResult {
  readonly status: HealthStatus;
  readonly latency_ms: number;
  readonly message?: string;
  readonly details?: Record<string, unknown>;
}

export interface RemediationResult {
  readonly success: boolean;
  readonly action: string;
  readonly message: string;
}

export interface HealthReport {
  readonly schema_version: string;
  readonly generated_at: string;
  readonly overall_status: HealthStatus;
  readonly targets: Array<{
    name: string;
    category: string;
    status: HealthStatus;
    latency_ms: number;
    consecutive_failures: number;
    last_check: string;
    last_success: string | null;
    message?: string;
  }>;
  readonly history: Array<{
    timestamp: string;
    healthy: number;
    degraded: number;
    unhealthy: number;
    unknown: number;
  }>;
}

interface TargetState {
  target: HealthTarget;
  status: HealthStatus;
  consecutiveFailures: number;
  lastCheck: Date | null;
  lastSuccess: Date | null;
  lastLatency: number;
  lastMessage: string;
  timer: ReturnType<typeof setInterval> | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_INTERVAL_MS = 60_000; // 1 minute
const DEFAULT_FAILURE_THRESHOLD = 3;
const MAX_HISTORY_ENTRIES = 100;
const PROBE_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Health Monitor
// ---------------------------------------------------------------------------

export class HealthMonitor {
  private readonly targets: Map<string, TargetState> = new Map();
  private readonly history: Array<{
    timestamp: string;
    healthy: number;
    degraded: number;
    unhealthy: number;
    unknown: number;
  }> = [];
  private readonly listeners: Array<
    (target: string, oldStatus: HealthStatus, newStatus: HealthStatus) => void
  > = [];
  private readonly auditLog: Array<{
    timestamp: string;
    target: string;
    action: string;
    result: string;
  }> = [];
  private running = false;

  /** Register a health check target */
  register(target: HealthTarget): void {
    assert(
      !this.targets.has(target.name),
      `Target "${target.name}" already registered`,
    );
    this.targets.set(target.name, {
      target,
      status: "unknown",
      consecutiveFailures: 0,
      lastCheck: null,
      lastSuccess: null,
      lastLatency: 0,
      lastMessage: "",
      timer: null,
    });
  }

  /** Register a status change listener */
  onStatusChange(
    listener: (
      target: string,
      oldStatus: HealthStatus,
      newStatus: HealthStatus,
    ) => void,
  ): void {
    this.listeners.push(listener);
  }

  /** Start periodic health monitoring for all targets */
  start(): void {
    assert(!this.running, "Monitor already running");
    this.running = true;

    for (const [, state] of this.targets) {
      const interval = state.target.intervalMs ?? DEFAULT_INTERVAL_MS;
      // Run immediately, then on interval
      void this.probeTarget(state);
      state.timer = setInterval(() => {
        void this.probeTarget(state);
      }, interval);
    }
  }

  /** Stop all health monitoring */
  stop(): void {
    this.running = false;
    for (const [, state] of this.targets) {
      if (state.timer !== null) {
        clearInterval(state.timer);
        state.timer = null;
      }
    }
  }

  /** Run a single health check pass on all targets (useful for on-demand checks) */
  async checkAll(): Promise<HealthReport> {
    const probes = Array.from(this.targets.values()).map((state) =>
      this.probeTarget(state),
    );
    await Promise.allSettled(probes);
    return this.generateReport();
  }

  /** Check a single target */
  async checkOne(targetName: string): Promise<HealthCheckResult> {
    const state = this.targets.get(targetName);
    assert(state !== undefined, `Unknown target: ${targetName}`);
    return this.probeTarget(state);
  }

  /** Generate a full health report */
  generateReport(): HealthReport {
    const targetStatuses = Array.from(this.targets.values()).map((state) => ({
      name: state.target.name,
      category: state.target.category,
      status: state.status,
      latency_ms: state.lastLatency,
      consecutive_failures: state.consecutiveFailures,
      last_check: state.lastCheck?.toISOString() ?? "never",
      last_success: state.lastSuccess?.toISOString() ?? null,
      message: state.lastMessage || undefined,
    }));

    const overall = this.computeOverallStatus();

    return {
      schema_version: "1.0",
      generated_at: new Date().toISOString(),
      overall_status: overall,
      targets: targetStatuses,
      history: this.history.slice(-30), // Last 30 snapshots
    };
  }

  /** Get audit log of health check actions */
  getAuditLog(): ReadonlyArray<{
    timestamp: string;
    target: string;
    action: string;
    result: string;
  }> {
    return this.auditLog;
  }

  /** Check if monitor is currently running */
  isRunning(): boolean {
    return this.running;
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private async probeTarget(state: TargetState): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // Wrap check in a timeout
      const result = await Promise.race([
        state.target.check(),
        new Promise<HealthCheckResult>((resolve) => {
          setTimeout(() => {
            resolve({
              status: "unhealthy",
              latency_ms: PROBE_TIMEOUT_MS,
              message: `Health check timed out after ${PROBE_TIMEOUT_MS}ms`,
            });
          }, PROBE_TIMEOUT_MS);
        }),
      ]);

      const oldStatus = state.status;
      state.lastCheck = new Date();
      state.lastLatency = result.latency_ms ?? Date.now() - startTime;
      state.lastMessage = result.message ?? "";

      if (result.status === "healthy") {
        state.consecutiveFailures = 0;
        state.lastSuccess = new Date();
        state.status = "healthy";
      } else if (result.status === "degraded") {
        state.status = "degraded";
      } else {
        state.consecutiveFailures++;
        const threshold =
          state.target.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
        if (state.consecutiveFailures >= threshold) {
          state.status = "unhealthy";
          // Attempt auto-remediation
          if (state.target.remediate) {
            await this.attemptRemediation(state);
          }
        } else {
          state.status = "degraded";
        }
      }

      // Notify listeners on status change
      if (oldStatus !== state.status) {
        for (const listener of this.listeners) {
          try {
            listener(state.target.name, oldStatus, state.status);
          } catch {
            // Listener errors don't affect monitoring
          }
        }
      }

      // Record history snapshot
      this.recordHistory();

      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      state.consecutiveFailures++;
      state.lastCheck = new Date();
      state.lastLatency = Date.now() - startTime;
      state.lastMessage = msg;

      const threshold =
        state.target.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
      const oldStatus = state.status;
      state.status =
        state.consecutiveFailures >= threshold ? "unhealthy" : "degraded";

      if (oldStatus !== state.status) {
        for (const listener of this.listeners) {
          try {
            listener(state.target.name, oldStatus, state.status);
          } catch {
            // Listener errors don't affect monitoring
          }
        }
      }

      return {
        status: state.status,
        latency_ms: Date.now() - startTime,
        message: msg,
      };
    }
  }

  private async attemptRemediation(state: TargetState): Promise<void> {
    if (!state.target.remediate) {
      return;
    }

    this.auditLog.push({
      timestamp: new Date().toISOString(),
      target: state.target.name,
      action: "remediation_attempt",
      result: "started",
    });

    try {
      const result = await state.target.remediate();
      this.auditLog.push({
        timestamp: new Date().toISOString(),
        target: state.target.name,
        action: `remediation_${result.action}`,
        result: result.success ? "success" : `failed: ${result.message}`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.auditLog.push({
        timestamp: new Date().toISOString(),
        target: state.target.name,
        action: "remediation_error",
        result: msg,
      });
    }

    // Keep audit log bounded
    if (this.auditLog.length > 500) {
      this.auditLog.splice(0, this.auditLog.length - 500);
    }
  }

  private recordHistory(): void {
    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;
    let unknown = 0;

    for (const [, state] of this.targets) {
      switch (state.status) {
        case "healthy":
          healthy++;
          break;
        case "degraded":
          degraded++;
          break;
        case "unhealthy":
          unhealthy++;
          break;
        case "unknown":
          unknown++;
          break;
      }
    }

    this.history.push({
      timestamp: new Date().toISOString(),
      healthy,
      degraded,
      unhealthy,
      unknown,
    });

    if (this.history.length > MAX_HISTORY_ENTRIES) {
      this.history.splice(0, this.history.length - MAX_HISTORY_ENTRIES);
    }
  }

  private computeOverallStatus(): HealthStatus {
    let hasUnhealthy = false;
    let hasDegraded = false;

    for (const [, state] of this.targets) {
      if (state.status === "unhealthy") {
        hasUnhealthy = true;
      }
      if (state.status === "degraded") {
        hasDegraded = true;
      }
    }

    if (hasUnhealthy) return "unhealthy";
    if (hasDegraded) return "degraded";
    return "healthy";
  }
}

// ---------------------------------------------------------------------------
// Health Target Factories
// ---------------------------------------------------------------------------

/** Create an HTTP health check target */
export function createHttpHealthTarget(params: {
  name: string;
  url: string;
  category?: HealthTarget["category"];
  intervalMs?: number;
  expectedStatus?: number;
}): HealthTarget {
  return {
    name: params.name,
    category: params.category ?? "service",
    intervalMs: params.intervalMs,
    check: async () => {
      const start = Date.now();
      try {
        const response = await fetch(params.url, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        });
        const latency_ms = Date.now() - start;
        const expectedStatus = params.expectedStatus ?? 200;
        return {
          status: response.status === expectedStatus ? "healthy" : "degraded",
          latency_ms,
          message: `HTTP ${response.status}`,
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          status: "unhealthy",
          latency_ms: Date.now() - start,
          message: msg,
        };
      }
    },
  };
}
