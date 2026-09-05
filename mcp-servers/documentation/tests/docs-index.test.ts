import { describe, it, expect } from 'vitest';
import { SUPPORTED_TECHNOLOGIES, docsIndex } from '../src/docs-index.js';
import { bitcoinDocs, gamedev2dArtDocs } from '../src/docs-index/index.js';

describe('docs-index', () => {
  describe('SUPPORTED_TECHNOLOGIES', () => {
    it('should be a non-empty array', () => {
      expect(Array.isArray(SUPPORTED_TECHNOLOGIES)).toBe(true);
      expect(SUPPORTED_TECHNOLOGIES.length).toBeGreaterThan(0);
    });

    it('should contain expected core technologies', () => {
      const coreTechnologies = [
        'react',
        'vue',
        'nextjs',
        'nestjs',
        'spring-boot',
        'prisma',
        'postgresql',
      ];

      coreTechnologies.forEach((tech) => {
        expect(SUPPORTED_TECHNOLOGIES).toContain(tech);
      });
    });

    it('should have unique values', () => {
      const unique = new Set(SUPPORTED_TECHNOLOGIES);
      expect(unique.size).toBe(SUPPORTED_TECHNOLOGIES.length);
    });

    it('should contain only lowercase strings', () => {
      SUPPORTED_TECHNOLOGIES.forEach((tech) => {
        expect(tech).toBe(tech.toLowerCase());
        expect(typeof tech).toBe('string');
      });
    });
  });

  describe('docsIndex', () => {
    it('should be defined', () => {
      expect(docsIndex).toBeDefined();
    });

    it('should have entries for supported technologies', () => {
      const indexedTechs = Object.keys(docsIndex);
      expect(indexedTechs.length).toBeGreaterThan(0);
    });

    it('should have valid structure for each technology', () => {
      Object.entries(docsIndex).forEach(([tech, config]) => {
        expect(typeof tech).toBe('string');
        expect(config).toBeDefined();

        // Each config should have topics or a base structure
        if (config.topics) {
          expect(Array.isArray(config.topics) || typeof config.topics === 'object').toBe(true);
        }
      });
    });

    // Both fields are optional, for opposite reasons: a KB-only topic has no
    // upstream page, and a live-only topic has no KB article. Neither may be
    // absent at the same time — that entry names nothing at all.
    it('gives every topic a local or a url, each well-formed when present', () => {
      Object.entries(docsIndex).forEach(([tech, topics]) => {
        Object.entries(topics).forEach(([topic, entry]) => {
          expect(
            entry.local !== undefined || entry.url !== undefined,
            `${tech}/${topic} has neither local nor url`
          ).toBe(true);
          if (entry.local !== undefined) {
            expect(entry.local, `${tech}/${topic} local`).toBeTruthy();
            expect(entry.local, `${tech}/${topic} local`).toMatch(/\.md$/);
          }
          if (entry.url !== undefined) {
            expect(entry.url, `${tech}/${topic} url`).toMatch(/^https?:\/\//);
          }
        });
      });
    });

    // A topic with no `local` is a deliberate statement that the KB never wrote
    // the article — it makes `fetch_docs` skip git mode entirely. Pin the list
    // so one cannot appear by someone forgetting the field on a real article.
    //
    // The list is long because most of it was a correction, not a choice: 168
    // entries declared a `local` for an article the knowledge base has never
    // held — `git log --all` over its whole history finds no commit touching
    // any of them. Each cost a failed sparse checkout and an error log on every
    // request before falling through to `url`, which is exactly the waste the
    // `DocEntry.local` doc comment describes in the past tense. Dropping the
    // field states the truth and skips the checkout; the upstream — official
    // docs for Astro, Bun, Deno, Django and the rest — is better than anything
    // a copy of ours would say, and does not drift from the tool being used.
    it('only omits local where the KB genuinely has no article', () => {
      const localless = Object.entries(docsIndex).flatMap(([tech, topics]) =>
        Object.entries(topics)
          .filter(([, entry]) => entry.local === undefined)
          .map(([topic]) => `${tech}/${topic}`)
      );

      expect(localless.sort()).toEqual([
      'actix-web/extractors',
      'actix-web/middleware',
      'actix-web/routing',
      'actix-web/state',
      'astro/components',
      'astro/content-collections',
      'astro/deployment',
      'astro/middleware',
      'astro/routing',
      'axum/extractors',
      'axum/handlers',
      'axum/routing',
      'axum/state',
      'bulk-engineering/namur-ne150',
      'bun/basics',
      'bun/bundler',
      'bun/runtime',
      'bun/sqlite',
      'bun/test-runner',
      'caddy/automatic-https',
      'caddy/caddyfile',
      'chi/middleware',
      'chi/patterns',
      'chi/routing',
      'class-validator/basics',
      'class-validator/custom-validation',
      'class-validator/decorators',
      'clean-code/principles',
      'clean-code/refactoring',
      'cpp-quality/address-sanitizer',
      'cpp-quality/gcc-warning-options',
      'cpp-quality/undefined-behavior-sanitizer',
      'cypress/commands',
      'cypress/patterns',
      'deno/basics',
      'deno/deploy',
      'deno/kv',
      'deno/permissions',
      'deno/std',
      'django/deployment',
      'django/models',
      'django/routing',
      'django/templates',
      'django/testing',
      'docker-compose/commands',
      'docker-compose/services',
      'dotnet-quality/code-analysis-rules',
      'dotnet-quality/nullable-reference-types',
      'drizzle/queries',
      'drizzle/schema',
      'echo/binding',
      'echo/middleware',
      'echo/routing',
      'elasticsearch/aggregations',
      'elasticsearch/basics',
      'elasticsearch/mapping',
      'elasticsearch/nodejs-client',
      'elasticsearch/queries',
      'email-infrastructure/dns-email-auth',
      'esbuild/api',
      'esbuild/basics',
      'esbuild/plugins',
      'fastify/hooks',
      'fastify/plugins',
      'fastify/routes',
      'fastify/testing',
      'fastify/validation',
      'fiber/context',
      'fiber/middleware',
      'fiber/routing',
      'flask/blueprints',
      'flask/deploying',
      'flask/quickstart',
      'flask/templates',
      'flask/testing',
      'fresh/handlers',
      'fresh/islands',
      'fresh/routes',
      'fresh/signals',
      'gin/binding',
      'gin/middleware',
      'gin/routing',
      'git-workflow/branching',
      'git-workflow/commands',
      'github-actions/actions',
      'go-quality/go-vet',
      'go-quality/golangci-lint-linters',
      'go-quality/staticcheck-checks',
      'hono/context',
      'hono/middleware',
      'hono/routing',
      'hono/testing',
      'java-quality/errorprone-bugpatterns',
      'java-quality/javac-xlint',
      'java-quality/nullaway',
      'java-quality/spotbugs-bug-descriptions',
      'javascript/async',
      'javascript/es6-features',
      'javascript/esm-vs-cjs',
      'javascript/modules',
      'kotlin-quality/detekt',
      'kotlin-quality/detekt-configuration',
      'kotlin-quality/detekt-potential-bugs',
      'kotlin-quality/detekt-suppressing',
      'load-balancer/haproxy',
      'log4j2/appenders',
      'log4j2/async',
      'log4j2/configuration',
      'logback/appenders',
      'logback/configuration',
      'logback/layouts',
      'mongodb/aggregation',
      'mongodb/indexes',
      'mongodb/queries',
      'mysql/indexes',
      'mysql/queries',
      'nextauth/callbacks',
      'nextauth/setup',
      'nextjs/server-components',
      'nuxt/data-fetching',
      'nuxt/deployment',
      'nuxt/routing',
      'nuxt/state-management',
      'nuxt/testing',
      'nx/affected',
      'nx/basics',
      'nx/configuration',
      'nx/executors',
      'nx/generators',
      'oak/context',
      'oak/middleware',
      'oak/routing',
      'openapi/specification',
      'openapi/tools',
      'opentelemetry/basics',
      'opentelemetry/collector',
      'opentelemetry/java-sdk',
      'opentelemetry/metrics',
      'opentelemetry/nodejs-sdk',
      'opentelemetry/tracing',
      'performance/backend',
      'performance/frontend',
      'pinia/composables',
      'pino/basics',
      'pino/child-loggers',
      'pino/redact',
      'pino/transports',
      'pnpm/basics',
      'pnpm/configuration',
      'pnpm/filtering',
      'pnpm/workspaces',
      'redis/commands',
      'redis/patterns',
      'redux-toolkit/rtk-query',
      'redux-toolkit/slices',
      'remix/actions',
      'remix/data-loading',
      'remix/deploying',
      'remix/routing',
      'remix/testing',
      'rest-api/conventions',
      'rest-api/error-handling',
      'rocket/fairings',
      'rocket/guards',
      'rocket/routing',
      'rocket/state',
      'ruff/settings',
      'rust-quality/cargo-profiles',
      'rust-quality/clippy-lints',
      'rust-quality/rustc-lints',
      'server-hardening/cis-benchmark',
      'server-performance/linux-performance-tuning',
      'slf4j/basics',
      'slf4j/mdc',
      'solid/data-fetching',
      'solid/effects',
      'solid/routing',
      'solid/signals',
      'solid/stores',
      'structlog/basics',
      'structlog/configuration',
      'structlog/processors',
      'swift-quality/swift-6-migration',
      'swift-quality/swiftlint-rules',
      'tailwindcss/spacing',
      'traefik/docker-provider',
      'traefik/middlewares',
      'turborepo/basics',
      'turborepo/caching',
      'turborepo/configuration',
      'turborepo/remote-cache',
      'typeorm/entities',
      'typeorm/queries',
      'typescript/tsconfig',
      'vite/basics',
      'vite/build',
      'vite/env-variables',
      'vite/plugins',
      'waf/cloudflare-waf',
      'waf/modsecurity-crs',
      'warp/filters',
      'warp/rejections',
      'warp/routing',
      'winston/basics',
      'winston/formats',
      'winston/transports',
      'yup/basics',
      'yup/schemas',
      'yup/validation',
      'zod/basics',
      'zod/transforms',
      ]);
    });
  });

  // Deep-dive topics are generated from the overview's folder by the `e()`
  // helper in bitcoin.ts / gamedev-2d-art.ts. A typo in a stem would silently
  // produce a `local` pointing at a file that does not exist, which degrades to
  // live scraping rather than failing loudly — so pin the derivation here.
  // Only the `e()`-generated records are checked: hand-written technologies
  // elsewhere legitimately give each topic its own url.
  describe('deep-dive topic derivation', () => {
    it('places each deep-dive beside its overview and reuses its url', () => {
      const generated = Object.entries({ ...bitcoinDocs, ...gamedev2dArtDocs });
      const withDeepDives = generated.filter(
        ([, topics]) => topics.overview && Object.keys(topics).length > 1
      );
      expect(withDeepDives.length).toBeGreaterThan(0);

      withDeepDives.forEach(([tech, topics]) => {
        const overview = topics.overview;
        // `e()`-generated records always carry a local; that is the point of
        // the helper, and the assertion below would be vacuous without one.
        expect(overview.local, `${tech}/overview local`).toBeDefined();
        const dir = overview.local!.slice(0, overview.local!.lastIndexOf('/'));

        Object.entries(topics).forEach(([topic, entry]) => {
          if (topic === 'overview') return;
          expect(entry.local, `${tech}/${topic}`).toBe(`${dir}/${topic}.md`);
          expect(entry.url, `${tech}/${topic}`).toBe(overview.url);
        });
      });
    });

    it('exposes the bitcoin-core-rpc deep-dives as their own topics', () => {
      expect(docsIndex['bitcoin-core-rpc']).toMatchObject({
        overview: { local: 'bitcoin/core/rpc/overview.md' },
        'error-codes-walkthrough': { local: 'bitcoin/core/rpc/error-codes-walkthrough.md' },
      });
    });
  });
});
