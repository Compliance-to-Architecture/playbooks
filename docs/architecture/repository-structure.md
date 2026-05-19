# Repository Structure

Complete monorepo layout with every component documented.

```
/
├── .claude/                          # AI Agent Configuration
│   ├── CLAUDE.md                     # Session instructions, mandatory rituals
│   ├── agents/                       # 16 specialized agent definitions
│   │   ├── architect.md              # System architecture decisions
│   │   ├── auto-error-resolver.md    # TypeScript/build error auto-fix
│   │   ├── build-error-resolver.md   # Build compilation errors
│   │   ├── code-reviewer.md          # Code quality + best practices
│   │   ├── doc-updater.md            # Documentation maintenance
│   │   ├── frontend-error-fixer.md   # Frontend runtime/build errors
│   │   ├── integrator.md             # System integration + deployment
│   │   ├── islamic-finance-expert.md # Shariah compliance domain expert
│   │   ├── obp-api-specialist.md     # Open Banking Protocol integration
│   │   ├── planner.md               # Strategic planning + decomposition
│   │   ├── rails-api-specialist.md   # Rails API (89 specialized rails)
│   │   ├── refactor-cleaner.md       # Code refactoring + cleanup
│   │   ├── security-reviewer.md      # Security audit + vulnerability
│   │   ├── stripe-metering-specialist.md # Billing + usage metering
│   │   ├── tdd-reviewer.md           # Test-driven development
│   │   └── web-research-specialist.md # External docs/API research
│   ├── hooks/                        # Event-driven automation
│   │   ├── post-tool-use-tracker.sh  # Track file modifications
│   │   ├── pre-edit-conflict-check.sh # Prevent parallel conflicts
│   │   ├── session-auto-complete.sh  # Auto-complete detection
│   │   ├── session-auto-register.sh  # Session registration
│   │   ├── skill-activation-prompt.sh # Auto-suggest skills
│   │   └── skill-activation-prompt.ts # Skill rules engine
│   ├── skills/                       # 25+ skill definitions
│   │   ├── skill-rules.json          # Activation rules (block/suggest/warn)
│   │   ├── codemap.md               # Structural code navigation
│   │   ├── deployment.md            # Multi-cloud deployment patterns
│   │   ├── obp-strategy.md          # OBP phased integration
│   │   ├── islamic-finance/         # Shariah compliance guardrail (BLOCK)
│   │   ├── frontend-guidelines/     # Frontend guardrail (BLOCK)
│   │   ├── structured-output.md     # JSON schema pipeline
│   │   ├── failure-inbox.md         # CI/CD failure collection
│   │   ├── tigerstyle-audit.md      # Code style enforcement
│   │   ├── ralph-method.md          # Autonomous dev loop
│   │   ├── github-lifecycle.md      # PR/issue lifecycle
│   │   ├── agent-tools.md           # Tool reference
│   │   └── terraform.md             # IaC patterns
│   └── commands/                    # Slash commands
│       ├── check-types.md
│       ├── db-migrate.md
│       ├── generate-tests.md
│       ├── iterate.md
│       ├── optimize-bundle.md
│       ├── ralph-loop.md
│       ├── ralph-status.md
│       ├── security-audit.md
│       └── verify-all.md
│
├── apps/                             # 19 Frontend Applications
│   ├── admin-portal/                 # Internal administration dashboard
│   ├── api-explorer/                 # Interactive API documentation + testing
│   ├── billing-dashboard/            # Subscription + usage billing (Stripe)
│   ├── compliance-explorer/          # Compliance framework browser
│   ├── customer-dashboard/           # Customer-facing portal
│   ├── demo-bank/                    # Demo: Islamic bank showcase
│   ├── demo-embeddedfinance/         # Demo: Embedded finance
│   ├── demo-fintech/                 # Demo: Fintech application
│   ├── demo-microfinance/            # Demo: Microfinance platform
│   ├── demo-takaful/                 # Demo: Islamic insurance
│   ├── developer-portal/             # Developer docs + onboarding
│   ├── docs/                         # VitePress documentation site
│   ├── join/                         # Waitlist + signup landing page
│   ├── partnership/                  # Partnership portal
│   ├── sandbox/                      # API sandbox environment
│   ├── status-page/                  # System status dashboard
│   ├── webhook-explorer/             # Webhook testing + debugging
│   ├── why/                          # Marketing: Why IOF?
│   └── wiki/                         # Internal knowledge base
│
├── packages/                         # 66 Shared Packages
│   ├── agent-core/                   # AI agent infrastructure
│   ├── ai-core/                      # Anthropic SDK integration
│   ├── audit-core/                   # Audit trail logging
│   ├── auth-client/                  # Frontend auth client (Clerk)
│   ├── auth-core/                    # Backend auth + Cerbos ABAC
│   ├── auth-ui/                      # Auth UI components
│   ├── billing-core/                 # Billing domain logic
│   ├── byoc-orchestrator/            # Bring-Your-Own-Cloud deployment
│   ├── cli/                          # IOF CLI tool
│   ├── clickhouse-client/            # ClickHouse connection + queries
│   ├── collateral-core/              # Collateral management
│   ├── compliance-core/              # Compliance checking engine
│   ├── compliance-monitor/           # Real-time compliance monitoring
│   ├── consent-privacy-core/         # GDPR consent management
│   ├── contracts-core/               # 66 contract schemas (Shariah-native)
│   ├── control-plane/                # Multi-tenant control plane
│   ├── data-quality-core/            # Data validation + quality
│   ├── db-core/                      # Prisma database layer
│   ├── dictionary-core/              # Reference data dictionaries
│   ├── document-renderer-core/       # Document generation logic
│   ├── document-signing-core/        # Digital signature workflows
│   ├── document-vault-core/          # Secure document storage
│   ├── documents-core/               # Document management
│   ├── entitlements-core/            # Feature entitlements
│   ├── errors/                       # Centralized error classes
│   ├── event-envelope/               # Event-driven messaging
│   ├── event-schema-registry/        # Schema registry for events
│   ├── feature-flags-core/           # Feature flag management
│   ├── finops-core/                  # Financial operations
│   ├── integration-hub-core/         # Third-party integrations
│   ├── iso20022-core/                # ISO 20022 financial messaging
│   ├── jurisdiction-profiles/        # Jurisdiction-specific rules
│   ├── ledger-core/                  # TigerBeetle ledger client
│   ├── legal-components/             # Reusable legal page components
│   ├── limits-core/                  # Transaction limits engine
│   ├── load-testing-core/            # Load testing infrastructure
│   ├── metadata-core/                # Metadata management
│   ├── notification-preferences-core/ # Notification settings
│   ├── novu-provider/                # Novu notification provider
│   ├── obp-client/                   # Open Banking Protocol client
│   ├── observability-core/           # Structured logging + tracing
│   ├── records-retention-core/       # Data retention policies
│   ├── reference-data/               # Reference data management
│   ├── registry-proxy-rail/          # Rail registry proxy
│   ├── repo-graph/                   # Repository dependency graph
│   ├── repo-graph-rules/             # Dependency graph rules
│   ├── rules-engine-core/            # Business rules engine
│   ├── sdk/                          # TypeScript SDK
│   ├── sdk-go/                       # Go SDK
│   ├── sdk-python/                   # Python SDK
│   ├── search-core/                  # Meilisearch integration
│   ├── secrets-core/                 # Secrets management
│   ├── security-core/                # Security utilities
│   ├── seed-data/                    # Database seed data packs
│   ├── service-core/                 # Shared service middleware
│   ├── sla-incident-core/            # SLA + incident management
│   ├── stripe-metering/              # Stripe usage metering
│   ├── structured-logger/            # Structured JSON logging
│   ├── taxonomy-core/                # Rail taxonomy (89 rails, 19 categories)
│   ├── tenant-core/                  # Multi-tenant management
│   ├── ui-core/                      # Shared UI components
│   ├── utils/                        # Shared utilities
│   ├── webhook-core/                 # Webhook delivery + management
│   ├── workspace-core/               # Workspace management
│   └── zakat-core/                   # Zakat calculation engine
│
├── services/                         # 7 Backend Microservices
│   ├── rail-api/                     # Main API: 105 Islamic finance rails
│   ├── analytics-api/                # ClickHouse analytics queries
│   ├── finops-api/                   # Financial operations + billing
│   ├── ledger-service/               # TigerBeetle ledger operations
│   ├── obp-gateway/                  # Open Banking Protocol proxy
│   ├── obp-demo-server/              # OBP sandbox for development
│   └── document-renderer/            # PDF/document generation
│
├── workers/                          # Cloudflare Edge Workers
│   ├── edge-auth/                    # Edge authentication pre-check
│   └── gh-webhook-ingest/            # GitHub webhook ingestion
│
├── infra/                            # Infrastructure as Code
│   ├── aws/                          # AWS-specific configs
│   ├── cloudflare/                   # Cloudflare Worker configs
│   ├── cloudformation/               # CloudFormation templates
│   ├── configs/                      # Environment configs
│   ├── docker/                       # Docker Compose + Dockerfiles
│   ├── helm/                         # Kubernetes Helm charts
│   ├── kubernetes/                   # K8s manifests
│   ├── monitoring/                   # Grafana + alerting
│   ├── nginx/                        # Nginx configs
│   ├── postgres/                     # PostgreSQL configs
│   ├── scripts/                      # Infra scripts
│   ├── terraform/                    # Terraform modules
│   └── tigerbeetle/                  # TigerBeetle configs
│
├── config/                           # Application Configuration
│   ├── cerbos/                       # ABAC policy files
│   ├── dictionaries/                 # Reference data dictionaries
│   ├── environments/                 # Environment-specific configs
│   ├── jurisdictions/                # Jurisdiction profiles
│   ├── onboarding/                   # Onboarding workflows
│   ├── openapi/                      # OpenAPI specifications
│   ├── pricing/                      # Pricing tiers + plans
│   ├── rails/                        # Rail definitions
│   ├── redis/                        # Redis configs
│   ├── roles/                        # Role definitions
│   ├── skus/                         # SKU mappings
│   ├── stripe/                       # Stripe product configs
│   └── tigerbeetle/                  # TigerBeetle account configs
│
├── scripts/                          # Build + Utility Scripts
│   ├── ci/                           # CI/CD helper scripts
│   ├── failures/                     # Failure collection + fingerprinting
│   └── ...                           # Various utility scripts
│
├── .github/workflows/                # 47 GitHub Actions Workflows
│   ├── ci.yml                        # Continuous Integration
│   ├── build.yml                     # Build all packages
│   ├── build-docker.yml              # Docker image builds
│   ├── deploy.yml                    # Production deployment
│   ├── deploy-app.yml                # Individual app deployment
│   ├── fixer.yml                     # Auto-fix CI failures
│   ├── failure-collector.yml         # Failure aggregation
│   ├── agent-lifecycle.yml           # Agent event processing
│   ├── terraform-deploy.yml          # Infrastructure provisioning
│   ├── security-scan.yml             # Security scanning
│   └── ... (37 more workflows)
│
├── CLAUDE.md                         # Root: AI agent instructions (32 principles)
├── PORTS.md                          # Port assignments (SSOT)
├── STATUS.md                         # Platform status (auto-generated)
├── turbo.json                        # Turborepo build config
├── pnpm-workspace.yaml               # pnpm monorepo workspace
└── package.json                      # Root package.json
```

## Key Files for Engine Reuse

| File                              | Why It Matters                                                 |
| --------------------------------- | -------------------------------------------------------------- |
| `CLAUDE.md`                       | The brain — all 32 principles, tool configs, workflow patterns |
| `.claude/CLAUDE.md`               | Session startup rituals, parallel universe prevention          |
| `.claude/skills/skill-rules.json` | Automated skill activation rules                               |
| `.claude/agents/*.md`             | Agent specialization definitions                               |
| `.claude/hooks/*.sh`              | Event-driven automation hooks                                  |
| `turbo.json`                      | Build dependency graph                                         |
| `pnpm-workspace.yaml`             | Package workspace configuration                                |
| `.github/workflows/*.yml`         | Complete CI/CD pipeline                                        |
| `config/rails/*.yaml`             | Domain-specific rail definitions                               |
| `packages/taxonomy-core/`         | Domain taxonomy (swap for your domain)                         |
