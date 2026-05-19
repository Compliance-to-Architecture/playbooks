/**
 * Coding Engine — 4-Tier Memory System
 *
 * Hot:   Session context (in-memory, current session only)
 * Warm:  MEMORY.md + Hindsight retain (file-based + semantic, cross-session)
 * Cold:  docs/incidents/, docs/adr/, docs/fixes/ (long-term archival + Hindsight)
 * Graph: Hindsight entity network (relationships, reasoning, mental models)
 *
 * File-based tiers (hot/warm/cold) work standalone. The Graph tier requires
 * Hindsight and provides relationship reasoning + cross-session synthesis.
 *
 * Ensures the engine NEVER forgets lessons learned.
 */

import { strict as assert } from "node:assert";
import * as fs from "fs";
import * as path from "path";
import { HindsightAdapter, defaultHindsightConfig } from "./hindsight-adapter";
import type { HindsightConfig } from "./hindsight-adapter";

export type MemoryTier = "hot" | "warm" | "cold";

export interface MemoryEntry {
  id: string;
  tier: MemoryTier;
  category: "anti-pattern" | "resolved-issue" | "lesson-learned" | "decision";
  title: string;
  content: string;
  fingerprint?: string;
  created_at: string;
  session_id?: string;
  tags: string[];
}

export interface AntiPattern {
  pattern: string;
  prevention: string;
  detection_command: string;
  incident_date: string;
  severity: "critical" | "high" | "medium" | "low";
}

const MEMORY_DIR = ".claude/memory";
const MEMORY_FILE = "MEMORY.md";
const ANTI_PATTERNS_FILE = "anti-patterns.json";
const INCIDENTS_DIR = "docs/incidents";
const ADR_DIR = "docs/adr";
const FIXES_DIR = "docs/fixes";

export class MemorySystem {
  private projectRoot: string;
  private hotMemory: Map<string, MemoryEntry> = new Map();
  private hindsight: HindsightAdapter | null = null;
  private readonly tenantId: string;
  private readonly projectId: string;

  constructor(
    projectRoot: string,
    hindsightConfig?: Partial<HindsightConfig>,
    options?: { tenantId?: string; projectId?: string },
  ) {
    assert(
      typeof projectRoot === "string" && projectRoot.length > 0,
      "projectRoot must be a non-empty string",
    );
    this.projectRoot = projectRoot;
    this.tenantId = options?.tenantId ?? "default";
    this.projectId = options?.projectId ?? "default";
    if (hindsightConfig !== undefined) {
      this.hindsight = new HindsightAdapter(hindsightConfig);
    }
  }

  /** Get the tenant ID for this memory system instance */
  getTenantId(): string {
    return this.tenantId;
  }

  /** Get the project ID for this memory system instance */
  getProjectId(): string {
    return this.projectId;
  }

  /**
   * Create a tenant-scoped memory system (factory for serverless).
   * Each invocation gets an isolated instance with tenant-prefixed paths.
   */
  static createForTenant(
    projectRoot: string,
    tenantId: string,
    projectId: string = "default",
    hindsightConfig?: Partial<HindsightConfig>,
  ): MemorySystem {
    assert(
      typeof projectRoot === "string" && projectRoot.length > 0,
      "projectRoot must be a non-empty string",
    );
    assert(
      typeof tenantId === "string" && tenantId.length > 0,
      "tenantId must be a non-empty string",
    );
    // Tenant-scoped root: projectRoot/.claude/tenants/{tenantId}/{projectId}
    const scopedRoot = `${projectRoot}/.claude/tenants/${tenantId}/${projectId}`;
    return new MemorySystem(scopedRoot, hindsightConfig, {
      tenantId,
      projectId,
    });
  }

  /**
   * Get the Hindsight adapter for direct access (recall, reflect)
   */
  getHindsight(): HindsightAdapter | null {
    return this.hindsight;
  }

  /**
   * Connect Hindsight after construction (lazy initialization)
   */
  connectHindsight(config?: Partial<HindsightConfig>): void {
    this.hindsight = new HindsightAdapter(config ?? defaultHindsightConfig);
  }

