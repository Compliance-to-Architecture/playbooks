# Agent Memory Skill

> **Enforcement**: suggest
> **Triggers**: memory, session, context, anti-pattern, incident, lesson-learned, cross-session

Patterns for persistent agent memory across sessions. Implements a 4-tier memory system (hot/warm/cold/graph) with anti-pattern detection, incident tracking, cross-session context preservation, and relationship reasoning. File-based tiers (hot/warm/cold) work standalone. The Graph tier requires Hindsight for entity network reasoning.

## 4-Tier Memory Architecture

```
Hot (Session)  → In-memory context, current task state, active file list
                 Lifespan: current session only

Warm (Project) → MEMORY.md file + Hindsight retain (semantic indexing)
                 Lifespan: persists across sessions (git-tracked + semantic)

Cold (Archive) → docs/incidents/, docs/adr/, docs/fixes/ + Hindsight retain
                 Lifespan: permanent (git-tracked + semantic search)

Graph (Entity) → Hindsight entity network (relationships + reasoning)
                 Lifespan: evolving (grows as relationships are discovered)
```

### Memory Flow

```
Event (incident, fix, decision, lesson)
    │
    ├──► Hot tier: update session context (in-memory)
    ├──► Warm tier: append to MEMORY.md + Hindsight retain() (file + semantic)
    ├──► Cold tier: create incident/ADR document + Hindsight retain() (file + semantic)
    └──► Graph tier: Hindsight builds entity relationships automatically

Session Start
    │
    ├──► Read MEMORY.md (warm recall — file-based)
    ├──► Scan docs/incidents/ for recent issues (cold recall — file-based)
    ├──► Load anti-pattern registry (warm recall — file-based)
    └──► Hindsight sessionStartRecall() (4-strategy: semantic + BM25 + graph + temporal)

Periodic Reflect
    │
    └──► Hindsight reflect() — synthesize mental models from all memories
```

## Core Operations

| Operation | Purpose | Implementation |
|-----------|---------|---------------|
| **retain** | Store a memory for future sessions | Append to MEMORY.md or create incident doc |
| **recall** | Retrieve relevant memories at session start | Read MEMORY.md + scan cold storage |
| **reflect** | Synthesize patterns from accumulated memories | Periodically review MEMORY.md, extract principles |

## Warm Tier — MEMORY.md

The primary cross-session memory file. Git-tracked, human-readable, machine-parseable.

### Structure

```markdown
# Project Memory

## Anti-Patterns (NEVER repeat)

### AP-001: Wrangler config in monorepo root
- **Pattern**: Placing wrangler.json in repository root
- **Why it fails**: Hijacks all worker builds in the monorepo
- **Prevention**: Each worker has its own wrangler.json in its directory
- **Detected**: 2025-06-15
- **Fingerprint**: `a1b2c3d4`

### AP-002: Duplicate workflow triggers
- **Pattern**: Adding both `push` and `workflow_run` triggers to same workflow
- **Why it fails**: Causes email storms from duplicate runs
- **Prevention**: Use `workflow_run` only for deploy workflows
- **Detected**: 2025-07-01

## Decisions

### D-001: Hono over Express for API framework
- **Date**: 2025-05-01
- **Context**: Needed lightweight, type-safe HTTP framework
- **Decision**: Use Hono (built-in Zod validation, Cloudflare Workers compatible)
- **Alternatives rejected**: Express (no native types), Fastify (heavier)

## Lessons Learned

### L-001: Always verify deployment before reporting success
- **Date**: 2025-08-12
- **Context**: Reported CI fix as complete, but change wasn't deployed
- **Lesson**: Check production URL/health endpoint, not just CI status
```

### Retain Operation

```typescript
interface WarmMemoryEntry {
  type: "anti-pattern" | "decision" | "lesson";
  id: string; // AP-001, D-001, L-001
  title: string;
  content: string;
  date: string;
  fingerprint?: string; // SHA-256 for dedup
}

// Append to MEMORY.md
function retain(entry: WarmMemoryEntry): void {
  const section = {
    "anti-pattern": "## Anti-Patterns (NEVER repeat)",
    decision: "## Decisions",
    lesson: "## Lessons Learned",
  }[entry.type];

  const block = `
### ${entry.id}: ${entry.title}
- **Date**: ${entry.date}
${entry.content}
`;

  appendToSection("MEMORY.md", section, block);
}
```

### Recall Operation

```typescript
// At session start, read and parse MEMORY.md
function recall(): ProjectMemory {
  const content = readFile("MEMORY.md");

  return {
    antiPatterns: parseSection(content, "Anti-Patterns"),
    decisions: parseSection(content, "Decisions"),
    lessons: parseSection(content, "Lessons Learned"),
  };
}

// Before every commit, check anti-patterns
function checkAntiPatterns(
  changedFiles: string[],
  antiPatterns: AntiPattern[],
): Violation[] {
  const violations: Violation[] = [];
  for (const ap of antiPatterns) {
    if (ap.detection_command) {
      const result = exec(ap.detection_command);
      if (result.exitCode !== 0) {
        violations.push({ antiPattern: ap, evidence: result.stderr });
      }
    }
  }
  return violations;
}
```

