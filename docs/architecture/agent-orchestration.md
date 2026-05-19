# Agent Orchestration

How AI agents autonomously build, fix, deploy, and learn in the IOF Code Engine.

## Agent Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLAUDE CODE (Primary)                  │
│  Model: Claude Opus 4.6 │ Context: 200K tokens          │
│  Tools: 40+ │ MCP Servers: 16 │ Skills: 25+             │
├─────────────────────────────────────────────────────────┤
│                    SUB-AGENTS (16 Specialized)            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │architect │ │rails-api │ │code-     │ │security- │   │
│  │          │ │specialist│ │reviewer  │ │reviewer  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │build-err │ │frontend- │ │refactor- │ │islamic-  │   │
│  │resolver  │ │err-fixer │ │cleaner   │ │finance   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │planner   │ │integrator│ │tdd-      │ │stripe-   │   │
│  │          │ │          │ │reviewer  │ │metering  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │obp-api   │ │doc-      │ │web-      │ │auto-err- │   │
│  │specialist│ │updater   │ │research  │ │resolver  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
├─────────────────────────────────────────────────────────┤
│                    SKILL ACTIVATION ENGINE                │
│  skill-rules.json → Hook → Match → Suggest/Block        │
│  promptTriggers (keywords+regex) │ fileTriggers (paths)  │
│  Enforcement: block │ suggest │ warn                     │
├─────────────────────────────────────────────────────────┤
│                    MCP SERVERS (16 Connected)             │
│  GitHub │ AWS │ Cloudflare │ Stripe │ PostgreSQL │ Redis │
│  Meilisearch │ Docker │ Grafana │ Sentry │ Axiom │ ...  │
└─────────────────────────────────────────────────────────┘
```

## The RALPH Loop (Autonomous Development)

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  READ    │────▶│ ANALYZE  │────▶│   LIST   │
│  PRD/Task│     │ Codebase │     │  Tasks   │
└──────────┘     └──────────┘     └──────┬───┘
                                         │
┌──────────┐     ┌──────────┐     ┌──────┴───┐
│ HARDCODE │◀────│ EXECUTE  │◀────│   PLAN   │
│ NOTHING  │     │ + Verify │     │  Approach│
└──────────┘     └──────────┘     └──────────┘
       │
       ▼
  Check exit conditions:
    - STATUS: COMPLETE?
    - EXIT_SIGNAL: true?
    - Circuit breaker (3+ stuck iterations)?
       │
       ▼
  [LOOP or EXIT]
```

## Failure Inbox (Self-Healing)

```
CI/CD Failure
    │
    ▼
┌──────────────────┐     ┌──────────────────┐
│ failure-collector│────▶│ Fingerprint      │
│ .yml             │     │ (SHA256 dedupe)  │
└──────────────────┘     └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │ Check: existing  │
                         │ fix PR?          │
                         └────────┬─────────┘
                                  │
                         No ──────┤──────── Yes → Skip
                                  │
                                  ▼
                         ┌──────────────────┐
                         │ fixer.yml        │
                         │ Claude generates │
                         │ fix PR           │
                         └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │ CI validates     │
                         │ Auto-merge       │
                         └──────────────────┘
```

## Skill Activation Flow

```
User Prompt: "Add a new sukuk rail"
    │
    ▼
skill-activation-prompt.sh (UserPromptSubmit hook)
    │
    ▼
skill-rules.json evaluation:
    ├── "sukuk" keyword → islamic-finance skill (BLOCK: must use)
    ├── "rail" keyword → rails-api skill (suggest)
    └── "add" intent → codemap skill (suggest)
    │
    ▼
Skills loaded into context BEFORE agent responds
    │
    ▼
Agent builds with Shariah compliance guardrails enforced
```

## Agent Delegation Patterns

### Parallel Exploration

```
Primary Agent receives task: "Fix all TypeScript errors"
    │
    ├──▶ Agent: build-error-resolver (scan services/)
    ├──▶ Agent: auto-error-resolver (scan packages/)
    └──▶ Agent: frontend-error-fixer (scan apps/)
    │
    ▼
Results merged → Primary applies coordinated fixes
```

