# OAuth Providers

> Integrate OAuth 2.0/OIDC social login with PKCE, token refresh, and multi-provider support for secure delegated authentication.

## Core Principles

1. **PKCE Everywhere** — All OAuth flows must use Proof Key for Code Exchange (S256), including server-side confidential clients, to prevent authorization code interception attacks.
2. **Token Lifecycle Management** — Access tokens are short-lived (5-15 min), refresh tokens rotated on every use with reuse detection, and revocation propagated immediately across all sessions.
3. **Provider Abstraction** — Normalize provider-specific claims (Google, GitHub, Microsoft, Apple) into a canonical user profile behind a unified adapter interface to prevent vendor lock-in.

## Patterns

### Pattern 1: PKCE Authorization Code Flow

Generate a cryptographic code verifier and challenge before redirecting to the authorization endpoint, then exchange the code with the verifier to obtain tokens.

```typescript
import crypto from "node:crypto";

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

async function initiateOAuthFlow(provider: OAuthProvider): Promise<string> {
  const { verifier, challenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString("hex");
  await sessionStore.set(state, { verifier, provider: provider.name }, { ttl: 600 });
  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: provider.redirectUri,
    response_type: "code",
    scope: provider.scopes.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${provider.authorizationUrl}?${params.toString()}`;
}
```

### Pattern 2: Multi-Provider Profile Normalization

Map each provider's unique claim structure into a canonical profile to unify downstream identity logic regardless of the upstream IdP.

```typescript
interface CanonicalProfile {
  provider: string;
  providerId: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
}

const normalizers: Record<string, (raw: any) => CanonicalProfile> = {
  google: (raw) => ({
    provider: "google",
    providerId: raw.sub,
    email: raw.email,
    emailVerified: raw.email_verified ?? false,
    displayName: raw.name,
    avatarUrl: raw.picture ?? null,
  }),
  github: (raw) => ({
    provider: "github",
    providerId: String(raw.id),
    email: raw.email,
    emailVerified: true,
    displayName: raw.login,
    avatarUrl: raw.avatar_url ?? null,
  }),
};
```

### Pattern 3: Refresh Token Rotation with Reuse Detection

Rotate refresh tokens on every use, flag reuse as a compromise signal, and revoke the entire token family when detected.

```typescript
async function refreshAccessToken(refreshToken: string): Promise<TokenPair> {
  const stored = await db.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
  });
  if (!stored) throw new AuthError("Invalid refresh token");
  if (stored.usedAt) {
    await db.refreshToken.deleteMany({ where: { familyId: stored.familyId } });
    await revokeAllSessions(stored.userId);
    throw new AuthError("Refresh token reuse detected — all sessions revoked");
  }
  await db.refreshToken.update({
    where: { id: stored.id },
    data: { usedAt: new Date() },
  });
  const newRefresh = crypto.randomBytes(32).toString("base64url");
  await db.refreshToken.create({
    data: {
      tokenHash: hashToken(newRefresh),
      userId: stored.userId,
      familyId: stored.familyId,
      expiresAt: addDays(new Date(), 30),
    },
  });
  return { accessToken: signJwt({ sub: stored.userId }, { expiresIn: "15m" }), refreshToken: newRefresh };
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|-------------|-------------|-----------------|
| Storing tokens in localStorage | XSS attacks can exfiltrate tokens from JavaScript-accessible storage | Use httpOnly, secure, SameSite cookies or server-side sessions |
| OAuth without PKCE | Authorization code interception attacks succeed without proof key | Always use S256 PKCE challenge on all flows |
| Long-lived access tokens (hours+) | Stolen tokens remain valid far too long to mitigate | 5-15 min access tokens with rotating refresh tokens |
| Skipping `state` parameter validation | Enables CSRF attacks linking victim accounts to attacker identities | Generate cryptographic state, validate on callback before exchange |

## Implementation Checklist

- [ ] PKCE (S256) enabled for all OAuth flows with verifier stored server-side
- [ ] Refresh token rotation implemented with family-based reuse detection
- [ ] Provider-specific claims normalized into canonical profile schema
- [ ] State parameter generated, stored, and validated on every callback
- [ ] Token revocation endpoint implemented and called on logout and session termination

## References

- [OAuth 2.0 Security Best Current Practice (RFC 9700)](https://datatracker.ietf.org/doc/html/rfc9700)
- [PKCE for OAuth Public Clients (RFC 7636)](https://datatracker.ietf.org/doc/html/rfc7636)
- [OpenID Connect Core 1.0 Specification](https://openid.net/specs/openid-connect-core-1_0.html)
