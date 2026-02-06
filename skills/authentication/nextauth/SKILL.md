---
name: nextauth
description: |
  NextAuth.js authentication for Next.js. Covers providers, sessions,
  and callbacks. Use for Next.js authentication.

  USE WHEN: user mentions "NextAuth", "Next.js auth", "Auth.js", asks about "Next.js authentication", "App Router auth", "next-auth", "authentication providers"

  DO NOT USE FOR: generic OAuth (use oauth2 skill), JWT implementation (use jwt skill), non-Next.js projects, Express/Fastify auth
allowed-tools: Read, Grep, Glob, Write, Edit
---
# NextAuth.js Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `nextauth` for comprehensive documentation.

## Basic Setup (App Router)

```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

```typescript
// lib/auth.ts
import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from './prisma';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const user = await prisma.user.findUnique({
          where: { email: credentials?.email },
        });
        if (user && await verifyPassword(credentials?.password, user.password)) {
          return user;
        }
        return null;
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/auth/error',
  },
};
```

## Client Usage

```tsx
'use client';
import { useSession, signIn, signOut } from 'next-auth/react';

function AuthButton() {
  const { data: session, status } = useSession();

  if (status === 'loading') return <Spinner />;

  if (session) {
    return (
      <div>
        <span>{session.user?.email}</span>
        <button onClick={() => signOut()}>Sign out</button>
      </div>
    );
  }

  return <button onClick={() => signIn('google')}>Sign in</button>;
}
```

## Server-Side Auth

```typescript
// In Server Component
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

async function ProtectedPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  return <div>Welcome {session.user.name}</div>;
}
```

## When NOT to Use This Skill

- **Generic OAuth 2.0 flows** - Use `oauth2` skill for platform-agnostic OAuth
- **Custom JWT implementation** - Use `jwt` skill for custom token logic
- **Non-Next.js frameworks** - Use framework-specific auth (Express Passport, etc.)
- **Remix/SvelteKit** - Use their native auth solutions

## Type Extensions

```typescript
// types/next-auth.d.ts
declare module 'next-auth' {
  interface Session {
    user: { id: string; role: string } & DefaultSession['user'];
  }
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| No NEXTAUTH_SECRET | Security vulnerability | Always set in production |
| Client-side session checks only | Can be bypassed | Use getServerSession() |
| Hardcoded provider credentials | Security risk | Use environment variables |
| No error handling | Poor UX | Implement custom error pages |
| Mixing session strategies | Inconsistent behavior | Stick to JWT or database |
| No CSRF protection | Vulnerable to attacks | Use default CSRF (enabled by default) |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Configuration error" | Missing required env vars | Check NEXTAUTH_URL and NEXTAUTH_SECRET |
| Session is null | Not authenticated or session expired | Check signIn() was called |
| "Callback URL error" | Invalid redirect | Whitelist URLs in provider settings |
| Type errors | Missing type extensions | Create types/next-auth.d.ts |
| Session not updating | Cache issue | Call update() from useSession |
| CORS errors | Wrong domain | Ensure NEXTAUTH_URL matches deployment URL |

## Production Readiness

### Security Configuration

```typescript
// lib/auth.ts
import { NextAuthOptions } from 'next-auth';

export const authOptions: NextAuthOptions = {
  // Secure session configuration
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  // Secure cookies
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },

  // Callbacks for security
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      return session;
    },
    async signIn({ user, account, profile }) {
      // Block suspicious sign-ins
      const isAllowed = await checkUserAllowed(user.email);
      return isAllowed;
    },
  },

  // Security events
  events: {
    async signIn({ user, account }) {
      await logSecurityEvent('signin', { userId: user.id, provider: account?.provider });
    },
    async signOut({ token }) {
      await logSecurityEvent('signout', { userId: token.sub });
    },
  },
};
```

### Rate Limiting

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '1 m'), // 5 requests per minute
});

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/auth')) {
    const ip = request.ip ?? '127.0.0.1';
    const { success, limit, reset, remaining } = await ratelimit.limit(ip);

    if (!success) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
        },
      });
    }
  }

  return NextResponse.next();
}
```

### CSRF Protection

```typescript
// lib/auth.ts
export const authOptions: NextAuthOptions = {
  // Enable CSRF token verification
  useSecureCookies: process.env.NODE_ENV === 'production',

  // Custom CSRF token
  callbacks: {
    async redirect({ url, baseUrl }) {
      // Only allow redirects to same origin
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },
};

// In API routes, verify CSRF
import { getToken } from 'next-auth/jwt';

export async function POST(request: Request) {
  const token = await getToken({ req: request });
  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }
  // Process request
}
```

### Error Handling

```tsx
// app/auth/error/page.tsx
'use client';

import { useSearchParams } from 'next/navigation';

const errorMessages: Record<string, string> = {
  Configuration: 'Server configuration error',
  AccessDenied: 'Access denied',
  Verification: 'Verification link expired',
  Default: 'Authentication error',
};

export default function AuthError() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error') ?? 'Default';

  return (
    <div className="error-page">
      <h1>Authentication Error</h1>
      <p>{errorMessages[error] ?? errorMessages.Default}</p>
      <a href="/login">Try again</a>
    </div>
  );
}
```

### Testing

```typescript
// __tests__/auth.test.ts
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// Mock next-auth
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

describe('Protected Route', () => {
  it('redirects unauthenticated users', async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);

    const response = await fetch('/api/protected');
    expect(response.status).toBe(401);
  });

  it('allows authenticated users', async () => {
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: '1', email: 'test@example.com', role: 'user' },
    });

    const response = await fetch('/api/protected');
    expect(response.status).toBe(200);
  });
});

// E2E with Playwright
test('OAuth flow', async ({ page }) => {
  await page.goto('/login');
  await page.click('button:has-text("Sign in with Google")');

  // Mock OAuth provider response in test environment
  await expect(page).toHaveURL('/dashboard');
});
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Login success rate | > 99% |
| Auth latency | < 200ms |
| Failed login attempts | Monitor & alert |
| Token refresh success | > 99.9% |

### Checklist

- [ ] Secure cookie configuration
- [ ] JWT with appropriate maxAge
- [ ] Rate limiting on auth endpoints
- [ ] CSRF protection enabled
- [ ] Redirect URL validation
- [ ] Security event logging
- [ ] Custom error pages
- [ ] Session refresh strategy
- [ ] Role-based access control
- [ ] Testing with mocked sessions

## Reference Documentation
- [Providers](quick-ref/providers.md)
- [Callbacks](quick-ref/callbacks.md)
