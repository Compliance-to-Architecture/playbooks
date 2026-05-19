# SWE Agent Patterns Skill

> **Enforcement**: suggest
> **Triggers**: agent, middleware, sandbox, subagent, coding-agent, swe-agent, autonomous, orchestration
> **Pattern**: reference (patterns catalog)

Patterns for building and operating autonomous software engineering agents. Covers middleware hooks, context engineering, sandbox isolation, multi-surface invocation, and subagent orchestration. These are first-party engine patterns — implement them directly, no external dependencies.

## Context Engineering

### AGENTS.md / CLAUDE.md Convention

Every repository MUST have a machine-readable instruction file that agents consume on task start:

```markdown
# AGENTS.md (or CLAUDE.md)

## Repository Conventions
- Language: TypeScript 5.7+ strict mode
- Package manager: pnpm 9.x
- Testing: vitest for unit, playwright for e2e

## Before Committing
1. Run `pnpm format:check`
2. Run `pnpm typecheck`
3. Run `pnpm lint`
4. Run `pnpm test`

## Architecture Decisions
- All APIs use Hono framework
- All database access through Prisma
- Multi-tenant: every query scoped by tenantId
```

**Why it matters**: Agents that receive repo conventions upfront make 60% fewer mistakes than agents that discover conventions by trial and error.

### Source Context Injection

When an agent receives a task from an external surface (issue, PR comment, Slack thread), inject the FULL source context before the agent starts working:

```typescript
interface AgentTaskContext {
  // The task itself
  task_description: string;

  // Full source context (don't make the agent discover these)
  source_context: {
    issue_body?: string;         // Full issue description
    pr_diff?: string;            // Full PR diff if addressing review
    thread_history?: string[];   // Full Slack/chat thread
    related_issues?: string[];   // Linked issues
  };

  // Repository conventions
  repo_conventions: string;      // Contents of AGENTS.md/CLAUDE.md

  // Recent failures (if any)
  failure_context?: string;      // From failure-inbox
}
```

**Principle**: Inject context upfront. Discovery is expensive and error-prone.

## Middleware Pattern

Middleware wraps the agent loop with deterministic hooks that execute regardless of agent behavior. This provides safety nets and consistency guarantees.

### Middleware Types

| Type | When It Runs | Purpose |
|------|-------------|---------|
| **Pre-model** | Before each LLM call | Inject queued messages, check budget |
| **Post-model** | After each LLM call | Log decisions, check safety |
| **Pre-tool** | Before tool execution | Validate parameters, check permissions |
| **Post-tool** | After tool execution | Log results, track file changes |
| **On-error** | On any error | Graceful recovery, fallback actions |
| **On-complete** | When agent finishes | Ensure PR created, notify stakeholders |

### Implementing Middleware

```typescript
// Middleware that ensures a PR is always created, even if the agent forgets
const ensurePrMiddleware = {
  name: "ensure-pr-created",
  phase: "on-complete",
  execute: async (context: AgentContext) => {
    if (context.files_changed.length > 0 && !context.pr_created) {
      await createPullRequest({
        title: `fix: ${context.task_summary}`,
        body: context.generatePrBody(),
        branch: context.branch_name,
      });
    }
  },
};

// Middleware that absorbs follow-up messages during execution
const messageQueueMiddleware = {
  name: "check-message-queue",
  phase: "pre-model",
  execute: async (context: AgentContext) => {
    const queued = await context.message_queue.drain();
    if (queued.length > 0) {
      context.inject_messages(queued);
    }
  },
};

// Middleware that tracks file modifications for build verification
const fileTrackerMiddleware = {
  name: "track-file-changes",
  phase: "post-tool",
  execute: async (context: AgentContext, toolResult: ToolResult) => {
    if (toolResult.tool === "edit" || toolResult.tool === "write") {
      context.files_changed.add(toolResult.file_path);
      context.affected_packages.add(getPackageFromPath(toolResult.file_path));
    }
  },
};
```

### Hook Implementation

These middleware patterns map to Claude Code hooks:

| Middleware Pattern | Implementation | Location |
|-------------------|---------------|----------|
| Pre-model skill injection | `skill-activation-prompt` hook (UserPromptSubmit) | `.claude/hooks/` |
| PR creation safety net | `auto-merge.yml` workflow (on-complete) | `.github/workflows/` |
| Tool error handling | `post-tool-use-tracker` hook (PostToolUse) | `.claude/hooks/` |
| File change tracking | `post-tool-use-tracker` hook (PostToolUse) | `.claude/hooks/` |

## Sandbox Isolation

### Principle

Every agent task runs in an isolated environment. One task cannot affect another task's filesystem, processes, or network state.

### Isolation Levels

| Level | Mechanism | Use Case |
|-------|-----------|----------|
| **Process** | Separate Node.js process | Unit test runs, lint checks |
| **Container** | Docker container per task | Build tasks, integration tests |
| **VM/Sandbox** | Full VM or cloud sandbox | Untrusted code, security audits |
| **Worktree** | Git worktree per branch | Parallel branch development |

### IOF Implementation

