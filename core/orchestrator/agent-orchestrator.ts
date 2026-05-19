/**
 * Coding Engine — Agent Orchestrator
 *
 * Built-in agent delegation engine that manages task decomposition,
 * parallel/sequential execution, circuit breaking, and result aggregation.
 *
 * Works standalone (without Claude Code Task tool) by providing:
 * - Task queue with priority scheduling
 * - Parallel execution with configurable concurrency
 * - Circuit breaker per agent type
 * - Result aggregation and conflict resolution
 * - Execution audit trail
 */

import { strict as assert } from "node:assert";
import type { AgentDefinition } from "../types/plugin-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskStatus =
  | "pending"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

export type TaskPriority = "critical" | "high" | "normal" | "low";

export interface AgentTask {
  readonly id: string;
  readonly agentType: string;
  readonly description: string;
  readonly priority: TaskPriority;
  readonly prompt: string;
  readonly dependencies: string[];
  readonly timeout_ms: number;
  readonly metadata?: Record<string, unknown>;
}

export interface TaskResult {
  readonly taskId: string;
  readonly agentType: string;
  readonly status: TaskStatus;
  readonly output?: string;
  readonly error?: string;
  readonly duration_ms: number;
  readonly started_at: string;
  readonly completed_at: string;
}

export interface AgentExecutor {
  /** Execute a task and return the result */
  execute(task: AgentTask): Promise<TaskResult>;
  /** Check if executor is available */
  isAvailable(): Promise<boolean>;
}

export interface OrchestratorConfig {
  readonly maxParallelTasks: number;
  readonly defaultTimeout_ms: number;
  readonly circuitBreakerThreshold: number;
  readonly circuitBreakerResetMs: number;
  readonly maxQueueSize: number;
  readonly maxRetries: number;
}

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: "closed" | "half-open" | "open";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: OrchestratorConfig = {
  maxParallelTasks: 4,
  defaultTimeout_ms: 120_000,
  circuitBreakerThreshold: 3,
  circuitBreakerResetMs: 300_000, // 5 minutes
  maxQueueSize: 100,
  maxRetries: 1,
};

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// ---------------------------------------------------------------------------
// Agent Orchestrator
// ---------------------------------------------------------------------------

