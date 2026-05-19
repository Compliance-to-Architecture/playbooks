# RAG Platform — Code Engine Example

> Built with the Coding Engine. Enterprise Retrieval-Augmented Generation.

## What This Builds

An enterprise RAG (Retrieval-Augmented Generation) platform for AI-powered knowledge systems:

- Multi-source document ingestion (PDF, DOCX, HTML, Confluence, Notion, Slack)
- Intelligent chunking with semantic boundaries
- Vector embeddings with multiple model support
- Hybrid search (semantic + keyword + reranking)
- Citation-grounded AI responses
- Conversational memory with context window management
- Knowledge base management with access controls
- Evaluation framework (faithfulness, relevance, groundedness)
- Hallucination detection & prevention
- Multi-tenant knowledge isolation

## Architecture

```
apps/
├── knowledge-portal/       # Knowledge base management & search
├── chat-interface/         # Conversational RAG chat UI
├── admin-dashboard/        # Ingestion monitoring, analytics
├── eval-studio/            # RAG evaluation & quality metrics
├── admin-portal/           # Platform admin (universal)

packages/
├── ingestion-core/         # Document parsing, chunking, metadata extraction
├── embedding-core/         # Vector embedding generation (multi-model)
├── retrieval-core/         # Hybrid search, reranking, filtering
├── generation-core/        # LLM orchestration, prompt engineering
├── citation-core/          # Source attribution & citation tracking
├── memory-core/            # Conversation history & context management
├── eval-core/              # RAG evaluation metrics (RAGAS framework)
├── guardrails-core/        # Hallucination detection, safety filters
├── knowledge-base-core/    # KB management, access control, versioning
├── connector-core/         # Source connectors (Confluence, Notion, S3, etc.)

services/
├── ingestion-api/          # Document ingestion pipeline
├── search-api/             # Hybrid search & retrieval service
├── chat-api/               # Conversational RAG service
├── eval-api/               # Evaluation & metrics service
├── embedding-api/          # Embedding generation service
```

## Key Patterns

### Intelligent Chunking Pipeline

```typescript
// packages/ingestion-core/src/chunker.ts

interface ChunkingConfig {
  strategy: "fixed" | "semantic" | "recursive" | "document_structure";
  maxChunkSize: number; // tokens
  overlapSize: number; // tokens
  respectBoundaries: boolean; // Don't split mid-sentence
}

interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  metadata: {
    source: string;
    page?: number;
    section?: string;
    headingHierarchy: string[];
    chunkIndex: number;
    totalChunks: number;
  };
  embedding?: number[];
  tokenCount: number;
}

async function ingestDocument(
  doc: RawDocument,
  config: ChunkingConfig,
): Promise<DocumentChunk[]> {
  // 1. Parse document (PDF → text, DOCX → markdown, etc.)
  const parsed = await parseDocument(doc);

  // 2. Extract structural metadata (headings, sections, tables)
  const structure = extractStructure(parsed);

  // 3. Chunk with semantic awareness
  const chunks = chunkDocument(parsed.content, {
    ...config,
    sections: structure.sections,
  });

  // 4. Generate embeddings in batch
  const embeddings = await generateEmbeddings(chunks.map((c) => c.content));

  // 5. Return enriched chunks
  return chunks.map((chunk, i) => ({
    ...chunk,
    embedding: embeddings[i],
    tokenCount: countTokens(chunk.content),
  }));
}
```

### Hybrid Search with Reranking

```typescript
// packages/retrieval-core/src/search.ts

interface SearchResult {
  chunkId: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
  source: "semantic" | "keyword" | "hybrid";
}

async function hybridSearch(
  query: string,
  knowledgeBaseId: string,
  options: { topK: number; semanticWeight: number; keywordWeight: number },
): Promise<SearchResult[]> {
  // 1. Semantic search (vector similarity)
  const queryEmbedding = await embed(query);
  const semanticResults = await vectorSearch(
    queryEmbedding,
    knowledgeBaseId,
    options.topK * 2,
  );

  // 2. Keyword search (BM25)
  const keywordResults = await bm25Search(
    query,
    knowledgeBaseId,
    options.topK * 2,
  );

  // 3. Reciprocal Rank Fusion (RRF) to merge results
  const fused = reciprocalRankFusion(
    semanticResults,
    keywordResults,
    options.semanticWeight,
    options.keywordWeight,
  );

  // 4. Cross-encoder reranking for precision
  const reranked = await crossEncoderRerank(
    query,
    fused.slice(0, options.topK * 2),
  );

  return reranked.slice(0, options.topK);
}
```

### RAG Evaluation Framework

```typescript
// packages/eval-core/src/metrics.ts

interface RAGEvaluation {
  query: string;
  response: string;
  contexts: string[];
  metrics: {
    faithfulness: number; // 0-1: Is the answer grounded in context?
    relevance: number; // 0-1: Is the answer relevant to the query?
    groundedness: number; // 0-1: Are claims supported by sources?
    contextPrecision: number; // 0-1: Are retrieved contexts relevant?
    contextRecall: number; // 0-1: Are all needed contexts retrieved?
    answerCorrectness: number; // 0-1: Is the answer factually correct?
  };
}

async function evaluateResponse(
  query: string,
  response: string,
  contexts: string[],
  groundTruth?: string,
): Promise<RAGEvaluation> {
  const faithfulness = await checkFaithfulness(response, contexts);
  const relevance = await checkRelevance(query, response);
  const groundedness = await checkGroundedness(response, contexts);

  return {
    query,
    response,
    contexts,
    metrics: {
      faithfulness,
      relevance,
      groundedness,
      contextPrecision: 0,
      contextRecall: 0,
      answerCorrectness: 0,
    },
  };
}
```

## Data Stack

- **PostgreSQL** — Documents, knowledge bases, conversations, users
- **pgvector / Qdrant** — Vector embeddings storage & search
- **Meilisearch** — BM25 keyword search
- **Redis** — Conversation memory, embedding cache
- **S3/R2** — Raw document storage

## Compliance Standards

| Standard      | Requirements                                           |
| ------------- | ------------------------------------------------------ |
| **SOC2**      | Access controls, data isolation, audit trails          |
| **GDPR**      | Data residency, consent management, right to erasure   |
| **HIPAA**     | PHI handling in healthcare RAG applications            |
| **EU AI Act** | Transparency, human oversight for AI-generated content |

## Getting Started

```bash
npx coding-engine init --domain rag --name "KnowledgeAI" --compliance "SOC2,GDPR"
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
