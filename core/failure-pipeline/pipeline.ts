/**
 * Coding Engine — Portable Failure Pipeline
 *
 * Domain-agnostic failure ingestion, fingerprinting, deduplication,
 * auto-fix orchestration, dead letter queue, escalation hooks,
 * resolution tracking, and cross-source correlation.
 *
 * All native TypeScript — zero runtime dependencies.
 */

import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type {
  FailureEvent,
  AgentFailureContext,
  FailureSeverity,
  FailureSource,
} from "../types/failure-types";
import { LRUCache } from "../storage/lru-cache";

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface FailureSourceConfig {
  name: string;
  source: FailureSource;
  enabled: boolean;
  collect: () => Promise<FailureEvent[]>;
}

export interface EscalationHook {
  /** Called when a failure exceeds the escalation threshold */
  onEscalation: (failure: FailureEvent, occurrenceCount: number) => void;
}

export interface ResolutionRecord {
  fingerprint: string;
  resolvedByPr: string;
  resolvedAt: string;
  summary: string;
  commitSha: string;
}

export interface DeadLetterEntry {
  failure: FailureEvent;
  reason: string;
  attempts: number;
  addedAt: string;
}

export interface CorrelationGroup {
  primaryFingerprint: string;
  relatedFingerprints: string[];
  reason: string;
}

export interface PipelineConfig {
  maxOpenFixPRs: number;
  deduplicationWindowHours: number;
  escalationThreshold: number;
  autoFixEnabled: boolean;
  sources: FailureSourceConfig[];
  /** Maximum tracked fingerprints (default: 10000) */
  maxFingerprints?: number;
  /** Max dead letter entries (default: 500) */
  maxDeadLetterEntries?: number;
  /** Max fix attempts before dead-lettering (default: 3) */
  maxFixAttempts?: number;
  /** Project root for file-based persistence */
  projectRoot?: string;
  /** Escalation hooks */
  escalationHooks?: EscalationHook[];
}

// ─── Failure Store (file-based persistence) ────────────────────────────────

const STORE_DIR = ".claude/failure-store";
const FAILURES_FILE = "failures.json";
const RESOLUTIONS_FILE = "resolutions.json";
const DEAD_LETTER_FILE = "dead-letter.json";

export class FailureStore {
  private storeDir: string;

  constructor(projectRoot: string) {
    this.storeDir = path.join(projectRoot, STORE_DIR);
  }

  initialize(): void {
    if (!fs.existsSync(this.storeDir)) {
      fs.mkdirSync(this.storeDir, { recursive: true });
    }
  }

  saveFailures(failures: FailureEvent[]): void {
    this.initialize();
    const filePath = path.join(this.storeDir, FAILURES_FILE);
    fs.writeFileSync(filePath, JSON.stringify(failures, null, 2));
  }

  loadFailures(): FailureEvent[] {
    const filePath = path.join(this.storeDir, FAILURES_FILE);
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      return [];
    }
  }

  saveResolutions(resolutions: ResolutionRecord[]): void {
    this.initialize();
    const filePath = path.join(this.storeDir, RESOLUTIONS_FILE);
    fs.writeFileSync(filePath, JSON.stringify(resolutions, null, 2));
  }

  loadResolutions(): ResolutionRecord[] {
    const filePath = path.join(this.storeDir, RESOLUTIONS_FILE);
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      return [];
    }
  }

  saveDeadLetterQueue(entries: DeadLetterEntry[]): void {
    this.initialize();
    const filePath = path.join(this.storeDir, DEAD_LETTER_FILE);
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
  }

  loadDeadLetterQueue(): DeadLetterEntry[] {
    const filePath = path.join(this.storeDir, DEAD_LETTER_FILE);
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      return [];
    }
  }
}

// ─── Failure Pipeline ───────────────────────────────────────────────────────

export class FailurePipeline {
  private knownFingerprints: LRUCache<
    string,
    { count: number; lastSeen: Date }
  >;
  private deadLetterQueue: DeadLetterEntry[] = [];
  private resolutions: ResolutionRecord[] = [];
  private store: FailureStore | null = null;
  private escalationHooks: EscalationHook[];