export class AgentOrchestrator {
  private readonly config: OrchestratorConfig;
  private readonly executors: Map<string, AgentExecutor> = new Map();
  private readonly agents: Map<string, AgentDefinition> = new Map();
  private readonly taskQueue: AgentTask[] = [];
  private readonly activeTask: Map<string, AgentTask> = new Map();
  private readonly completedTasks: Map<string, TaskResult> = new Map();
  private readonly circuitBreakers: Map<string, CircuitBreakerState> =
    new Map();
  private readonly auditTrail: Array<{
    timestamp: string;
    taskId: string;
    action: string;
    details: string;
  }> = [];
  private running = false;
  private completionResolvers: Array<() => void> = [];

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    assert(
      this.config.maxParallelTasks > 0,
      "maxParallelTasks must be positive",
    );
    assert(this.config.maxQueueSize > 0, "maxQueueSize must be positive");
  }

  /** Register an agent type with its executor */
  registerAgent(agent: AgentDefinition, executor: AgentExecutor): void {
    assert(
      !this.agents.has(agent.name),
      `Agent "${agent.name}" already registered`,
    );
    this.agents.set(agent.name, agent);
    this.executors.set(agent.name, executor);
    this.circuitBreakers.set(agent.name, {
      failures: 0,
      lastFailure: 0,
      state: "closed",
    });
  }

  /** Submit a task to the orchestrator */
  submit(task: AgentTask): void {
    assert(
      this.taskQueue.length < this.config.maxQueueSize,
      `Task queue full (max ${this.config.maxQueueSize})`,
    );
    assert(
      this.agents.has(task.agentType) || task.agentType === "*",
      `Unknown agent type: ${task.agentType}`,
    );

    this.taskQueue.push(task);
    this.sortQueue();
    this.audit(task.id, "submitted", `Priority: ${task.priority}`);
  }

  /** Submit multiple independent tasks for parallel execution */
  submitParallel(tasks: AgentTask[]): void {
    for (const task of tasks) {
      this.submit(task);
    }
  }

  /** Execute all queued tasks, respecting dependencies and concurrency */
  async executeAll(): Promise<Map<string, TaskResult>> {
    this.running = true;

    while (
      this.running &&
      (this.taskQueue.length > 0 || this.activeTask.size > 0)
    ) {
      // Launch ready tasks up to concurrency limit
      const launched: Array<Promise<void>> = [];
      while (
        this.activeTask.size < this.config.maxParallelTasks &&
        this.taskQueue.length > 0
      ) {
        const nextTask = this.findNextReady();
        if (nextTask === undefined) {
          break;
        }
        launched.push(this.executeTask(nextTask));
      }

      if (launched.length > 0) {
        // Wait for at least one launched task to complete
        await Promise.race(launched);
      } else if (this.activeTask.size > 0) {
        // Wait for any active task
        await this.waitForAnyCompletion();
      } else if (this.taskQueue.length > 0) {
        // All remaining tasks have unmet dependencies — deadlock
        for (const task of this.taskQueue) {
          this.completedTasks.set(task.id, {
            taskId: task.id,
            agentType: task.agentType,
            status: "cancelled",
            error: "Deadlock: unresolvable dependencies",
            duration_ms: 0,
            started_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          });
          this.audit(task.id, "cancelled", "Deadlock detected");
        }
        this.taskQueue.length = 0;
      }
    }

    this.running = false;
    return this.completedTasks;
  }

  /** Cancel all pending and active tasks */
  cancel(): void {
    this.running = false;
    for (const task of this.taskQueue) {
      this.completedTasks.set(task.id, {
        taskId: task.id,
        agentType: task.agentType,
        status: "cancelled",
        duration_ms: 0,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
      this.audit(task.id, "cancelled", "Orchestrator cancelled");
    }
    this.taskQueue.length = 0;
  }

  /** Get execution summary */
  getSummary(): {
    queued: number;
    active: number;
    completed: number;
    failed: number;
    cancelled: number;
    circuitBreakers: Record<string, string>;
  } {
    const results = Array.from(this.completedTasks.values());
    return {
      queued: this.taskQueue.length,
      active: this.activeTask.size,
      completed: results.filter((r) => r.status === "completed").length,
      failed: results.filter((r) => r.status === "failed").length,
      cancelled: results.filter((r) => r.status === "cancelled").length,
      circuitBreakers: Object.fromEntries(
        Array.from(this.circuitBreakers.entries()).map(([k, v]) => [
          k,
          v.state,
        ]),
      ),
    };
  }

  /** Get full audit trail */
  getAuditTrail(): ReadonlyArray<{
    timestamp: string;
    taskId: string;
    action: string;
    details: string;
  }> {
    return this.auditTrail;
  }

  /** Get result for a specific task */
  getResult(taskId: string): TaskResult | undefined {
    return this.completedTasks.get(taskId);
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private sortQueue(): void {
    this.taskQueue.sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
    );
  }

  private findNextReady(): AgentTask | undefined {
    for (let i = 0; i < this.taskQueue.length; i++) {
      const task = this.taskQueue.at(i);
      assert(task !== undefined, `Task at index ${i} must exist within bounds`);
      if (
        this.areDependenciesMet(task) &&
        this.isCircuitClosed(task.agentType)
      ) {
        this.taskQueue.splice(i, 1);
        return task;
      }
    }
    return undefined;
  }

  private areDependenciesMet(task: AgentTask): boolean {
    return task.dependencies.every((dep) => {
      const result = this.completedTasks.get(dep);
      return result !== undefined && result.status === "completed";
    });
  }

  private isCircuitClosed(agentType: string): boolean {
    const cb = this.circuitBreakers.get(agentType);
    if (cb === undefined) {
      return true;
    }

    if (cb.state === "open") {
      // Check if reset period has elapsed
      if (Date.now() - cb.lastFailure > this.config.circuitBreakerResetMs) {
        cb.state = "half-open";
        return true;
      }
      return false;
    }
    return true;
  }

  private async executeTask(task: AgentTask): Promise<void> {
    this.activeTask.set(task.id, task);
    this.audit(task.id, "started", `Agent: ${task.agentType}`);

    const executor = this.executors.get(task.agentType);
    assert(executor !== undefined, `No executor for agent: ${task.agentType}`);

    const startTime = Date.now();
    const timeoutMs = task.timeout_ms || this.config.defaultTimeout_ms;

    try {
      const timeoutPromise = new Promise<TaskResult>((resolve) => {
        setTimeout(() => {
          resolve({
            taskId: task.id,
            agentType: task.agentType,
            status: "timed_out",
            error: `Task timed out after ${timeoutMs}ms`,
            duration_ms: timeoutMs,
            started_at: new Date(startTime).toISOString(),
            completed_at: new Date().toISOString(),
          });
        }, timeoutMs);
      });

      const result = await Promise.race([
        executor.execute(task),
        timeoutPromise,
      ]);
      this.onTaskComplete(task, result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.onTaskComplete(task, {
        taskId: task.id,
        agentType: task.agentType,
        status: "failed",
        error: msg,
        duration_ms: Date.now() - startTime,
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
      });
    }
  }

  private onTaskComplete(task: AgentTask, result: TaskResult): void {
    this.activeTask.delete(task.id);
    this.completedTasks.set(task.id, result);

    if (result.status === "failed" || result.status === "timed_out") {
      this.recordCircuitBreakerFailure(task.agentType);
      this.audit(task.id, "failed", result.error ?? "Unknown error");
    } else {
      this.resetCircuitBreakerOnSuccess(task.agentType);
      this.audit(task.id, "completed", `Duration: ${result.duration_ms}ms`);
    }

    // Wake up the orchestrator's executeAll loop
    for (const resolver of this.completionResolvers) {
      resolver();
    }
    this.completionResolvers = [];
  }

  private recordCircuitBreakerFailure(agentType: string): void {
    const cb = this.circuitBreakers.get(agentType);
    if (cb === undefined) {
      return;
    }
    cb.failures++;
    cb.lastFailure = Date.now();
    if (cb.failures >= this.config.circuitBreakerThreshold) {
      cb.state = "open";
      this.audit(
        agentType,
        "circuit_breaker_opened",
        `${cb.failures} consecutive failures`,
      );
    }
  }

  private resetCircuitBreakerOnSuccess(agentType: string): void {
    const cb = this.circuitBreakers.get(agentType);
    if (cb === undefined) {
      return;
    }
    if (cb.state === "half-open") {
      cb.state = "closed";
      cb.failures = 0;
      this.audit(
        agentType,
        "circuit_breaker_closed",
        "Success after reset period",
      );
    }
  }

  private async waitForAnyCompletion(): Promise<void> {
    // Event-driven: wait until onTaskComplete resolves this promise
    if (this.activeTask.size === 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.completionResolvers.push(resolve);
    });
  }

  private audit(taskId: string, action: string, details: string): void {
    this.auditTrail.push({
      timestamp: new Date().toISOString(),
      taskId,
      action,
      details,
    });
    // Keep audit trail bounded
    if (this.auditTrail.length > 1000) {
      this.auditTrail.splice(0, this.auditTrail.length - 1000);
    }
  }
}
