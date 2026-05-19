/**
 * Coding Engine — Autonomous Execution Loop
 *
 * A persistent, self-driven execution loop that:
 * 1. Reads a task list (PRD, failure inbox, or custom source)
 * 2. Picks the next uncompleted task
 * 3. Executes via AgentOrchestrator + LLM adapter
 * 4. Records results to memory
 * 5. Checks exit conditions
 * 6. Loops or exits
 *
 * Implements the RALPH method: Read → Analyze → List → Plan → Hardcode-nothing
 *
 * Exit requires BOTH conditions:
 *   - STATUS: COMPLETE (all tasks done or circuit breaker tripped)
 *   - EXIT_SIGNAL: true (explicit signal, not premature termination)
 *
 * Circuit breaker: 3 consecutive no-progress iterations → halt
 */

import { strict as assert } from "node:assert";
import type {
  AgentOrchestrator,
  AgentTask,
  TaskResult,
} from "../orchestrator/agent-orchestrator";
import type { MemorySystem } from "../memory/memory-system";
import type { MetricsCollector } from "../engine-metrics/metrics";
import type { LlmAdapter, LlmCompletionRequest } from "../llm/llm-adapter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LoopStatus =
  | "idle"
  | "running"
  | "paused"
  | "complete"
  | "halted"
  | "error";

export type TaskSource = "prd" | "failure_inbox" | "custom";

export interface LoopTask {
  readonly id: string;
  readonly description: string;
  readonly priority: number;
  completed: boolean;
  result?: string;
  error?: string;
  attempts: number;
}

export interface LoopConfig {
  /** Maximum iterations before forced exit (default: 100) */
  readonly maxIterations: number;
  /** No-progress iterations before circuit breaker trips (default: 3) */
  readonly circuitBreakerThreshold: number;
  /** Delay between iterations in ms (default: 1000) */
  readonly iterationDelay_ms: number;
  /** Maximum time for entire loop in ms (default: 3600000 = 1 hour) */
  readonly maxRuntime_ms: number;
  /** Task source type */
  readonly taskSource: TaskSource;
  /** Whether to use LLM for task analysis (default: true) */
  readonly useLlm: boolean;
}

export interface LoopState {
  readonly status: LoopStatus;
  readonly iteration: number;
  readonly tasksCompleted: number;
  readonly tasksFailed: number;
  readonly tasksRemaining: number;
  readonly noProgressCount: number;
  readonly startedAt: string | null;
  readonly lastActivityAt: string | null;
  readonly exitReason: string | null;
}

export interface IterationResult {
  readonly iteration: number;
  readonly taskId: string | null;
  readonly outcome: "completed" | "failed" | "skipped" | "no_task";
  readonly duration_ms: number;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: LoopConfig = {
  maxIterations: 100,
  circuitBreakerThreshold: 3,
  iterationDelay_ms: 1_000,
  maxRuntime_ms: 3_600_000,
  taskSource: "custom",
  useLlm: true,
};

const MAX_TASK_LIST_SIZE = 500;

// ---------------------------------------------------------------------------
// Execution Loop
// ---------------------------------------------------------------------------

export class ExecutionLoop {
  private readonly config: LoopConfig;
  private readonly orchestrator: AgentOrchestrator | null;
  private readonly memory: MemorySystem | null;
  private readonly metrics: MetricsCollector | null;
  private readonly llm: LlmAdapter | null;

  private tasks: LoopTask[] = [];
  private status: LoopStatus = "idle";
  private iteration = 0;
  private noProgressCount = 0;
  private startedAt: string | null = null;
  private lastActivityAt: string | null = null;
  private exitSignal = false;
  private exitReason: string | null = null;
  private readonly history: IterationResult[] = [];

  constructor(
    config?: Partial<LoopConfig>,
    deps?: {
      orchestrator?: AgentOrchestrator;
      memory?: MemorySystem;
      metrics?: MetricsCollector;
      llm?: LlmAdapter;
    },
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    assert(this.config.maxIterations > 0, "maxIterations must be positive");
    assert(
      this.config.circuitBreakerThreshold > 0,
      "circuitBreakerThreshold must be positive",
    );
    this.orchestrator = deps?.orchestrator ?? null;
    this.memory = deps?.memory ?? null;
    this.metrics = deps?.metrics ?? null;
    this.llm = deps?.llm ?? null;
  }

  /** Load tasks into the loop */
  loadTasks(tasks: LoopTask[]): void {
    assert(this.status === "idle", "Cannot load tasks while loop is running");
    assert(
      tasks.length <= MAX_TASK_LIST_SIZE,
      `Task list too large: ${tasks.length}`,
    );
    this.tasks = tasks;
  }

  /** Get current loop state */
  getState(): LoopState {
    return {
      status: this.status,
      iteration: this.iteration,
      tasksCompleted: this.tasks.filter((t) => t.completed).length,
      tasksFailed: this.tasks.filter((t) => t.error !== undefined).length,
      tasksRemaining: this.tasks.filter((t) => !t.completed).length,
      noProgressCount: this.noProgressCount,
      startedAt: this.startedAt,
      lastActivityAt: this.lastActivityAt,
      exitReason: this.exitReason,
    };
  }

