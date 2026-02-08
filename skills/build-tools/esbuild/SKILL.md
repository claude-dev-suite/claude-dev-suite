---
name: esbuild
description: |
  esbuild extremely fast JavaScript bundler. Used internally by Vite.
  Use for simple bundling, library builds, or understanding Vite internals.

  USE WHEN: user mentions "esbuild", "fast bundler", asks about "esbuild config", "library bundling", "esbuild API"

  DO NOT USE FOR: Complex apps (use Vite), Webpack projects (use webpack skill), need extensive plugins (use Rollup/Webpack)
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---
# esbuild - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `esbuild` for comprehensive documentation.

## When NOT to Use This Skill

- **Complex applications** - Use Vite (which uses esbuild internally)
- **Need many plugins** - Webpack or Rollup have richer ecosystems
- **CSS modules, PostCSS** - Vite handles these better
- **HMR required** - Vite provides full HMR experience

## When to Use This Skill
- Ultra-fast simple bundling
- TypeScript library builds
- Understanding how Vite works
- Custom build scripts

## Setup

```bash
npm install -D esbuild
```

## CLI Usage

```bash
# Bundle single file
esbuild src/index.ts --bundle --outfile=dist/bundle.js

# Watch mode
esbuild src/index.ts --bundle --outfile=dist/bundle.js --watch

# Minify for production
esbuild src/index.ts --bundle --minify --outfile=dist/bundle.min.js

# Multiple outputs
esbuild src/index.ts --bundle --outdir=dist --format=esm --format=cjs

# Source maps
esbuild src/index.ts --bundle --sourcemap --outfile=dist/bundle.js
```

## API Usage

```typescript
// build.ts
import * as esbuild from 'esbuild';

// Simple build
await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/bundle.js',
});

// Production build
await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  sourcemap: true,
  target: ['es2020'],
  outfile: 'dist/bundle.min.js',
});
```

## Configuration Options

```typescript
await esbuild.build({
  // Entry points
  entryPoints: ['src/index.ts', 'src/worker.ts'],
  // Or object for custom names
  entryPoints: {
    main: 'src/index.ts',
    worker: 'src/worker.ts',
  },

  // Output
  bundle: true,
  outdir: 'dist',
  outfile: 'dist/bundle.js',    // Single file
  outExtension: { '.js': '.mjs' },

  // Format
  format: 'esm',   // 'esm' | 'cjs' | 'iife'
  platform: 'node', // 'browser' | 'node' | 'neutral'
  target: ['es2020', 'chrome90', 'firefox88'],

  // Optimization
  minify: true,
  minifyWhitespace: true,
  minifyIdentifiers: true,
  minifySyntax: true,
  treeShaking: true,

  // Source maps
  sourcemap: true,        // External .map file
  sourcemap: 'inline',    // Inline in JS
  sourcemap: 'linked',    // External with reference

  // Splitting (ESM only)
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',

  // External packages
  external: ['react', 'react-dom'],
  packages: 'external',   // All node_modules external

  // Define
  define: {
    'process.env.NODE_ENV': '"production"',
    '__VERSION__': '"1.0.0"',
  },

  // Loaders
  loader: {
    '.png': 'file',
    '.svg': 'text',
    '.json': 'json',
  },

  // Paths
  alias: {
    '@': './src',
    '@components': './src/components',
  },
  resolveExtensions: ['.tsx', '.ts', '.jsx', '.js'],

  // Banner/Footer
  banner: {
    js: '/* Bundle generated at ' + new Date().toISOString() + ' */',
  },
  footer: {
    js: '/* End of bundle */',
  },

  // Legal comments
  legalComments: 'none', // 'none' | 'inline' | 'eof' | 'linked' | 'external'

  // Metafile for analysis
  metafile: true,
});
```

## Watch Mode (API)

```typescript
// Watch with rebuild
const ctx = await esbuild.context({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/bundle.js',
});

await ctx.watch();
console.log('Watching for changes...');

// Later: stop watching
await ctx.dispose();
```

## Dev Server

```typescript
const ctx = await esbuild.context({
  entryPoints: ['src/index.tsx'],
  bundle: true,
  outdir: 'dist',
});

// Start dev server
await ctx.serve({
  servedir: 'dist',
  port: 3000,
});

console.log('Server running on http://localhost:3000');
```

## Plugins

```typescript
// Custom plugin structure
const myPlugin: esbuild.Plugin = {
  name: 'my-plugin',
  setup(build) {
    // Resolve hook
    build.onResolve({ filter: /^env$/ }, (args) => ({
      path: args.path,
      namespace: 'env-ns',
    }));

    // Load hook
    build.onLoad({ filter: /.*/, namespace: 'env-ns' }, () => ({
      contents: JSON.stringify(process.env),
      loader: 'json',
    }));

    // Start/End hooks
    build.onStart(() => {
      console.log('Build started');
    });

    build.onEnd((result) => {
      console.log(`Build ended with ${result.errors.length} errors`);
    });
  },
};

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  plugins: [myPlugin],
  outfile: 'dist/bundle.js',
});
```