  constructor(private config: PipelineConfig) {
    assert(config.maxOpenFixPRs > 0, "maxOpenFixPRs must be positive");
    assert(
      config.deduplicationWindowHours > 0,
      "deduplicationWindowHours must be positive",
    );
    assert(
      config.escalationThreshold > 0,
      "escalationThreshold must be positive",
    );

    const ttlMs = config.deduplicationWindowHours * 60 * 60 * 1000;
    this.knownFingerprints = new LRUCache({
      maxEntries: config.maxFingerprints ?? 10_000,
      ttlMs,
    });

    this.escalationHooks = config.escalationHooks ?? [];

    // Initialize file-based persistence if projectRoot provided
    if (config.projectRoot) {
      this.store = new FailureStore(config.projectRoot);
      this.store.initialize();
      this.deadLetterQueue = this.store.loadDeadLetterQueue();
      this.resolutions = this.store.loadResolutions();
    }
  }

  /**
   * Collect failures from all configured sources
   */
  async collectAll(): Promise<FailureEvent[]> {
    const allFailures: FailureEvent[] = [];

    for (const source of this.config.sources) {
      if (!source.enabled) continue;

      try {
        const failures = await source.collect();
        allFailures.push(...failures);
      } catch (error) {
        console.error(`Failed to collect from ${source.name}:`, error);
      }
    }

    return allFailures;
  }

  /**
   * Deduplicate failures by fingerprint
   */
  deduplicate(failures: FailureEvent[]): FailureEvent[] {
    const seen = new Set<string>();
    const deduped: FailureEvent[] = [];
    const windowMs = this.config.deduplicationWindowHours * 60 * 60 * 1000;

    for (const failure of failures) {
      const existing = this.knownFingerprints.get(failure.fingerprint);

      if (existing !== undefined) {
        const timeSinceLast = Date.now() - existing.lastSeen.getTime();
        if (timeSinceLast < windowMs) {
          existing.count++;
          existing.lastSeen = new Date();
          this.knownFingerprints.set(failure.fingerprint, existing);

          // Escalate recurring failures and notify hooks
          if (existing.count >= this.config.escalationThreshold) {
            failure.severity = "critical";
            failure.status = "triaged";
            this.notifyEscalation(failure, existing.count);
          }

          continue; // Skip duplicate
        }
      }

      if (!seen.has(failure.fingerprint)) {
        seen.add(failure.fingerprint);
        deduped.push(failure);
        this.knownFingerprints.set(failure.fingerprint, {
          count: 1,
          lastSeen: new Date(),
        });
      }
    }

    return deduped;
  }

