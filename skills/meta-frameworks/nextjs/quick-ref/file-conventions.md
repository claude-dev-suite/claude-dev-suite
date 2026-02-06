# Next.js File Conventions

> **Knowledge Base:** Read `knowledge/nextjs/routing.md` for complete documentation.

## App Router File Structure

```
app/
├── layout.tsx          # Root layout (required)
├── page.tsx            # Home page (/)
├── loading.tsx         # Loading UI
├── error.tsx           # Error UI
├── not-found.tsx       # 404 page
├── global-error.tsx    # Global error boundary
├── route.ts            # API route handler
├── template.tsx        # Re-rendered layout
├── default.tsx         # Parallel route default
│
├── dashboard/
│   ├── layout.tsx      # Nested layout
│   ├── page.tsx        # /dashboard
│   └── settings/
│       └── page.tsx    # /dashboard/settings
│
├── blog/
│   └── [slug]/
│       └── page.tsx    # /blog/:slug (dynamic)
│
├── shop/
│   └── [...slug]/
│       └── page.tsx    # /shop/* (catch-all)
│
├── (marketing)/        # Route group (no URL impact)
│   ├── about/
│   └── contact/
│
└── @modal/             # Parallel route
    └── login/
        └── page.tsx
```

## Special Files

| File | Purpose |
|------|---------|
| `page.tsx` | Unique UI for route, makes route publicly accessible |
| `layout.tsx` | Shared UI, preserves state on navigation |
| `template.tsx` | Like layout but re-mounts on navigation |
| `loading.tsx` | Loading UI with Suspense |
| `error.tsx` | Error boundary for segment |
| `not-found.tsx` | UI for `notFound()` function |
| `route.ts` | API endpoint (GET, POST, etc.) |

## Dynamic Routes

```
[slug]        → Single dynamic segment
[...slug]     → Catch-all (matches any depth)
[[...slug]]   → Optional catch-all
```

## Route Groups

```
(marketing)   → Groups routes without affecting URL
(shop)        → Can have different layouts per group
```

## Parallel Routes

```
@modal        → Named slot rendered in parallel
@sidebar      → Can show different content simultaneously
```

## Intercepting Routes

```
(.)photo      → Intercepts same level
(..)photo     → Intercepts one level up
(..)(..)photo → Intercepts two levels up
(...)photo    → Intercepts from root
```

## Private Folders

```
_components   → Excluded from routing
_utils        → For colocating non-route files
```

**Official docs:** https://nextjs.org/docs/app/building-your-application/routing
