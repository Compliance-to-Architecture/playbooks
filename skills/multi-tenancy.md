# Multi-Tenancy Skill

> **Enforcement**: suggest
> **Triggers**: tenant, multi-tenant, isolation, workspace, RLS, subdomain, organization

## Overview

Enterprise multi-tenancy patterns covering data isolation, tenant resolution, workspace management, and per-tenant configuration.

## Tenant Resolution

```typescript
// packages/tenant-core/src/resolver.ts

type TenantResolutionMethod = "subdomain" | "header" | "jwt-claim" | "path";

async function resolveTenant(request: Request): Promise<string> {
  // 1. Try subdomain: tenant.platform.com
  const host = request.headers.get("host") ?? "";
  const subdomain = host.split(".")[0];
  if (subdomain && subdomain !== "www" && subdomain !== "api") {
    const tenant = await getTenantBySubdomain(subdomain);
    if (tenant) return tenant.id;
  }

  // 2. Try header: X-Tenant-ID
  const headerTenantId = request.headers.get("X-Tenant-ID");
  if (headerTenantId) {
    const tenant = await getTenantById(headerTenantId);
    if (tenant) return tenant.id;
  }

  // 3. Try JWT claim
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (token) {
    const payload = decodeJWT(token);
    if (payload.tenant_id) return payload.tenant_id;
  }

  throw new TenantResolutionError("Could not resolve tenant from request");
}
```

## Data Isolation (Row-Level Security)

```sql
-- db/migrations/001_enable_rls.sql
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON contracts
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Set tenant context per request
SET app.current_tenant_id = 'tenant-uuid-here';
```

```typescript
// packages/db-core/src/tenant-context.ts
async function withTenantContext<T>(
  tenantId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await prisma.$executeRaw`SET app.current_tenant_id = ${tenantId}`;
  try {
    return await fn();
  } finally {
    await prisma.$executeRaw`RESET app.current_tenant_id`;
  }
}
```

## Tenant Provisioning

```typescript
// packages/tenant-core/src/provisioning.ts

async function provisionTenant(params: {
  name: string;
  subdomain: string;
  plan: string;
  adminEmail: string;
}): Promise<Tenant> {
  // 1. Create tenant record
  const tenant = await db.tenants.create({
    data: {
      name: params.name,
      subdomain: params.subdomain,
      planId: params.plan,
      status: "provisioning",
    },
  });

  // 2. Create admin user
  await createUser({
    tenantId: tenant.id,
    email: params.adminEmail,
    role: "tenant_admin",
  });

  // 3. Create default workspace
  await createWorkspace({
    tenantId: tenant.id,
    name: "Default",
    isDefault: true,
  });

  // 4. Seed initial data
  await seedTenantData(tenant.id, params.plan);

  // 5. Setup billing
  await setupBilling(tenant.id, params.plan, params.adminEmail);

  // 6. Configure DNS (if custom subdomain)
  await configureDNS(params.subdomain);

  // 7. Mark as active
  await db.tenants.update({
    where: { id: tenant.id },
    data: { status: "active" },
  });

  return tenant;
}
```

## Per-Tenant Configuration

```typescript
// packages/tenant-core/src/config.ts

interface TenantConfig {
  branding: { logo?: string; primaryColor?: string; appName?: string };
  features: Record<string, boolean>;
  limits: Record<string, number>;
  integrations: Record<string, { enabled: boolean; config: Record<string, string> }>;
  compliance: { standards: string[]; dataResidency: string };
}

async function getTenantConfig(tenantId: string): Promise<TenantConfig> {
  const cached = await redis.get(`tenant:${tenantId}:config`);
  if (cached) return JSON.parse(cached);

  const config = await db.tenantConfigs.findUnique({ where: { tenantId } });
  assert(config, `No config for tenant ${tenantId}`);

  await redis.set(`tenant:${tenantId}:config`, JSON.stringify(config), "EX", 300);
  return config;
}
```

## Core Principles

- **Data isolation is non-negotiable**: Every query must be scoped to a tenant; cross-tenant data leakage is a critical security defect
- **Tenant context propagation**: The resolved tenant ID must flow through every layer (middleware, service, repository, logging)
- **Fail-closed resolution**: If tenant cannot be resolved from request, reject with 403; never fall back to a default tenant
- **Configuration inheritance**: Tenant config inherits from plan defaults, with tenant-specific overrides layered on top
- **Provisioning is atomic**: Tenant creation must complete all steps (record, admin user, workspace, billing, DNS) or roll back entirely

## Patterns

- **Row-Level Security (RLS)**: Use PostgreSQL RLS policies to enforce tenant isolation at the database level
- **Tenant-scoped caching**: All cache keys must include tenant ID to prevent cross-tenant cache pollution
- **Subdomain-first resolution**: Resolve tenant from subdomain, then header, then JWT claim, in priority order
- **Lazy resource provisioning**: Create tenant-specific resources (search indexes, storage buckets) on first use rather than at provisioning time
- **Tenant-aware logging**: Include `tenant_id` in every structured log entry for audit and debugging

## Anti-Patterns

- **Global queries without tenant filter**: Never run queries that scan across all tenants unless explicitly authorized for admin operations
- **Shared cache keys**: Never use cache keys that omit tenant ID; this leads to data leakage between tenants
- **Tenant ID in URL path**: Avoid exposing tenant IDs in public URLs; use subdomains or headers instead
- **Synchronous provisioning**: Do not block the signup request on DNS propagation or external service setup; use async provisioning with status polling
- **Hardcoded tenant limits**: Never embed plan limits in application code; store them in the plan/config layer

## Checklist

- [ ] RLS policies enabled on all tenant-scoped tables
- [ ] Tenant context set and reset correctly in every request lifecycle
- [ ] All cache keys include tenant ID prefix
- [ ] Provisioning rollback tested for each failure scenario
- [ ] Cross-tenant access explicitly blocked and tested with integration tests

## References

- [PostgreSQL Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Multi-tenant SaaS architecture patterns (AWS)](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/multi-tenant-saas-architecture.html)
- [Prisma multi-tenancy guide](https://www.prisma.io/docs/guides/other-guides/multi-tenancy)
- [Cerbos tenant-scoped ABAC](https://docs.cerbos.dev/)
