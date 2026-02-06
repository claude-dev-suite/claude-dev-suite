---
name: oauth2
description: |
  OAuth 2.0 authorization framework. Covers flows, tokens, and
  provider integration. Use for third-party authentication.

  USE WHEN: user mentions "OAuth", "Google login", "GitHub auth", "social login", "authorization code flow", "PKCE", asks about "third-party auth", "provider integration"

  DO NOT USE FOR: JWT tokens (use jwt skill), NextAuth.js (use nextauth skill), API keys, simple password auth
allowed-tools: Read, Grep, Glob, Write, Edit
---
# OAuth 2.0 Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `oauth2` for comprehensive documentation.

## Authorization Code Flow (Recommended)

```
1. User clicks "Login with Google"
2. Redirect to provider:
   GET https://accounts.google.com/oauth/authorize
     ?client_id=xxx
     &redirect_uri=https://app.com/callback
     &response_type=code
     &scope=openid email profile
     &state=random_state

3. User authorizes, provider redirects:
   GET https://app.com/callback?code=xxx&state=random_state

4. Backend exchanges code for tokens:
   POST https://oauth2.googleapis.com/token
     client_id=xxx
     client_secret=xxx
     code=xxx
     grant_type=authorization_code
     redirect_uri=https://app.com/callback

5. Receive tokens:
   { "access_token": "...", "refresh_token": "...", "id_token": "..." }
```

## Implementation

```typescript
// Step 1: Generate auth URL
function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${process.env.APP_URL}/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state: generateRandomState(),
  });
  return `https://accounts.google.com/oauth/authorize?${params}`;
}

// Step 2: Handle callback
async function handleCallback(code: string) {
  const tokens = await exchangeCodeForTokens(code);
  const userInfo = await getUserInfo(tokens.access_token);
  const user = await findOrCreateUser(userInfo);
  return generateSessionToken(user);
}
```

## When NOT to Use This Skill

- **Simple JWT authentication** - Use `jwt` skill for custom token-based auth
- **NextAuth.js integration** - Use `nextauth` skill for Next.js projects
- **Internal authentication** - Use traditional username/password with JWT
- **API-to-API communication** - Use API keys or mTLS

## Common Flows

| Flow | Use Case |
|------|----------|
| Authorization Code | Web apps (server-side) |
| Authorization Code + PKCE | SPAs, mobile apps |
| Client Credentials | Machine-to-machine |
| Refresh Token | Long-lived sessions |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| No state parameter | Vulnerable to CSRF attacks | Always generate and validate state |
| PKCE without S256 | Weak code challenge | Use S256 (SHA-256), not plain |
| Storing tokens in localStorage | XSS vulnerability | Use httpOnly cookies or secure storage |
| Ignoring provider errors | Silent failures | Handle all error codes properly |
| Hardcoded redirect URLs | Security risk | Use environment variables |
| No nonce validation | ID token replay attacks | Validate nonce for OpenID Connect |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Invalid redirect_uri" | URL mismatch with provider | Exact match required, check protocol/trailing slash |
| "Invalid state" | CSRF token mismatch | Verify state cookie exists and matches |
| "Invalid code" | Code expired or used twice | Codes expire in ~10 minutes, can only be used once |
| "Invalid client" | Wrong client_id/secret | Verify credentials from provider console |
| CORS errors | Same-origin policy | Use backend proxy for token exchange |
| "Invalid grant" | Code verifier mismatch | Ensure code_verifier matches code_challenge |

## PKCE Extension

```typescript
// For SPAs - no client_secret needed
const codeVerifier = generateRandomString(64);
const codeChallenge = base64url(sha256(codeVerifier));

// Add to auth URL
params.set('code_challenge', codeChallenge);
params.set('code_challenge_method', 'S256');

// Include in token exchange
body.code_verifier = codeVerifier;
```

## Production Readiness

### Security Configuration

```typescript
// Secure state parameter (CSRF protection)
import { randomBytes, createHash } from 'crypto';

function generateState(): string {
  return randomBytes(32).toString('hex');
}

// Store state in httpOnly cookie before redirect
res.cookie('oauth_state', state, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax', // Required for OAuth redirects
  maxAge: 10 * 60 * 1000, // 10 minutes
});