  /**
   * Initialize the memory system — create all directories and template files
   */
  initialize(): void {
    const dirs = [MEMORY_DIR, INCIDENTS_DIR, ADR_DIR, FIXES_DIR];

    for (const dir of dirs) {
      const fullPath = path.join(this.projectRoot, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }

    this.ensureMemoryFile();
    this.ensureAntiPatternsFile();
    this.ensureIncidentTemplate();
    this.ensureAdrTemplate();
  }

  /**
   * Hot tier: Add entry to current session memory
   */
  addHot(entry: Omit<MemoryEntry, "tier" | "created_at">): void {
    assert(
      typeof entry.id === "string" && entry.id.length > 0,
      "entry.id must be a non-empty string",
    );
    assert(
      typeof entry.title === "string" && entry.title.length > 0,
      "entry.title must be a non-empty string",
    );
    const full: MemoryEntry = {
      ...entry,
      tier: "hot",
      created_at: new Date().toISOString(),
    };
    this.hotMemory.set(entry.id, full);
  }

  /**
   * Warm tier: Persist entry to MEMORY.md + Hindsight
   */
  addWarm(entry: Omit<MemoryEntry, "tier" | "created_at">): void {
    assert(
      typeof entry.id === "string" && entry.id.length > 0,
      "entry.id must be a non-empty string",
    );
    assert(
      typeof entry.title === "string" && entry.title.length > 0,
      "entry.title must be a non-empty string",
    );
    const memoryPath = path.join(this.projectRoot, MEMORY_DIR, MEMORY_FILE);
    const section = this.categorySectionName(entry.category);
    const content = fs.readFileSync(memoryPath, "utf-8");

    const marker = `## ${section}`;
    const entryText = `\n- **${entry.title}** — ${entry.content} (${new Date().toISOString().split("T")[0]})\n`;

    if (content.includes(marker)) {
      const updated = content.replace(marker, `${marker}\n${entryText}`);
      fs.writeFileSync(memoryPath, updated);
    } else {
      fs.appendFileSync(memoryPath, `\n${marker}\n${entryText}`);
    }

    // Auto-retain to Hindsight (fire-and-forget — file write is authoritative)
    if (this.hindsight && this.hindsight.isAutoRetainEnabled()) {
      void this.hindsight.retain(`${entry.title}: ${entry.content}`, {
        category: this.mapCategoryToHindsight(entry.category),
        fingerprint: entry.fingerprint,
        sessionId: entry.session_id,
        tags: entry.tags,
      });
    }
  }

  /**
   * Cold tier: Write incident document
   */
  addCold(incident: {
    title: string;
    rootCause: string;
    fix: string;
    prevention: string;
    fingerprint: string;
    severity: string;
  }): void {
    assert(
      typeof incident.title === "string" && incident.title.length > 0,
      "incident.title must be a non-empty string",
    );
    assert(
      typeof incident.fingerprint === "string" &&
        incident.fingerprint.length > 0,
      "incident.fingerprint must be a non-empty string",
    );
    const date = new Date().toISOString().split("T")[0];
    const slug = incident.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 50);
    const filename = `${date}-${slug}.md`;
    const filePath = path.join(this.projectRoot, INCIDENTS_DIR, filename);

    const content = `# Incident: ${incident.title}

**Date**: ${date}
**Severity**: ${incident.severity}
**Fingerprint**: \`${incident.fingerprint}\`
**Status**: Resolved

## Root Cause

${incident.rootCause}

## Fix Applied

${incident.fix}

## Prevention Steps

${incident.prevention}

## Detection

This incident is fingerprinted. If fingerprint \`${incident.fingerprint}\` recurs, it triggers automatic escalation.
`;

    fs.writeFileSync(filePath, content);

    // Auto-retain incident to Hindsight (fire-and-forget)
    if (this.hindsight && this.hindsight.isAutoRetainEnabled()) {
      void this.hindsight.retain(
        `Incident: ${incident.title}. Root cause: ${incident.rootCause}. Fix: ${incident.fix}. Prevention: ${incident.prevention}`,
        {
          category: "incident",
          severity: incident.severity,
          fingerprint: incident.fingerprint,
          tags: ["incident", "cold-tier"],
        },
      );
    }
  }

  /**
   * Register an anti-pattern for future prevention
   */
  registerAntiPattern(antiPattern: AntiPattern): void {
    assert(
      typeof antiPattern.pattern === "string" && antiPattern.pattern.length > 0,
      "antiPattern.pattern must be a non-empty string",
    );
    assert(
      typeof antiPattern.prevention === "string" &&
        antiPattern.prevention.length > 0,
      "antiPattern.prevention must be a non-empty string",
    );
    const filePath = path.join(
      this.projectRoot,
      MEMORY_DIR,
      ANTI_PATTERNS_FILE,
    );
    let patterns: AntiPattern[] = [];

    try {
      patterns = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      // File doesn't exist yet or is invalid — start with empty array
      patterns = [];
    }

    // Deduplicate by pattern text
    if (!patterns.some((p) => p.pattern === antiPattern.pattern)) {
      patterns.push(antiPattern);
      fs.writeFileSync(filePath, JSON.stringify(patterns, null, 2));

      // Auto-retain anti-pattern to Hindsight
      if (this.hindsight && this.hindsight.isAutoRetainEnabled()) {
        void this.hindsight.retain(
          `Anti-pattern: ${antiPattern.pattern}. Prevention: ${antiPattern.prevention}. Detection: ${antiPattern.detection_command}`,
          {
            category: "anti-pattern",
            severity: antiPattern.severity,
            tags: ["anti-pattern", "prevention"],
          },
        );
      }
    }
  }

