/**
 * Code-Mode Plugin — Tool Execution Optimization
 *
 * Integrates @utcp/code-mode into the coding engine, enabling agents to batch
 * multiple MCP tool calls into single TypeScript code executions.
 *
 * Token savings: 67-88% vs sequential tool calling.
 * Runtime: Node.js native (no Cloudflare Workers required).
 *
 * @see https://github.com/universal-tool-calling-protocol/code-mode
 */

import { strict as assert } from "node:assert";
import type {
  CodingEnginePlugin,
  HookContext,
  HookResult,
} from "../types/plugin-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CodeModeConfig {
  /** Enable code-mode tool batching (default: true) */
  readonly enabled: boolean;
  /** Default execution timeout in ms (default: 30000) */
  readonly timeout_ms: number;
  /** MCP servers to register with code-mode */
  readonly mcpServers: Record<
    string,
    {
      readonly command: string;
      readonly args: string[];
      readonly env?: Record<string, string>;
    }
  >;
  /** HTTP API endpoints to register */
  readonly httpEndpoints?: Array<{
    readonly name: string;
    readonly baseUrl: string;
    readonly specPath?: string;
  }>;
}

/**
 * Agent context for Cerbos authorization and audit trail.
 * Propagated to every tool invocation for SOC2 CC6.1 compliance.
 */
export interface AgentExecutionContext {
  /** Agent instance ID (WHO) */
  readonly agentInstanceId: string;
  /** Agent trust level (determines tool access) */
  readonly trustLevel: "read_only" | "sandboxed" | "trusted" | "elevated";
  /** Tenant scope (multi-tenancy isolation) */
  readonly tenantId: string;
  /** Session ID for audit correlation */
  readonly sessionId: string;
  /** Agent category (SoR enforcement) */
  readonly category?: string;
}

export interface ToolChainResult {
  readonly result: unknown;
  readonly logs: string[];
  readonly duration_ms: number;
  readonly tools_called: number;
  /** Agent context used for this execution (for audit trail) */
  readonly agentContext?: AgentExecutionContext;
}

// Uses type declarations from ./utcp-code-mode.d.ts
// The module is loaded dynamically at runtime via import("@utcp/code-mode")
type CodeModeClient = import("@utcp/code-mode").CodeModeUtcpClient;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLUGIN_NAME = "code-mode";
const PLUGIN_VERSION = "1.0.0";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Code-Mode Manager
// ---------------------------------------------------------------------------

export class CodeModeManager {
  private client: CodeModeClient | null = null;
  private config: CodeModeConfig;
  private initialized = false;

  constructor(config: CodeModeConfig) {
    assert(config !== null, "CodeModeConfig must not be null");
    this.config = config;
  }

  /**
   * Initialize the code-mode client and register all configured tool sources.
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    if (this.initialized) {
      return;
    }

    try {
      const { CodeModeUtcpClient } = await import("@utcp/code-mode");
      this.client = await CodeModeUtcpClient.create();

      // Register MCP servers
      const serverEntries = Object.entries(this.config.mcpServers);
      for (let i = 0; i < serverEntries.length; i++) {
        const [name, serverConfig] = serverEntries[i]!;
        assert(
          typeof name === "string" && name.length > 0,
          `MCP server name at index ${i} must be non-empty`,
        );

        await this.client.registerManual({
          name,
          call_template_type: "mcp",
          config: {
            mcpServers: {
              [name]: {
                command: serverConfig.command,
                args: serverConfig.args,
                env: serverConfig.env,
              },
            },
          },
        });
      }

      // Register HTTP endpoints
      if (this.config.httpEndpoints) {
        for (let i = 0; i < this.config.httpEndpoints.length; i++) {
          const endpoint = this.config.httpEndpoints[i]!;
          assert(
            typeof endpoint.name === "string",
            `HTTP endpoint name at index ${i} must be a string`,
          );

          await this.client.registerManual({
            name: endpoint.name,
            call_template_type: "http",
            config: {
              baseUrl: endpoint.baseUrl,
              specPath: endpoint.specPath,
            },
          });
        }
      }

      this.initialized = true;
    } catch (error) {
      // Code-mode is optional — degrade gracefully if not installed
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[code-mode] Failed to initialize: ${message}. Tool batching disabled.`,
      );
      this.client = null;
    }
  }

  /**
   * Execute a TypeScript code block with access to all registered tools.
   * Returns the result, logs, execution time, and tool call count.
   *
   * @param code - TypeScript code to execute
   * @param timeout_ms - Execution timeout (optional, defaults to config)
   * @param agentContext - Agent identity for Cerbos authorization + audit trail
   */
  async executeToolChain(
    code: string,
    timeout_ms?: number,
    agentContext?: AgentExecutionContext,
  ): Promise<ToolChainResult> {
    assert(
      typeof code === "string" && code.length > 0,
      "Code must be a non-empty string",
    );

    const effective_timeout = Math.min(
      timeout_ms ?? this.config.timeout_ms ?? DEFAULT_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
    );

    if (!this.client) {
      throw new Error(
        "Code-mode client not initialized. Call initialize() first.",
      );
    }

    // SOC2 CC6.1: Log tool chain execution with agent attribution
    if (agentContext) {
      console.info(
        JSON.stringify({
          event: "tool_chain_execution_start",
          agentInstanceId: agentContext.agentInstanceId,
          trustLevel: agentContext.trustLevel,
          tenantId: agentContext.tenantId,
          sessionId: agentContext.sessionId,
          category: agentContext.category,
          codeLength: code.length,
          timeout_ms: effective_timeout,
          timestamp: new Date().toISOString(),
        }),
      );
    }

    const start = Date.now();
    const { result, logs } = await this.client.callToolChain(
      code,
      effective_timeout,
    );
    const duration_ms = Date.now() - start;

    // Estimate tool calls from logs (each tool call produces output)
    const tools_called = logs.filter(
      (log) =>
        log.includes("Tool call:") ||
        log.includes("Calling tool") ||
        log.includes("→"),
    ).length;

    // SOC2 CC6.1: Log completion with metrics
    if (agentContext) {
      console.info(
        JSON.stringify({
          event: "tool_chain_execution_complete",
          agentInstanceId: agentContext.agentInstanceId,
          tenantId: agentContext.tenantId,
          sessionId: agentContext.sessionId,
          tools_called,
          duration_ms,
          timestamp: new Date().toISOString(),
        }),
      );
    }

    return { result, logs, duration_ms, tools_called, agentContext };
  }

