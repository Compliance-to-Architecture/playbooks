# AI Chatbot Platform — Code Engine Example

> Built with the Coding Engine. Enterprise conversational AI platform.

## What This Builds

An enterprise AI chatbot platform for customer engagement and internal operations:

- Multi-channel deployment (web widget, mobile SDK, WhatsApp, Slack, Teams)
- Visual conversation flow builder (no-code)
- Intent recognition & entity extraction
- Knowledge base integration (FAQ, docs, product catalog)
- Live agent handoff with context preservation
- Multi-language support with auto-translation
- Conversation analytics & sentiment tracking
- A/B testing for conversation flows
- Webhook actions (CRM updates, ticket creation, order lookup)
- White-label embedding for SaaS customers

## Architecture

```
apps/
├── flow-builder/           # Visual conversation flow editor
├── analytics-dashboard/    # Conversation analytics & insights
├── agent-console/          # Live agent handoff workspace
├── widget-preview/         # Chat widget preview & customization
├── admin-portal/           # Platform admin (universal)

packages/
├── conversation-core/      # Conversation state machine & context
├── nlu-core/               # Intent classification & entity extraction
├── flow-engine-core/       # Visual flow execution engine
├── knowledge-core/         # FAQ & knowledge base search
├── channel-core/           # Multi-channel adapters (web, WhatsApp, Slack)
├── handoff-core/           # Live agent escalation & routing
├── translation-core/       # Multi-language support & auto-translation
├── analytics-core/         # Conversation metrics & sentiment analysis
├── widget-core/            # Embeddable chat widget SDK
├── ab-testing-core/        # Flow A/B testing & experiment tracking

services/
├── conversation-api/       # Conversation processing service
├── nlu-api/                # NLU inference service
├── channel-api/            # Channel webhook receivers
├── handoff-api/            # Live agent routing service
├── analytics-api/          # Analytics aggregation service
```

## Key Patterns

### Conversation State Machine

```typescript
// packages/conversation-core/src/state-machine.ts

interface ConversationState {
  sessionId: string;
  channelId: string;
  userId?: string;
  currentNodeId: string;
  context: Record<string, unknown>; // Extracted entities, user data
  history: Message[];
  metadata: {
    language: string;
    sentiment: number; // -1 to 1
    intentConfidence: number; // 0 to 1
    handedOff: boolean;
    agentId?: string;
  };
}

interface FlowNode {
  id: string;
  type:
    | "message"
    | "question"
    | "condition"
    | "action"
    | "ai_response"
    | "handoff"
    | "end";
  content?: string;
  // Question nodes
  options?: { label: string; value: string; nextNodeId: string }[];
  // Condition nodes
  conditions?: { expression: string; nextNodeId: string }[];
  // Action nodes (webhook, CRM, ticket)
  action?: { type: string; url: string; payload: Record<string, unknown> };
  // AI response nodes
  aiConfig?: {
    model: string;
    systemPrompt: string;
    knowledgeBaseId: string;
    maxTokens: number;
  };
  // Handoff nodes
  handoffConfig?: {
    department: string;
    priority: string;
    contextFields: string[];
  };
  // Default next
  nextNodeId?: string;
}

async function processMessage(
  state: ConversationState,
  message: string,
  flow: FlowNode[],
): Promise<{ response: string; newState: ConversationState }> {
  const currentNode = flow.find((n) => n.id === state.currentNodeId)!;

  switch (currentNode.type) {
    case "ai_response": {
      const context = await searchKnowledgeBase(
        currentNode.aiConfig!.knowledgeBaseId,
        message,
      );
      const response = await generateResponse(
        message,
        context,
        currentNode.aiConfig!,
      );
      return {
        response,
        newState: { ...state, currentNodeId: currentNode.nextNodeId! },
      };
    }
    case "question": {
      const matched = currentNode.options?.find((o) =>
        message.toLowerCase().includes(o.value.toLowerCase()),
      );
      const nextId = matched?.nextNodeId ?? currentNode.nextNodeId!;
      return { response: "", newState: { ...state, currentNodeId: nextId } };
    }
    case "handoff": {
      await escalateToAgent(state, currentNode.handoffConfig!);
      return {
        response: "Connecting you with a live agent...",
        newState: {
          ...state,
          metadata: { ...state.metadata, handedOff: true },
        },
      };
    }
    default:
      return {
        response: currentNode.content ?? "",
        newState: { ...state, currentNodeId: currentNode.nextNodeId! },
      };
  }
}
```

### Multi-Channel Adapter

```typescript
// packages/channel-core/src/adapter.ts

interface ChannelAdapter {
  name: string;
  receiveMessage(rawPayload: unknown): IncomingMessage;
  sendMessage(sessionId: string, message: OutgoingMessage): Promise<void>;
  sendTypingIndicator(sessionId: string): Promise<void>;
  getCapabilities(): ChannelCapabilities;
}

interface ChannelCapabilities {
  richText: boolean;
  buttons: boolean;
  images: boolean;
  carousels: boolean;
  quickReplies: boolean;
  fileUpload: boolean;
  location: boolean;
}

const adapters: Record<string, ChannelAdapter> = {
  web: new WebWidgetAdapter(),
  whatsapp: new WhatsAppAdapter(),
  slack: new SlackAdapter(),
  teams: new TeamsAdapter(),
  sms: new TwilioSMSAdapter(),
};
```

## Data Stack

- **PostgreSQL** — Conversations, flows, users, knowledge bases
- **Redis** — Session state, typing indicators, real-time pub/sub
- **pgvector** — Knowledge base embeddings for semantic search
- **ClickHouse** — Conversation analytics, sentiment time-series
- **S3/R2** — File attachments, conversation exports

## Compliance Standards

| Standard      | Requirements                                         |
| ------------- | ---------------------------------------------------- |
| **SOC2**      | Access controls, data encryption, audit trails       |
| **GDPR**      | Consent collection, data retention, right to erasure |
| **CCPA**      | Consumer data rights, opt-out mechanisms             |
| **EU AI Act** | AI disclosure, human oversight requirements          |
| **PCI DSS**   | Masking card data in conversations                   |

## Getting Started

```bash
npx coding-engine init --domain ai-chatbot --name "ChatGenius" --compliance "SOC2,GDPR"
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

## Billing & Monetization

### Subscription Tiers

| Tier           | Limits                                                                            | Price      |
| -------------- | --------------------------------------------------------------------------------- | ---------- |
| **Free**       | 1,000 API calls/month, 1 user, community support                                  | $0/month   |
| **Pro**        | 50,000 API calls/month, 10 users, email support, analytics                        | $49/month  |
| **Business**   | 500,000 API calls/month, unlimited users, priority support, SSO, audit logs       | $199/month |
| **Enterprise** | Unlimited, dedicated infrastructure, SLA, compliance reports, custom integrations | Custom     |

### Usage Metering

All API calls are metered via Stripe Usage Records:

```typescript
await stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
  quantity: 1,
  timestamp: Math.floor(Date.now() / 1000),
  action: "increment",
});
```

### Billing Events

| Event                    | Trigger         | Action                             |
| ------------------------ | --------------- | ---------------------------------- |
| `subscription.created`   | New signup      | Provision tenant resources         |
| `subscription.updated`   | Plan change     | Adjust resource limits             |
| `subscription.deleted`   | Cancellation    | Schedule data retention + cleanup  |
| `invoice.payment_failed` | Payment failure | Grace period → downgrade → suspend |
| `usage_record.created`   | API call        | Increment usage counter            |
