# Package Reference

All 117 shared packages in the monorepo.

## Package Categories

### Core Infrastructure (12)

| Package                      | Purpose                                       | Used By           |
| ---------------------------- | --------------------------------------------- | ----------------- |
| `@iof/db-core`               | Prisma database layer, generated types        | All services      |
| `@iof/errors`                | Centralized error classes                     | All packages      |
| `@iof/utils`                 | Shared formatters, validators, helpers        | All packages      |
| `@iof/service-core`          | Shared middleware (rate-limit, auth, logging) | All services      |
| `@iof/structured-logger`     | Structured JSON logging                       | All services      |
| `@iof/event-envelope`        | Event-driven messaging format                 | Cross-service     |
| `@iof/event-schema-registry` | Schema registry for events                    | Cross-service     |
| `@iof/observability-core`    | Distributed tracing                           | All services      |
| `@iof/secrets-core`          | Secrets management (SSM/Vault)                | All services      |
| `@iof/feature-flags-core`    | Feature flag management                       | All apps/services |
| `@iof/metadata-core`         | Metadata management                           | All services      |
| `@iof/rules-engine-core`     | Business rules engine                         | Domain services   |

### Authentication & Authorization (4)

| Package              | Purpose                            | Used By       |
| -------------------- | ---------------------------------- | ------------- |
| `@iof/auth-core`     | Backend auth + Cerbos ABAC         | All services  |
| `@iof/auth-client`   | Frontend auth client (Clerk)       | All apps      |
| `@iof/auth-ui`       | Auth UI components (login, signup) | Frontend apps |
| `@iof/security-core` | Security utilities, encryption     | All           |

### Domain: Islamic Finance (12)

| Package                      | Purpose                               |
| ---------------------------- | ------------------------------------- |
| `@iof/contracts-core`        | 66 contract schemas (Shariah-native)  |
| `@iof/taxonomy-core`         | 89 rails, 19 categories, SKU mappings |
| `@iof/compliance-core`       | Compliance checking engine            |
| `@iof/compliance-monitor`    | Real-time compliance monitoring       |
| `@iof/iso20022-core`         | ISO 20022 financial messaging         |
| `@iof/jurisdiction-profiles` | Jurisdiction-specific rules           |
| `@iof/collateral-core`       | Collateral management                 |
| `@iof/zakat-core`            | Zakat calculation engine              |
| `@iof/reference-data`        | Reference data management             |
| `@iof/dictionary-core`       | Reference data dictionaries           |
| `@iof/limits-core`           | Transaction limits engine             |
| `@iof/entitlements-core`     | Feature entitlements                  |

### Multi-Tenancy (3)

| Package               | Purpose                     |
| --------------------- | --------------------------- |
| `@iof/tenant-core`    | Tenant lifecycle management |
| `@iof/workspace-core` | Workspace isolation         |
| `@iof/control-plane`  | Multi-tenant control plane  |

### Billing & Monetization (3)

| Package                | Purpose               |
| ---------------------- | --------------------- |
| `@iof/billing-core`    | Billing domain logic  |
| `@iof/stripe-metering` | Stripe usage metering |
| `@iof/finops-core`     | Financial operations  |

### Documents (5)

| Package                       | Purpose                        |
| ----------------------------- | ------------------------------ |
| `@iof/documents-core`         | Document management            |
| `@iof/document-renderer-core` | Document generation logic      |
| `@iof/document-signing-core`  | Digital signatures             |
| `@iof/document-vault-core`    | Secure document storage        |
| `@iof/legal-components`       | Reusable legal page components |

### Data & Search (4)

| Package                  | Purpose                         |
| ------------------------ | ------------------------------- |
| `@iof/search-core`       | Meilisearch integration         |
| `@iof/clickhouse-client` | ClickHouse connection + queries |
| `@iof/data-quality-core` | Data validation + quality       |
| `@iof/seed-data`         | Database seed data packs        |

### External Integrations (5)

| Package                              | Purpose                       |
| ------------------------------------ | ----------------------------- |
| `@iof/obp-client`                    | Open Banking Protocol client  |
| `@iof/integration-hub-core`          | Third-party integrations      |
| `@iof/webhook-core`                  | Webhook delivery + management |
| `@iof/novu-provider`                 | Novu notification provider    |
| `@iof/notification-preferences-core` | Notification settings         |

### SDKs (3)

| Package           | Purpose                    |
| ----------------- | -------------------------- |
| `@iof/sdk`        | TypeScript SDK for IOF API |
| `@iof/sdk-go`     | Go SDK                     |
| `@iof/sdk-python` | Python SDK                 |

### Operations (7)

| Package                       | Purpose                         |
| ----------------------------- | ------------------------------- |
| `@iof/audit-core`             | Audit trail logging             |
| `@iof/consent-privacy-core`   | GDPR consent management         |
| `@iof/records-retention-core` | Data retention policies         |
| `@iof/sla-incident-core`      | SLA + incident management       |
| `@iof/load-testing-core`      | Load testing infrastructure     |
| `@iof/byoc-orchestrator`      | Bring-Your-Own-Cloud deployment |
| `@iof/registry-proxy-rail`    | Rail registry proxy             |

### AI & Agents (2)

| Package           | Purpose                   |
| ----------------- | ------------------------- |
| `@iof/agent-core` | AI agent infrastructure   |
| `@iof/ai-core`    | Anthropic SDK integration |

### UI (2)

| Package        | Purpose              |
| -------------- | -------------------- |
| `@iof/ui-core` | Shared UI components |
| `@iof/cli`     | IOF CLI tool         |

### Repository Health (2)

| Package                 | Purpose                     |
| ----------------------- | --------------------------- |
| `@iof/repo-graph`       | Repository dependency graph |
| `@iof/repo-graph-rules` | Dependency graph rules      |

## Package Conventions

1. Every package has `src/index.ts` with named exports
2. No default exports
3. Types co-located with implementations
4. Package names prefixed with `@iof/`
5. Each package has its own `tsconfig.json` extending root
6. Dependencies declared explicitly in `package.json`