// Validate state on callback
function validateState(receivedState: string, storedState: string): void {
  if (!receivedState || !storedState || receivedState !== storedState) {
    throw new Error('Invalid state parameter - possible CSRF attack');
  }
}
```

### PKCE Implementation (Required for SPAs/Mobile)

```typescript
// Generate PKCE parameters
function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 64);

  const challenge = createHash('sha256')
    .update(verifier)
    .digest('base64url');

  return { verifier, challenge };
}

// Store verifier securely (server-side session or encrypted cookie)
const { verifier, challenge } = generatePKCE();
session.codeVerifier = verifier;

// Include in authorization URL
const authUrl = new URL('https://provider.com/oauth/authorize');
authUrl.searchParams.set('code_challenge', challenge);
authUrl.searchParams.set('code_challenge_method', 'S256');

// Include in token exchange
const tokenResponse = await fetch('https://provider.com/oauth/token', {
  method: 'POST',
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: session.codeVerifier,
    client_id: process.env.OAUTH_CLIENT_ID!,
    redirect_uri: process.env.OAUTH_REDIRECT_URI!,
  }),
});
```

### Token Handling

```typescript
// Secure token storage and refresh
async function handleTokens(tokens: OAuthTokens) {
  // Encrypt tokens before storing
  const encryptedAccess = encrypt(tokens.access_token);
  const encryptedRefresh = encrypt(tokens.refresh_token);

  // Store in database with user association
  await db.oauthTokens.upsert({
    where: { userId_provider: { userId, provider: 'google' } },
    create: {
      userId,
      provider: 'google',
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
    update: {
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
  });
}

// Auto-refresh expired tokens
async function getValidAccessToken(userId: string): Promise<string> {
  const stored = await db.oauthTokens.findUnique({
    where: { userId_provider: { userId, provider: 'google' } },
  });

  if (!stored) throw new Error('No OAuth tokens found');

  // Refresh if expired or expiring soon
  if (stored.expiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
    const newTokens = await refreshOAuthToken(decrypt(stored.refreshToken));
    await handleTokens(newTokens);
    return newTokens.access_token;
  }

  return decrypt(stored.accessToken);
}
```

### Provider Verification

```typescript
// Verify ID token (for OpenID Connect)
import * as jose from 'jose';

async function verifyIdToken(idToken: string, provider: string): Promise<jose.JWTPayload> {
  const JWKS = jose.createRemoteJWKSet(
    new URL('https://www.googleapis.com/oauth2/v3/certs')
  );

  const { payload } = await jose.jwtVerify(idToken, JWKS, {
    issuer: 'https://accounts.google.com',
    audience: process.env.GOOGLE_CLIENT_ID!,
  });

  // Verify nonce if used
  if (payload.nonce !== session.nonce) {
    throw new Error('Invalid nonce');
  }

  return payload;
}
```

### Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| OAuth callback failures | > 50/hour |
| State validation failures | > 10/hour |
| Token refresh failures | > 20/hour |
| Invalid provider responses | > 5/hour |

### Error Handling

```typescript
async function handleOAuthCallback(req: Request) {
  try {
    // Check for provider errors
    if (req.query.error) {
      const error = req.query.error as string;
      const description = req.query.error_description as string;

      if (error === 'access_denied') {
        // User cancelled - redirect to login
        return redirect('/login?cancelled=true');
      }

      throw new OAuthError(error, description);
    }

    // Validate state
    validateState(req.query.state, req.cookies.oauth_state);

    // Exchange code for tokens
    const tokens = await exchangeCode(req.query.code);

    // Create/update user
    const user = await findOrCreateUser(tokens);

    // Create session
    await createSession(user);

  } catch (error) {
    // Log security events
    logger.warn('OAuth callback error', {
      error: error.message,
      ip: req.ip,
      provider: 'google',
    });

    return redirect('/login?error=oauth_failed');
  }
}
```

### Checklist

- [ ] State parameter for CSRF protection
- [ ] PKCE for all public clients (SPAs, mobile)
- [ ] Validate state before code exchange
- [ ] Verify ID token signature and claims
- [ ] Encrypt stored OAuth tokens
- [ ] Auto-refresh expired tokens
- [ ] Handle provider errors gracefully
- [ ] Log all OAuth security events
- [ ] Use localhost for dev redirect URIs
- [ ] Strict redirect URI validation
- [ ] Rate limit callback endpoint

## Reference Documentation
- [Provider Setup](quick-ref/providers.md)
- [PKCE Flow](quick-ref/pkce.md)
