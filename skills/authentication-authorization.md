# Authentication & Authorization Skill

> **Enforcement**: suggest
> **Triggers**: auth, login, signup, jwt, oauth, sso, saml, rbac, abac, permission, role, session, mfa, 2fa

## Overview

Enterprise authentication and authorization patterns covering JWT, OAuth2, SSO/SAML, MFA, API keys, RBAC/ABAC, and session management.

## Authentication Patterns

### JWT Token Flow
```typescript
// packages/auth-core/src/jwt.ts

interface TokenPayload {
  sub: string;          // User ID
  tenant_id: string;    // Tenant ID
  roles: string[];      // User roles
  permissions: string[]; // Direct permissions
  iat: number;
  exp: number;
}

function generateTokens(user: User, tenant: Tenant): {
  accessToken: string;
  refreshToken: string;
} {
  const accessToken = jwt.sign(
    {
      sub: user.id,
      tenant_id: tenant.id,
      roles: user.roles,
      permissions: user.permissions,
    },
    process.env.JWT_SECRET!,
    { expiresIn: "15m" },
  );

  const refreshToken = jwt.sign(
    { sub: user.id, type: "refresh" },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: "7d" },
  );

  return { accessToken, refreshToken };
}
```

### OAuth2 / SSO Integration
```typescript
// packages/auth-core/src/oauth.ts

// Support multiple providers via adapter pattern
interface OAuthProvider {
  name: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  getAuthUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;
  getUserInfo(accessToken: string): Promise<OAuthUserInfo>;
}

// Pre-built providers
const providers: Record<string, OAuthProvider> = {
  clerk: new ClerkProvider(),
  google: new GoogleProvider(),
  microsoft: new MicrosoftProvider(),
  github: new GitHubProvider(),
  okta: new OktaProvider(),
};
```

### API Key Authentication
```typescript
// packages/auth-core/src/api-keys.ts

async function validateApiKey(key: string): Promise<{
  valid: boolean;
  tenantId?: string;
  scopes?: string[];
  rateLimit?: number;
}> {
  const hash = createHash("sha256").update(key).digest("hex");
  const apiKey = await db.apiKeys.findUnique({ where: { hash } });

  if (!apiKey || apiKey.revokedAt) return { valid: false };
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return { valid: false };

  // Update last used
  await db.apiKeys.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    valid: true,
    tenantId: apiKey.tenantId,
    scopes: apiKey.scopes,
    rateLimit: apiKey.rateLimit,
  };
}
```

## Authorization (Cerbos ABAC)

```typescript
// packages/auth-core/src/authorization.ts

import { GRPC } from "@cerbos/grpc";

const cerbos = new GRPC(process.env.CERBOS_URL!, { tls: false });

async function checkPermission(params: {
  principal: { id: string; roles: string[]; attributes: Record<string, unknown> };
  resource: { kind: string; id: string; attributes: Record<string, unknown> };
  action: string;
}): Promise<boolean> {
  const result = await cerbos.checkResource({
    principal: {
      id: params.principal.id,
      roles: params.principal.roles,
      attributes: params.principal.attributes,
    },
    resource: {
      kind: params.resource.kind,
      id: params.resource.id,
      attributes: params.resource.attributes,
    },
    actions: [params.action],
  });

  return result.isAllowed(params.action);
}

// Middleware
function authorize(resourceKind: string, action: string) {
  return async (c: Context, next: () => Promise<void>) => {
    const user = c.get("user");
    const resourceId = c.req.param("id") ?? "";

    const allowed = await checkPermission({
      principal: { id: user.id, roles: user.roles, attributes: { tenant_id: user.tenantId } },
      resource: { kind: resourceKind, id: resourceId, attributes: {} },
      action,
    });

    if (!allowed) {
      return c.json({ error: { code: "FORBIDDEN", message: "Access denied" } }, 403);
    }

    await next();
  };
}
```

## MFA / Two-Factor Authentication

