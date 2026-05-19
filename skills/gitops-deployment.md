# GitOps Deployment

> Blue-green, canary, rolling updates, feature flags, GitOps workflow, ArgoCD, Flux, and deployment gates for safe, auditable releases.

## Core Principles

1. **Git Is the Single Source of Truth** — The desired state of every environment lives in Git. No manual kubectl, no SSH-and-edit, no console clicking. If it is not in Git, it does not exist.
2. **Declarative Over Imperative** — Define what the system should look like, not the steps to get there. Kubernetes manifests, Terraform configs, and Helm values describe desired state. The tooling reconciles.
3. **Progressive Delivery Reduces Risk** — Never deploy 100% at once. Use canary (1% -> 10% -> 50% -> 100%), blue-green (instant switchover with rollback), or rolling updates (gradual pod replacement).
4. **Deployment Gates Prevent Bad Releases** — Automated checks (health, smoke tests, error rates) must pass before traffic shifts. Human approval gates for production. No deploy without passing CI.
5. **Rollback Must Be One Command** — If a deployment fails, revert to the previous Git commit. The system reconciles back. Rollback is not a special operation — it is just another Git commit.

## Patterns

### Pattern 1: Blue-Green Deployment

```yaml
# ArgoCD Application with blue-green strategy
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: rail-api
spec:
  replicas: 3
  strategy:
    blueGreen:
      activeService: rail-api-active
      previewService: rail-api-preview
      autoPromotionEnabled: false
      prePromotionAnalysis:
        templates:
          - templateName: smoke-tests
        args:
          - name: service-url
            value: "http://rail-api-preview.iof.svc.cluster.local"
      scaleDownDelaySeconds: 300
  template:
    spec:
      containers:
        - name: rail-api
          image: ecr.aws/iof/rail-api:{{ .Values.image.tag }}
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
```

### Pattern 2: Canary with Automated Analysis

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: rail-api-canary
spec:
  strategy:
    canary:
      steps:
        - setWeight: 5
        - pause: { duration: 5m }
        - analysis:
            templates:
              - templateName: error-rate-check
            args:
              - name: service
                value: rail-api
        - setWeight: 25
        - pause: { duration: 10m }
        - analysis:
            templates:
              - templateName: latency-check
        - setWeight: 50
        - pause: { duration: 15m }
        - setWeight: 100
      canaryMetadata:
        labels:
          deployment: canary
---
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: error-rate-check
spec:
  metrics:
    - name: error-rate
      interval: 60s
      successCondition: result[0] < 0.01
      provider:
        prometheus:
          address: http://prometheus.monitoring:9090
          query: |
            sum(rate(http_requests_total{service="{{args.service}}",status=~"5.."}[5m]))
            / sum(rate(http_requests_total{service="{{args.service}}"}[5m]))
```

### Pattern 3: GitOps Directory Structure

```
infra/
  gitops/
    base/                    # Base manifests (shared across envs)
      rail-api/
        deployment.yaml
        service.yaml
        hpa.yaml
    overlays/
      dev/
        kustomization.yaml   # Dev-specific patches
        rail-api-patch.yaml
      staging/
        kustomization.yaml
      production/
        kustomization.yaml
        rail-api-patch.yaml  # Production replicas, resources
    apps/                    # ArgoCD Application definitions
      dev.yaml
      staging.yaml
      production.yaml
```

### Pattern 4: Deployment Gate with GitHub Actions

```yaml
# .github/workflows/deploy-production.yml
name: Deploy Production
on:
  workflow_dispatch:
    inputs:
      image_tag:
        description: 'Image tag to deploy'
        required: true

jobs:
  pre-deploy-checks:
    runs-on: ubuntu-latest
    steps:
      - name: Verify image exists in ECR
        run: aws ecr describe-images --repository-name iof/rail-api --image-ids imageTag=${{ inputs.image_tag }}

      - name: Verify staging health
        run: |
          STATUS=$(curl -sf https://staging-api.islamicopenfinance.com/health | jq -r '.status')
          [ "$STATUS" = "healthy" ] || exit 1

      - name: Check for open incidents
        run: |
          INCIDENTS=$(gh issue list --label "incident" --state open --json number | jq length)
          [ "$INCIDENTS" -eq 0 ] || (echo "Open incidents exist" && exit 1)

  approval:
    needs: pre-deploy-checks
    runs-on: ubuntu-latest
    environment: production  # Requires manual approval
    steps:
      - run: echo "Approved for production deployment"

  deploy:
    needs: approval
    runs-on: ubuntu-latest
    steps:
      - name: Update GitOps repo
        run: |
          cd infra/gitops/overlays/production
          kustomize edit set image rail-api=ecr.aws/iof/rail-api:${{ inputs.image_tag }}
          git commit -am "deploy: rail-api ${{ inputs.image_tag }}"
          git push

      - name: Wait for ArgoCD sync
        run: argocd app wait rail-api-production --timeout 300
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|---|---|---|
| kubectl apply in CI pipeline | Imperative, no audit trail, no drift detection | GitOps reconciliation (ArgoCD/Flux) |
| Deploy 100% immediately | Full blast radius on failure | Canary or blue-green with automated analysis |
| No health checks in rollout | Bad pods receive traffic | Readiness/liveness probes mandatory |
| Manual rollback procedures | Slow, error-prone under pressure | Rollback = revert Git commit, auto-reconcile |
| Shared config across environments | Dev changes leak to production | Kustomize overlays or Helm values per env |
| No deployment gates | Broken staging deploys to production | Automated checks + manual approval for prod |

## Implementation Checklist

- [ ] Set up GitOps repository structure (base + overlays per environment)
- [ ] Configure ArgoCD or Flux for automated reconciliation
- [ ] Implement canary or blue-green deployment strategy
- [ ] Add automated analysis templates (error rate, latency, saturation)
- [ ] Set up deployment gates with health checks and approval
- [ ] Configure rollback automation (revert on failed analysis)
- [ ] Add drift detection alerts (manual changes outside Git)
- [ ] Document promotion path: dev -> staging -> production

## References

- [ArgoCD Documentation](https://argo-cd.readthedocs.io/)
- [Argo Rollouts](https://argoproj.github.io/argo-rollouts/)
- [Flux CD](https://fluxcd.io/docs/)
- [GitOps Principles](https://opengitops.dev/)
