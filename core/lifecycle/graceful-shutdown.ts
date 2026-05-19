/**
 * Coding Engine — Graceful Shutdown Handler
 *
 * Manages orderly shutdown on SIGTERM/SIGINT:
 * 1. Stop accepting new tasks
 * 2. Drain in-flight tasks (with timeout)
 * 3. Flush metrics and save state
 * 4. Close storage connections
 * 5. Stop health monitor
 * 6. Stop HTTP server
 * 7. Exit cleanly
 */

import { strict as assert } from "node:assert";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShutdownPhase =
  | "running"
  | "draining"
  | "flushing"
  | "closing"
  | "stopped";

export interface ShutdownHook {
  /** Hook name for logging */
  readonly name: string;
  /** Priority (lower = runs first, default: 100) */
  readonly priority: number;
  /** Shutdown function */
  readonly fn: () => Promise<void>;
}

export interface ShutdownConfig {
  /** Maximum time to wait for drain phase in ms (default: 30000) */
  readonly drainTimeoutMs: number;
  /** Maximum time for entire shutdown in ms (default: 60000) */
  readonly totalTimeoutMs: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DRAIN_TIMEOUT_MS = 30_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Graceful Shutdown Manager
// ---------------------------------------------------------------------------

export class GracefulShutdown {
  private readonly hooks: ShutdownHook[] = [];
  private readonly config: ShutdownConfig;
  private phase: ShutdownPhase = "running";
  private registered = false;

  constructor(config?: Partial<ShutdownConfig>) {
    this.config = {
      drainTimeoutMs: config?.drainTimeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS,
      totalTimeoutMs: config?.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS,
    };
  }

  /** Current shutdown phase */
  getPhase(): ShutdownPhase {
    return this.phase;
  }

  /** Register a shutdown hook */
  register(hook: ShutdownHook): void {
    assert(this.phase === "running", "Cannot register hooks during shutdown");
    this.hooks.push(hook);
    // Sort by priority (lower first)
    this.hooks.sort((a, b) => a.priority - b.priority);
  }

  /** Register SIGTERM and SIGINT handlers */
  listen(): void {
    if (this.registered) return;
    this.registered = true;

    const handler = (signal: string) => {
      console.log(`\nReceived ${signal} — starting graceful shutdown...`);
      void this.shutdown().then(() => {
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => handler("SIGTERM"));
    process.on("SIGINT", () => handler("SIGINT"));
  }

  /** Execute shutdown sequence */
  async shutdown(): Promise<void> {
    if (this.phase !== "running") {
      console.log(`Shutdown already in progress (phase: ${this.phase})`);
      return;
    }

    const startTime = Date.now();

    // Total timeout safety net
    const totalTimeout = setTimeout(() => {
      console.error(
        `Shutdown exceeded total timeout (${this.config.totalTimeoutMs}ms) — forcing exit`,
      );
      process.exit(1);
    }, this.config.totalTimeoutMs);

    try {
      // Phase 1: Draining
      this.phase = "draining";
      console.log("[shutdown] Phase 1: Draining in-flight tasks...");
      await this.runHooksWithTimeout(
        this.hooks.filter((h) => h.priority < 50),
        this.config.drainTimeoutMs,
      );

      // Phase 2: Flushing
      this.phase = "flushing";
      console.log("[shutdown] Phase 2: Flushing state and metrics...");
      await this.runHooksWithTimeout(
        this.hooks.filter((h) => h.priority >= 50 && h.priority < 100),
        10_000,
      );

      // Phase 3: Closing connections
      this.phase = "closing";
      console.log("[shutdown] Phase 3: Closing connections...");
      await this.runHooksWithTimeout(
        this.hooks.filter((h) => h.priority >= 100),
        10_000,
      );

      this.phase = "stopped";
      const elapsed = Date.now() - startTime;
      console.log(`[shutdown] Complete in ${elapsed}ms`);
    } finally {
      clearTimeout(totalTimeout);
    }
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private async runHooksWithTimeout(
    hooks: ShutdownHook[],
    timeoutMs: number,
  ): Promise<void> {
    const timeout = new Promise<void>((resolve) => {
      setTimeout(() => {
        console.warn(
          `Shutdown phase timed out after ${timeoutMs}ms — skipping`,
        );
        resolve();
      }, timeoutMs);
    });

    const run = async () => {
      for (const hook of hooks) {
        try {
          await hook.fn();
          console.log(`  [ok] ${hook.name}`);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error(`  [fail] ${hook.name}: ${msg}`);
        }
      }
    };

    await Promise.race([run(), timeout]);
  }
}
