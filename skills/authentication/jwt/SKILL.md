---
name: jwt
description: |
  JSON Web Tokens for authentication. Covers token structure,
  signing, and validation. Use for stateless authentication.

  USE WHEN: user mentions "JWT", "token authentication", "access token", "refresh token", asks about "stateless auth", "token signing", "token validation"

  DO NOT USE FOR: session-based auth (use session management), OAuth flows (use oauth2 skill), NextAuth.js (use nextauth skill)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# JWT Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `jwt` for comprehensive documentation.

## Token Structure

```
header.payload.signature

Header: { "alg": "HS256", "typ": "JWT" }
Payload: { "sub": "1234", "name": "John", "iat": 1516239022 }
Signature: HMACSHA256(base64(header) + "." + base64(payload), secret)
```

## Node.js Implementation

```typescript
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET!;

// Generate token
function generateToken(user: User): string {
  return jwt.sign(
    { sub: user.id, email: user.email },
    SECRET,
    { expiresIn: '1h' }
  );
}

// Verify token
function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET) as JwtPayload;
}

// Refresh token pattern
function generateRefreshToken(user: User): string {
  return jwt.sign(
    { sub: user.id, type: 'refresh' },
    SECRET,
    { expiresIn: '7d' }
  );
}
```

## Middleware

```typescript
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    req.user = verifyToken(token);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

## When NOT to Use This Skill

- **Session-based authentication** - Use traditional server-side sessions with cookies
- **OAuth 2.0 flows** - Use `oauth2` skill for third-party authentication
- **NextAuth.js** - Use `nextauth` skill for Next.js authentication
- **Simple internal APIs** - API keys might be sufficient

## Best Practices

| Do | Don't |
|----|----|
| Use HTTPS | Store in localStorage (use httpOnly cookies) |
| Short expiry (15m-1h) | Put sensitive data in payload |
| Validate all claims | Use weak secrets |
| Use refresh tokens | Ignore expiration |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Storing JWT in localStorage | Vulnerable to XSS attacks | Use httpOnly cookies |
| Long-lived access tokens | Security risk if compromised | 15-minute expiry + refresh tokens |
| Weak secrets (< 32 bytes) | Easy to brute force | Use 256-bit random secret |
| Ignoring algorithm verification | Algorithm confusion attacks | Explicitly specify allowed algorithms |
| Putting passwords in payload | Token is base64, not encrypted | Only non-sensitive claims |
| No token revocation | Can't logout users | Implement blacklist or token versioning |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Invalid signature" | Wrong secret or algorithm | Verify JWT_SECRET matches, check algorithm |
| "Token expired" | exp claim in past | Implement refresh token flow |
| "Missing token" | Authorization header not sent | Check `Authorization: Bearer <token>` |
| Token not recognized | Malformed token | Verify header.payload.signature format |
| CORS errors with cookies | SameSite/Secure flags | Set sameSite:'strict', secure:true |
| Logout doesn't work | Tokens are stateless | Implement revocation with Redis/DB |

## Standard Claims

| Claim | Purpose |
|-------|---------|
| `sub` | Subject (user ID) |
| `iat` | Issued at |
| `exp` | Expiration |
| `iss` | Issuer |
| `aud` | Audience |

## Production Readiness

### Security Configuration

```typescript
// Use asymmetric keys (RS256) for production
import * as jose from 'jose';

// Generate key pair (run once, store securely)
// openssl genrsa -out private.pem 2048
// openssl rsa -in private.pem -pubout -out public.pem

const privateKey = await jose.importPKCS8(
  process.env.JWT_PRIVATE_KEY!,
  'RS256'
);
const publicKey = await jose.importSPKI(
  process.env.JWT_PUBLIC_KEY!,
  'RS256'
);

