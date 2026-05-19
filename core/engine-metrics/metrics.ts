/**
 * Coding Engine — Self-Observability & Metrics
 *
 * Tracks engine performance: sessions, fixes, PRs, resolution time.
 * Produces engine-metrics.json for dashboards and trend analysis.
 */

import { strict as assert } from "node:assert";
import * as fs from "fs";
import * as path from "path";

export interface EngineMetrics {
  schema_version: string;
  generated_at: string;
  engine_version: string;

  /** Session metrics */
  sessions: {
    total: number;
    active: number;
    completed: number;
    failed: number;
    avg_duration_minutes: number;
  };

  /** Failure pipeline metrics */
  failures: {
    total_ingested: number;
    auto_fixed: number;
    escalated: number;
    ignored: number;
    fix_success_rate: number;
    mean_time_to_fix_minutes: number;
    unique_fingerprints: number;
    recurring_failures: number;
  };

  /** PR metrics */
  pull_requests: {
    total_created: number;
    auto_merged: number;
    manual_merged: number;
    rejected: number;
    avg_time_to_merge_minutes: number;
  };

  /** Skill activation metrics */
  skills: {
    total_activations: number;
    activations_by_skill: Record<string, number>;
    blocked_by_guardrail: number;
  };

  /** Agent delegation metrics */
  agents: {
    total_delegations: number;
    delegations_by_agent: Record<string, number>;
    parallel_delegations: number;
    avg_agent_duration_seconds: number;
  };

  /** Code quality metrics */
  codebase: {
    total_files: number;
    total_lines: number;
    packages: number;
    services: number;
    apps: number;
    workflows: number;
    test_coverage_percent?: number;
    type_errors: number;
    lint_errors: number;
  };

  /** Trend data (last 30 entries) */
  history: Array<{
    date: string;
    failures_ingested: number;
    failures_fixed: number;
    prs_created: number;
    prs_merged: number;
  }>;
}

const METRICS_FILE = "engine-metrics.json";

export class MetricsCollector {
  private metricsPath: string;
  private metrics: EngineMetrics;

  constructor(projectRoot: string) {
    assert(
      typeof projectRoot === "string" && projectRoot.length > 0,
      "projectRoot must be a non-empty string",
    );
    this.metricsPath = path.join(projectRoot, ".claude", METRICS_FILE);
    this.metrics = this.loadOrCreate();
  }

  private loadOrCreate(): EngineMetrics {
    try {
      const raw = fs.readFileSync(this.metricsPath, "utf-8");
      return JSON.parse(raw) as EngineMetrics;
    } catch {
      return this.createEmpty();
    }
  }

  private createEmpty(): EngineMetrics {
    return {
      schema_version: "1.0",
      generated_at: new Date().toISOString(),
      engine_version: "1.0.0",
      sessions: {
        total: 0,
        active: 0,
        completed: 0,
        failed: 0,
        avg_duration_minutes: 0,
      },
      failures: {
        total_ingested: 0,
        auto_fixed: 0,
        escalated: 0,
        ignored: 0,
        fix_success_rate: 0,
        mean_time_to_fix_minutes: 0,
        unique_fingerprints: 0,
        recurring_failures: 0,
      },
      pull_requests: {
        total_created: 0,
        auto_merged: 0,
        manual_merged: 0,
        rejected: 0,
        avg_time_to_merge_minutes: 0,
      },
      skills: {
        total_activations: 0,
        activations_by_skill: {},
        blocked_by_guardrail: 0,
      },
      agents: {
        total_delegations: 0,
        delegations_by_agent: {},
        parallel_delegations: 0,
        avg_agent_duration_seconds: 0,
      },
      codebase: {
        total_files: 0,
        total_lines: 0,
        packages: 0,
        services: 0,
        apps: 0,
        workflows: 0,
        type_errors: 0,
        lint_errors: 0,
      },
      history: [],
    };
  }

