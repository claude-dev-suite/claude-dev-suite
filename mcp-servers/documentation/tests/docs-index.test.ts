import { describe, it, expect } from 'vitest';
import { SUPPORTED_TECHNOLOGIES, docsIndex } from '../src/docs-index.js';

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
  });
});
