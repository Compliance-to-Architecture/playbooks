# AI Agent Platform — Code Engine Example

> Built with the Coding Engine. Multi-agent orchestration platform.

## What This Builds

An enterprise AI agent orchestration platform with:

- Agent marketplace (discover, deploy, manage AI agents)
- Multi-model support (Claude, GPT, Gemini, local LLMs)
- Tool/MCP server registry
- Agent memory & knowledge graphs
- Real-time agent monitoring & observability
- Agent-to-agent communication protocols
- Human-in-the-loop approval workflows
- Usage metering & billing per agent execution
- Enterprise SSO & RBAC for agent access

## Architecture

```
apps/
├── agent-studio/           # Agent builder & visual workflow editor (Next.js)
├── agent-marketplace/      # Discover & deploy pre-built agents
├── monitoring-dashboard/   # Real-time agent execution monitoring
├── admin-portal/           # Platform admin (universal)
├── billing-dashboard/      # Usage metering per agent (universal)
├── developer-portal/       # API docs for agent SDK

packages/
├── agent-runtime-core/     # Agent execution engine
├── agent-memory-core/      # Knowledge graph + vector store
├── agent-tools-core/       # Tool registry & MCP integration
├── agent-comms-core/       # Agent-to-agent messaging protocol
├── model-router-core/      # Multi-model routing (Claude, GPT, Gemini)
├── workflow-core/          # Visual workflow execution engine
├── hitl-core/              # Human-in-the-loop approval gates
├── prompt-core/            # Prompt management & versioning
├── eval-core/              # Agent evaluation & benchmarking
├── sandbox-core/           # Sandboxed code execution
├── billing-core/           # Usage metering (universal)
├── auth-core/              # Auth + RBAC (universal)
├── tenant-core/            # Multi-tenancy (universal)

services/
├── agent-api/              # Agent CRUD & execution API
├── runtime-api/            # Agent runtime orchestration
├── memory-api/             # Knowledge graph queries
├── eval-api/               # Evaluation & benchmarking service
├── marketplace-api/        # Agent marketplace service
```

## Key Features

### Agent Runtime Engine

```typescript
// packages/agent-runtime-core/src/runtime.ts

interface AgentConfig {
  id: string;
  name: string;
  model: "claude-opus" | "claude-sonnet" | "gpt-4o" | "gemini-2.5";
  systemPrompt: string;
  tools: ToolDefinition[];
  memory: MemoryConfig;
  maxIterations: number;
  timeout_ms: number;
  approvalGates: ApprovalGate[];
}

class AgentRuntime {
  async execute(config: AgentConfig, input: string): Promise<AgentResult> {
    const session = await this.createSession(config);

    for (let i = 0; i < config.maxIterations; i++) {
      const response = await this.callModel(config.model, {
        system: config.systemPrompt,
        messages: session.messages,
        tools: config.tools,
      });

      // Check if tool call needs human approval
      if (response.toolCalls?.length) {
        for (const call of response.toolCalls) {
          if (this.requiresApproval(call, config.approvalGates)) {
            await this.requestApproval(session.id, call);
          }
        }
      }

      // Record to memory
      await this.memory.record(session.id, response);

      // Check completion
      if (response.done) break;

      // Meter usage
      await this.meter.record({
        agentId: config.id,
        tokens: response.usage.totalTokens,
        toolCalls: response.toolCalls?.length ?? 0,
      });
    }

    return session.result;
  }
}
```

### Agent-to-Agent Communication

```typescript
// packages/agent-comms-core/src/protocol.ts

interface AgentMessage {
  from: string; // Agent ID
  to: string; // Target agent ID
  type: "request" | "response" | "broadcast";
  payload: unknown;
  replyTo?: string; // For response correlation
  ttl: number; // Max hops
}

// Agent A delegates a subtask to Agent B
await agentComms.send({
  from: "research-agent",
  to: "data-analysis-agent",
  type: "request",
  payload: { task: "Analyze Q4 sales data", data: salesData },
  ttl: 3,
});
```

## Compliance Standards

| Standard   | Requirements                                               |
| ---------- | ---------------------------------------------------------- |
| **SOC2**   | Audit trails on all agent executions, data access controls |
| **GDPR**   | Data minimization in agent memory, right to erasure        |
| **AI Act** | Transparency, human oversight, risk classification         |

## Key Integrations

- **Anthropic API** — Claude models (Opus, Sonnet, Haiku)
- **OpenAI API** — GPT-4o, o1
- **Google AI** — Gemini 2.5
- **Ollama** — Local LLM deployment
- **Cognee** — Knowledge graph for agent memory
- **Stripe** — Per-execution usage billing
- **Cloudflare Workers** — Edge agent deployment

