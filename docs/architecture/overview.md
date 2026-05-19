# Architecture Overview

## System Architecture

The IOF Code Engine is a **five-layer architecture** with clear separation of concerns at every level.

```
┌─────────────────────────────────────────────────────────────────┐
│                     LAYER 1: EDGE (Cloudflare)                  │
│  Workers │ Pages │ KV │ D1 │ DNS │ Rate Limiting │ Auth Pre-check│
├─────────────────────────────────────────────────────────────────┤
│                     LAYER 2: FRONTEND (Next.js 15)              │
│  22 Apps: admin, customer, billing, compliance, developer, euai │
│  UI: Sera UI │ State: React Query │ Auth: Clerk │ Legal: Built-in│
├─────────────────────────────────────────────────────────────────┤
│                     LAYER 3: API (Hono on ECS Fargate)          │
│  rail-api (89 rails) │ analytics-api │ finops-api │ ledger     │
│  obp-gateway │ document-renderer │ obp-demo-server │ cerbos     │
├─────────────────────────────────────────────────────────────────┤
│                     LAYER 4: DATA                               │
│  PostgreSQL 16 │ Redis 7 │ TigerBeetle │ ClickHouse │ Meilisearch│
├─────────────────────────────────────────────────────────────────┤
│                     LAYER 5: INFRASTRUCTURE                     │
│  AWS ECS/VPC/ALB │ ECR │ SSM │ SES │ CloudWatch │ Terraform     │
│  GitHub Actions (36 workflows) │ Docker │ Helm │ K8s             │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
User Request
    │
    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Cloudflare  │────▶│  Next.js App │────▶│  API Gateway │
│  Edge Worker │     │  (SSR/CSR)   │     │  (Hono)      │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                     ┌────────────────────────────┼────────────────────────────┐
                     │                            │                            │
                     ▼                            ▼                            ▼
              ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
              │  Cerbos ABAC │          │  Rail Router  │          │  Event Bus   │
              │  (AuthZ)     │          │  (89 Rails)  │          │  (Envelopes) │
              └──────────────┘          └──────┬───────┘          └──────────────┘
                                               │
                     ┌─────────────────────────┼─────────────────────────┐
                     │                         │                         │
                     ▼                         ▼                         ▼
              ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
              │  PostgreSQL  │          │  TigerBeetle │          │  ClickHouse  │
              │  (State)     │          │  (Ledger)    │          │  (Analytics) │
              └──────────────┘          └──────────────┘          └──────────────┘
```

## Request Lifecycle

1. **DNS Resolution**: Cloudflare DNS resolves `*.islamicopenfinance.com`
2. **Edge Processing**: Cloudflare Worker handles routing, auth pre-check, rate limiting
3. **Frontend Delivery**: Next.js app served from Cloudflare Pages (SSR/static)
4. **API Call**: Frontend calls backend API via `api.islamicopenfinance.com`
5. **Authentication**: JWT validated, tenant resolved from subdomain/header/token
6. **Authorization**: Cerbos ABAC evaluates policy for resource + action + principal
7. **Rail Routing**: Request routed to appropriate rail handler (1 of 142)
8. **Business Logic**: Rail handler executes domain logic with Shariah compliance checks
9. **Data Access**: PostgreSQL for state, TigerBeetle for ledger, ClickHouse for analytics
10. **Response**: Structured JSON response with ISO 20022 compatible format
11. **Audit Trail**: Every mutation logged with who/what/when/why

## Multi-Tenant Architecture

```
Tenant Resolution:
  1. Subdomain: {tenant}.islamicopenfinance.com
  2. Header: X-IOF-Tenant: tenant-id
  3. JWT Claim: tenant_id in access token

Data Isolation:
  - Row-Level Security (RLS) on all PostgreSQL tables
  - Tenant-scoped Redis key prefixes
  - Tenant-scoped TigerBeetle accounts
  - Tenant-scoped search indices
```

## Service Mesh

| Service           | Port | Purpose                         | Health  |
| ----------------- | ---- | ------------------------------- | ------- |
| rail-api          | 3000 | 105 Islamic finance rails       | /health |
| analytics-api     | 3001 | ClickHouse analytics queries    | /health |
| finops-api        | 3003 | Financial operations, billing   | /health |
| ledger-service    | 3002 | TigerBeetle double-entry ledger | /health |
| obp-gateway       | 3004 | Open Banking Protocol proxy     | /health |
| obp-demo-server   | 8080 | OBP sandbox for development     | /health |
| document-renderer | 3005 | PDF/document generation         | /health |
| cerbos            | 3592 | Policy decision point (ABAC)    | /health |

