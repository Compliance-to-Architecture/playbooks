/**
 * Coding Engine — LLM Adapter Layer
 *
 * Provides a unified interface for LLM inference across multiple backends:
 * - llama.cpp (local inference via llama-server OpenAI-compatible API)
 * - Anthropic Claude (cloud API via @anthropic-ai/sdk)
 * - OpenAI (cloud API)
 * - Custom providers (adapter pattern)
 *
 * The engine is LLM-agnostic. All agent logic uses this adapter interface.
 * Backend selection is configuration-driven, not hardcoded.
 *
 * For BYOC deployments requiring data sovereignty, llama.cpp provides
 * on-premises inference with no cloud API dependency.
 *
 * @see https://github.com/ggml-org/llama.cpp (100k+ stars, MIT)
 */

import { strict as assert } from "node:assert";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LlmProvider = "llamacpp" | "anthropic" | "openai" | "custom";

export interface LlmMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface LlmCompletionRequest {
  readonly messages: LlmMessage[];
  readonly model?: string;
  readonly temperature?: number;
  readonly max_tokens?: number;
  readonly stop?: string[];
  /** Structured output: JSON schema for constrained generation */
  readonly response_format?: {
    readonly type: "json_object" | "text";
    readonly schema?: Record<string, unknown>;
  };
}

export interface LlmCompletionResponse {
  readonly content: string;
  readonly model: string;
  readonly usage: {
    readonly prompt_tokens: number;
    readonly completion_tokens: number;
    readonly total_tokens: number;
  };
  readonly finish_reason: "stop" | "length" | "tool_calls";
  readonly latency_ms: number;
}

export interface LlmToolCall {
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

export interface LlmToolResult {
  readonly tool_call_id: string;
  readonly content: string;
}

export interface LlmAdapterConfig {
  readonly provider: LlmProvider;
  /** Base URL for API (required for llamacpp, optional for cloud) */
  readonly baseUrl?: string;
  /** API key (required for cloud providers) */
  readonly apiKey?: string;
  /** Default model to use */
  readonly defaultModel: string;
  /** Request timeout in ms (default: 120000) */
  readonly timeout_ms: number;
  /** Max retries on transient failures (default: 2) */
  readonly maxRetries: number;
  /** Health check interval in ms (default: 60000) */
  readonly healthCheckInterval_ms: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 120_000;
// Idle timeout: abort if no bytes received for this long (proxy/LB default is 60s)
const STREAM_IDLE_TIMEOUT_MS = 55_000;
const MAX_RETRIES = 3;
const HEALTH_CHECK_INTERVAL_MS = 60_000;
const MAX_MESSAGES_PER_REQUEST = 200;
const MAX_CONTENT_LENGTH = 200_000;
// 5xx status codes that warrant a retry (transient server errors)
const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504, 529]);

// ---------------------------------------------------------------------------
// LLM Adapter Interface
// ---------------------------------------------------------------------------

/**
 * All LLM providers implement this interface.
 * The engine never calls a provider directly — always through the adapter.
 */
export interface LlmAdapter {
  /** Provider identifier */
  readonly provider: LlmProvider;
  /** Check if the provider is reachable */
  healthCheck(): Promise<boolean>;
  /** Generate a completion */
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
  /** Get available models */
  listModels(): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// llama.cpp Adapter (Local Inference)
// ---------------------------------------------------------------------------

/**
 * llama.cpp adapter — connects to llama-server's OpenAI-compatible API.
 *
 * Setup:
 *   # Download and build llama.cpp
 *   git clone https://github.com/ggml-org/llama.cpp && cd llama.cpp
 *   cmake -B build && cmake --build build --config Release
 *
 *   # Start server with a model
 *   ./build/bin/llama-server -m model.gguf --port 8080
 *
 * The server exposes OpenAI-compatible endpoints:
 *   POST /v1/chat/completions
 *   GET  /v1/models
 *   GET  /health
 */
export class LlamaCppAdapter implements LlmAdapter {
  readonly provider: LlmProvider = "llamacpp";
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly timeout_ms: number;
  private readonly maxRetries: number;