  recordSession(status: "started" | "completed" | "failed"): void {
    assert(
      status === "started" || status === "completed" || status === "failed",
      `status must be started|completed|failed, got: ${status}`,
    );
    this.metrics.sessions.total++;
    if (status === "started") this.metrics.sessions.active++;
    if (status === "completed") {
      this.metrics.sessions.completed++;
      this.metrics.sessions.active = Math.max(
        0,
        this.metrics.sessions.active - 1,
      );
    }
    if (status === "failed") {
      this.metrics.sessions.failed++;
      this.metrics.sessions.active = Math.max(
        0,
        this.metrics.sessions.active - 1,
      );
    }
  }

  recordFailure(fixed: boolean, escalated: boolean): void {
    assert(typeof fixed === "boolean", "fixed must be a boolean");
    assert(typeof escalated === "boolean", "escalated must be a boolean");
    this.metrics.failures.total_ingested++;
    if (fixed) this.metrics.failures.auto_fixed++;
    if (escalated) this.metrics.failures.escalated++;
    if (!fixed && !escalated) this.metrics.failures.ignored++;
    this.metrics.failures.fix_success_rate =
      this.metrics.failures.total_ingested > 0
        ? this.metrics.failures.auto_fixed /
          this.metrics.failures.total_ingested
        : 0;
  }

  recordPR(
    action: "created" | "auto_merged" | "manual_merged" | "rejected",
  ): void {
    assert(
      action === "created" ||
        action === "auto_merged" ||
        action === "manual_merged" ||
        action === "rejected",
      `action must be created|auto_merged|manual_merged|rejected, got: ${action}`,
    );
    this.metrics.pull_requests.total_created += action === "created" ? 1 : 0;
    if (action === "auto_merged") this.metrics.pull_requests.auto_merged++;
    if (action === "manual_merged") this.metrics.pull_requests.manual_merged++;
    if (action === "rejected") this.metrics.pull_requests.rejected++;
  }

  recordSkillActivation(skillName: string, blocked: boolean): void {
    assert(
      typeof skillName === "string" && skillName.length > 0,
      "skillName must be a non-empty string",
    );
    assert(typeof blocked === "boolean", "blocked must be a boolean");
    this.metrics.skills.total_activations++;
    this.metrics.skills.activations_by_skill[skillName] =
      (this.metrics.skills.activations_by_skill[skillName] ?? 0) + 1;
    if (blocked) this.metrics.skills.blocked_by_guardrail++;
  }

  recordAgentDelegation(agentName: string, parallel: boolean): void {
    assert(
      typeof agentName === "string" && agentName.length > 0,
      "agentName must be a non-empty string",
    );
    assert(typeof parallel === "boolean", "parallel must be a boolean");
    this.metrics.agents.total_delegations++;
    this.metrics.agents.delegations_by_agent[agentName] =
      (this.metrics.agents.delegations_by_agent[agentName] ?? 0) + 1;
    if (parallel) this.metrics.agents.parallel_delegations++;
  }

  addHistoryEntry(entry: EngineMetrics["history"][0]): void {
    assert(
      typeof entry.date === "string" && entry.date.length > 0,
      "entry.date must be a non-empty string",
    );
    assert(
      entry.failures_ingested >= 0,
      "entry.failures_ingested must be >= 0",
    );
    this.metrics.history.push(entry);
    // Keep last 30 entries
    if (this.metrics.history.length > 30) {
      this.metrics.history = this.metrics.history.slice(-30);
    }
    assert(
      this.metrics.history.length <= 30,
      "history must not exceed 30 entries",
    );
  }

  save(): void {
    this.metrics.generated_at = new Date().toISOString();
    const dir = path.dirname(this.metricsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.metricsPath, JSON.stringify(this.metrics, null, 2));
  }

  getMetrics(): EngineMetrics {
    const result = this.metrics;
    assert(result !== null && result !== undefined, "metrics must not be null");
    assert(
      typeof result.schema_version === "string" &&
        result.schema_version.length > 0,
      "metrics.schema_version must be a non-empty string",
    );
    return result;
  }
}
