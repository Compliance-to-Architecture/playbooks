# System Diagrams

## 1. Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE EDGE LAYER                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │   DNS    │ │   CDN    │ │  Workers │ │ Pages(22)│ │ WAF + DDoS   │ │
│  │ Anycast  │ │ 275+ PoP │ │ edge-auth│ │ Frontend │ │ Protection   │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │  AWS ALB (eu-west-1)  │
                    │  iof-production-alb   │
                    │  Port 80 → :3000      │
                    └───────────┬───────────┘
                                │
┌───────────────────────────────┴─────────────────────────────────────────┐
│                      AWS ECS FARGATE (iof-cluster)                       │
│                                                                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │
│  │  rail-api   │ │  ledger-    │ │ analytics-  │ │  finops-    │      │
│  │  :3000      │ │  service    │ │  api :3001  │ │  api :3003  │      │
│  │  89 rails  │ │  :3002      │ │ ClickHouse  │ │  Stripe     │      │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘      │
│                                                                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │
│  │  obp-       │ │  obp-demo-  │ │  document-  │ │  cerbos     │      │
│  │  gateway    │ │  server     │ │  renderer   │ │  ABAC PDP   │      │
│  │  :3004      │ │  :8080      │ │  :3005      │ │  :3592      │      │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘      │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                │
┌───────────────────────────────┴─────────────────────────────────────────┐
│                          DATA LAYER                                      │
│                                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │PostgreSQL│ │  Redis   │ │TigerBtle │ │ClickHouse│ │Meilisrch │    │
│  │  :5432   │ │  :6379   │ │  Ledger  │ │  :8123   │ │  :7700   │    │
│  │  State   │ │  Cache   │ │  Finance │ │ Analytics│ │  Search  │    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## 2. Agent Orchestration Flow

```
┌──────────────────────────────────────────────────────────────┐
│                     CLAUDE CODE (Primary Agent)               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  200K token context │ 40+ tools │ 16 MCP servers      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
│  SKILL ACTIVATION ─────────────────────────────────────────  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │ BLOCK   │ │ SUGGEST │ │  WARN   │ │  HOOKS  │          │
│  │islamic- │ │codemap  │ │tiger-   │ │pre-edit │          │
│  │finance  │ │rails-api│ │style    │ │post-tool│          │
│  │frontend │ │deploy   │ │         │ │session  │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
│                                                               │
│  SUB-AGENTS (16) ──────────────────────────────────────────  │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │architect│ │rails-api│ │code-    │ │security │          │
│  │         │ │specialist│ │reviewer │ │reviewer │          │
│  ├─────────┤ ├─────────┤ ├─────────┤ ├─────────┤          │
│  │build-err│ │frontend │ │refactor │ │islamic  │          │
│  │resolver │ │err-fixer│ │cleaner  │ │finance  │          │
│  ├─────────┤ ├─────────┤ ├─────────┤ ├─────────┤          │
│  │planner  │ │integrtor│ │tdd-     │ │stripe-  │          │
│  │         │ │         │ │reviewer │ │metering │          │
│  ├─────────┤ ├─────────┤ ├─────────┤ ├─────────┤          │
│  │obp-api  │ │doc-     │ │web-     │ │auto-err │          │
│  │specalst │ │updater  │ │research │ │resolver │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
│                                                               │
│  MCP SERVERS (16) ─────────────────────────────────────────  │
│  GitHub │ AWS │ CF │ Stripe │ PG │ Redis │ Docker │ Sentry  │
│  Meili  │ Grafana │ Axiom │ Tavily │ Playwright │ ...      │
└──────────────────────────────────────────────────────────────┘
```

## 3. CI/CD Pipeline Flow

```
    Push to main
         │
         ▼
    ┌─────────┐
    │   CI    │──── Format → Lint → TypeCheck → Test → Build
    └────┬────┘
         │ success
         ▼
    ┌──────────┐     ┌──────────────┐
    │  Build   │────▶│ Build Docker │
    └────┬─────┘     └──────┬───────┘
         │                   │
         ▼                   ▼
    ┌──────────┐     ┌──────────────┐
    │  Deploy  │     │  Push to ECR │
    │ Frontend │     │  (8 images)  │
    │ (CF Pages)│    └──────┬───────┘
    └──────────┘            │
                            ▼
                    ┌──────────────┐
                    │ Deploy Backend│
                    │ (ECS Update)  │
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                  │
         ▼                 ▼                  ▼
    ┌──────────┐    ┌──────────┐     ┌──────────────┐
    │  Verify  │    │  Verify  │     │   Failure    │
    │ CF Deploy│    │  Health  │     │  Collector   │
    └──────────┘    └──────────┘     └──────┬───────┘
                                            │ if failure
                                            ▼
                                    ┌──────────────┐
                                    │    Fixer     │
                                    │ (Auto-fix PR)│
                                    └──────────────┘
```

## 4. Multi-Tenant Data Flow

```
   Tenant A Request              Tenant B Request
        │                              │
        ▼                              ▼
   ┌──────────┐                  ┌──────────┐
   │ Subdomain│                  │  Header  │
   │ a.iof.com│                  │ X-IOF-   │
   └────┬─────┘                  │ Tenant:B │
        │                        └────┬─────┘
        └────────────┬────────────────┘
                     │
                     ▼
              ┌──────────────┐
              │   Tenant     │
              │  Resolver    │
              │ (middleware) │
              └──────┬───────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
  ┌──────────────┐       ┌──────────────┐
  │ PostgreSQL   │       │   Redis      │
  │ WHERE        │       │ tenant:A:*   │
  │ tenant_id=A  │       │ tenant:B:*   │
  │ (RLS)        │       │ (key prefix) │
  └──────────────┘       └──────────────┘
```

## 5. Compliance Engine Flow

```
   API Request
       │
       ▼
  ┌──────────────┐
  │  AuthN (JWT) │
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │  Cerbos ABAC │  ← Policy: resource + action + principal + attributes
  │  (AuthZ)     │
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │  Shariah     │  ← Contract schema must include shariahGovernance
  │  Compliance  │  ← AAOIFI standards check
  │  Check       │  ← Board approval verification
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │  Audit Trail │  ← Structured JSON: who/what/when/why
  │  (SOC2)      │  ← Encrypted, tamper-evident
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │  ISO 20022   │  ← Financial message format
  │  Response    │  ← Standardized identifiers
  └──────────────┘
```

## 6. Memory Architecture

```
┌─────────────────────────────────────────────────┐
│                  HOT MEMORY                      │
│           (Session Context: 200K tokens)         │
│  Current task state, active file contents,       │
│  recent tool results, conversation history       │
└────────────────────┬────────────────────────────┘
                     │ persists to ↓
┌────────────────────┴────────────────────────────┐
│                  WARM MEMORY                     │
│           (MEMORY.md + Knowledge Graph)          │
│  Lessons learned, anti-patterns, credentials,    │
│  architecture decisions, deployment patterns     │
└────────────────────┬────────────────────────────┘
                     │ archived to ↓
┌────────────────────┴────────────────────────────┐
│                  COLD MEMORY                     │
│           (docs/incidents/ + docs/adr/)          │
│  Incident reports, architectural decisions,      │
│  fix patterns, domain knowledge, compliance docs │
└─────────────────────────────────────────────────┘
```
