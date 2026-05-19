# Kubernetes Patterns

> Pod design, operators, Helm charts, RBAC, resource limits, HPA, PDB, and network policies for production-grade container orchestration.

## Core Principles

1. **Resource Limits Are Mandatory** — Every container must declare CPU and memory requests and limits. Without them, a single pod can starve the entire node. Requests guarantee scheduling; limits prevent runaway consumption.
2. **Pod Disruption Budgets Protect Availability** — PDBs ensure that voluntary disruptions (node drains, upgrades) never take down more than the allowed number of replicas simultaneously.
3. **Least Privilege by Default** — Pods run as non-root, with read-only root filesystems, dropped capabilities, and no privilege escalation. RBAC grants minimum permissions per service account.
4. **Health Probes Drive Reliability** — Liveness probes restart stuck containers. Readiness probes remove unhealthy pods from service endpoints. Startup probes handle slow-starting apps. All three are required.
5. **Declarative Configuration Over Imperative Commands** — Never `kubectl edit` in production. All configuration lives in Git (Helm charts, Kustomize) and is applied through CI/CD pipelines.

## Patterns

### Pattern 1: Production-Ready Pod Spec

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rail-api
  labels:
    app: rail-api
    version: v1
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  selector:
    matchLabels:
      app: rail-api
  template:
    metadata:
      labels:
        app: rail-api
    spec:
      serviceAccountName: rail-api
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
      containers:
        - name: rail-api
          image: ecr.aws/iof/rail-api:sha-abc1234
          ports:
            - containerPort: 3000
              protocol: TCP
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: 1000m
              memory: 512Mi
          securityContext:
            readOnlyRootFilesystem: true
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
          startupProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 30
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            periodSeconds: 10
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            periodSeconds: 30
            failureThreshold: 3
          env:
            - name: NODE_ENV
              value: production
            - name: DATABASE_URL
              valueFrom:
                secretRef:
                  name: rail-api-secrets
                  key: database-url
          volumeMounts:
            - name: tmp
              mountPath: /tmp
      volumes:
        - name: tmp
          emptyDir: {}
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app: rail-api
```

### Pattern 2: Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: rail-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: rail-api
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: 100
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 25
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
```

### Pattern 3: Network Policy for Namespace Isolation

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: rail-api-netpol
  namespace: iof-production
spec:
  podSelector:
    matchLabels:
      app: rail-api
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: api-gateway
        - podSelector:
            matchLabels:
              app: ledger-service
      ports:
        - protocol: TCP
          port: 3000
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432
    - to:
        - podSelector:
            matchLabels:
              app: redis
      ports:
        - protocol: TCP
          port: 6379
    - to:  # DNS
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
```

### Pattern 4: Pod Disruption Budget

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: rail-api-pdb
spec:
  minAvailable: 2  # Or use maxUnavailable: 1
  selector:
    matchLabels:
      app: rail-api
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|---|---|---|
| No resource limits | Pod can consume entire node resources | Always set requests and limits |
| Running as root | Security vulnerability, container escape risk | runAsNonRoot: true, drop ALL capabilities |
| kubectl edit in production | No audit trail, drift from Git state | All changes through Git + CI/CD pipeline |
| Single replica for stateless services | No availability during restarts or failures | Minimum 2 replicas with PDB |
| No topology spread constraints | All replicas on same node/zone | Spread across zones with maxSkew: 1 |
| Using :latest image tag | Non-deterministic deployments, rollback impossible | SHA-based tags for immutable references |

## Implementation Checklist

- [ ] Set resource requests and limits on all containers
- [ ] Configure all three health probes (startup, readiness, liveness)
- [ ] Apply PodDisruptionBudgets for all production deployments
- [ ] Set up HPA with appropriate metrics and scaling behavior
- [ ] Enable network policies for namespace and pod isolation
- [ ] Configure topology spread constraints across availability zones
- [ ] Apply security context (non-root, read-only filesystem, no escalation)
- [ ] Use Helm charts or Kustomize for environment-specific configuration

## References

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Kubernetes Best Practices](https://cloud.google.com/architecture/best-practices-for-running-cost-effective-kubernetes-applications-on-gke)
- [Helm Charts Best Practices](https://helm.sh/docs/chart_best_practices/)
- [NSA Kubernetes Hardening Guide](https://media.defense.gov/2022/Aug/29/2003066362/-1/-1/0/CTR_KUBERNETES_HARDENING_GUIDANCE_1.2_20220829.PDF)