### Common Plugins

```typescript
// Environment variables plugin
const envPlugin: esbuild.Plugin = {
  name: 'env',
  setup(build) {
    build.onResolve({ filter: /^env$/ }, (args) => ({
      path: args.path,
      namespace: 'env-ns',
    }));

    build.onLoad({ filter: /.*/, namespace: 'env-ns' }, () => ({
      contents: `export const API_URL = ${JSON.stringify(process.env.API_URL)}`,
      loader: 'ts',
    }));
  },
};

// CSS modules plugin (basic)
const cssModulesPlugin: esbuild.Plugin = {
  name: 'css-modules',
  setup(build) {
    build.onLoad({ filter: /\.module\.css$/ }, async (args) => {
      const css = await fs.readFile(args.path, 'utf8');
      // Process CSS modules...
      return {
        contents: `export default ${JSON.stringify(classNames)}`,
        loader: 'js',
      };
    });
  },
};
```

## Library Build

```typescript
// Build library for npm
await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  sourcemap: true,
  target: ['es2020'],
  external: ['react', 'react-dom'],  // Peer deps
  outdir: 'dist',
  format: 'esm',
  outExtension: { '.js': '.mjs' },
});

// Also build CJS
await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  sourcemap: true,
  target: ['es2020'],
  external: ['react', 'react-dom'],
  outdir: 'dist',
  format: 'cjs',
  outExtension: { '.js': '.cjs' },
});
```

```json
// package.json for library
{
  "name": "my-lib",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  }
}
```

## Bundle Analysis

```typescript
const result = await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  metafile: true,
  outfile: 'dist/bundle.js',
});

// Write metafile
await fs.writeFile('meta.json', JSON.stringify(result.metafile));

// Analyze
const analysis = await esbuild.analyzeMetafile(result.metafile);
console.log(analysis);
```

## TypeScript Declaration

```typescript
// esbuild doesn't generate .d.ts - use tsc
import { execSync } from 'child_process';

// Build JS with esbuild
await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.js',
});

// Generate types with tsc
execSync('tsc --emitDeclarationOnly --declaration --outDir dist');
```

## Comparison with Other Bundlers

| Feature | esbuild | Webpack | Vite | Rollup |
|---------|---------|---------|------|--------|
| Speed | Fastest | Slow | Fast (uses esbuild) | Medium |
| Config | Simple | Complex | Simple | Medium |
| Plugins | Limited | Many | Many | Many |
| HMR | Basic | Full | Full | Plugin |
| Tree-shaking | Yes | Yes | Yes | Best |
| Code-splitting | ESM only | Full | Full | Full |

## When to Use esbuild

| Scenario | Recommendation |
|----------|----------------|
| Simple bundling | esbuild |
| Library build | esbuild + tsc |
| Complex app | Vite (uses esbuild) |
| Legacy support | Webpack |
| Need plugins | Vite or Rollup |

## Anti-Patterns to Avoid

- Do not use for complex apps (use Vite)
- Do not expect advanced HMR
- Do not forget tsc for .d.ts
- Do not ignore external for libraries

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using for complex apps | Missing features | Use Vite for apps, esbuild for libraries |
| Not externalizing dependencies | Large library bundles | Use external: [...] for peer deps |
| No .d.ts generation | Missing TypeScript types | Run tsc --emitDeclarationOnly |
| Expecting advanced HMR | esbuild HMR is basic | Use Vite's dev server for HMR |
| Not specifying target | Wrong output format | Set target: ['es2020'] explicitly |
| Missing bundle analysis | Unknown bundle size | Use metafile and analyzeMetafile |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Cannot find module" | Missing external | Add to external array |
| No type definitions | esbuild doesn't generate | Use tsc --emitDeclarationOnly |
| Large bundle | Not externalizing deps | Mark peer deps as external |
| Wrong module format | Incorrect format setting | Set format: 'esm' or 'cjs' |
| Slow builds (unexpected) | Not using esbuild efficiently | Check for plugins causing slowdown |
| CSS not bundled | No CSS loader | esbuild bundles CSS by default, check import |

## Performance

```bash
# Benchmark (10K modules)
# esbuild: ~0.3s
# Rollup:  ~10s
# Webpack: ~30s
```

## Checklist

- [ ] Target browsers/node configured
- [ ] External packages for libraries
- [ ] Minify + sourcemap for production
- [ ] Metafile for bundle analysis
- [ ] tsc to generate .d.ts

## Further Reading
> For advanced configurations: `mcp__documentation__fetch_docs`
> - Technology: `esbuild`
> - [esbuild Docs](https://esbuild.github.io/)