## Cold Tier — Incident & Decision Documents

Structured documents in `docs/` for permanent archival.

### Incident Document Template

```markdown
# Incident: {title}

| Field | Value |
|-------|-------|
| **ID** | INC-{number} |
| **Date** | {date} |
| **Severity** | {critical/high/medium/low} |
| **Fingerprint** | `{sha256}` |
| **Service** | {service_name} |
| **Status** | Resolved |

## Summary
{2-3 sentences}

## Root Cause
{5 Whys analysis}

## Fix
{What changed, commit SHA}

## Prevention
{Systemic change to prevent recurrence}
```

### Architecture Decision Record (ADR) Template

```markdown
# ADR-{number}: {title}

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | {date} |
| **Decision Makers** | {who} |

## Context
{Why this decision was needed}

## Decision
{What was decided}

## Consequences
{Trade-offs accepted}
```

## Anti-Pattern Registry

A machine-readable index of all known anti-patterns for automated checking.

```typescript
interface AntiPattern {
  id: string; // AP-001
  pattern: string; // What the bad pattern looks like
  why_fails: string; // Why it causes problems
  prevention: string; // How to prevent it
  detection_command?: string; // CLI command to detect violation
  fingerprint: string; // SHA-256 for dedup
}

// Example registry
const antiPatterns: AntiPattern[] = [
  {
    id: "AP-001",
    pattern: "wrangler.json in monorepo root",
    why_fails: "Hijacks all worker builds",
    prevention: "Each worker has its own wrangler.json",
    detection_command: "test ! -f ./wrangler.json",
    fingerprint: "a1b2c3d4e5f6",
  },
  {
    id: "AP-002",
    pattern: "Duplicate push + workflow_run triggers",
    why_fails: "Email storms from duplicate workflow runs",
    prevention: "Use workflow_run only, never both",
    detection_command:
      'grep -rl "workflow_run" .github/workflows/ | xargs grep -l "push:"',
    fingerprint: "b2c3d4e5f6a1",
  },
];
```

## Session Lifecycle Integration

### Session Start

```
1. Read MEMORY.md → extract anti-patterns, decisions, lessons
2. Scan docs/incidents/ → find recent unresolved issues
3. Read .claude/failure-context.md → get CI/CD failure state
4. Inject all into agent context as "known context"
```

### During Session

```
1. After fixing an issue → retain() to warm tier
2. After resolving incident → create cold tier document
3. After architectural decision → create ADR document
4. Before every commit → check anti-patterns against changed files
```

### Session End

```
1. Summarize new entries added during session
2. Update MEMORY.md with any new anti-patterns discovered
3. Verify all incident documents are complete
```

## Reflect Operation — Periodic Synthesis

Periodically review accumulated memories to extract higher-order patterns:

```typescript
function reflect(memories: ProjectMemory): string[] {
  const insights: string[] = [];

  // Group anti-patterns by category
  const categories = groupBy(memories.antiPatterns, (ap) => ap.category);
  for (const [category, patterns] of Object.entries(categories)) {
    if (patterns.length >= 3) {
      insights.push(
        `Recurring issue in ${category}: ${patterns.length} anti-patterns. Consider systemic fix.`,
      );
    }
  }

  // Check for lessons that contradict decisions
  for (const lesson of memories.lessons) {
    const related = memories.decisions.filter((d) =>
      d.content.includes(lesson.topic),
    );
    if (related.length > 0) {
      insights.push(
        `Lesson "${lesson.title}" may require revisiting decision "${related[0].title}"`,
      );
    }
  }

  return insights;
}
```

## Principles

- **File-based persistence**: All memory is stored in git-tracked files. No external databases, no SaaS services, no Docker containers. Memory survives across sessions, machines, and team members via git.
- **Human-readable format**: MEMORY.md is Markdown. Anyone can read, edit, or search it. No binary formats, no proprietary schemas.
- **Fingerprint dedup**: Every anti-pattern and incident has a SHA-256 fingerprint. Duplicates are detected and escalated, not re-recorded.
- **Pre-commit checking**: Anti-patterns are checked automatically before commits. Known mistakes cannot recur without explicit override.
- **Graduated detail**: Hot tier is lightweight (session context). Warm tier is medium (MEMORY.md entries). Cold tier is detailed (full incident documents). Use the right level for the right memory.

## Anti-Patterns

- **External service dependency**: Memory that requires a running Docker container or SaaS service is fragile. If the service is down, the agent has amnesia. File-based memory is always available.
- **Unbounded growth**: MEMORY.md growing to 10,000 lines defeats the purpose. Archive old entries to cold tier periodically. Keep warm tier under 500 lines.
- **Stale anti-patterns**: Anti-patterns with no detection command are toothless. Every anti-pattern MUST have a detection mechanism.
- **Missing fingerprints**: Incidents without fingerprints cause duplicate entries. Always generate a fingerprint from the root cause description.
