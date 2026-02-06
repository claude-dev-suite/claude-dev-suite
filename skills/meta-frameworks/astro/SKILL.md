---
name: astro
description: |
  Astro content-focused web framework. Covers islands architecture,
  content collections, and multi-framework support. Use when building
  content-heavy or static websites.

  USE WHEN: user mentions "Astro", asks about "islands architecture", "content collections", "Astro components", "client directives", "Astro.glob", "static site generation with Astro", "multi-framework in Astro"

  DO NOT USE FOR: Next.js - use `nextjs-app-router` instead; Nuxt - use `nuxt3` instead; SvelteKit - use `sveltekit` instead; Gatsby - use Astro as modern alternative; pure React/Vue/Svelte - use respective framework skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Astro Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `astro` for comprehensive documentation.

## Component Structure

```astro
---
// Component script (runs at build time)
import Header from '../components/Header.astro';
import ReactCounter from '../components/Counter.tsx';

const { title } = Astro.props;
const posts = await Astro.glob('./posts/*.md');
---

<!-- Component template -->
<html>
  <head><title>{title}</title></head>
  <body>
    <Header />
    <main>
      <slot />
    </main>
    <!-- Island: hydrates on client -->
    <ReactCounter client:load />
  </body>
</html>

<style>
  main { max-width: 800px; }
</style>
```

## Client Directives (Islands)

| Directive | Behavior |
|-----------|----------|
| `client:load` | Hydrate immediately |
| `client:idle` | Hydrate when idle |
| `client:visible` | Hydrate when visible |
| `client:media` | Hydrate on media query |
| `client:only` | Skip SSR, client only |

## Content Collections

```ts
// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.date(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
```

```astro
---
import { getCollection } from 'astro:content';
const posts = await getCollection('blog', ({ data }) => !data.draft);
---
```

## Key Features

- Zero JS by default (ship HTML)
- Use React, Vue, Svelte together
- Content collections with type safety
- Built-in Markdown/MDX support

## Production Readiness

### Security Configuration

```typescript
// astro.config.mjs
import { defineConfig } from 'astro/config';

export default defineConfig({
  security: {
    checkOrigin: true, // CSRF protection for SSR
  },
  vite: {
    define: {
      // Never expose secrets to client
      'import.meta.env.SECRET_KEY': 'undefined',
    },
  },
});

// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();

  // Security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
  );

  return response;
});
```

### Content Validation

```typescript
// src/content/config.ts
import { defineCollection, z, reference } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: ({ image }) =>
    z.object({
      title: z.string().max(100),
      description: z.string().max(200),
      date: z.date(),
      author: reference('authors'),
      cover: image().refine((img) => img.width >= 800, {
        message: 'Cover image must be at least 800px wide',
      }),
      tags: z.array(z.string()).max(5),
      draft: z.boolean().default(false),
    }),
});

export const collections = { blog };
```

### Performance

```typescript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import compress from 'astro-compress';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://example.com',
  integrations: [
    sitemap(),
    compress({
      CSS: true,
      HTML: true,
      Image: true,
      JavaScript: true,
      SVG: true,
    }),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },
});
```

```astro
---
// Image optimization
import { Image, getImage } from 'astro:assets';
import heroImage from '../assets/hero.png';

const optimizedBackground = await getImage({ src: heroImage, format: 'webp' });
---

<Image
  src={heroImage}
  alt="Hero"
  widths={[400, 800, 1200]}
  sizes="(max-width: 800px) 100vw, 800px"
  loading="eager"
/>

<!-- Lazy hydration for islands -->
<ReactWidget client:visible />

<!-- View Transitions -->
<ViewTransitions />
```

### Error Handling

```astro
---
// src/pages/404.astro
import Layout from '../layouts/Layout.astro';
---

<Layout title="Page Not Found">
  <div class="error-page">
    <h1>404</h1>
    <p>Page not found</p>
    <a href="/">Go home</a>
  </div>
</Layout>
```

```astro
---
// src/pages/500.astro
import Layout from '../layouts/Layout.astro';
---

<Layout title="Server Error">
  <div class="error-page">
    <h1>500</h1>
    <p>Something went wrong</p>
    <a href="/">Go home</a>
  </div>
</Layout>
```