```typescript
// packages/auth-core/src/mfa.ts
import { authenticator } from "otplib";

async function enableMFA(userId: string): Promise<{
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}> {
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(userId, "YourApp", secret);

  const backupCodes = Array.from({ length: 10 }, () =>
    randomBytes(4).toString("hex"),
  );

  await db.users.update({
    where: { id: userId },
    data: {
      mfaSecret: encrypt(secret),
      mfaBackupCodes: backupCodes.map(c => hashCode(c)),
      mfaEnabled: true,
    },
  });

  return { secret, qrCodeUrl: otpauth, backupCodes };
}

async function verifyMFA(userId: string, token: string): Promise<boolean> {
  const user = await db.users.findUnique({ where: { id: userId } });
  assert(user?.mfaEnabled, "MFA not enabled");

  const secret = decrypt(user.mfaSecret!);
  return authenticator.verify({ token, secret });
}

## Core Principles

- **Short-Lived Access Tokens**: Access tokens must expire within 15 minutes. Refresh tokens are long-lived (7 days) and rotated on each use. Never extend access token lifetime to avoid refresh complexity.
- **Hash API Keys at Rest**: Store only the SHA-256 hash of API keys in the database. The raw key is shown once at creation and never stored. This limits exposure if the database is compromised.
- **Attribute-Based Authorization (ABAC)**: Use Cerbos policies to evaluate permissions based on principal attributes (role, tenant, plan) and resource attributes (owner, status, classification). RBAC alone is insufficient for multi-tenant SaaS.
- **Fail Closed**: Any authorization error — policy evaluation failure, network timeout to Cerbos, missing role — must deny access. Never default to allowing when the decision is uncertain.
- **MFA for Privileged Actions**: Require TOTP verification before high-risk operations (admin role changes, API key creation, billing changes, data exports) regardless of session age.

## Patterns

- **Adapter Pattern for OAuth Providers**: Implement a single `OAuthProvider` interface and swap concrete providers (Clerk, Google, Okta) without changing call sites. This isolates provider churn behind a stable interface.
- **JWT Claim Enrichment at Edge**: Validate and decode the JWT at the Cloudflare Worker edge layer, then forward enriched headers (`X-Tenant-ID`, `X-User-Roles`) to backend services. Backend services trust headers from the edge, not raw tokens.
- **Scoped API Keys**: Each API key carries an explicit `scopes` list (e.g., `["contracts:read", "reports:write"]`). Middleware validates that the requested operation's required scope is present in the key's scope list.
- **Backup Codes for MFA Recovery**: Generate 10 single-use backup codes at MFA enrollment. Store only hashed values. Invalidate a code immediately after use and alert the user via email.
- **Session Binding**: Bind refresh tokens to the originating device fingerprint (user-agent + IP class). Refresh attempts from a mismatched fingerprint trigger a re-authentication challenge.

## Anti-Patterns

- **Long-Lived Access Tokens**: Tokens valid for hours or days become a permanent credential if stolen. Use 15-minute access tokens and secure refresh token rotation instead.
- **Storing Raw Secrets**: Saving plaintext passwords, API keys, or MFA secrets in the database exposes all credentials in a single breach. Always hash (Argon2id for passwords, SHA-256 for API keys).
- **Role Checks in Application Code**: Scattering `if (user.role === "admin")` checks across route handlers creates an unmaintainable permission surface. Centralize all authorization in Cerbos policies evaluated through a single middleware.
- **Trusting Client-Supplied Tenant IDs**: Never accept `tenantId` from the request body or query string as the authoritative tenant. Derive it from the verified JWT claim or API key record only.
- **Skipping MFA for API Clients**: Machine-to-machine clients should use scoped API keys with IP allowlisting, not username/password with MFA bypassed. Bypassed MFA is no MFA.

## Checklist

- [ ] Access tokens expire in ≤ 15 minutes; refresh tokens rotate on every use
- [ ] API keys stored as SHA-256 hash only; raw key shown once at creation
- [ ] All authorization evaluated through Cerbos `checkResource()` — no inline role checks
- [ ] OAuth providers implemented behind the `OAuthProvider` adapter interface
- [ ] MFA (TOTP) enforced for all privileged administrative actions
- [ ] Backup codes generated, hashed, and single-use at MFA enrollment
- [ ] JWT validated at edge; enriched headers forwarded to backend services
- [ ] Scoped API keys — each key specifies allowed operations explicitly

## References

- [Cerbos Documentation](https://docs.cerbos.dev/)
- [RFC 9068 — JWT Profile for OAuth 2.0 Access Tokens](https://www.rfc-editor.org/rfc/rfc9068)
- [NIST SP 800-63B — Digital Identity Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)
- [otplib — TOTP/HOTP for Node.js](https://github.com/yeojz/otplib)
- [Argon2 Password Hashing](https://github.com/nicowillis/argon2)
```