  constructor(config: Partial<LlmAdapterConfig> & { baseUrl: string }) {
    assert(
      config.baseUrl,
      "llama.cpp requires baseUrl (e.g., http://localhost:8080)",
    );
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.defaultModel = config.defaultModel ?? "default";
    this.timeout_ms = config.timeout_ms ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? MAX_RETRIES;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  async complete(
    request: LlmCompletionRequest,
  ): Promise<LlmCompletionResponse> {
    assert(request.messages.length > 0, "Messages cannot be empty");
    assert(
      request.messages.length <= MAX_MESSAGES_PER_REQUEST,
      `Messages exceed limit: ${request.messages.length}`,
    );

    const startTime = Date.now();
    const body = {
      model: request.model ?? this.defaultModel,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens ?? 4096,
      stop: request.stop,
      ...(request.response_format?.type === "json_object"
        ? { response_format: { type: "json_object" as const } }
        : {}),
    };

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeout_ms);
        const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        assert(response.ok, `llama.cpp returned HTTP ${response.status}`);
        const data = (await response.json()) as {
          choices: Array<{
            message: { content: string };
            finish_reason: string;
          }>;
          model: string;
          usage: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
          };
        };

        assert(data.choices?.length > 0, "No choices in response");
        const choice = data.choices[0];
        assert(choice !== undefined, "First choice is undefined");

        return {
          content: choice.message.content,
          model: data.model ?? this.defaultModel,
          usage: data.usage ?? {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          },
          finish_reason: (choice.finish_reason as "stop" | "length") ?? "stop",
          latency_ms: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxRetries) {
          // Exponential backoff: 1s, 2s
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError ?? new Error("llama.cpp request failed after retries");
  }

  async listModels(): Promise<string[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) return [this.defaultModel];
      const data = (await response.json()) as {
        data: Array<{ id: string }>;
      };
      return data.data?.map((m) => m.id) ?? [this.defaultModel];
    } catch {
      return [this.defaultModel];
    }
  }
}

// ---------------------------------------------------------------------------
// Cloud Adapter (Anthropic / OpenAI compatible)
// ---------------------------------------------------------------------------

/**
 * Cloud LLM adapter — connects to any OpenAI-compatible API.
 * Works with Anthropic (via proxy), OpenAI, Azure OpenAI, Together, Groq, etc.
 */
export class CloudLlmAdapter implements LlmAdapter {
  readonly provider: LlmProvider;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly timeout_ms: number;
  private readonly maxRetries: number;

  constructor(config: LlmAdapterConfig) {
    assert(config.apiKey, "Cloud LLM requires apiKey");
    this.provider = config.provider;
    this.baseUrl = (config.baseUrl ?? "https://api.openai.com").replace(
      /\/$/,
      "",
    );
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel;
    this.timeout_ms = config.timeout_ms ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? MAX_RETRIES;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  async complete(
    request: LlmCompletionRequest,
  ): Promise<LlmCompletionResponse> {
    assert(request.messages.length > 0, "Messages cannot be empty");
    assert(
      request.messages.length <= MAX_MESSAGES_PER_REQUEST,
      `Messages exceed limit: ${request.messages.length}`,
    );

    const startTime = Date.now();
    const body = {
      model: request.model ?? this.defaultModel,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens ?? 4096,
      stop: request.stop,
      stream: true, // Use SSE streaming to prevent idle-timeout on long generations
      ...(request.response_format
        ? { response_format: request.response_format }
        : {}),
    };

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        // Hard wall-clock timeout for the entire request
        const hardTimeout = setTimeout(
          () => controller.abort(),
          this.timeout_ms,
        );

        const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        // Retry on transient 5xx before consuming body
        if (RETRYABLE_STATUS_CODES.has(response.status)) {
          clearTimeout(hardTimeout);
          lastError = new Error(
            `Cloud LLM returned HTTP ${response.status} (retryable)`,
          );
          if (attempt < this.maxRetries) {
            const backoff_ms = Math.min(1000 * 2 ** attempt, 8000);
            await new Promise((r) => setTimeout(r, backoff_ms));
          }
          continue;
        }

        assert(response.ok, `Cloud LLM returned HTTP ${response.status}`);
        assert(response.body !== null, "Response body is null");

        // Read SSE stream with per-chunk idle timeout to prevent proxy timeouts
        let content = "";
        let finishReason = "stop";
        let model = this.defaultModel;
        let usage = {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        };

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let idleTimer: ReturnType<typeof setTimeout> | null = null;
        const resetIdle = () => {
          if (idleTimer !== null) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            controller.abort();
          }, STREAM_IDLE_TIMEOUT_MS);
        };

