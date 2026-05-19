# Observability & Monitoring Skill

> **Enforcement**: suggest
> **Triggers**: logging, monitoring, tracing, metrics, alerting, health-check, observability, dashboard, grafana, sentry

## Overview

Enterprise observability stack covering structured logging, distributed tracing, health checks, alerting, and dashboards.

## Structured Logging

```typescript
// packages/observability-core/src/logger.ts
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: process.env.SERVICE_NAME,
    env: process.env.NODE_ENV,
    version: process.env.APP_VERSION,
  },
});

// Usage: logger.info({ tenantId, userId, action }, "Contract created");
```

## Health Check Endpoint

```typescript
// packages/service-core/src/health.ts
app.get("/health", async (c) => {
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkExternalDeps(),
  ]);

  const status = checks.every(c => c.status === "fulfilled") ? "healthy" : "degraded";

  return c.json({
    status,
    version: process.env.APP_VERSION,
    uptime: process.uptime(),
    checks: checks.map((check, i) => ({
      name: ["database", "redis", "external"][i],
      status: check.status === "fulfilled" ? "up" : "down",
      latency_ms: check.status === "fulfilled" ? check.value.latency_ms : null,
    })),
  }, status === "healthy" ? 200 : 503);
});
```

## Distributed Tracing (OpenTelemetry)

```typescript
// packages/observability-core/src/tracing.ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  }),
  serviceName: process.env.SERVICE_NAME,
});

sdk.start();
```

## Alerting Rules

```yaml
# infra/monitoring/alerts.yaml
groups:
  - name: service-health
    rules:
      - alert: ServiceDown
        expr: up == 0
        for: 2m
        labels:
          severity: critical
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: high
      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: medium
```

## Core Principles

- **Structured logging everywhere**: All log output must be JSON with service, tenant, request ID, and severity fields; no unstructured text logs
- **Observe the three pillars**: Logs, metrics, and traces must all be present; any one alone is insufficient for production debugging
- **Health checks are contracts**: Every service exposes `/health` returning structured JSON with dependency status and latency
- **Alert on symptoms, not causes**: Alert on user-facing impact (error rate, latency) rather than internal metrics (CPU, memory) unless they indicate imminent failure
- **Correlation IDs flow end-to-end**: Every request gets a trace/request ID that propagates across all service boundaries

## Patterns

- **Request-scoped child loggers**: Create a child logger per request with pre-bound context (request ID, tenant ID, user ID)
- **Health check dependency cascade**: Health endpoints check all critical dependencies (database, cache, external APIs) with individual status reporting
- **RED method for services**: Track Rate, Errors, and Duration for every service endpoint as the baseline metrics
- **Log sampling in high-throughput paths**: Sample debug/info logs at high-traffic endpoints to control volume without losing visibility
- **Dashboard-per-service**: Each service gets its own Grafana dashboard with standardized panels for latency, error rate, and throughput

## Anti-Patterns

- **Logging sensitive data**: Never log PII, tokens, passwords, or full request/response bodies containing user data
- **Alerting without runbooks**: Every alert must have a linked runbook; alerts without remediation guidance create noise
- **Catch-all error suppression**: Never swallow errors silently; log them with full context even if the operation can continue
- **Polling-based monitoring only**: Do not rely solely on periodic polling; use push-based metrics and event-driven alerting
- **Unbounded log retention**: Always configure retention policies; unlimited log storage leads to cost overruns and compliance issues

## Checklist

- [ ] All services emit structured JSON logs with required fields (service, env, request_id, severity)
- [ ] OpenTelemetry tracing configured with proper service name and exporter
- [ ] Health check endpoints return dependency status with latency measurements
- [ ] Alerting rules cover service downtime, high error rate, and high latency
- [ ] Dashboards exist for each service with RED method metrics

## References

- [OpenTelemetry documentation](https://opentelemetry.io/docs/)
- [Pino structured logger](https://github.com/pinojs/pino)
- [Grafana alerting best practices](https://grafana.com/docs/grafana/latest/alerting/)
- [Google SRE — Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
