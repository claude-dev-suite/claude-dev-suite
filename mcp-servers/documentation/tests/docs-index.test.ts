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

    it('should give every topic a non-empty local and url', () => {
      Object.entries(docsIndex).forEach(([tech, topics]) => {
        Object.entries(topics).forEach(([topic, entry]) => {
          expect(entry.local, `${tech}/${topic} local`).toBeTruthy();
          expect(entry.url, `${tech}/${topic} url`).toMatch(/^https?:\/\//);
          expect(entry.local, `${tech}/${topic} local`).toMatch(/\.md$/);
        });
      });
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
        const dir = overview.local.slice(0, overview.local.lastIndexOf('/'));

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
