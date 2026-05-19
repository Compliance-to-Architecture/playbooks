/**
 * Coding Engine — Runtime Agent Daemon
 *
 * Persistent, always-on agent process that:
 * 1. Starts the HTTP server (REST API for external interaction)
 * 2. Starts the health monitor (proactive service monitoring)
 * 3. Starts the failure pipeline (continuous failure ingestion)
 * 4. Starts the execution loop (autonomous task processing)
 * 5. Manages graceful shutdown
 *
 * This is the "runtime agent" — a long-running process that ties
 * all engine components together into a self-healing, autonomous system.
 *
 * Usage:
 *   # Start daemon
 *   npx coding-engine serve
 *
 *   # Start with llama.cpp backend
 *   LLAMACPP_URL=http://localhost:8080 npx coding-engine serve
 *
 *   # Start with custom config
 *   npx coding-engine serve --config ./engine.config.ts
 */

import { strict as assert } from "node:assert";
import { AgentOrchestrator } from "../orchestrator/agent-orchestrator";
import { MemorySystem } from "../memory/memory-system";
import { MetricsCollector } from "../engine-metrics/metrics";
import { HealthMonitor } from "../watchdog/health-monitor";
import { EngineHttpServer } from "../server/http-server";
import { GracefulShutdown } from "../lifecycle/graceful-shutdown";
import { SessionManager } from "../session/session-manager";
import { ExecutionLoop } from "./execution-loop";
import type { LoopTask, LoopConfig } from "./execution-loop";
import {
  LlmManager,
  LlamaCppAdapter,
  CloudLlmAdapter,
  createLlmAdapter,
} from "../llm/llm-adapter";
import type { LlmAdapterConfig } from "../llm/llm-adapter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DaemonConfig {
  /** Project root directory */
  readonly projectRoot: string;
  /** HTTP server port (default: 3100) */
  readonly port: number;
  /** Enable health monitoring (default: true) */
  readonly enableHealthMonitor: boolean;
  /** Enable failure pipeline (default: true) */
  readonly enableFailurePipeline: boolean;
  /** Enable execution loop (default: false — must be explicitly enabled) */
  readonly enableExecutionLoop: boolean;
  /** Execution loop config (if enabled) */
  readonly loopConfig?: Partial<LoopConfig>;
  /** LLM adapter configs */
  readonly llmConfigs?: LlmAdapterConfig[];
}

export type DaemonStatus =
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "error";

