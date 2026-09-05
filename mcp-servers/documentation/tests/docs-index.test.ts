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
    it('only omits local where the KB genuinely has no article', () => {
      const localless = Object.entries(docsIndex).flatMap(([tech, topics]) =>
        Object.entries(topics)
          .filter(([, entry]) => entry.local === undefined)
          .map(([topic]) => `${tech}/${topic}`)
      );

      expect(localless.sort()).toEqual([
        'bulk-engineering/namur-ne150',
        // Static-analysis rule indexes. Live-only by design: they are
        // maintained and versioned by the tool authors, and they back the
        // "already covered by the toolchain" half of the `review/*` skills.
        // A KB copy would diverge from the tool the reader is running, which
        // is the one thing that must not happen when the question is "did the
        // linter already report this?".
        'cpp-quality/address-sanitizer',
        'cpp-quality/gcc-warning-options',
        'cpp-quality/undefined-behavior-sanitizer',
        'dotnet-quality/code-analysis-rules',
        'dotnet-quality/nullable-reference-types',
        'github-actions/actions',
        'go-quality/go-vet',
        'go-quality/golangci-lint-linters',
        'go-quality/staticcheck-checks',
        'java-quality/errorprone-bugpatterns',
        'java-quality/javac-xlint',
        'java-quality/nullaway',
        'java-quality/spotbugs-bug-descriptions',
        'kotlin-quality/detekt',
        'kotlin-quality/detekt-configuration',
        'kotlin-quality/detekt-potential-bugs',
        'kotlin-quality/detekt-suppressing',
        'mongodb/aggregation',
        'mongodb/indexes',
        'mongodb/queries',
        'mysql/indexes',
        'mysql/queries',
        'nextjs/server-components',
        'pinia/composables',
        'redis/commands',
        'redis/patterns',
        'ruff/settings',
        'rust-quality/cargo-profiles',
        'rust-quality/clippy-lints',
        'rust-quality/rustc-lints',
        'server-hardening/cis-benchmark',
        'server-performance/linux-performance-tuning',
        'swift-quality/swift-6-migration',
        'swift-quality/swiftlint-rules',
        'tailwindcss/spacing',
        'typescript/tsconfig',
        'vite/basics',
        'vite/build',
        'vite/env-variables',
        'vite/plugins',
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
