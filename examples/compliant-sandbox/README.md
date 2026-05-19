# Compliant Sandbox as a Service — Code Engine Example

> Built with the Coding Engine. One-click compliant environments with E2B.

## What This Builds

A Sandbox-as-a-Service platform providing one-click deployment of compliant, isolated environments with pre-built data pipelines:

- One-click sandbox provisioning (< 60 seconds)
- Data classification & PII detection (automated)
- Embedding generation pipeline (multi-model)
- RAG pipeline pre-configured per sandbox
- Synthetic data generation for safe testing
- Environment snapshotting & cloning
- Compliance pre-checks (SOC2, HIPAA, GDPR, PCI DSS)
- E2B runtime integration for secure code execution
- Per-sandbox resource quotas & cost tracking
- API playground with pre-loaded sample data
- Audit trail for all sandbox activities

## Architecture

```
apps/
├── sandbox-console/        # Sandbox management & provisioning UI
├── data-studio/            # Data classification & pipeline builder
├── playground/             # API playground & code execution
├── compliance-center/      # Pre-deployment compliance checks
├── admin-portal/           # Platform admin (universal)

packages/
├── provisioner-core/       # Sandbox lifecycle (create, snapshot, clone, destroy)
├── classification-core/    # PII detection, data classification (L1-L4)
├── embedding-core/         # Embedding generation (OpenAI, Cohere, local models)
├── rag-pipeline-core/      # Pre-built RAG pipeline (ingest → chunk → embed → index)
├── synthetic-data-core/    # Synthetic data generation (Faker + LLM-based)
├── e2b-runtime-core/       # E2B sandbox runtime integration
├── compliance-check-core/  # Pre-deployment compliance validation
├── quota-core/             # Resource quotas, cost tracking per sandbox
├── snapshot-core/          # Environment snapshot & restore
├── template-core/          # Sandbox templates (per industry, per use case)

services/
├── provisioner-api/        # Sandbox lifecycle service
├── pipeline-api/           # Data pipeline orchestration
├── classification-api/     # Data classification service
├── embedding-api/          # Embedding generation service
├── compliance-api/         # Compliance check service
```

## Key Patterns

### One-Click Sandbox Provisioning

```typescript
// packages/provisioner-core/src/provisioner.ts

interface SandboxTemplate {
  id: string;
  name: string;
  description: string;
  industry: "healthcare" | "finance" | "legal" | "general" | "custom";
  compliance: string[]; // ["HIPAA", "SOC2", "GDPR"]
  includedPipelines: Pipeline[];
  preloadedData: DataPack[];
  resourceLimits: ResourceLimits;
  estimatedProvisionSeconds: number;
}

interface SandboxInstance {
  id: string;
  templateId: string;
  status: "provisioning" | "ready" | "running" | "paused" | "terminated";
  owner: string;
  endpoints: {
    api: string; // Sandbox API URL
    playground: string; // Code playground URL
    vectorDb: string; // Vector DB endpoint
    database: string; // PostgreSQL connection
  };
  pipelines: PipelineStatus[];
  compliance: ComplianceReport;
  createdAt: Date;
  expiresAt: Date; // Auto-cleanup
  costAccumulated: number;
}

async function provisionSandbox(
  template: SandboxTemplate,
  owner: string,
): Promise<SandboxInstance> {
  // 1. Create isolated E2B sandbox runtime
  const runtime = await e2b.createSandbox({
    template: template.id,
    timeout: 3600,
    metadata: { owner, compliance: template.compliance },
  });

  // 2. Run compliance pre-checks
  const complianceReport = await runComplianceChecks(template.compliance);
  assert(
    complianceReport.passed,
    `Compliance pre-check failed: ${complianceReport.failures.join(", ")}`,
  );

  // 3. Provision data infrastructure
  await provisionDatabase(runtime.id);
  await provisionVectorStore(runtime.id);

  // 4. Load seed data with classification
  for (const dataPack of template.preloadedData) {
    const classified = await classifyData(dataPack);
    await loadDataPack(runtime.id, classified);
  }

  // 5. Initialize pipelines
  for (const pipeline of template.includedPipelines) {
    await initializePipeline(runtime.id, pipeline);
  }

  return createSandboxInstance(runtime, template, owner);
}
```

### Automated Data Classification