### Sequential Pipeline

```
Primary Agent receives task: "Add new payment rail"
    │
    ├── Step 1: planner → Design rail architecture
    ├── Step 2: rails-api-specialist → Implement rail
    ├── Step 3: islamic-finance-expert → Shariah review
    ├── Step 4: tdd-reviewer → Generate tests
    ├── Step 5: code-reviewer → Code quality review
    └── Step 6: integrator → Deploy and verify
```

### Guardrail Enforcement

```
Any code change touching contracts-core:
    │
    ▼
islamic-finance skill (enforcement: BLOCK)
    │
    ├── Verify shariahGovernance field present
    ├── Verify AAOIFI standards compliance
    ├── Verify boardApproval structure
    └── Verify fatwahReference included
    │
    ▼
Proceed ONLY if all checks pass
```

## Memory Architecture (Four Tiers + Hindsight)

| Tier      | Storage                       | Lifetime        | Purpose                      |
| --------- | ----------------------------- | --------------- | ---------------------------- |
| **Hot**   | Session context (200K tokens) | Current session | Active task state            |
| **Warm**  | MEMORY.md + Hindsight retain  | Persistent      | Lessons learned, patterns    |
| **Cold**  | docs/incidents/ + Hindsight   | Permanent       | Incident reports, ADRs       |
| **Graph** | Hindsight entity network      | Evolving        | Relationships, mental models |

### Hindsight Reinforced Learning Loop

```
┌──────────────────────────────────────────────────────────────┐
│                  REINFORCED LEARNING LOOP                      │
│                                                                │
│  1. RETAIN ──▶ Every warm/cold write auto-retains to          │
│                Hindsight (facts, entities, graph edges)        │
│                                                                │
│  2. RECALL ──▶ Session start runs session-recall:             │
│                • Known anti-patterns                          │
│                • Recent incidents + resolutions                │
│                • Coding conventions + decisions                │
│                                                                │
│  3. REFLECT ─▶ Periodic synthesis (configurable interval):    │
│                • Mental models from all accumulated memories  │
│                • Patterns, opinions, observations             │
│                                                                │
│  4. APPLY ───▶ Agent uses recalled context to:                │
│                • Avoid repeating past mistakes                │
│                • Follow established conventions               │
│                • Apply learned fix patterns                    │
│                                                                │
│  5. LEARN ───▶ New session outcomes retained → loop continues │
└──────────────────────────────────────────────────────────────┘
```

### CLI Memory Commands

```bash
coding-engine recall "what anti-patterns exist?"   # Query memories
coding-engine reflect "summarize principles"        # Synthesize insights
coding-engine session-recall                        # Full session context
```

## MCP Server Integration

Each MCP server provides direct tool access:

| Server     | Tools Available                               | Use Case                  |
| ---------- | --------------------------------------------- | ------------------------- |
| GitHub     | create_pr, merge_pr, list_issues, search_code | Code lifecycle            |
| AWS        | ecs_describe, ssm_get, s3_list                | Infrastructure management |
| Cloudflare | workers_deploy, pages_deploy, kv_get          | Edge deployment           |
| Stripe     | create_customer, list_invoices                | Billing operations        |
| PostgreSQL | query, migrate                                | Database operations       |
| Redis      | get, set, pub/sub                             | Cache operations          |
| Docker     | build, push, inspect                          | Container management      |

## How to Adapt Agent Orchestration for Your Platform

1. **Keep the 16-agent pattern** — rename agents for your domain
2. **Keep skill-rules.json** — update triggers for your domain keywords
3. **Keep hooks** — they are domain-agnostic automation
4. **Keep MCP servers** — add/remove based on your infrastructure
5. **Keep the RALPH loop** — it works for any autonomous development
6. **Keep the failure inbox** — self-healing is universally valuable
7. **Add domain guardrails** — create BLOCK-enforcement skills for your compliance needs
8. **Start Hindsight** — `docker run ghcr.io/vectorize-io/hindsight:latest` for persistent agent memory
9. **Configure memory bank** — set `agentMemory.hindsight.bankId` to your project name in config
