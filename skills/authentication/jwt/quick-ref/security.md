# JWT Security Quick Reference

> **Knowledge Base:** Read `knowledge/jwt/security.md` for complete documentation.

## Token Storage

```typescript
// NEVER store tokens in localStorage (XSS vulnerable)

// Access Token: Memory only
let accessToken: string | null = null;

function setAccessToken(token: string) {
  accessToken = token;
}

function getAccessToken() {
  return accessToken;
}

// Refresh Token: httpOnly Cookie
res.cookie('refreshToken', token, {
  httpOnly: true,     // Not accessible via JS
  secure: true,       // HTTPS only
  sameSite: 'strict', // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/api/auth',  // Only sent to auth endpoints
});
```

## Algorithm Security

```typescript
// Always specify algorithm
jwt.verify(token, SECRET, { algorithms: ['HS256'] });

// For RS256 (asymmetric)
const publicKey = fs.readFileSync('public.pem');
const privateKey = fs.readFileSync('private.pem');

jwt.sign(payload, privateKey, { algorithm: 'RS256' });
jwt.verify(token, publicKey, { algorithms: ['RS256'] });

// Never use 'none' algorithm
// Never trust alg header from token
```

## Claim Validation

```typescript
interface TokenPayload {
  sub: string;      // Subject (user ID)
  iat: number;      // Issued at
  exp: number;      // Expiration
  iss: string;      // Issuer
  aud: string;      // Audience
  jti?: string;     // JWT ID (for blacklisting)
}

jwt.verify(token, SECRET, {
  algorithms: ['HS256'],
  issuer: 'https://myapp.com',
  audience: 'myapp-api',
  clockTolerance: 30, // 30 seconds leeway
});
```

## Refresh Token Rotation

```typescript
// 1. Generate new refresh token on each use
async function refreshTokens(oldRefreshToken: string) {
  const { userId } = verifyRefreshToken(oldRefreshToken);

  // Check if token is in database
  const storedToken = await db.refreshToken.findUnique({
    where: { userId, token: hashToken(oldRefreshToken) }
  });

  if (!storedToken) {
    // Token reuse detected - revoke all tokens for user
    await db.refreshToken.deleteMany({ where: { userId } });
    throw new Error('Token reuse detected');
  }

  // Generate new tokens
  const newTokens = generateTokens(userId);

  // Replace old token with new one
  await db.refreshToken.update({
    where: { id: storedToken.id },
    data: { token: hashToken(newTokens.refreshToken) }
  });

  return newTokens;
}
```

## Token Revocation

```typescript
// Method 1: Blacklist (for short-lived tokens)
const tokenBlacklist = new Map<string, number>(); // token -> expiry

function blacklistToken(token: string) {
  const decoded = jwt.decode(token) as { exp: number };
  tokenBlacklist.set(token, decoded.exp);

  // Clean up expired entries periodically
  cleanupBlacklist();
}

function isBlacklisted(token: string): boolean {
  return tokenBlacklist.has(token);
}

// Method 2: Token version (for all tokens)
// Store version in user record, increment on logout
interface User {
  id: string;
  tokenVersion: number;
}

interface TokenPayload {
  userId: string;
  tokenVersion: number;
}

// Verify token version matches
function verifyTokenVersion(payload: TokenPayload, user: User) {
  if (payload.tokenVersion !== user.tokenVersion) {
    throw new Error('Token revoked');
  }
}

// Revoke all tokens
async function revokeAllTokens(userId: string) {
  await db.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } }
  });
}
```

## CSRF Protection

```typescript
// 1. Use SameSite cookies
res.cookie('refreshToken', token, {
  sameSite: 'strict'
});

// 2. Double-submit cookie pattern
const csrfToken = crypto.randomBytes(32).toString('hex');

res.cookie('csrf', csrfToken, {
  httpOnly: false, // Readable by JS
  secure: true,
  sameSite: 'strict'
});

// Client sends csrf token in header
// Server validates it matches cookie
function validateCsrf(req: Request) {
  const cookieCsrf = req.cookies.csrf;
  const headerCsrf = req.headers['x-csrf-token'];

  if (!cookieCsrf || cookieCsrf !== headerCsrf) {
    throw new Error('CSRF validation failed');
  }
}
```

## Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

// Limit login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts',
  skipSuccessfulRequests: true,
});

app.post('/auth/login', loginLimiter, loginHandler);

// Limit refresh attempts
const refreshLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: 'Too many refresh attempts',
});

app.post('/auth/refresh', refreshLimiter, refreshHandler);
```

## Security Checklist

```markdown
- [ ] Use HTTPS only (secure cookies)
- [ ] Short access token expiry (5-15 min)
- [ ] Refresh tokens in httpOnly cookies
- [ ] Validate all JWT claims
- [ ] Specify algorithm explicitly
- [ ] Implement token rotation
- [ ] Rate limit auth endpoints
- [ ] Hash refresh tokens in database
- [ ] Implement logout (revocation)
- [ ] Monitor for anomalies
- [ ] Use strong secrets (256+ bits)
```

**Official docs:** https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html
