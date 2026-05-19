# Service Mesh

> Istio, Linkerd, mTLS, traffic management, observability, circuit breaking, and load balancing for secure microservice communication.

## Core Principles

1. **Zero-Trust Networking** — Every service-to-service call must be authenticated and encrypted. mTLS between all services is the baseline, not an upgrade. Trust nothing inside the network perimeter.
2. **Traffic Management Is Infrastructure** — Retries, timeouts, circuit breaking, and load balancing belong in the mesh, not in application code. Application developers should not implement retry logic.
3. **Observability Without Instrumentation** — The mesh provides distributed tracing, metrics, and access logs for all service-to-service traffic without modifying application code. Golden signals (latency, traffic, errors, saturation) are automatic.
4. **Progressive Traffic Shifting** — Route traffic by percentage, headers, or user attributes. This enables canary deployments, A/B testing, and gradual migrations at the infrastructure level.
5. **Sidecar Overhead Is Real** — Each sidecar proxy adds latency (~1-3ms per hop) and memory (~50-100MB). Measure the overhead and ensure it is acceptable for your latency budget.

## Patterns

### Pattern 1: mTLS Configuration (Istio)

```yaml
# PeerAuthentication: Enforce mTLS across namespace
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: iof-production
spec:
  mtls:
    mode: STRICT  # All traffic must be mTLS

---
# AuthorizationPolicy: Service-level access control
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: rail-api-policy
  namespace: iof-production
spec:
  selector:
    matchLabels:
      app: rail-api
  rules:
    - from:
        - source:
            principals: ["cluster.local/ns/iof-production/sa/api-gateway"]
            principals: ["cluster.local/ns/iof-production/sa/ledger-service"]
      to:
        - operation:
            methods: ["GET", "POST"]
            paths: ["/api/v1/*"]
```

### Pattern 2: Circuit Breaking and Retry

```yaml
# DestinationRule: Circuit breaking + connection pool
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: ledger-service
spec:
  host: ledger-service.iof-production.svc.cluster.local
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100
      http:
        h2UpgradePolicy: DEFAULT
        http1MaxPendingRequests: 100
        http2MaxRequests: 1000
        maxRequestsPerConnection: 10
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 10s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
    loadBalancer:
      simple: LEAST_REQUEST
```

### Pattern 3: Traffic Splitting for Canary

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: rail-api
spec:
  hosts:
    - rail-api.iof-production.svc.cluster.local
  http:
    - match:
        - headers:
            x-canary:
              exact: "true"
      route:
        - destination:
            host: rail-api
            subset: canary
    - route:
        - destination:
            host: rail-api
            subset: stable
          weight: 95
        - destination:
            host: rail-api
            subset: canary
          weight: 5
```

### Pattern 4: Observability with Distributed Tracing

```yaml
# Telemetry: Configure trace sampling
apiVersion: telemetry.istio.io/v1alpha1
kind: Telemetry
metadata:
  name: tracing-config
  namespace: iof-production
spec:
  tracing:
    - providers:
        - name: otel-collector
      randomSamplingPercentage: 10
      customTags:
        tenant_id:
          header:
            name: x-iof-tenant
        rail:
          header:
            name: x-iof-rail
```

```typescript
// Application: Propagate trace context (automatic with sidecar)
// The mesh handles span creation, but apps should add business context
app.use('*', async (c, next) => {
  const traceId = c.req.header('x-b3-traceid') ?? c.req.header('traceparent');
  c.set('traceId', traceId);
  logger.info({
    traceId,
    tenantId: c.get('tenantId'),
    path: c.req.path,
    method: c.req.method,
  }, 'Request received');
  await next();
});
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|---|---|---|
| Application-level retry logic with mesh retries | Double retries amplify failures exponentially | Configure retries in mesh only, remove from app |
| PERMISSIVE mTLS mode in production | Allows unencrypted traffic, defeats zero-trust | STRICT mode in production, PERMISSIVE only during migration |
| No circuit breaker configuration | Cascading failures across services | Configure outlierDetection on all DestinationRules |
| Mesh for single-service apps | Overhead without benefit | Use mesh only when you have 3+ communicating services |
| Ignoring sidecar resource limits | Unbounded proxy memory/CPU usage | Set explicit resource requests/limits on sidecar |
| No rate limiting at mesh level | Individual services must implement rate limiting | Use EnvoyFilter or mesh-level rate limiting |

## Implementation Checklist

- [ ] Enable STRICT mTLS across all production namespaces
- [ ] Configure AuthorizationPolicies for service-to-service access
- [ ] Set up circuit breaking with outlier detection on all services
- [ ] Configure retry budgets in mesh (remove app-level retries)
- [ ] Set up distributed tracing with appropriate sampling rate
- [ ] Define traffic splitting rules for canary deployments
- [ ] Set resource limits on sidecar proxies
- [ ] Monitor mesh control plane health and proxy sync status

## References

- [Istio Documentation](https://istio.io/latest/docs/)
- [Linkerd Documentation](https://linkerd.io/2/overview/)
- [Envoy Proxy Documentation](https://www.envoyproxy.io/docs)
- [CNCF Service Mesh Interface](https://smi-spec.io/)