  /** Get iteration history */
  getHistory(): ReadonlyArray<IterationResult> {
    return this.history;
  }

  /** Signal the loop to exit after current iteration */
  signalExit(reason: string): void {
    this.exitSignal = true;
    this.exitReason = reason;
  }

  /** Pause the loop */
  pause(): void {
    if (this.status === "running") {
      this.status = "paused";
    }
  }

  /** Resume the loop */
  resume(): void {
    if (this.status === "paused") {
      this.status = "running";
    }
  }

  /**
   * Run the autonomous execution loop.
   *
   * For each iteration:
   *   1. Find next uncompleted task
   *   2. Analyze task (optionally via LLM)
   *   3. Execute task via provided executor
   *   4. Record result
   *   5. Check exit conditions
   */
  async run(
    executor: (task: LoopTask) => Promise<{ success: boolean; output: string }>,
  ): Promise<LoopState> {
    assert(this.status === "idle", "Loop already running or completed");
    assert(this.tasks.length > 0, "No tasks loaded");

    this.status = "running";
    this.startedAt = new Date().toISOString();
    const startTime = Date.now();

    try {
      while (this.status === "running") {
        // Check bounds
        if (this.iteration >= this.config.maxIterations) {
          this.exitReason = `Max iterations reached (${this.config.maxIterations})`;
          break;
        }

        if (Date.now() - startTime > this.config.maxRuntime_ms) {
          this.exitReason = `Max runtime exceeded (${this.config.maxRuntime_ms}ms)`;
          break;
        }

        // Check circuit breaker
        if (this.noProgressCount >= this.config.circuitBreakerThreshold) {
          this.status = "halted";
          this.exitReason = `Circuit breaker: ${this.noProgressCount} no-progress iterations`;
          break;
        }

        // Check exit conditions (dual-gate)
        const allComplete = this.tasks.every((t) => t.completed);
        if (allComplete && this.exitSignal) {
          this.status = "complete";
          this.exitReason = "All tasks complete + exit signal received";
          break;
        }
        if (allComplete) {
          // Tasks done but no exit signal yet — signal ourselves
          this.exitSignal = true;
          this.status = "complete";
          this.exitReason = "All tasks complete";
          break;
        }
        if (this.exitSignal) {
          this.status = "complete";
          break;
        }

        // Find next task
        const task = this.findNextTask();
        const iterationStart = Date.now();
        this.iteration++;

        if (task === null) {
          this.recordIteration(
            null,
            "no_task",
            iterationStart,
            "No eligible task found",
          );
          this.noProgressCount++;
          await this.delay();
          continue;
        }

        // Execute
        try {
          task.attempts++;
          const result = await executor(task);

          if (result.success) {
            task.completed = true;
            task.result = result.output;
            this.noProgressCount = 0;
            this.lastActivityAt = new Date().toISOString();
            this.recordIteration(
              task.id,
              "completed",
              iterationStart,
              result.output,
            );

            // Record to memory
            if (this.memory) {
              this.memory.addHot({
                id: `loop-${this.iteration}-${task.id}`,
                category: "resolved-issue",
                title: `Task completed: ${task.description.slice(0, 80)}`,
                content: result.output.slice(0, 500),
                tags: ["execution-loop", "task-complete"],
              });
            }
          } else {
            task.error = result.output;
            this.noProgressCount++;
            this.recordIteration(
              task.id,
              "failed",
              iterationStart,
              result.output,
            );
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          task.error = msg;
          this.noProgressCount++;
          this.recordIteration(task.id, "failed", iterationStart, msg);
        }

        await this.delay();
      }
    } catch (error) {
      this.status = "error";
      this.exitReason = error instanceof Error ? error.message : String(error);
    }

    // Flush hot memory to warm on exit
    if (this.memory) {
      this.memory.flushHotToWarm();
    }

    return this.getState();
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private findNextTask(): LoopTask | null {
    // Find highest priority uncompleted task with fewest attempts
    const eligible = this.tasks
      .filter((t) => !t.completed && t.attempts < 3)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.attempts - b.attempts;
      });

    return eligible.length > 0 ? (eligible[0] ?? null) : null;
  }

  private recordIteration(
    taskId: string | null,
    outcome: IterationResult["outcome"],
    startTime: number,
    message: string,
  ): void {
    const result: IterationResult = {
      iteration: this.iteration,
      taskId,
      outcome,
      duration_ms: Date.now() - startTime,
      message: message.slice(0, 1000),
    };
    this.history.push(result);

    // Keep history bounded
    if (this.history.length > 200) {
      this.history.splice(0, this.history.length - 200);
    }
  }

  private async delay(): Promise<void> {
    if (this.config.iterationDelay_ms > 0) {
      await new Promise((r) => setTimeout(r, this.config.iterationDelay_ms));
    }
  }
}
