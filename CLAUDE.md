# Code Engine — Claude Instructions

Portable AI Coding Engine for building enterprise-grade SaaS platforms.

## Quick Reference

```bash
pnpm test          # Run all tests
pnpm typecheck     # TypeScript type checking
pnpm init          # Bootstrap new project
pnpm build         # Build for distribution
```

## Architecture

- `core/` — Engine modules (memory, failure-pipeline, metrics, session, plugins, language-adapters)
- `skills/` — 61 domain skills (database, auth, billing, compliance, etc.)
- `examples/` — 41 industry examples with 9-dimension scoring
- `templates/` — Scaffolding templates for agents, hooks, skills, workflows
- `init/bootstrap.ts` — Project initialization script
- `cli.ts` — CLI entry point
- `config/` — Engine configuration

## Core Modules

| Module             | Purpose                                                          |
| ------------------ | ---------------------------------------------------------------- |
| `MemorySystem`     | 4-tier memory (hot/warm/cold/graph) with anti-pattern registry   |
| `HindsightAdapter` | Optional external memory provider (file-based memory is default) |
| `SessionManager`   | Parallel-universe prevention, file conflict detection            |
| `FailurePipeline`  | SHA-256 fingerprinting, dedup, severity escalation               |
| `MetricsCollector` | Self-observability, 30-entry rolling history                     |
| `PluginRegistry`   | Plugin lifecycle, skill/agent/hook registration                  |
| `LanguageAdapters` | TypeScript, Python, Go, Rust, Java support                       |

## Agent Memory

4-tier memory system (hot/warm/cold/graph). File-based tiers work standalone; Graph tier requires Hindsight.

- **Hot**: In-memory session context (current task state)
- **Warm**: `MEMORY.md` file + Hindsight retain (anti-patterns, decisions, lessons — git-tracked + semantic)
- **Cold**: `docs/incidents/`, `docs/adr/` + Hindsight (permanent archive — git-tracked + semantic)
- **Graph**: Hindsight entity network (relationships, reasoning, mental models — evolving)

File-based memory (hot/warm/cold) is the default and works standalone. The `HindsightAdapter` adds the Graph tier for cross-session relationship reasoning and mental model synthesis. See `skills/agent-memory.md` for patterns.

## Skill Registries

This engine has its OWN skill registry, separate from any host monorepo:

- **Engine registry**: `skills/skills-index.md` — portable, domain-agnostic skills
- **Engine rules**: `skills/skill-rules.json` — activation triggers for engine skills

When embedded in a monorepo (like IOF), the host project may have its own `.claude/skills/skill-rules.json` for project-specific rules. These are separate systems — the engine's skills are portable, the host's skills are project-specific.

## Standalone Usage

This engine is designed to be copied out of the IOF monorepo and used independently:

1. Copy `apps/code-engine/` to your project
2. Run `pnpm install` to install dependencies
3. Run `npx coding-engine init` to bootstrap
4. Customize skills, examples, and config for your domain
