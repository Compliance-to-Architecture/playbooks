/**
 * Coding Engine — Hindsight Agent Memory Adapter
 *
 * Integrates vectorize-io/hindsight as the persistent, cross-session
 * agent memory backend. Hindsight provides 4-strategy retrieval
 * (semantic, BM25, entity graph, temporal) with cross-encoder reranking.
 *
 * This adapter bridges the existing 3-tier MemorySystem (hot/warm/cold)
 * with Hindsight's retain/recall/reflect API, enabling:
 * - Automatic persistence of session learnings
 * - Cross-session recall of anti-patterns, incidents, and decisions
 * - Periodic reflection to synthesize higher-order insights
 *
 * @see https://github.com/vectorize-io/hindsight
 */

export interface HindsightConfig {
  /** Hindsight API base URL (default: http://localhost:8888) */
  baseUrl: string;
  /** Memory bank ID — isolates memories per project */
  bankId: string;
  /** Max tokens for recall responses */
  recallTokenBudget: number;
  /** Enable automatic retain on warm/cold writes */
  autoRetain: boolean;
  /** Enable periodic reflect cycles */
  autoReflect: boolean;
  /** Reflect interval in minutes */
  reflectIntervalMinutes: number;
}

export const defaultHindsightConfig: HindsightConfig = {
  baseUrl: process.env["HINDSIGHT_URL"] ?? "http://localhost:8888",
  bankId: "iof-coding-engine",
  recallTokenBudget: 2000,
  autoRetain: true,
  autoReflect: true,
  reflectIntervalMinutes: 60,
};

export interface RetainResult {
  success: boolean;
  memoryId?: string;
  error?: string;
}

export interface RecallResult {
  success: boolean;
  memories: Array<{
    content: string;
    relevance: number;
    category?: string;
    timestamp?: string;
  }>;
  error?: string;
}

export interface ReflectResult {
  success: boolean;
  insight?: string;
  mentalModels?: string[];
  error?: string;
}

/**
 * HindsightAdapter — Bridge between MemorySystem and Hindsight API
 *
 * Usage:
 *   const adapter = new HindsightAdapter(config);
 *   await adapter.retain("Team uses TypeScript strict mode with pnpm");
 *   const result = await adapter.recall("What coding conventions does the team follow?");
 *   const insight = await adapter.reflect("Summarize all known anti-patterns");
 */
export class HindsightAdapter {
  private config: HindsightConfig;
  private available: boolean | null = null;
  private lastAvailabilityCheck = 0;
  private reflectTimer: ReturnType<typeof setInterval> | null = null;

  /** Re-check availability if cached result is false and older than this */
  private static readonly AVAILABILITY_RECHECK_MS = 30_000;

  constructor(config: Partial<HindsightConfig> = {}) {
    this.config = { ...defaultHindsightConfig, ...config };
  }

