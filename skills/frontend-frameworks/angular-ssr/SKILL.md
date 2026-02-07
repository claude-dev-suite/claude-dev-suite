---
name: angular-ssr
description: |
  Angular SSR with @angular/ssr, hydration, and prerendering.
  Covers server-side rendering setup, transfer state, and deployment.

  USE WHEN: user mentions "Angular SSR", "server-side rendering", "Angular Universal",
  "@angular/ssr", "hydration", "prerendering", "Angular SEO"

  DO NOT USE FOR: Next.js SSR - use `nextjs`, Nuxt SSR - use `vue-composition`,
  SvelteKit SSR - use `svelte`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Angular SSR - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `angular`, topic: `ssr` for comprehensive documentation.

## Setup

```bash
# Add SSR to existing project
ng add @angular/ssr
```

This creates:
- `server.ts` - Express server entry point
- `src/app/app.config.server.ts` - Server-specific providers
- Updates `angular.json` with server builder

## Server Configuration

```typescript
// app.config.server.ts
import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { provideServerRoutesConfig } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    provideServerRoutesConfig(serverRoutes),
  ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
```

## Route-Level Rendering Modes

```typescript
// app.routes.server.ts
import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },           // Static at build time
  { path: 'dashboard', renderMode: RenderMode.Server },      // SSR per request
  { path: 'profile/**', renderMode: RenderMode.Client },     // Client-only (SPA)
  { path: '**', renderMode: RenderMode.Server },              // Default: SSR
];
```

## Hydration

```typescript
// app.config.ts - Hydration is enabled by default with @angular/ssr
export const appConfig: ApplicationConfig = {
  providers: [
    provideClientHydration(),  // Included automatically
  ]
};
```

## Platform Checks

```typescript
import { isPlatformBrowser, isPlatformServer } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';

@Component({ ... })
export class MyComponent {
  private platformId = inject(PLATFORM_ID);

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      // Browser-only code (localStorage, window, DOM manipulation)
      window.addEventListener('scroll', this.onScroll);
    }
  }
}

// Or use afterNextRender for one-time browser init
import { afterNextRender } from '@angular/core';

@Component({ ... })
export class ChartComponent {
  constructor() {
    afterNextRender(() => {
      // Runs only in browser after first render
      this.initChart();
    });
  }
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Direct `window`/`document` access | Breaks SSR | Use `isPlatformBrowser()` |
| No hydration | Full page re-render | Enable `provideClientHydration()` |
| SSR for auth-only pages | Wasted server resources | Use `RenderMode.Client` |
| Ignoring transfer state | Double data fetch | Hydration handles this automatically |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Hydration mismatch | DOM changed before hydration | Avoid DOM manipulation in `ngOnInit` |
| `window is not defined` | Server-side access | Guard with `isPlatformBrowser()` |
| Slow SSR | Heavy computation | Move to client with `@defer` |
| SEO not working | Client-only rendering | Use `RenderMode.Server` or `Prerender` |