## Getting Started

```bash
npx coding-engine init --domain ai-agents --name "AgentHub" --compliance "SOC2,GDPR"
```

## Health & Readiness Endpoints

Every service MUST expose structured health check endpoints:

| Endpoint              | Purpose         | Response                                                                                   |
| --------------------- | --------------- | ------------------------------------------------------------------------------------------ |
| `GET /health`         | Liveness probe  | `{ "status": "ok", "service": "<name>", "version": "<semver>", "timestamp": "<ISO>" }`     |
| `GET /health/ready`   | Readiness probe | `{ "status": "ready", "dependencies": { "database": "connected", "cache": "connected" } }` |
| `GET /health/startup` | Startup probe   | `{ "status": "started", "uptime_seconds": 42 }`                                            |

### Implementation Pattern

```typescript
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: config.serviceName,
    version: config.version,
    timestamp: new Date().toISOString(),
  });
});

app.get("/health/ready", async (c) => {
  const db = await checkDatabase();
  const cache = await checkCache();
  const status = db && cache ? "ready" : "degraded";
  return c.json(
    {
      status,
      dependencies: {
        database: db ? "connected" : "disconnected",
        cache: cache ? "connected" : "disconnected",
      },
    },
    status === "ready" ? 200 : 503,
  );
});
```

Health checks are consumed by:

- **Kubernetes**: liveness/readiness/startup probes
- **AWS ECS**: container health checks
- **Load balancers**: target group health checks
- **Monitoring**: uptime dashboards and alerting

## Failure Fingerprinting & Incident Response

All errors produce structured, machine-readable JSON with fingerprints for deduplication:

### Error Schema

```typescript
interface StructuredError {
  fingerprint: string; // SHA-256 hash for deduplication
  severity: "critical" | "high" | "medium" | "low";
  service: string;
  environment: string;
  message: string;
  stack_trace: string;
  timestamp: string;
  request_id: string;
  trace_id: string;
  context: Record<string, unknown>;
  cause_chain: string[];
}
```

### Fingerprint Generation

```typescript
import { createHash } from "crypto";

function generateFingerprint(error: Error, service: string): string {
  const normalized = `${service}:${error.constructor.name}:${error.message.replace(/[0-9a-f-]{36}/g, "<UUID>")}`;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
```

### Incident Response Pipeline

1. **Detection**: Error captured by structured logger → fingerprinted
2. **Deduplication**: Same fingerprint within 24h window → increment counter (no duplicate alerts)
3. **Escalation**: 3+ occurrences of same fingerprint → escalate to `critical` severity
4. **Fix PR**: Auto-generated fix branch `fix/<service>/<fingerprint>` with context bundle
5. **Verification**: CI validates fix → auto-merge if tests pass
6. **Resolution**: Fingerprint marked resolved, added to known-issues registry

## Anti-Pattern Prevention & Memory

### Never Repeat Mistakes

Every session MUST check `MEMORY.md` before starting work. Known anti-patterns are engineering defects if repeated:

```bash
# Session start — mandatory
cat .claude/memory/MEMORY.md 2>/dev/null || echo "No memory file — create one"
```

### Known Anti-Patterns Registry

| Anti-Pattern                | Prevention                                      | Detection                                       |
| --------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| Mock data in production     | Zero Mock Data policy — all data from real APIs | `grep -r "mockData\|MOCK_\|fakeName" src/`      |
| Hardcoded secrets           | Environment variables + secret manager          | `grep -r "sk_live\|password.*=.*['\"]" src/`    |
| Missing health endpoints    | Health check middleware on every service        | CI check: every service has `/health` route     |
| Orphan files after refactor | Delete old files in same commit as new          | `codemap refs` — unreferenced files = orphans   |
| Duplicate implementations   | One canonical implementation per feature        | `codemap where <symbol>` — multiple = duplicate |
| Cascading workflow triggers | Max depth 2 for workflow chains                 | Audit `workflow_run` triggers quarterly         |

### Memory File Template

```markdown
# MEMORY.md — Project Memory

## Resolved Issues

<!-- Each resolved issue with root cause and fix -->

## Known Anti-Patterns

<!-- Patterns that caused incidents — NEVER repeat -->

## Architectural Decisions

<!-- Key decisions with rationale (link to ADRs) -->

## Lessons Learned

<!-- Session-by-session learnings -->
```

### Incident Documentation

Every production incident generates a document:

```
docs/incidents/
├── YYYY-MM-DD-<short-description>.md
└── INCIDENT_TEMPLATE.md
```

Each incident includes: root cause analysis, fix applied, prevention steps, fingerprint for future detection.