```typescript
// packages/classification-core/src/classifier.ts

type DataLevel =
  | "L1_public"
  | "L2_internal"
  | "L3_confidential"
  | "L4_restricted";

interface ClassificationResult {
  field: string;
  level: DataLevel;
  piiType?:
    | "name"
    | "email"
    | "phone"
    | "ssn"
    | "dob"
    | "address"
    | "financial"
    | "health";
  action: "allow" | "mask" | "tokenize" | "encrypt" | "redact";
  confidence: number;
}

async function classifyDataset(
  records: Record<string, unknown>[],
): Promise<ClassificationResult[]> {
  const sample = records.slice(0, 100); // Sample for classification
  const fields = Object.keys(sample[0] ?? {});
  const results: ClassificationResult[] = [];

  for (const field of fields) {
    const values = sample.map((r) => String(r[field] ?? ""));

    // Pattern-based PII detection
    const piiType = detectPII(field, values);

    // Classify data level
    const level = piiType
      ? piiType === "ssn" || piiType === "health"
        ? "L4_restricted"
        : piiType === "financial"
          ? "L3_confidential"
          : "L2_internal"
      : "L1_public";

    // Determine action
    const action =
      level === "L4_restricted"
        ? "redact"
        : level === "L3_confidential"
          ? "encrypt"
          : level === "L2_internal"
            ? "mask"
            : "allow";

    results.push({
      field,
      level,
      piiType: piiType ?? undefined,
      action,
      confidence: 0.95,
    });
  }

  return results;
}
```

### Pre-Built RAG Pipeline

```typescript
// packages/rag-pipeline-core/src/pipeline.ts

interface RAGPipelineConfig {
  sandboxId: string;
  sources: DataSource[];
  chunkingStrategy: "fixed" | "semantic" | "recursive";
  chunkSize: number;
  embeddingModel:
    | "openai-3-small"
    | "openai-3-large"
    | "cohere-v3"
    | "local-bge";
  vectorStore: "pgvector" | "qdrant" | "chromadb";
  searchStrategy: "semantic" | "hybrid" | "mmr";
}

async function initializeRAGPipeline(config: RAGPipelineConfig): Promise<void> {
  // 1. Ingest sources
  for (const source of config.sources) {
    const documents = await ingestSource(source);

    // 2. Classify before processing
    const classified = await classifyDocuments(documents);

    // 3. Apply data protection actions
    const protected_ = await applyProtections(classified);

    // 4. Chunk documents
    const chunks = await chunkDocuments(
      protected_,
      config.chunkingStrategy,
      config.chunkSize,
    );

    // 5. Generate embeddings
    const embeddings = await generateEmbeddings(chunks, config.embeddingModel);

    // 6. Index in vector store
    await indexChunks(config.sandboxId, embeddings, config.vectorStore);
  }
}
```

## Data Stack

- **E2B** — Secure sandbox runtime (isolated code execution)
- **PostgreSQL** — Sandbox metadata, user data, pipeline configs
- **pgvector / Qdrant** — Vector embeddings per sandbox
- **Redis** — Sandbox status, real-time pipeline progress
- **S3/R2** — Snapshots, raw data storage, artifacts

## Compliance Standards

| Standard    | Requirements                                     |
| ----------- | ------------------------------------------------ |
| **SOC2**    | Sandbox isolation, access controls, audit trails |
| **HIPAA**   | PHI detection, data classification, encryption   |
| **GDPR**    | PII handling, data residency, consent tracking   |
| **PCI DSS** | Cardholder data masking, network segmentation    |
| **FedRAMP** | Government data handling requirements            |

## Sandbox Templates

| Template                | Industry   | Compliance    | Included Pipelines                                  |
| ----------------------- | ---------- | ------------- | --------------------------------------------------- |
| **Healthcare AI**       | Healthcare | HIPAA, SOC2   | PII detection, FHIR ingestion, clinical NLP         |
| **Financial Analytics** | Finance    | PCI DSS, SOC2 | Transaction masking, fraud detection, AML           |
| **Legal Discovery**     | Legal      | SOC2, GDPR    | Document OCR, entity extraction, privilege review   |
| **General ML**          | Any        | SOC2          | Data profiling, feature engineering, model training |
| **RAG Starter**         | Any        | SOC2          | Document ingestion, embedding, search, chat         |

## Getting Started

```bash
npx coding-engine init --domain compliant-sandbox --name "SandboxCloud" --compliance "SOC2,HIPAA,GDPR"
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
