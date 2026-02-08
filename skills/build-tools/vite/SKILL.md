---
name: vite
description: |
  Vite frontend build tool and dev server. Fast HMR and optimized builds.

  USE WHEN: user mentions "Vite", "vite config", "vite.config", asks about "Vite setup", "Vite dev server", "Vite build", "fast HMR"

  DO NOT USE FOR: Webpack projects (use webpack skill), Next.js (uses its own bundler), Create React App (uses Webpack), library builds with Rollup only
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Vite - Quick Reference

## When to Use This Skill
- Set up React/Vue/Svelte projects
- Configure dev server and proxy
- Optimize production builds

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `vite` for comprehensive documentation.

## When NOT to Use This Skill

- **Webpack-based projects** - Use `webpack` skill for webpack.config.js
- **Next.js** - Has its own build system (uses SWC/Turbopack)
- **Create React App** - Still uses Webpack (consider migrating)
- **Pure Rollup** - Use Rollup directly for libraries

## Essential Patterns

### Setup
```bash
npm create vite@latest my-app -- --template react-ts
cd my-app
npm install
npm run dev
```

### Basic Config
```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    }
  },

  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  },

  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
```

### Environment Variables
```bash
# .env
VITE_API_URL=http://localhost:8080/api
```

```typescript
// Usage
const apiUrl = import.meta.env.VITE_API_URL;
const isProd = import.meta.env.PROD;

// TypeScript types (vite-env.d.ts)
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}
```

### Code Splitting
```typescript
// Dynamic imports
const AdminPanel = lazy(() => import('./AdminPanel'));

// Manual chunks
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        }
      }
    }
  }
});
```

## Commands
| Command | Usage |
|---------|-------|
| `npm run dev` | Dev server HMR |
| `npm run build` | Build production |
| `npm run preview` | Preview build |

## Anti-Patterns to Avoid
- Do not forget the `VITE_` prefix for env vars
- Do not use relative paths (use aliases)
- Do not ignore chunk size warnings

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| No VITE_ prefix for env vars | Won't be exposed to client | All client vars need VITE_ prefix |
| Relative imports | Hard to refactor | Use path aliases (@/...) |
| Ignoring chunk size warnings | Large initial bundles | Use manual chunks or lazy loading |
| Not using TypeScript for config | Missing type hints | Use defineConfig from 'vite' |
| No dev/prod environment separation | Same config for both | Use env-specific .env files |
| Large public folder | Slow builds | Only static assets in public/ |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Env vars undefined | Missing VITE_ prefix | Rename to VITE_API_URL |
| HMR not working | Proxy configuration | Check server.hmr settings |
| Build fails with dynamic imports | Wrong syntax | Use import() not require() |
| Slow dev server | Too many dependencies | Add to optimizeDeps.include |
| 404 on refresh (SPA) | No fallback | Add server.historyApiFallback |
| CORS errors in dev | Wrong proxy config | Configure server.proxy correctly |

## Production Readiness

### Build Optimization

```typescript
// vite.config.ts
import { defineConfig, splitVendorChunkPlugin } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    splitVendorChunkPlugin(),
    visualizer({ open: true }), // Bundle analysis
  ],

  build: {
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },

  // Optimize deps
  optimizeDeps: {
    include: ['react', 'react-dom'],
    exclude: ['@some/heavy-package'],
  },
});
```

### Security Configuration

```typescript
// vite.config.ts
export default defineConfig({
  // Never expose server-only vars
  define: {
    'process.env.API_SECRET': 'undefined',
  },

  server: {
    // CORS for dev
    cors: {
      origin: 'http://localhost:3000',
      credentials: true,
    },
    // Proxy to avoid CORS issues
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  // Preview server (for testing prod builds)
  preview: {
    port: 4173,
    strictPort: true,
  },
});

// Type-safe env vars
// env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_TITLE: string;
  // Add all VITE_ prefixed vars here
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

### Performance

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    // CSS code splitting
    cssCodeSplit: true,

    // Asset inlining threshold (4kb)
    assetsInlineLimit: 4096,

    // Terser for smaller bundles (slower build)
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },

  // Enable compression
  plugins: [
    react(),
    compression({ algorithm: 'gzip' }),
    compression({ algorithm: 'brotliCompress', ext: '.br' }),
  ],
});

// Lazy loading routes
// router.tsx
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));

const routes = [
  {
    path: '/dashboard',
    element: (
      <Suspense fallback={<Loading />}>
        <Dashboard />
      </Suspense>
    ),
  },
];
```

### Testing Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
  },
});

// src/test/setup.ts
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock environment variables
vi.stubEnv('VITE_API_URL', 'http://localhost:8080');
```

### CI/CD Integration

```yaml
# .github/workflows/build.yml
name: Build

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Type check
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm run test:coverage

      - name: Build
        run: npm run build

      - name: Upload coverage
        uses: codecov/codecov-action@v4
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Bundle size (gzip) | < 200KB |
| Initial load time | < 2s |
| Build time | < 60s |
| Lighthouse Performance | > 90 |

### Checklist

- [ ] Type-safe environment variables
- [ ] Manual chunks for large dependencies
- [ ] Bundle analysis with visualizer
- [ ] Lazy loading for routes
- [ ] CSS code splitting enabled
- [ ] Compression (gzip/brotli)
- [ ] Console removed in production
- [ ] Source maps enabled
- [ ] Vitest configured with coverage
- [ ] CI/CD pipeline

## Further Reading
> For advanced configurations: `mcp__documentation__fetch_docs`
> - Technology: `vite`
> - [Vite Docs](https://vite.dev/)