```bash
# Git worktree isolation (preferred for parallel tasks)
git worktree add ../iof-task-123 -b claude/fix-issue-123 main
cd ../iof-task-123 && claude --worktree

# Docker isolation (for build/test tasks)
docker run --rm -v $(pwd):/workspace -w /workspace node:22-slim pnpm test

# Cloudflare Workers sandbox (for code execution)
# Uses @cloudflare/codemode DynamicWorkerExecutor
```

## Multi-Surface Invocation

### Pattern

Agents should be invokable from multiple surfaces without changing core logic:

| Surface | Trigger | Context Source |
|---------|---------|---------------|
| **GitHub Issue** | `@agent` mention in issue | Issue body + comments |
| **GitHub PR** | `@agent` mention in PR comment | PR diff + review comments |
| **Slack** | `@agent` mention in thread | Thread history |
| **CLI** | `claude` command | Local files + stdin |
| **CI/CD** | Workflow failure event | Failure bundle JSON |
| **Linear** | `@agent` mention on ticket | Ticket description + comments |

### Unified Task Interface

```typescript
interface AgentTask {
  id: string;
  source: "github_issue" | "github_pr" | "slack" | "cli" | "ci" | "linear";
  repository: string;
  branch?: string;

  // Normalized context (same shape regardless of source)
  title: string;
  description: string;
  context_messages: string[];

  // Metadata
  author: string;
  priority: "critical" | "high" | "medium" | "low";
  labels: string[];
}
```

## Subagent Orchestration

### When to Use Subagents

- Task has independent subtasks that can run in parallel
- Task requires different expertise (security review + code fix)
- Task scope is too large for a single agent context window

### Pattern

```typescript
// Parent agent decomposes task and spawns subagents
const subtasks = decompose(task);

const results = await Promise.all(
  subtasks.map((subtask) =>
    spawnSubagent({
      type: subtask.agent_type,  // "code-reviewer", "security-reviewer", etc.
      task: subtask,
      isolation: "worktree",     // Each subagent gets its own worktree
      timeout_ms: 300_000,       // 5 minute timeout per subtask
    })
  )
);

// Parent agent synthesizes results
const synthesis = synthesize(results);
```

### IOF Agent Types for Subagent Spawning

| Agent Type | Purpose | Tools |
|-----------|---------|-------|
| `architect` | System design decisions | Read, Glob, Grep, WebSearch |
| `code-reviewer` | Code quality review | Read, Glob, Grep |
| `security-reviewer` | Security audit | Read, Glob, Grep, WebSearch |
| `rails-api-specialist` | API development | Read, Glob, Grep, Edit |
| `build-error-resolver` | Build error fixing | Read, Glob, Grep, Bash |
| `auto-error-resolver` | TypeScript error fixing | Read, Write, Edit, Bash, Glob, Grep |

## Tool Curation

### Principle: Fewer Tools, Better Results

> "Tool curation matters more than tool quantity."

Agents perform better with 10-15 well-chosen tools than with 50+ tools that overlap in functionality.

### Core Tool Categories

| Category | Tools | Why |
|----------|-------|-----|
| **Execution** | Shell, Bash | Run commands, scripts, tests |
| **Files** | Read, Write, Edit, Glob, Grep | File operations |
| **Web** | WebFetch, WebSearch | External information |
| **Version Control** | Git (via Bash) | Commits, branches, PRs |
| **Communication** | GitHub API (via `gh`) | Issues, PRs, comments |

### Anti-Pattern: Tool Sprawl

Adding tools for every possible action fragments the agent's attention and increases hallucination risk. Before adding a new tool, verify:

1. Can an existing tool do this? (Bash can do most things)
2. Will the agent use it correctly? (Complex tools need examples)
3. Is the safety boundary clear? (What can go wrong?)

## Principles

- **Context over discovery**: Inject known information upfront. Don't make agents search for what you already know.
- **Middleware as safety net**: Deterministic hooks catch what non-deterministic agents miss. Every critical action has a middleware backstop.
- **Isolation by default**: Every task runs in its own sandbox. Cross-task contamination is an engineering defect.
- **Fewer, better tools**: 15 curated tools outperform 50 generic ones. Quality of tool descriptions > quantity of tools.
- **Multi-surface, single logic**: The same agent logic handles tasks from any invocation surface. Adapter layer normalizes context.

## Anti-Patterns

- **Tool sprawl**: Adding a new tool for every capability fragments agent attention. Use Bash + existing tools first.
- **Discovery-first**: Making agents discover repo conventions by reading files wastes tokens and causes errors. Inject AGENTS.md upfront.
- **Shared sandbox**: Running multiple tasks in the same environment causes file conflicts and race conditions.
- **Fire-and-forget**: Spawning an agent without middleware to ensure PR creation or notification leaves tasks incomplete.
- **Monolithic agents**: One agent doing everything hits context limits. Decompose into subagents for parallel work.

## References

- Claude Code Agent SDK — Native subagent spawning
- Claude Code Hooks — Pre/post tool middleware
- Git Worktree — Filesystem isolation for parallel tasks