  /**
   * Get TypeScript interfaces for all registered tools.
   * Useful for generating system prompts with tool type information.
   */
  getToolInterfaces(): string {
    if (!this.client) {
      return "";
    }
    return this.client.getAllToolsTypeScriptInterfaces();
  }

  /**
   * Search for available tools by natural language query.
   */
  async searchTools(
    query: string,
  ): Promise<Array<{ name: string; description: string }>> {
    assert(
      typeof query === "string" && query.length > 0,
      "Search query must be a non-empty string",
    );

    if (!this.client) {
      return [];
    }

    return this.client.searchTools(query);
  }

  /**
   * Check if code-mode is available and initialized.
   */
  isAvailable(): boolean {
    return this.initialized && this.client !== null;
  }
}

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

export const defaultCodeModeConfig: CodeModeConfig = {
  enabled: true,
  timeout_ms: DEFAULT_TIMEOUT_MS,
  mcpServers: {},
  httpEndpoints: [],
};

// ---------------------------------------------------------------------------
// Plugin Factory
// ---------------------------------------------------------------------------

/**
 * Create the code-mode plugin for the coding engine.
 *
 * Usage:
 * ```ts
 * const registry = new PluginRegistry();
 * registry.register(createCodeModePlugin(config));
 * ```
 */
export function createCodeModePlugin(
  config?: Partial<CodeModeConfig>,
): CodingEnginePlugin {
  const mergedConfig: CodeModeConfig = {
    ...defaultCodeModeConfig,
    ...config,
    mcpServers: {
      ...defaultCodeModeConfig.mcpServers,
      ...config?.mcpServers,
    },
  };

  const manager = new CodeModeManager(mergedConfig);

  return {
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    description:
      "Tool execution optimization via @utcp/code-mode. Batches multiple MCP tool calls into single TypeScript code executions for 67-88% token savings.",

    skills: [
      {
        name: "code-mode-execute",
        type: "utility",
        enforcement: "suggest",
        description:
          "Execute batched tool calls via code-mode for token efficiency",
        promptTriggers: [
          {
            keywords: [
              "batch",
              "code-mode",
              "tool chain",
              "execute tools",
              "multi-tool",
            ],
            intent: "batch-tool-execution",
          },
        ],
        skillFilePath: "skills/code-mode.md",
      },
    ],

    hooks: {
      SessionStart: async (_context: HookContext): Promise<HookResult> => {
        await manager.initialize();
        return {
          proceed: true,
          message: manager.isAvailable()
            ? "[code-mode] Tool batching enabled"
            : "[code-mode] Not available (install @utcp/code-mode)",
          suggestions: manager.isAvailable()
            ? [
                "Use code-mode for batch operations: manager.executeToolChain(code)",
              ]
            : [],
        };
      },
    },

    onLoad: async () => {
      await manager.initialize();
    },
  };
}

// Export manager class for direct usage in standalone mode
export { CodeModeManager as default };