## Agent Memory Architecture (Hindsight)

The coding engine uses a **4-tier memory architecture** combining file-based persistence with
[vectorize-io/hindsight](https://github.com/vectorize-io/hindsight) for intelligent cross-session recall.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     AGENT MEMORY FLOW                               │
│                                                                     │
│  Session Events ──▶ MemorySystem ──▶ File Write (MEMORY.md)        │
│                          │                                          │
│                          └──▶ Hindsight retain() [async]            │
│                                    │                                │
│                                    ▼                                │
│                        ┌─────────────────────┐                      │
│                        │   Hindsight Server   │                     │
│                        │  (4-strategy recall)  │                     │
│                        │                       │                     │
│                        │  Semantic    BM25     │                     │
│                        │  Entity     Temporal  │                     │
│                        │  Graph      Filter    │                     │
│                        │       ▼               │                     │
│                        │  Cross-Encoder Rerank │                     │
│                        └─────────┬─────────────┘                    │
│                                  │                                  │
│  Session Start ◀── recall() ◀───┘                                  │
│  Periodic      ◀── reflect() ◀──── Mental Model Synthesis          │
│                                                                     │
│  Memory Tiers:                                                      │
│    HOT   = In-memory Map (current session only)                     │
│    WARM  = MEMORY.md + Hindsight (cross-session, file + semantic)  │
│    COLD  = docs/incidents/ + Hindsight (archival + semantic)        │
│    GRAPH = Hindsight entity network (relationships + reasoning)     │
└─────────────────────────────────────────────────────────────────────┘
```

### Reinforced Learning Loop

```
1. RETAIN:  Session learnings, incidents, anti-patterns → Hindsight
2. RECALL:  Session start → Hindsight recalls relevant context
3. REFLECT: Periodic → Hindsight synthesizes mental models
4. APPLY:   Agent uses recalled context to avoid past mistakes
5. RETAIN:  New learnings from current session → Hindsight (loop continues)
```

### CLI Commands

| Command                         | Purpose                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| `coding-engine recall [query]`  | Recall memories from Hindsight                                     |
| `coding-engine reflect [query]` | Synthesize insights from accumulated memories                      |
| `coding-engine session-recall`  | Full session-start context (anti-patterns, incidents, conventions) |

## Technology Decisions

| Decision        | Choice               | Why                                          |
| --------------- | -------------------- | -------------------------------------------- |
| Runtime         | Node.js 22           | LTS, native fetch, ESM modules               |
| Language        | TypeScript 5.7+      | Type safety, developer experience            |
| API Framework   | Hono                 | Lightweight, fast, Workers-compatible        |
| Frontend        | Next.js 15           | SSR, ISR, app router, React 19               |
| UI Components   | Sera UI              | Modern, accessible, customizable             |
| Package Manager | pnpm 9.14            | Fast, disk-efficient, monorepo support       |
| Build System    | Turborepo            | Parallel builds, caching, dependency graph   |
| Database        | PostgreSQL 16        | ACID, mature, extensions, RLS                |
| Cache           | Redis 7              | Pub/sub, sessions, rate limiting             |
| Ledger          | TigerBeetle          | Double-entry, high-throughput, deterministic |
| Analytics       | ClickHouse           | Column-oriented, fast aggregations           |
| Search          | Meilisearch          | Typo-tolerant, instant search                |
| Auth            | Clerk                | Managed auth, social login, MFA              |
| AuthZ           | Cerbos               | ABAC, policy-as-code, embedded PDP           |
| Container       | Docker + ECS Fargate | Serverless containers, auto-scaling          |
| Edge            | Cloudflare Workers   | Global edge, sub-ms cold starts              |
| CDN/Hosting     | Cloudflare Pages     | Global CDN, atomic deploys                   |
| DNS             | Cloudflare DNS       | Anycast, DNSSEC, analytics                   |
| CI/CD           | GitHub Actions       | Native integration, workflow_run chaining    |
| IaC             | Terraform            | Declarative, multi-cloud, state management   |
| Monitoring      | CloudWatch + Grafana | Metrics, logs, dashboards                    |
| Errors          | Sentry               | Real-time error tracking                     |
| Secrets         | AWS SSM + CF Secrets | Encrypted, versioned, audited                |
