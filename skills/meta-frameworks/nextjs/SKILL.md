---
name: nextjs-app-router
description: |
  Next.js 14+ App Router. Covers Server Components, routing, data
  fetching, caching, and deployment. Use when building Next.js
  applications with the App Router.

  USE WHEN: user mentions "Next.js", "App Router", "Server Components", "RSC", asks about "server actions", "Next.js routing", "Next.js caching", "Next.js deployment", "streaming", "Suspense in Next.js"

  DO NOT USE FOR: React (non-Next.js) - use `frontend-react` instead; Nuxt - use `nuxt3` instead; Remix - use `remix` instead; Pages Router (old Next.js) - consult KB for migration
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Next.js App Router Core

> **Full Reference**: See [advanced.md](advanced.md) for WebSocket integration, Socket.IO, Server-Sent Events, TanStack Query real-time sync, and Vercel/Pusher patterns.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `nextjs` for comprehensive documentation.

## File Conventions

| File | Purpose |
|------|---------|
| `page.tsx` | Route UI (required for route) |
| `layout.tsx` | Shared layout, preserves state |
| `loading.tsx` | Loading UI (Suspense) |
| `error.tsx` | Error boundary |
| `not-found.tsx` | 404 page |
| `route.ts` | API endpoint |

## Component Types

### Server Components (Default)
```tsx
// No 'use client' - runs on server
async function Page() {
  const data = await db.query(...); // Direct DB access
  return <div>{data.name}</div>;
}
```

### Client Components
```tsx
'use client'
import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

## Data Fetching

```tsx
// Server Component
async function Page() {
  const data = await fetch('https://api.example.com/data', {
    cache: 'force-cache',     // Static (default)
    // cache: 'no-store',     // Dynamic
    // next: { revalidate: 60 } // ISR
  });
  return <Component data={await data.json()} />;
}
```

## Server Actions

```tsx
'use server'
export async function createItem(formData: FormData) {
  await db.items.create({ name: formData.get('name') });
  revalidatePath('/items');
}
```

## Decision Rules

| Scenario | Use |
|----------|-----|
| Interactive UI | 'use client' |
| Data fetching | Server Component |
| Form mutations | Server Actions |
| Shared state | Client Component |

## Production Readiness

### Security Configuration

```typescript
// next.config.js - Security headers
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
  {
    key: 'Content-Security-Policy',
    value: `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline';`,
  },
];

module.exports = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
```

```typescript
// Server-side secrets (never exposed to client)
// Use server components or API routes
async function SecureComponent() {
  const apiKey = process.env.API_SECRET_KEY; // Server only
  const data = await fetch(url, { headers: { Authorization: apiKey } });
  return <div>{/* render data */}</div>;
}

// Environment variables
// NEXT_PUBLIC_* = exposed to client (careful!)
// Other vars = server-side only
```

### Error Handling

```tsx
// app/error.tsx - Error boundary
'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log to error reporting service
    captureException(error);
  }, [error]);

  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

```tsx
// app/global-error.tsx - Root error boundary
'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <h2>Something went wrong!</h2>
        <button onClick={reset}>Try again</button>
      </body>
    </html>
  );
}
```

### Performance Optimization

```tsx
// Dynamic imports for client components
import dynamic from 'next/dynamic';

const HeavyChart = dynamic(() => import('@/components/Chart'), {
  loading: () => <Skeleton />,
  ssr: false, // Client-only if needed
});

// Image optimization
import Image from 'next/image';

<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={600}
  priority // For LCP images
  placeholder="blur"
  blurDataURL={blurHash}
/>

// Font optimization
import { Inter } from 'next/font/google';
const inter = Inter({ subsets: ['latin'], display: 'swap' });
```

### Caching Strategy

```tsx
// Static data (cached indefinitely)
async function StaticPage() {
  const data = await fetch(url, { cache: 'force-cache' });
}

// Dynamic data (never cached)
async function DynamicPage() {
  const data = await fetch(url, { cache: 'no-store' });
}

// ISR (revalidate every 60 seconds)
async function ISRPage() {
  const data = await fetch(url, { next: { revalidate: 60 } });
}

// On-demand revalidation
import { revalidatePath, revalidateTag } from 'next/cache';

async function updateData() {
  'use server';
  await db.update(...);
  revalidatePath('/posts');     // Revalidate specific path
  revalidateTag('posts');       // Revalidate by tag
}
```