// Sign token
async function generateToken(user: User): Promise<string> {
  return new jose.SignJWT({
    sub: user.id,
    email: user.email,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(process.env.JWT_ISSUER!)
    .setAudience(process.env.JWT_AUDIENCE!)
    .setExpirationTime('15m')  // Short-lived access token
    .sign(privateKey);
}

// Verify token
async function verifyToken(token: string): Promise<jose.JWTPayload> {
  const { payload } = await jose.jwtVerify(token, publicKey, {
    issuer: process.env.JWT_ISSUER!,
    audience: process.env.JWT_AUDIENCE!,
  });
  return payload;
}
```

### Secure Token Storage

```typescript
// Server-side: HttpOnly cookie for access token
res.cookie('access_token', token, {
  httpOnly: true,     // Prevents XSS access
  secure: true,       // HTTPS only
  sameSite: 'strict', // CSRF protection
  maxAge: 15 * 60 * 1000, // 15 minutes
  path: '/',
});

// Refresh token in separate cookie
res.cookie('refresh_token', refreshToken, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/auth/refresh', // Only sent to refresh endpoint
});
```

### Token Rotation & Revocation

```typescript
// Refresh token rotation
async function refreshTokens(refreshToken: string) {
  // Verify refresh token
  const payload = await verifyRefreshToken(refreshToken);

  // Check if refresh token is in blacklist (revoked)
  if (await isTokenRevoked(refreshToken)) {
    throw new Error('Token revoked');
  }

  // Revoke old refresh token
  await revokeToken(refreshToken);

  // Generate new tokens
  const user = await db.users.findUnique({ where: { id: payload.sub } });
  return {
    accessToken: await generateToken(user),
    refreshToken: await generateRefreshToken(user),
  };
}

// Token revocation with Redis
async function revokeToken(token: string): Promise<void> {
  const payload = await jose.decodeJwt(token);
  const ttl = payload.exp! - Math.floor(Date.now() / 1000);
  if (ttl > 0) {
    await redis.set(`revoked:${token}`, '1', 'EX', ttl);
  }
}

// Logout: revoke all user tokens
async function logoutAll(userId: string): Promise<void> {
  // Increment user's token version, invalidating all existing tokens
  await db.users.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}
```

### Algorithm Security

```typescript
// NEVER allow 'none' algorithm
// ALWAYS specify allowed algorithms explicitly
const { payload } = await jose.jwtVerify(token, publicKey, {
  algorithms: ['RS256'], // Only allow RS256
  issuer: process.env.JWT_ISSUER!,
  audience: process.env.JWT_AUDIENCE!,
});

// Validate token type to prevent token confusion
if (payload.type !== 'access') {
  throw new Error('Invalid token type');
}
```

### Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Token verification failures | > 100/min |
| Refresh token reuse attempts | > 10/min |
| Expired token requests | > 500/min |
| Invalid signature errors | > 50/min |

### Claims Validation

```typescript
async function validateTokenClaims(payload: jose.JWTPayload): Promise<void> {
  // Check required claims
  if (!payload.sub || !payload.iat || !payload.exp) {
    throw new Error('Missing required claims');
  }

  // Check user still exists and is active
  const user = await db.users.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) {
    throw new Error('User not found or inactive');
  }

  // Check token version (for logout-all functionality)
  if (payload.tokenVersion !== user.tokenVersion) {
    throw new Error('Token invalidated');
  }
}
```

### Checklist

- [ ] Use RS256 (asymmetric) in production
- [ ] Short access token expiry (15 minutes)
- [ ] Refresh tokens with rotation
- [ ] HttpOnly cookies (not localStorage)
- [ ] Secure + SameSite cookie flags
- [ ] Token revocation mechanism
- [ ] Validate issuer and audience
- [ ] Specify allowed algorithms explicitly
- [ ] Include token version for logout-all
- [ ] Monitor verification failures
- [ ] Rate limit token endpoints

## Reference Documentation
- [Refresh Tokens](quick-ref/refresh-tokens.md)
- [Security Best Practices](quick-ref/security.md)
