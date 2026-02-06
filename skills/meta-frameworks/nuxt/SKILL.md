---
name: nuxt3
description: |
  Nuxt 3 full-stack Vue framework. Covers file-based routing, data
  fetching, server routes, and auto-imports. Use when building Nuxt
  applications.

  USE WHEN: user mentions "Nuxt", "Nuxt 3", asks about "useFetch", "Nuxt server routes", "Nitro", "Nuxt auto-imports", "Nuxt composables", "Nuxt middleware", "SSR with Vue"

  DO NOT USE FOR: Vue without Nuxt - use `frontend-vue` instead; Next.js - use `nextjs-app-router` instead; Nuxt 2 - consult KB for migration; Astro - use `astro` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Nuxt 3 Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for WebSocket composable, Nitro WebSocket handlers, Socket.IO integration, plugin pattern, SSE, and room management patterns.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `nuxt` for comprehensive documentation.

## Directory Structure

| Directory | Purpose |
|-----------|---------|
| `pages/` | File-based routing |
| `components/` | Auto-imported components |
| `composables/` | Auto-imported composables |
| `server/` | Server routes & middleware |
| `layouts/` | Page layouts |
| `middleware/` | Route middleware |

## Page Component

```vue
<script setup lang="ts">
// Auto-imports work: ref, computed, useFetch, etc.
const { data, pending } = await useFetch('/api/users')

definePageMeta({
  layout: 'admin',
  middleware: 'auth'
})
</script>

<template>
  <div v-if="pending">Loading...</div>
  <div v-else>{{ data }}</div>
</template>
```

## Data Fetching

| Composable | Purpose |
|------------|---------|
| `useFetch` | SSR-friendly fetch with caching |
| `useAsyncData` | Custom async logic |
| `$fetch` | Direct fetch (no SSR handling) |
| `useLazyFetch` | Non-blocking fetch |

## Server Routes

```ts
// server/api/users.get.ts
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  return await db.users.findMany()
})

// server/api/users.post.ts
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  return await db.users.create(body)
})
```

## Key Features

- Auto-imports (components, composables, utils)
- Hybrid rendering (SSR, SSG, ISR, SPA)
- Nitro server engine
- Built-in state with `useState`

## When NOT to Use This Skill

This skill is for Nuxt 3 (Vue meta-framework). DO NOT use for:

- **Vue without Nuxt**: Use `frontend-vue` skill instead
- **Nuxt 2**: Consult KB for migration to Nuxt 3
- **Next.js (React meta-framework)**: Use `nextjs-app-router` skill instead
- **Remix (React meta-framework)**: Use `remix` skill instead
- **SvelteKit**: Use `sveltekit` skill instead
- **Astro**: Use `astro` skill instead
- **Vite-only setup**: Use `frontend-vue` with Vite configuration

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|--------------|----------------|------------------|
| Using $fetch instead of useFetch | No SSR handling, data not cached | Use useFetch for SSR-friendly fetching |
| Fetching in onMounted | Client-side only, no SSR | Fetch in setup with useFetch/useAsyncData |
| Not using auto-imports | Unnecessary boilerplate | Rely on auto-imports for components/composables |
| Secrets in public runtimeConfig | Exposed to client, security risk | Use server-only runtimeConfig (not public) |
| Ignoring route rules | Missed performance opportunities | Set prerender, swr, or ssr rules per route |
| No error.vue | Poor error UX | Create error.vue for global error handling |

## Quick Troubleshooting

| Issue | Possible Cause | Solution |
|-------|----------------|----------|
| "useFetch is not defined" | Auto-imports not working | Check .nuxt/tsconfig.json is generated, restart dev server |
| Data not available on SSR | Using $fetch instead of useFetch | Replace $fetch with useFetch |
| "useState is not defined" | Auto-import issue | Use useState composable (Nuxt 3), ensure .nuxt is built |
| API route 404 in production | Route not generated | Check server/api/ structure, rebuild |
| Hydration mismatch | Server/client render differently | Use <ClientOnly>, ensure consistent state |
| Components not auto-imported | Not in components/ directory | Move to components/ or configure in nuxt.config |

## Production Readiness

### Security Configuration

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  runtimeConfig: {
    // Server-only (not exposed to client)
    dbPassword: process.env.DB_PASSWORD,

    // Exposed to client via useRuntimeConfig()
    public: {
      apiBase: process.env.API_BASE,
    },
  },
});
```

### Error Handling

```vue
<!-- error.vue -->
<script setup lang="ts">
import type { NuxtError } from '#app';

const props = defineProps<{ error: NuxtError }>();
const handleError = () => clearError({ redirect: '/' });
</script>

<template>
  <div class="error-page">
    <h1>{{ error.statusCode }}</h1>
    <p>{{ error.message }}</p>
    <button @click="handleError">Go Home</button>
  </div>
</template>
```

### Performance

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  routeRules: {
    '/': { prerender: true },
    '/blog/**': { swr: 3600 }, // Stale-while-revalidate
    '/admin/**': { ssr: false }, // Client-only
  },
});
```

### API Security

```typescript
// server/api/users.post.ts
export default defineEventHandler(async (event) => {
  // Validate input
  const body = await readValidatedBody(event, (body) => {
    return z.object({
      email: z.string().email(),
      name: z.string().min(2),
    }).parse(body);
  });

  // Auth check
  const session = await requireAuth(event);

  return await createUser(body);
});
```

### Testing

```typescript
import { mountSuspended } from '@nuxt/test-utils/runtime';
import IndexPage from '~/pages/index.vue';

describe('Index Page', () => {
  it('renders correctly', async () => {
    const component = await mountSuspended(IndexPage);
    expect(component.text()).toContain('Welcome');
  });
});
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Time to First Byte | < 200ms |
| First Contentful Paint | < 1.5s |
| Hydration time | < 500ms |
| API response time | < 100ms |

### Checklist

- [ ] Security headers configured
- [ ] Runtime config for secrets
- [ ] Error handling (error.vue, plugins)
- [ ] Route rules (prerender, swr, ssr)
- [ ] Image optimization
- [ ] Lazy loaded components
- [ ] API validation (Zod)
- [ ] Rate limiting on API routes
- [ ] Auth middleware for protected routes
- [ ] E2E tests with @nuxt/test-utils

## Reference Documentation

- [Directory Structure](quick-ref/directory-structure.md)
- [Data Fetching Patterns](quick-ref/data-fetching.md)
