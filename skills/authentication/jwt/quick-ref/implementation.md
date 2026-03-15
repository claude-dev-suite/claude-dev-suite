# JWT Implementation Quick Reference

> **Knowledge Base:** Read `knowledge/jwt/implementation.md` for complete documentation.

## Structure

```
Header.Payload.Signature

eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

## Node.js (jsonwebtoken)

```typescript
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET!;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

// Generate tokens
function generateTokens(payload: TokenPayload) {
  const accessToken = jwt.sign(payload, SECRET, {
    expiresIn: '15m',
    issuer: 'myapp',
    audience: 'myapp-users',
  });

  const refreshToken = jwt.sign(
    { userId: payload.userId },
    REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
}

// Verify access token
function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, SECRET, {
    issuer: 'myapp',
    audience: 'myapp-users',
  }) as TokenPayload;
}

// Verify refresh token
function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, REFRESH_SECRET) as { userId: string };
}

// Decode without verification (for debugging)
const decoded = jwt.decode(token, { complete: true });
```

## Express Middleware

```typescript
import { Request, Response, NextFunction } from 'express';

interface AuthRequest extends Request {
  user?: TokenPayload;
}

function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Role-based middleware
function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

// Usage
app.get('/admin', authMiddleware, requireRole('admin'), (req, res) => {
  res.json({ message: 'Admin area' });
});
```

## Refresh Token Flow

```typescript
// Login endpoint
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await authenticate(email, password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const { accessToken, refreshToken } = generateTokens({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  // Store refresh token (hashed) in database
  await storeRefreshToken(user.id, refreshToken);

  // Send refresh token as httpOnly cookie
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.json({ accessToken });
});

// Refresh endpoint
app.post('/auth/refresh', async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token' });
  }

  try {
    const { userId } = verifyRefreshToken(refreshToken);

    // Verify token exists in database
    const isValid = await validateStoredRefreshToken(userId, refreshToken);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const user = await getUserById(userId);
    const { accessToken, refreshToken: newRefreshToken } = generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Rotate refresh token
    await updateRefreshToken(userId, newRefreshToken);

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ accessToken });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Logout endpoint
app.post('/auth/logout', async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (refreshToken) {
    try {
      const { userId } = verifyRefreshToken(refreshToken);
      await revokeRefreshToken(userId);
    } catch {}
  }

  res.clearCookie('refreshToken');
  res.json({ message: 'Logged out' });
});
```

## Security Best Practices

```typescript
// 1. Use strong secrets
const SECRET = crypto.randomBytes(64).toString('hex');

// 2. Short access token expiry
jwt.sign(payload, SECRET, { expiresIn: '15m' });

// 3. Validate all claims
jwt.verify(token, SECRET, {
  algorithms: ['HS256'],
  issuer: 'myapp',
  audience: 'myapp-users',
});

// 4. Store refresh tokens hashed
import bcrypt from 'bcrypt';
const hashedToken = await bcrypt.hash(refreshToken, 10);

// 5. Implement token blacklist for logout
const blacklist = new Set<string>();

function isBlacklisted(token: string): boolean {
  return blacklist.has(token);
}
```

**Official docs:** https://jwt.io/introduction