  /**
   * Prioritize failures by severity
   */
  prioritize(failures: FailureEvent[]): FailureEvent[] {
    return [...failures].sort((a, b) => {
      const severityOrder: Record<FailureSeverity, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Generate agent-ingestable failure context
   */
  generateContext(
    failures: FailureEvent[],
    repository: string,
    openFixPRs: Array<{
      number: number;
      title: string;
      fingerprint: string;
      url: string;
    }>,
  ): AgentFailureContext {
    return {
      schema_version: "1.0",
      generated_at: new Date().toISOString(),
      repository,
      failures,
      open_fix_prs: openFixPRs,
      action_items: this.generateActionItems(failures),
    };
  }

  private generateActionItems(failures: FailureEvent[]): string[] {
    const items: string[] = [];

    const critical = failures.filter((f) => f.severity === "critical");
    if (critical.length > 0) {
      items.push(
        `URGENT: ${critical.length} critical failures require immediate attention`,
      );
    }

    const byService = new Map<string, number>();
    for (const f of failures) {
      byService.set(f.service, (byService.get(f.service) ?? 0) + 1);
    }
    for (const [service, count] of byService) {
      items.push(`${service}: ${count} failure(s) detected`);
    }

    // Add dead letter warnings
    if (this.deadLetterQueue.length > 0) {
      items.push(
        `DEAD LETTER: ${this.deadLetterQueue.length} unresolvable failure(s) require manual review`,
      );
    }

    return items;
  }

  /**
   * Check if auto-fix is allowed (circuit breaker)
   */
  canAutoFix(openFixPRCount: number): boolean {
    if (!this.config.autoFixEnabled) return false;
    return openFixPRCount < this.config.maxOpenFixPRs;
  }

  /**
   * Collect failures with pagination support for large collections
   */
  async collectPaginated(params: {
    limit: number;
    offset: number;
  }): Promise<{ failures: FailureEvent[]; total: number; hasMore: boolean }> {
    assert(params.limit > 0, "limit must be positive");
    assert(params.offset >= 0, "offset must be non-negative");

    const all = await this.collectAll();
    const total = all.length;
    const page = all.slice(params.offset, params.offset + params.limit);
    return {
      failures: page,
      total,
      hasMore: params.offset + params.limit < total,
    };
  }

  /**
   * Get fingerprint cache statistics for observability
   */
  getCacheStats(): {
    size: number;
    maxEntries: number;
    ttlMs: number;
    oldestEntryAgeMs: number | null;
  } {
    return this.knownFingerprints.stats();
  }

  /**
   * Prune expired entries from the fingerprint cache
   */
  pruneCache(): number {
    return this.knownFingerprints.prune();
  }

  // ─── Dead Letter Queue ──────────────────────────────────────────────────

  /**
   * Add a failure to the dead letter queue (unresolvable after max attempts)
   */
  addToDeadLetter(failure: FailureEvent, reason: string): void {
    const maxEntries = this.config.maxDeadLetterEntries ?? 500;
    const existing = this.deadLetterQueue.find(
      (e) => e.failure.fingerprint === failure.fingerprint,
    );

    if (existing) {
      existing.attempts++;
      existing.reason = reason;
      return;
    }

    this.deadLetterQueue.push({
      failure,
      reason,
      attempts: 1,
      addedAt: new Date().toISOString(),
    });

    // Enforce max entries — drop oldest
    if (this.deadLetterQueue.length > maxEntries) {
      this.deadLetterQueue = this.deadLetterQueue.slice(-maxEntries);
    }

    this.persistDeadLetterQueue();
  }

  /**
   * Check if a failure should be dead-lettered (exceeded max fix attempts)
   */
  shouldDeadLetter(fingerprint: string): boolean {
    const maxAttempts = this.config.maxFixAttempts ?? 3;
    const entry = this.deadLetterQueue.find(
      (e) => e.failure.fingerprint === fingerprint,
    );
    return entry !== undefined && entry.attempts >= maxAttempts;
  }

  /**
   * Get all dead letter entries
   */
  getDeadLetterQueue(): ReadonlyArray<DeadLetterEntry> {
    return this.deadLetterQueue;
  }

  /**
   * Remove a failure from the dead letter queue (manually resolved)
   */
  removeFromDeadLetter(fingerprint: string): boolean {
    const idx = this.deadLetterQueue.findIndex(
      (e) => e.failure.fingerprint === fingerprint,
    );
    if (idx === -1) return false;
    this.deadLetterQueue.splice(idx, 1);
    this.persistDeadLetterQueue();
    return true;
  }

  // ─── Resolution Tracking ───────────────────────────────────────────────

  /**
   * Record that a failure was resolved by a PR
   */
  recordResolution(record: ResolutionRecord): void {
    assert(record.fingerprint.length > 0, "fingerprint required");
    assert(record.resolvedByPr.length > 0, "resolvedByPr required");

    // Deduplicate by fingerprint
    const existing = this.resolutions.findIndex(
      (r) => r.fingerprint === record.fingerprint,
    );
    if (existing !== -1) {
      this.resolutions[existing] = record;
    } else {
      this.resolutions.push(record);
    }

    // Remove from dead letter queue if present
    this.removeFromDeadLetter(record.fingerprint);

    this.persistResolutions();
  }

  /**
   * Get all resolution records
   */
  getResolutions(): ReadonlyArray<ResolutionRecord> {
    return this.resolutions;
  }

  /**
   * Check if a fingerprint has been resolved
   */
  isResolved(fingerprint: string): ResolutionRecord | undefined {
    return this.resolutions.find((r) => r.fingerprint === fingerprint);
  }

  /**
   * Get recently resolved issues (for agent context)
   */
  getRecentResolutions(limit: number = 10): ResolutionRecord[] {
    return [...this.resolutions]
      .sort(
        (a, b) =>
          new Date(b.resolvedAt).getTime() - new Date(a.resolvedAt).getTime(),
      )
      .slice(0, limit);
  }

  // ─── Cross-Source Correlation ──────────────────────────────────────────

  /**
   * Correlate failures across sources by normalized error patterns
   */
  correlateFailures(failures: FailureEvent[]): CorrelationGroup[] {
    const groups: CorrelationGroup[] = [];
    const messageMap = new Map<string, string[]>();

    // Normalize messages and group by pattern
    for (const f of failures) {
      const normalized = f.message
        .replace(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}[.\d]*Z?/g, "")
        .replace(/[0-9a-f]{7,}/gi, "HASH")
        .replace(/\d+/g, "N")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);

      const key = normalized;
      if (!messageMap.has(key)) {
        messageMap.set(key, []);
      }
      messageMap.get(key)!.push(f.fingerprint);
    }

    // Create groups for correlated fingerprints (>1 fingerprint per pattern)
    for (const [pattern, fingerprints] of messageMap) {
      const unique = [...new Set(fingerprints)];
      if (unique.length > 1) {
        groups.push({
          primaryFingerprint: unique[0]!,
          relatedFingerprints: unique.slice(1),
          reason: `Same error pattern: "${pattern.slice(0, 100)}"`,
        });
      }
    }

    return groups;
  }

  // ─── Escalation Hooks ─────────────────────────────────────────────────

  /**
   * Register an escalation hook
   */
  addEscalationHook(hook: EscalationHook): void {
    this.escalationHooks.push(hook);
  }

  private notifyEscalation(failure: FailureEvent, count: number): void {
    for (const hook of this.escalationHooks) {
      try {
        hook.onEscalation(failure, count);
      } catch {
        // Never let hook errors break the pipeline
      }
    }
  }

  // ─── Persistence ──────────────────────────────────────────────────────

  /**
   * Persist current pipeline state to file store
   */
  persistAll(failures: FailureEvent[]): void {
    if (!this.store) return;
    this.store.saveFailures(failures);
    this.persistResolutions();
    this.persistDeadLetterQueue();
  }

  private persistResolutions(): void {
    if (this.store) {
      this.store.saveResolutions(this.resolutions);
    }
  }

  private persistDeadLetterQueue(): void {
    if (this.store) {
      this.store.saveDeadLetterQueue(this.deadLetterQueue);
    }
  }

  /**
   * Load persisted failures from file store
   */
  loadPersistedFailures(): FailureEvent[] {
    return this.store?.loadFailures() ?? [];
  }

  /**
   * Get pipeline statistics for observability
   */
  getStats(): {
    cacheSize: number;
    deadLetterCount: number;
    resolutionCount: number;
    escalationHookCount: number;
  } {
    return {
      cacheSize: this.knownFingerprints.stats().size,
      deadLetterCount: this.deadLetterQueue.length,
      resolutionCount: this.resolutions.length,
      escalationHookCount: this.escalationHooks.length,
    };
  }
}

// ─── GitHub Actions Source (with fingerprinting) ────────────────────────────

/**
 * GitHub Actions failure source — collects from workflow run logs.
 * Now generates proper SHA-256 fingerprints for deduplication.
 */
export function createGitHubActionsSource(params: {
  repository: string;
  token: string;
  workflowNames?: string[];
}): FailureSourceConfig {
  return {
    name: "github-actions",
    source: "github-actions",
    enabled: true,
    collect: async () => {
      const { execSync } = await import("child_process");
      try {
        const output = execSync(
          `gh run list --repo ${params.repository} --status failure --limit 10 --json databaseId,name,conclusion,headSha,createdAt`,
          {
            encoding: "utf-8",
            env: { ...process.env, GH_TOKEN: params.token },
          },
        );
        const runs = JSON.parse(output);
        return runs.map((run: Record<string, unknown>) => {
          const workflowName = run.name as string;
          const commitSha = (run.headSha as string) || "";
          const message = `Workflow "${workflowName}" failed`;

          // Generate proper fingerprint from source+workflow+normalized message
          const fingerprintPayload = [
            "github-actions",
            workflowName,
            message.replace(/\d+/g, "N").replace(/[a-f0-9]{7,}/gi, "HASH"),
          ].join("|");
          const fingerprint = crypto
            .createHash("sha256")
            .update(fingerprintPayload)
            .digest("hex")
            .slice(0, 16);

          return {
            id: String(run.databaseId),
            timestamp: run.createdAt as string,
            source: "github-actions" as const,
            severity: "high" as const,
            fingerprint,
            service: workflowName,
            environment: "ci",
            message,
            commitSha,
            workflowRunId: String(run.databaseId),
            status: "new" as const,
            blobs: [],
          };
        });
      } catch {
        return [];
      }
    },
  };
}