        resetIdle();
        try {
          while (true) {
            const { done, value } = await reader.read();
            resetIdle();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split("\n")) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const data_str = trimmed.slice(5).trim();
              if (data_str === "[DONE]") break;
              try {
                const parsed = JSON.parse(data_str) as {
                  choices?: Array<{
                    delta?: { content?: string };
                    finish_reason?: string;
                  }>;
                  model?: string;
                  usage?: {
                    prompt_tokens: number;
                    completion_tokens: number;
                    total_tokens: number;
                  };
                };
                if (parsed.model) model = parsed.model;
                if (parsed.usage) usage = parsed.usage;
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) content += delta;
                const fr = parsed.choices?.[0]?.finish_reason;
                if (fr) finishReason = fr;
              } catch {
                // Malformed SSE line — skip
              }
            }
          }
        } finally {
          if (idleTimer !== null) clearTimeout(idleTimer);
          clearTimeout(hardTimeout);
          reader.releaseLock();
        }

        return {
          content,
          model,
          usage,
          finish_reason: (finishReason as "stop" | "length") ?? "stop",
          latency_ms: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxRetries) {
          const backoff_ms = Math.min(1000 * 2 ** attempt, 8000);
          await new Promise((r) => setTimeout(r, backoff_ms));
        }
      }
    }

    throw lastError ?? new Error("Cloud LLM request failed after retries");
  }

  async listModels(): Promise<string[]> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) return [this.defaultModel];
      const data = (await response.json()) as {
        data: Array<{ id: string }>;
      };
      return data.data?.map((m) => m.id) ?? [this.defaultModel];
    } catch {
      return [this.defaultModel];
    }
  }
}

// ---------------------------------------------------------------------------
// LLM Manager (Factory + Health Monitoring)
// ---------------------------------------------------------------------------

export const DEFAULT_LLAMACPP_CONFIG: LlmAdapterConfig = {
  provider: "llamacpp",
  baseUrl: "http://localhost:8080",
  defaultModel: "default",
  timeout_ms: DEFAULT_TIMEOUT_MS,
  maxRetries: MAX_RETRIES,
  healthCheckInterval_ms: HEALTH_CHECK_INTERVAL_MS,
};

/**
 * LLM Manager — creates and manages LLM adapters.
 * Supports runtime switching between providers (e.g., fallback from cloud to local).
 */
export class LlmManager {
  private readonly adapters: Map<string, LlmAdapter> = new Map();
  private primaryAdapterId: string | null = null;

  /** Register an LLM adapter */
  register(id: string, adapter: LlmAdapter): void {
    assert(!this.adapters.has(id), `Adapter "${id}" already registered`);
    this.adapters.set(id, adapter);
    if (this.primaryAdapterId === null) {
      this.primaryAdapterId = id;
    }
  }

  /** Set the primary adapter */
  setPrimary(id: string): void {
    assert(this.adapters.has(id), `Adapter "${id}" not registered`);
    this.primaryAdapterId = id;
  }

  /** Get the primary adapter */
  getPrimary(): LlmAdapter {
    assert(this.primaryAdapterId !== null, "No LLM adapter registered");
    const adapter = this.adapters.get(this.primaryAdapterId);
    assert(adapter !== undefined, "Primary adapter not found");
    return adapter;
  }

  /** Get a specific adapter */
  get(id: string): LlmAdapter | undefined {
    return this.adapters.get(id);
  }

  /** Complete using primary adapter with automatic fallback */
  async complete(
    request: LlmCompletionRequest,
  ): Promise<LlmCompletionResponse> {
    const primary = this.getPrimary();
    try {
      return await primary.complete(request);
    } catch (error) {
      // Try fallback adapters
      for (const [id, adapter] of this.adapters) {
        if (id === this.primaryAdapterId) continue;
        try {
          const healthy = await adapter.healthCheck();
          if (healthy) {
            return await adapter.complete(request);
          }
        } catch {
          // Skip unhealthy fallback
        }
      }
      throw error;
    }
  }

  /** Health check all adapters */
  async healthCheckAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    for (const [id, adapter] of this.adapters) {
      results.set(id, await adapter.healthCheck());
    }
    return results;
  }

  /** List all registered adapters */
  listAdapters(): Array<{
    id: string;
    provider: LlmProvider;
    isPrimary: boolean;
  }> {
    return Array.from(this.adapters.entries()).map(([id, adapter]) => ({
      id,
      provider: adapter.provider,
      isPrimary: id === this.primaryAdapterId,
    }));
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create an LLM adapter from config */
export function createLlmAdapter(config: LlmAdapterConfig): LlmAdapter {
  switch (config.provider) {
    case "llamacpp":
      assert(config.baseUrl, "llama.cpp requires baseUrl");
      return new LlamaCppAdapter(
        config as LlmAdapterConfig & { baseUrl: string },
      );
    case "anthropic":
    case "openai":
    case "custom":
      return new CloudLlmAdapter(config);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}