  /**
   * Check if a known anti-pattern is being violated
   */
  checkAntiPatterns(): AntiPattern[] {
    const filePath = path.join(
      this.projectRoot,
      MEMORY_DIR,
      ANTI_PATTERNS_FILE,
    );
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      return [];
    }
  }

  /**
   * Promote hot memory to warm at session end
   */
  flushHotToWarm(): void {
    for (const entry of this.hotMemory.values()) {
      this.addWarm({
        id: entry.id,
        category: entry.category,
        title: entry.title,
        content: entry.content,
        fingerprint: entry.fingerprint,
        session_id: entry.session_id,
        tags: entry.tags,
      });
    }
    this.hotMemory.clear();
  }

  /**
   * Get all hot memory entries
   */
  getHotMemory(): MemoryEntry[] {
    const result = Array.from(this.hotMemory.values());
    assert(result.length <= 10000, "hot memory must not exceed 10000 entries");
    return result;
  }

  /**
   * Read the full MEMORY.md content
   */
  readWarmMemory(): string {
    const filePath = path.join(this.projectRoot, MEMORY_DIR, MEMORY_FILE);
    try {
      return fs.readFileSync(filePath, "utf-8");
    } catch {
      return "";
    }
  }

  /**
   * List all cold storage incident files
   */
  listIncidents(): string[] {
    const dir = path.join(this.projectRoot, INCIDENTS_DIR);
    try {
      const result = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".md") && f !== "INCIDENT_TEMPLATE.md");
      assert(
        result.length <= 10000,
        "incidents list must not exceed 10000 entries",
      );
      return result;
    } catch {
      return [];
    }
  }

  private mapCategoryToHindsight(
    category: MemoryEntry["category"],
  ): "anti-pattern" | "incident" | "decision" | "lesson" | "fix" {
    switch (category) {
      case "anti-pattern":
        return "anti-pattern";
      case "resolved-issue":
        return "fix";
      case "lesson-learned":
        return "lesson";
      case "decision":
        return "decision";
    }
  }

  private categorySectionName(category: MemoryEntry["category"]): string {
    switch (category) {
      case "anti-pattern":
        return "Known Anti-Patterns";
      case "resolved-issue":
        return "Resolved Issues";
      case "lesson-learned":
        return "Lessons Learned";
      case "decision":
        return "Architectural Decisions";
    }
  }

  private ensureMemoryFile(): void {
    const filePath = path.join(this.projectRoot, MEMORY_DIR, MEMORY_FILE);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(
        filePath,
        `# MEMORY.md — Project Memory

> Auto-generated by Coding Engine. Check this file at the start of every session.

## Resolved Issues
<!-- Each resolved issue with root cause and fix -->

## Known Anti-Patterns
<!-- Patterns that caused incidents — NEVER repeat these -->

## Lessons Learned
<!-- Session-by-session learnings -->

## Architectural Decisions
<!-- Key decisions with rationale (link to ADRs in docs/adr/) -->
`,
      );
    }
  }

  private ensureAntiPatternsFile(): void {
    const filePath = path.join(
      this.projectRoot,
      MEMORY_DIR,
      ANTI_PATTERNS_FILE,
    );
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "[]");
    }
  }

  private ensureIncidentTemplate(): void {
    const filePath = path.join(
      this.projectRoot,
      INCIDENTS_DIR,
      "INCIDENT_TEMPLATE.md",
    );
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(
        filePath,
        `# Incident: <Title>

**Date**: YYYY-MM-DD
**Severity**: critical | high | medium | low
**Fingerprint**: \`<SHA-256 prefix>\`
**Status**: New | Investigating | Mitigated | Resolved

## Summary

<1-2 sentence description of what happened>

## Impact

- **Users affected**: <number or description>
- **Duration**: <start time> to <end time>
- **Services affected**: <list>

## Root Cause

<Detailed technical explanation>

## Fix Applied

<What was done to resolve the issue>

## Prevention Steps

<What changes prevent this from happening again>

## Timeline

| Time | Event |
|------|-------|
| HH:MM | Issue detected |
| HH:MM | Investigation started |
| HH:MM | Root cause identified |
| HH:MM | Fix deployed |
| HH:MM | Issue resolved |

## Detection

Fingerprint: \`<hash>\` — auto-escalates if this recurs.
`,
      );
    }
  }

  private ensureAdrTemplate(): void {
    const filePath = path.join(this.projectRoot, ADR_DIR, "ADR_TEMPLATE.md");
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(
        filePath,
        `# ADR-NNN: <Title>

**Date**: YYYY-MM-DD
**Status**: Proposed | Accepted | Deprecated | Superseded
**Deciders**: <who made this decision>

## Context

<What is the issue that we're seeing that is motivating this decision?>

## Decision

<What is the change that we're proposing and/or doing?>

## Consequences

### Positive
- <benefit 1>
- <benefit 2>

### Negative
- <tradeoff 1>
- <tradeoff 2>

### Neutral
- <observation>
`,
      );
    }
  }
}
