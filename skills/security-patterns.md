# Security Patterns Skill

> **Enforcement**: suggest
> **Triggers**: security, vulnerability, encryption, xss, injection, owasp, cve, secret, csrf

## Overview

Enterprise security patterns covering OWASP Top 10 prevention, secret management, input validation, and security headers.

## OWASP Top 10 Prevention

### 1. Injection Prevention
```typescript
// ALWAYS use parameterized queries (Prisma does this automatically)
const user = await prisma.users.findUnique({ where: { email } }); // Safe
// NEVER: `SELECT * FROM users WHERE email = '${email}'`
```

### 2. Authentication
```typescript
// Use established libraries (Clerk, Auth0, Lucia)
// Never implement password hashing from scratch
import { hash, verify } from "@node-rs/argon2";
const hashed = await hash(password, { memoryCost: 65536, timeCost: 3 });
```

### 3. XSS Prevention
```typescript
// React auto-escapes JSX — safe by default
// NEVER use dangerouslySetInnerHTML with user input
// Sanitize if you must render HTML:
import DOMPurify from "dompurify";
const safe = DOMPurify.sanitize(userInput);
```

### 4. CSRF Protection
```typescript
// Use SameSite cookies + CSRF tokens
app.use(csrf({ origin: process.env.ALLOWED_ORIGINS?.split(",") }));
```

### 5. Security Headers
```typescript
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "0"); // Deprecated, CSP replaces
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.header("Content-Security-Policy", "default-src 'self'; script-src 'self'");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
});
```

## Secret Management

```typescript
// NEVER hardcode secrets
// Use environment variables + secret managers
const dbUrl = process.env.DATABASE_URL;
assert(dbUrl, "DATABASE_URL is required");

// Rotate secrets on schedule
// Use AWS SSM, Cloudflare Secrets, or Vault
```

## Input Validation (Zod)

```typescript
import { z } from "zod";

const CreateUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100),
  password: z.string().min(12).max(128),
  role: z.enum(["user", "admin"]),
});

// Validate at system boundaries only
app.post("/api/v1/users", async (c) => {
  const body = CreateUserSchema.parse(await c.req.json());
  // body is now typed and validated
});
```

## Dependency Scanning

```bash
# Audit dependencies for known vulnerabilities
pnpm audit
# Use GitHub Dependabot or Renovate for automated updates
# Scan Docker images with Trivy
trivy image my-app:latest
```

## Core Principles

- **Defense in depth**: Apply security controls at every layer (network, application, data); never rely on a single boundary
- **Validate at system boundaries**: All external input must be validated and sanitized at the point of entry using schemas (Zod)
- **Least privilege everywhere**: Every service account, API key, and user role gets the minimum permissions required
- **Secrets never in code**: No credentials, tokens, or keys in source code, logs, error messages, or client-side bundles
- **Shift security left**: Run dependency audits, SAST, and secret scanning in CI before code reaches production

## Patterns

- **Schema-based input validation**: Use Zod schemas at API boundaries to reject malformed input before it reaches business logic
- **Security headers middleware**: Apply a standard set of security headers (CSP, HSTS, X-Frame-Options) via shared middleware on all services
- **Parameterized queries only**: Use ORMs (Prisma) or parameterized query builders; never concatenate user input into SQL
- **Rate limiting per endpoint**: Apply rate limits based on authentication level and endpoint sensitivity
- **Dependency pinning with audit**: Pin all dependency versions in lockfiles and run `pnpm audit` in CI on every build

## Anti-Patterns

- **Rolling custom auth**: Never implement password hashing, session management, or JWT signing from scratch; use established libraries
- **Logging sensitive data**: Never log passwords, tokens, full card numbers, or PII in any log level
- **Client-side-only validation**: Frontend validation is for UX only; all security validation must be server-side
- **Disabling CORS for convenience**: Never set `Access-Control-Allow-Origin: *` on authenticated endpoints
- **Ignoring dependency vulnerabilities**: Never suppress audit findings without documented justification and a remediation timeline

## Checklist

- [ ] All API endpoints validate input with Zod schemas before processing
- [ ] Security headers middleware applied to all services
- [ ] No secrets in source code (verified by secret scanning in CI)
- [ ] `pnpm audit` runs in CI and blocks on critical/high vulnerabilities
- [ ] CSRF protection enabled on all state-changing endpoints

## References

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [Zod validation library](https://zod.dev/)
- [Helmet.js security headers](https://helmetjs.github.io/)