```typescript
// src/pages/api/data.ts
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
  try {
    const data = await fetchData();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('API error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

### Testing

```typescript
// tests/e2e/blog.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Blog', () => {
  test('lists published posts', async ({ page }) => {
    await page.goto('/blog');

    const posts = page.locator('article');
    await expect(posts).toHaveCount(await posts.count());
    await expect(posts.first()).toBeVisible();
  });

  test('navigates to post', async ({ page }) => {
    await page.goto('/blog');
    await page.click('article a');

    await expect(page.locator('h1')).toBeVisible();
    await expect(page).toHaveURL(/\/blog\/.+/);
  });
});

// Component testing with container queries
test('island hydrates on visibility', async ({ page }) => {
  await page.goto('/');

  const counter = page.locator('[data-testid="counter"]');
  await expect(counter).not.toBeVisible();

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(counter).toBeVisible();
});
```

### Deployment Configuration

```yaml
# Vercel - vercel.json
{
  "buildCommand": "astro build",
  "outputDirectory": "dist",
  "framework": "astro"
}

# Netlify - netlify.toml
[build]
  command = "astro build"
  publish = "dist"

# Docker
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Lighthouse Score | > 95 |
| First Contentful Paint | < 1s |
| Time to Interactive | < 1.5s |
| Total Blocking Time | < 50ms |
| Bundle size (JS) | < 50KB |

### Checklist

- [ ] Security headers in middleware
- [ ] checkOrigin enabled for SSR
- [ ] Content collections with Zod schemas
- [ ] Image optimization with astro:assets
- [ ] Lazy hydration (client:visible/idle)
- [ ] View Transitions enabled
- [ ] 404/500 error pages
- [ ] Sitemap generation
- [ ] Asset compression
- [ ] E2E tests with Playwright
- [ ] Lighthouse CI in pipeline

## When NOT to Use This Skill

This skill is for Astro (content-focused, islands architecture). DO NOT use for:

- **Next.js (React meta-framework)**: Use `nextjs-app-router` skill instead
- **Nuxt (Vue meta-framework)**: Use `nuxt3` skill instead
- **SvelteKit (Svelte meta-framework)**: Use `sveltekit` skill instead
- **Remix (React meta-framework)**: Use `remix` skill instead
- **Pure React applications**: Use `frontend-react` skill instead
- **Pure Vue applications**: Use `frontend-vue` skill instead
- **Pure Svelte applications**: Use `frontend-svelte` skill instead
- **Gatsby**: Astro is a modern alternative, but migration differs

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|--------------|----------------|------------------|
| Using client:load everywhere | Defeats zero-JS philosophy, large bundles | Use client:idle or client:visible for deferred hydration |
| Not using content collections | Unvalidated content, no type safety | Define collections in src/content/config.ts |
| Mixing frameworks unnecessarily | Increases bundle size, complexity | Use one framework per project, or Astro components |
| Ignoring image optimization | Poor performance, large assets | Use <Image> from astro:assets |
| Not setting alt text on images | Accessibility issue, SEO penalty | Always provide meaningful alt text |
| Using client:only for all content | No SSR, poor SEO | Use client:only only for browser-only components |
| Hardcoding data in components | Unmaintainable, no CMS integration | Use content collections or API fetching |
| No ViewTransitions | Choppy navigation UX | Add <ViewTransitions /> to layout |

## Quick Troubleshooting

| Issue | Possible Cause | Solution |
|-------|----------------|----------|
| "Cannot use import.meta.env in client" | Accessing server-only env var | Prefix with PUBLIC_ for client access |
| Island not hydrating | Wrong client directive | Check client:load/idle/visible directive is set |
| Content collection not found | Schema not defined or wrong path | Define in src/content/config.ts, check src/content/{collection} |
| Images not optimized | Using <img> instead of <Image> | Import and use <Image> from astro:assets |
| "getCollection is not defined" | Wrong import | Import from 'astro:content' |
| Build fails with type errors | Content schema mismatch | Check frontmatter matches Zod schema |
| 404 page not showing | Missing src/pages/404.astro | Create 404.astro in src/pages/ |
| CSS not scoped | Missing <style> in component | Add <style> block to Astro component |

## Reference Documentation
- [Islands Architecture](quick-ref/islands.md)
- [Content Collections](quick-ref/content.md)