export interface DaemonState {
  readonly status: DaemonStatus;
  readonly startedAt: string | null;
  readonly uptime_ms: number;
  readonly components: {
    readonly httpServer: boolean;
    readonly healthMonitor: boolean;
    readonly failurePipeline: boolean;
    readonly executionLoop: boolean;
    readonly llmManager: boolean;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PORT = 3100;
const MAX_STARTUP_TIME_MS = 30_000;

// ---------------------------------------------------------------------------
// Agent Daemon
// ---------------------------------------------------------------------------

export class AgentDaemon {
  private readonly config: DaemonConfig;

  // Core components
  private readonly orchestrator: AgentOrchestrator;
  private readonly memory: MemorySystem;
  private readonly metrics: MetricsCollector;
  private readonly session: SessionManager;
  private readonly shutdown: GracefulShutdown;
  private readonly llmManager: LlmManager;

  // Optional components
  private healthMonitor: HealthMonitor | null = null;
  private httpServer: EngineHttpServer | null = null;
  private executionLoop: ExecutionLoop | null = null;

  // State
  private status: DaemonStatus = "stopped";
  private startedAt: string | null = null;

  constructor(config: Partial<DaemonConfig> & { projectRoot: string }) {
    this.config = {
      projectRoot: config.projectRoot,
      port: config.port ?? DEFAULT_PORT,
      enableHealthMonitor: config.enableHealthMonitor ?? true,
      enableFailurePipeline: config.enableFailurePipeline ?? true,
      enableExecutionLoop: config.enableExecutionLoop ?? false,
      loopConfig: config.loopConfig,
      llmConfigs: config.llmConfigs,
    };

    // Initialize core components
    this.orchestrator = new AgentOrchestrator();
    this.memory = new MemorySystem(this.config.projectRoot);
    this.metrics = new MetricsCollector(this.config.projectRoot);
    this.session = new SessionManager(this.config.projectRoot);
    this.shutdown = new GracefulShutdown();
    this.llmManager = new LlmManager();
  }

  /** Get current daemon state */
  getState(): DaemonState {
    return {
      status: this.status,
      startedAt: this.startedAt,
      uptime_ms: this.startedAt
        ? Date.now() - new Date(this.startedAt).getTime()
        : 0,
      components: {
        httpServer: this.httpServer !== null,
        healthMonitor: this.healthMonitor !== null,
        failurePipeline: this.config.enableFailurePipeline,
        executionLoop: this.executionLoop !== null,
        llmManager: this.llmManager.listAdapters().length > 0,
      },
    };
  }

  /** Access the LLM manager for external configuration */
  getLlmManager(): LlmManager {
    return this.llmManager;
  }

  /** Access the orchestrator for agent registration */
  getOrchestrator(): AgentOrchestrator {
    return this.orchestrator;
  }

  /** Access the memory system */
  getMemory(): MemorySystem {
    return this.memory;
  }

  /**
   * Start the daemon — initializes all components and begins serving.
   */
  async start(): Promise<void> {
    assert(this.status === "stopped", "Daemon already running");
    this.status = "starting";
    this.startedAt = new Date().toISOString();

    try {
      // 1. Initialize memory
      this.memory.initialize();

      // 2. Configure LLM adapters
      this.initializeLlmAdapters();

      // 3. Start health monitor
      if (this.config.enableHealthMonitor) {
        this.healthMonitor = new HealthMonitor();
      }

      // 4. Start HTTP server
      this.httpServer = new EngineHttpServer(
        {
          healthMonitor: this.healthMonitor ?? undefined,
          metricsCollector: this.metrics,
          sessionManager: this.session,
        },
        {
          port: this.config.port,
          requireAuth: false,
        },
      );
      await this.httpServer.start();

      // 5. Start execution loop (if enabled)
      if (this.config.enableExecutionLoop) {
        const primaryLlm =
          this.llmManager.listAdapters().length > 0
            ? this.llmManager.getPrimary()
            : null;

        this.executionLoop = new ExecutionLoop(this.config.loopConfig, {
          orchestrator: this.orchestrator,
          memory: this.memory,
          metrics: this.metrics,
          llm: primaryLlm ?? undefined,
        });
      }

      // 6. Register shutdown hooks
      this.registerShutdownHooks();
      this.shutdown.listen();

      this.status = "running";
      console.log(`[daemon] Engine started on port ${this.config.port}`);
      console.log(
        `[daemon] Components: ${JSON.stringify(this.getState().components)}`,
      );
    } catch (error) {
      this.status = "error";
      throw error;
    }
  }

  /**
   * Load and run tasks through the execution loop.
   * Requires enableExecutionLoop=true in config.
   */
  async runTasks(
    tasks: LoopTask[],
    executor: (task: LoopTask) => Promise<{ success: boolean; output: string }>,
  ): Promise<void> {
    assert(this.executionLoop !== null, "Execution loop not enabled");
    this.executionLoop.loadTasks(tasks);
    await this.executionLoop.run(executor);
  }

  /**
   * Stop the daemon gracefully.
   */
  async stop(): Promise<void> {
    if (this.status !== "running") return;
    this.status = "stopping";
    await this.shutdown.shutdown();
    this.status = "stopped";
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private initializeLlmAdapters(): void {
    // Auto-detect llama.cpp from environment
    const llamaCppUrl =
      process.env["LLAMACPP_URL"] ?? process.env["LLAMA_CPP_URL"];
    if (llamaCppUrl) {
      this.llmManager.register(
        "llamacpp",
        new LlamaCppAdapter({ baseUrl: llamaCppUrl }),
      );
      console.log(`[daemon] Registered llama.cpp adapter: ${llamaCppUrl}`);
    }

    // Auto-detect cloud providers from environment
    const anthropicKey = process.env["ANTHROPIC_API_KEY"];
    if (anthropicKey) {
      this.llmManager.register(
        "anthropic",
        new CloudLlmAdapter({
          provider: "anthropic",
          baseUrl: "https://api.anthropic.com",
          apiKey: anthropicKey,
          defaultModel: "claude-sonnet-4-20250514",
          timeout_ms: 120_000,
          maxRetries: 2,
          healthCheckInterval_ms: 60_000,
        }),
      );
      console.log("[daemon] Registered Anthropic adapter");
    }

    const openaiKey = process.env["OPENAI_API_KEY"];
    if (openaiKey) {
      this.llmManager.register(
        "openai",
        new CloudLlmAdapter({
          provider: "openai",
          apiKey: openaiKey,
          defaultModel: "gpt-4o",
          timeout_ms: 120_000,
          maxRetries: 2,
          healthCheckInterval_ms: 60_000,
        }),
      );
      console.log("[daemon] Registered OpenAI adapter");
    }

    // Register from explicit config
    if (this.config.llmConfigs) {
      for (const cfg of this.config.llmConfigs) {
        const id = `${cfg.provider}-${cfg.defaultModel}`;
        if (!this.llmManager.get(id)) {
          this.llmManager.register(id, createLlmAdapter(cfg));
          console.log(`[daemon] Registered ${cfg.provider} adapter: ${id}`);
        }
      }
    }
  }

  private registerShutdownHooks(): void {
    // Priority 10: Stop execution loop
    if (this.executionLoop) {
      this.shutdown.register({
        name: "execution-loop",
        priority: 10,
        fn: async () => {
          this.executionLoop?.signalExit("Daemon shutdown");
        },
      });
    }

    // Priority 20: Stop health monitor
    if (this.healthMonitor) {
      this.shutdown.register({
        name: "health-monitor",
        priority: 20,
        fn: async () => {
          this.healthMonitor?.stop();
        },
      });
    }

    // Priority 50: Flush memory
    this.shutdown.register({
      name: "memory-flush",
      priority: 50,
      fn: async () => {
        this.memory.flushHotToWarm();
      },
    });

    // Priority 100: Stop HTTP server
    if (this.httpServer) {
      this.shutdown.register({
        name: "http-server",
        priority: 100,
        fn: async () => {
          await this.httpServer?.stop();
        },
      });
    }
  }
}
