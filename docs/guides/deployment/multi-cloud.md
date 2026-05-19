# Multi-Cloud Deployment Guide

Deploying across AWS ECS Fargate and Cloudflare Workers/Pages.

## Architecture

```
                    ┌─────────────────┐
                    │   Cloudflare    │
                    │   DNS + CDN     │
                    │   (Edge)        │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
     ┌──────────────┐ ┌──────────┐ ┌──────────────┐
     │  CF Pages    │ │ CF Workers│ │  AWS ALB     │
     │  (Frontend)  │ │ (Edge)   │ │  (Backend)   │
     │  20 apps     │ │ Auth,    │ │  Port 80     │
     └──────────────┘ │ Rate     │ └──────┬───────┘
                      │ Limit    │        │
                      └──────────┘        │
                             ┌────────────┼────────────┐
                             │            │            │
                             ▼            ▼            ▼
                    ┌──────────┐ ┌──────────┐ ┌──────────┐
                    │ ECS      │ │ ECS      │ │ ECS      │
                    │ rail-api │ │ ledger   │ │ analytics│
                    │ :3000    │ │ :3002    │ │ :3001    │
                    └──────────┘ └──────────┘ └──────────┘
```

## AWS ECS Deployment

### Cluster: iof-cluster (eu-west-1)

| Service               | Task Definition          | Desired | Image                     |
| --------------------- | ------------------------ | ------- | ------------------------- |
| iof-rail-api          | iof-rail-api:190         | 1       | ECR:iof/rail-api          |
| iof-ledger-service    | iof-ledger-service:187   | 1       | ECR:iof/ledger-service    |
| iof-analytics-api     | iof-analytics-api:182    | 1       | ECR:iof/analytics-api     |
| iof-finops-api        | iof-finops-api:180       | 1       | ECR:iof/finops-api        |
| iof-obp-gateway       | iof-obp-gateway:181      | 1       | ECR:iof/obp-gateway       |
| iof-obp-demo-server   | iof-obp-demo-server:84   | 1       | ECR:iof/obp-demo-server   |
| iof-document-renderer | iof-document-renderer:84 | 1       | ECR:iof/document-renderer |
| iof-cerbos            | iof-cerbos:173           | 1       | ECR:iof/cerbos            |

### Deploy Command (Manual)

```bash
# Build and push Docker image
aws ecr get-login-password --region eu-west-1 | \
  docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.eu-west-1.amazonaws.com

docker build -t iof/rail-api:$(git rev-parse --short HEAD) \
  -f services/rail-api/Dockerfile .

docker tag iof/rail-api:$(git rev-parse --short HEAD) \
  <AWS_ACCOUNT_ID>.dkr.ecr.eu-west-1.amazonaws.com/iof/rail-api:$(git rev-parse --short HEAD)

docker push <AWS_ACCOUNT_ID>.dkr.ecr.eu-west-1.amazonaws.com/iof/rail-api:$(git rev-parse --short HEAD)

# Update ECS service
aws ecs update-service --cluster iof-cluster --service iof-rail-api --force-new-deployment
```

### Health Checks

```bash
# Check all services
aws ecs describe-services --cluster iof-cluster \
  --services iof-rail-api iof-ledger-service iof-analytics-api \
  --query 'services[].{name:serviceName,running:runningCount,status:status}'

# Check ALB target health
aws elbv2 describe-target-health \
  --target-group-arn <target-group-arn>
```

## Cloudflare Pages Deployment

### Apps Deployed

Each app deploys to Cloudflare Pages with custom domain:

```bash
# Deploy single app
wrangler pages deploy apps/{app-name}/out --project-name iof-{app-name}

# Or via GitHub Actions (automated)
# Triggered by deploy.yml workflow
```

### Custom Domains

```
customer-dashboard → dashboard.islamicopenfinance.com
admin-portal → admin.islamicopenfinance.com
api-explorer → explorer.islamicopenfinance.com
developer-portal → developer.islamicopenfinance.com
billing-dashboard → billing.islamicopenfinance.com
docs → docs.islamicopenfinance.com
```

## Cloudflare Workers

```bash
# Deploy edge auth worker
wrangler deploy --name iof-edge-auth workers/edge-auth/

# Deploy webhook ingest worker
wrangler deploy --name iof-gh-webhook workers/gh-webhook-ingest/
```

## Terraform Infrastructure

```bash
cd infra/terraform

# Initialize
terraform init

# Plan
terraform plan -var-file=environments/production.tfvars

# Apply
terraform apply -var-file=environments/production.tfvars
```

### Key Resources Managed

- VPC + Subnets (eu-west-1a, eu-west-1b)
- ECS Cluster + Services
- ALB + Target Groups + Listeners
- ECR Repositories (8 repos)
- Security Groups
- IAM Roles + Policies
- SSM Parameters (secrets)
- CloudWatch Log Groups

## Environment Promotion

```
dev → sandbox → uat → production
  │       │       │        │
  └───────┴───────┴────────┘
  Each has its own:
  - ECS cluster (or namespace)
  - Database instance
  - Redis instance
  - CF Pages project
  - DNS records
```

## Monitoring

```bash
# CloudWatch logs
aws logs tail /ecs/iof-rail-api --follow

# ECS service events
aws ecs describe-services --cluster iof-cluster --services iof-rail-api \
  --query 'services[0].events[:5]'

# GitHub Actions status
gh run list --repo Islamic-Open-Finance/app --limit 10
```

## Rollback

```bash
# ECS: Roll back to previous task definition
aws ecs update-service --cluster iof-cluster \
  --service iof-rail-api \
  --task-definition iof-rail-api:189  # Previous revision

# Cloudflare Pages: Rollback to previous deployment
wrangler pages deployments list --project-name iof-customer-dashboard
wrangler pages deployments rollback --project-name iof-customer-dashboard <deployment-id>
```
