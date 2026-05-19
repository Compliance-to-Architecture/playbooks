# Service Reference

All 8 backend services running on AWS ECS Fargate.

## Service Status (Live)

| Service               | Status | Running | Task Def | Health  |
| --------------------- | ------ | ------- | -------- | ------- |
| iof-rail-api          | ACTIVE | 1/1     | :190     | healthy |
| iof-ledger-service    | ACTIVE | 2/1     | :187     | healthy |
| iof-analytics-api     | ACTIVE | 2/1     | :182     | healthy |
| iof-finops-api        | ACTIVE | 1/1     | :180     | healthy |
| iof-obp-gateway       | ACTIVE | 1/1     | :181     | healthy |
| iof-obp-demo-server   | ACTIVE | 1/1     | :84      | healthy |
| iof-document-renderer | ACTIVE | 1/1     | :84      | healthy |
| iof-cerbos            | ACTIVE | 1/1     | :173     | healthy |

## rail-api (Primary API)

**Port**: 3000 | **Framework**: Hono | **ECR**: iof/rail-api

The main API service handling all 105 Islamic finance rails across 19 categories:

### Rail Categories

1. **Core Islamic Contracts** (19) — Murabaha, Ijarah, Musharakah, Mudarabah, Salam, Istisna, Wakalah
2. **Takaful** (11) — General, Family, Claims, Underwriting, Reinsurance, Surplus
3. **Islamic Funds** (7) — Management, Subscription, Fees, Performance, Compliance
4. **Financial** (7) — Payments, Treasury, FX, Risk, Liquidity, Profit Distribution
5. **Capital Markets** (6) — Sukuk Issuance, Trading, Settlement, Valuation, Compliance
6. **Waqf / Social Finance** (5) — Waqf, Sadaqah, Qard Hasan, Zakat
7. **Trade Finance** (4) — LC, Guarantee, Documentary, Supply Chain
8. **Platform** (4) — Contracts, Workspaces, Notifications, Billing
9. **Operations** (3) — Documents, Reconciliation, Clearing
10. **Governance** (3) — Compliance, Audit, Shariah Governance
11. **Access / Identity** (2) — KYC, AML
12. **Observability** (1) — Analytics

### Key Endpoints

```
GET    /health                    # Health check
GET    /api/v1/status             # System status
GET    /api/v1/rails              # List all rails
GET    /api/v1/contracts          # List contracts
POST   /api/v1/contracts          # Create contract
GET    /api/v1/tenants            # List tenants
GET    /api/v1/compliance         # Compliance frameworks
GET    /api/v1/reference-data     # Reference data
GET    /api/v1/governance         # Governance policies
POST   /api/v1/webhooks           # Webhook management
GET    /api/v1/analytics          # Analytics queries
```

## ledger-service

**Port**: 3002 | **Framework**: Hono | **ECR**: iof/ledger-service

Double-entry ledger powered by TigerBeetle for financial transactions.

### Key Endpoints

```
POST   /api/v1/accounts           # Create account
GET    /api/v1/accounts/:id       # Get account
POST   /api/v1/transfers          # Create transfer
GET    /api/v1/balances/:id       # Get balance
GET    /api/v1/journal            # Journal entries
```

## analytics-api

**Port**: 3001 | **Framework**: Hono | **ECR**: iof/analytics-api

ClickHouse-powered analytics for real-time reporting.

### Key Endpoints

```
GET    /api/v1/analytics/transactions  # Transaction analytics
GET    /api/v1/analytics/compliance    # Compliance metrics
GET    /api/v1/analytics/usage         # Usage metrics
GET    /api/v1/analytics/tenants       # Tenant analytics
```

## finops-api

**Port**: 3003 | **Framework**: Hono | **ECR**: iof/finops-api

Financial operations, billing, and Stripe integration.

### Key Endpoints

```
GET    /api/v1/billing/plans       # Billing plans
POST   /api/v1/billing/subscribe   # Create subscription
GET    /api/v1/billing/invoices    # List invoices
POST   /api/v1/billing/usage      # Report usage
GET    /api/v1/billing/meters     # Usage meters
```

## obp-gateway

**Port**: 3004 | **Framework**: Hono | **ECR**: iof/obp-gateway

Open Banking Protocol proxy for banking core integration.

### Key Endpoints

```
GET    /api/v1/obp/banks           # List banks
GET    /api/v1/obp/accounts        # List accounts
POST   /api/v1/obp/transactions    # Create transaction
GET    /api/v1/obp/customers       # List customers
```

## obp-demo-server

**Port**: 8080 | **ECR**: iof/obp-demo-server

OBP sandbox server for development and demos.

## document-renderer

**Port**: 3005 | **Framework**: Hono | **ECR**: iof/document-renderer

PDF and document generation service.

### Key Endpoints

```
POST   /api/v1/render/pdf          # Generate PDF
POST   /api/v1/render/contract     # Render contract document
GET    /api/v1/templates           # List templates
```

## cerbos

**Port**: 3592 | **ECR**: iof/cerbos

Policy decision point for ABAC authorization.

### Key Endpoints

```
POST   /api/check                  # Check permission
POST   /api/plan                   # Plan resources
GET    /api/health                 # Health check
```