### Middleware Security

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Rate limiting header for upstream proxy
  const response = NextResponse.next();

  // Auth check
  const token = request.cookies.get('session');
  if (!token && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // CORS for API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    response.headers.set('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN!);
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
};
```

### Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Largest Contentful Paint (LCP) | > 2.5s |
| First Input Delay (FID) | > 100ms |
| Cumulative Layout Shift (CLS) | > 0.1 |
| Time to First Byte (TTFB) | > 800ms |
| Server Component render time | > 200ms |
| Build size increase | > 10% |

### Build & Deployment

```typescript
// next.config.js - Production optimizations
module.exports = {
  output: 'standalone', // For Docker deployments
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.example.com' },
    ],
  },
  experimental: {
    // Enable if using PPR
    ppr: true,
  },
};
```

```bash
# Production build with analysis
ANALYZE=true npm run build

# Check bundle size
npx @next/bundle-analyzer
```

### Checklist

- [ ] Security headers configured
- [ ] CSP policy defined
- [ ] No secrets in NEXT_PUBLIC_* vars
- [ ] Error boundaries at route level
- [ ] Global error boundary
- [ ] Image optimization with next/image
- [ ] Font optimization with next/font
- [ ] Dynamic imports for heavy components
- [ ] Caching strategy per route
- [ ] Middleware for auth/rate limiting
- [ ] Core Web Vitals monitored
- [ ] Standalone output for containerization

## When NOT to Use This Skill

This skill is for Next.js App Router (v13+). DO NOT use for:

- **React without Next.js**: Use `frontend-react` skill instead
- **Next.js Pages Router (v12 and below)**: Consult KB for migration guidance
- **Nuxt.js (Vue meta-framework)**: Use `nuxt3` skill instead
- **Remix (React meta-framework)**: Use `remix` skill instead
- **SvelteKit**: Use `sveltekit` skill instead
- **Astro**: Use `astro` skill instead
- **API-only backend**: Consider `nestjs` or `fastapi` instead

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|--------------|----------------|------------------|
| Using 'use client' everywhere | Defeats Server Component benefits, increases bundle size | Only use 'use client' for interactive components |
| Fetching in Client Components | Waterfalls, no SSR, poor SEO | Fetch in Server Components or use Server Actions |
| Not using loading.tsx | Poor UX during data fetching | Create loading.tsx for route-level loading states |
| Secrets in NEXT_PUBLIC_* | Exposed to client, security risk | Use server-only env vars or Server Components |
| Ignoring caching strategy | Poor performance or stale data | Set explicit cache: 'force-cache', 'no-store', or revalidate |
| No error boundaries | Uncaught errors crash entire app | Add error.tsx at route and root level |
| fetch() without cache option | Unpredictable caching behavior | Always specify cache or revalidate strategy |
| Using useEffect for data | Client-side only, no SSR | Use Server Components with async/await |

## Quick Troubleshooting

| Issue | Possible Cause | Solution |
|-------|----------------|----------|
| "Cannot use useState in Server Component" | Missing 'use client' directive | Add 'use client' at top of file |
| Data not updating after mutation | Cache not revalidated | Use revalidatePath() or revalidateTag() in Server Action |
| Hydration mismatch error | Server/client render differently | Ensure consistent data, check Date/random values |
| "Cannot access cookies" in component | Cookies only in Server Components/Actions | Move logic to Server Component or API route |
| Build fails with "Dynamic server usage" | Using dynamic APIs in static route | Add export const dynamic = 'force-dynamic' |
| Images not optimized | Not using next/image | Replace <img> with <Image> from next/image |
| Slow page load | Large client bundle | Use dynamic imports, check bundle analyzer |
| CORS errors with API routes | Missing headers in route.ts | Add CORS headers in route handler |

## Reference Documentation
- [File Conventions](quick-ref/file-conventions.md)
- [Data Fetching Patterns](quick-ref/data-fetching.md)
- [Deep: Caching](deep-docs/caching/)
- [Deep: Server Components](deep-docs/rendering/)