  /**
   * Check if Hindsight server is reachable.
   * Re-checks if previously unavailable and cache is older than 30s.
   */
  async isAvailable(): Promise<boolean> {
    if (this.available !== null) {
      // If available, cache permanently for this session
      if (this.available) return true;
      // If unavailable, re-check after cooldown period
      const elapsed = Date.now() - this.lastAvailabilityCheck;
      if (elapsed < HindsightAdapter.AVAILABILITY_RECHECK_MS) {
        return false;
      }
    }
    try {
      const response = await fetch(`${this.config.baseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });
      this.available = response.ok;
      this.lastAvailabilityCheck = Date.now();
      return this.available;
    } catch {
      this.available = false;
      this.lastAvailabilityCheck = Date.now();
      return false;
    }
  }

  /**
   * Retain — Store a memory in Hindsight
   *
   * Maps to Hindsight's retain() API which extracts atomic facts,
   * resolves entities, and builds knowledge graph edges.
   */
  async retain(
    content: string,
    metadata?: {
      category?: "anti-pattern" | "incident" | "decision" | "lesson" | "fix";
      severity?: string;
      fingerprint?: string;
      sessionId?: string;
      tags?: string[];
    },
  ): Promise<RetainResult> {
    if (!(await this.isAvailable())) {
      return { success: false, error: "Hindsight server not available" };
    }

    const enrichedContent = this.enrichContent(content, metadata);

    try {
      const response = await fetch(
        `${this.config.baseUrl}/api/v1/banks/${this.config.bankId}/memories`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: enrichedContent }),
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${text}` };
      }

      const data = (await response.json()) as { id?: string };
      return { success: true, memoryId: data.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Recall — Retrieve relevant memories for a query
   *
   * Uses 4-strategy parallel retrieval (semantic, BM25, entity graph,
   * temporal) with cross-encoder reranking. Returns within token budget.
   */
  async recall(
    query: string,
    options?: { maxResults?: number; tokenBudget?: number },
  ): Promise<RecallResult> {
    if (!(await this.isAvailable())) {
      return {
        success: false,
        memories: [],
        error: "Hindsight server not available",
      };
    }

    const tokenBudget = options?.tokenBudget ?? this.config.recallTokenBudget;

    try {
      const response = await fetch(
        `${this.config.baseUrl}/api/v1/banks/${this.config.bankId}/recall`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            max_tokens: tokenBudget,
            max_results: options?.maxResults ?? 10,
          }),
          signal: AbortSignal.timeout(15000),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        return {
          success: false,
          memories: [],
          error: `HTTP ${response.status}: ${text}`,
        };
      }

      const data = (await response.json()) as {
        results?: Array<{
          content: string;
          score: number;
          metadata?: Record<string, string>;
        }>;
      };
      const memories = (data.results ?? []).map((r) => ({
        content: r.content,
        relevance: r.score,
        category: r.metadata?.category,
        timestamp: r.metadata?.timestamp,
      }));
      return { success: true, memories };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, memories: [], error: message };
    }
  }

  /**
   * Reflect — Synthesize higher-order insights from accumulated memories
   *
   * Generates "mental models" — patterns, opinions, and observations
   * derived from all stored memories. Useful for periodic synthesis of
   * anti-patterns, coding conventions, and architectural principles.
   */
  async reflect(query: string): Promise<ReflectResult> {
    if (!(await this.isAvailable())) {
      return { success: false, error: "Hindsight server not available" };
    }

    try {
      const response = await fetch(
        `${this.config.baseUrl}/api/v1/banks/${this.config.bankId}/reflect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
          signal: AbortSignal.timeout(30000),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `HTTP ${response.status}: ${text}` };
      }

      const data = (await response.json()) as {
        insight?: string;
        mental_models?: string[];
      };
      return {
        success: true,
        insight: data.insight,
        mentalModels: data.mental_models,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Ensure the memory bank exists, creating it if needed
   */
  async ensureBank(): Promise<boolean> {
    if (!(await this.isAvailable())) {
      return false;
    }

    try {
      const response = await fetch(
        `${this.config.baseUrl}/api/v1/banks/${this.config.bankId}`,
        {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        },
      );

      if (response.ok) {
        return true;
      }

      // Bank doesn't exist — create it
      const createResponse = await fetch(
        `${this.config.baseUrl}/api/v1/banks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: this.config.bankId,
            name: `Memory bank for ${this.config.bankId}`,
          }),
          signal: AbortSignal.timeout(5000),
        },
      );

      return createResponse.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get bank statistics (memory count, last activity, etc.)
   */
  async getBankStats(): Promise<{
    memoryCount: number;
    lastActivity?: string;
  } | null> {
    if (!(await this.isAvailable())) {
      return null;
    }

    try {
      const response = await fetch(
        `${this.config.baseUrl}/api/v1/banks/${this.config.bankId}/stats`,
        {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        },
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        memory_count?: number;
        last_activity?: string;
      };
      return {
        memoryCount: data.memory_count ?? 0,
        lastActivity: data.last_activity,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if auto-retain is enabled
   */
  isAutoRetainEnabled(): boolean {
    return this.config.autoRetain;
  }

  /**
   * Get the current config (read-only access for callers)
   */
  getConfig(): Readonly<HindsightConfig> {
    return this.config;
  }

  /**
   * Start periodic reflect scheduler
   *
   * Calls reflect() at the configured interval to synthesize
   * mental models from accumulated memories. Returns a cleanup
   * function to stop the scheduler.
   */
  startReflectScheduler(
    onReflect?: (result: ReflectResult) => void,
  ): (() => void) | null {
    if (!this.config.autoReflect || this.config.reflectIntervalMinutes <= 0) {
      return null;
    }

    // TigerStyle: clean up previous timer to prevent memory leak on repeated calls
    if (this.reflectTimer !== null) {
      clearInterval(this.reflectTimer);
      this.reflectTimer = null;
    }

    const intervalMs = this.config.reflectIntervalMinutes * 60 * 1000;

    this.reflectTimer = setInterval(async () => {
      const result = await this.reflect(
        "Synthesize all known anti-patterns, recurring issues, engineering principles, and lessons learned into updated mental models",
      );
      if (onReflect) {
        onReflect(result);
      }
    }, intervalMs);

    return () => {
      if (this.reflectTimer !== null) {
        clearInterval(this.reflectTimer);
        this.reflectTimer = null;
      }
    };
  }

  /**
   * Session start — recall relevant context for the current project
   *
   * Returns structured context that can be appended to failure-context.md
   * or used directly by the agent.
   */
  async sessionStartRecall(): Promise<{
    antiPatterns: string[];
    recentIncidents: string[];
    conventions: string[];
  }> {
    const empty = { antiPatterns: [], recentIncidents: [], conventions: [] };
    if (!(await this.isAvailable())) {
      return empty;
    }

    const [apResult, incResult, convResult] = await Promise.all([
      this.recall("known anti-patterns and mistakes to avoid", {
        maxResults: 5,
      }),
      this.recall("recent incidents and how they were resolved", {
        maxResults: 5,
      }),
      this.recall("coding conventions and architectural decisions", {
        maxResults: 5,
      }),
    ]);

    return {
      antiPatterns: apResult.success
        ? apResult.memories.map((m) => m.content)
        : [],
      recentIncidents: incResult.success
        ? incResult.memories.map((m) => m.content)
        : [],
      conventions: convResult.success
        ? convResult.memories.map((m) => m.content)
        : [],
    };
  }

  /**
   * Enrich content with structured metadata for better retrieval
   */
  private enrichContent(
    content: string,
    metadata?: {
      category?: string;
      severity?: string;
      fingerprint?: string;
      sessionId?: string;
      tags?: string[];
    },
  ): string {
    const parts = [content];

    if (metadata?.category) {
      parts.push(`[Category: ${metadata.category}]`);
    }
    if (metadata?.severity) {
      parts.push(`[Severity: ${metadata.severity}]`);
    }
    if (metadata?.fingerprint) {
      parts.push(`[Fingerprint: ${metadata.fingerprint}]`);
    }
    if (metadata?.tags && metadata.tags.length > 0) {
      parts.push(`[Tags: ${metadata.tags.join(", ")}]`);
    }

    return parts.join(" ");
  }
}
