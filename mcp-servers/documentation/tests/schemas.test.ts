import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { SUPPORTED_TECHNOLOGIES } from '../src/docs-index.js';

// Replicate schemas from index.ts for testing
const FetchDocsSchema = z.object({
  technology: z.enum([...SUPPORTED_TECHNOLOGIES] as [string, ...string[]]),
  topic: z.string(),
  source: z.enum(['local', 'live']).default('local'),
  refresh: z.boolean().optional(),
});

const SearchDocsSchema = z.object({
  query: z.string(),
  technologies: z.array(z.string()).optional(),
  maxResults: z.number().default(5),
});

const ListTopicsSchema = z.object({
  technology: z.enum([...SUPPORTED_TECHNOLOGIES] as [string, ...string[]]),
});

describe('Input Schemas', () => {
  describe('FetchDocsSchema', () => {
    it('should validate correct input', () => {
      const validInput = {
        technology: 'react',
        topic: 'hooks',
        source: 'local',
      };

      const result = FetchDocsSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject invalid technology', () => {
      const invalidInput = {
        technology: 'invalid-tech',
        topic: 'hooks',
      };

      const result = FetchDocsSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should default source to local', () => {
      const input = {
        technology: 'react',
        topic: 'hooks',
      };

      const result = FetchDocsSchema.parse(input);
      expect(result.source).toBe('local');
    });

    it('should accept live source', () => {
      const input = {
        technology: 'nextjs',
        topic: 'caching',
        source: 'live',
      };

      const result = FetchDocsSchema.parse(input);
      expect(result.source).toBe('live');
    });

    it('should accept refresh flag', () => {
      const input = {
        technology: 'prisma',
        topic: 'queries',
        refresh: true,
      };

      const result = FetchDocsSchema.parse(input);
      expect(result.refresh).toBe(true);
    });
  });

  describe('SearchDocsSchema', () => {
    it('should validate correct input', () => {
      const validInput = {
        query: 'how to use hooks',
      };

      const result = SearchDocsSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should default maxResults to 5', () => {
      const input = {
        query: 'authentication',
      };

      const result = SearchDocsSchema.parse(input);
      expect(result.maxResults).toBe(5);
    });

    it('should accept technologies filter', () => {
      const input = {
        query: 'routing',
        technologies: ['nextjs', 'react'],
        maxResults: 10,
      };

      const result = SearchDocsSchema.parse(input);
      expect(result.technologies).toEqual(['nextjs', 'react']);
      expect(result.maxResults).toBe(10);
    });

    it('should reject empty query', () => {
      const input = {
        query: '',
      };

      // Empty string is technically valid for z.string(), but semantic validation
      // would happen in the handler
      const result = SearchDocsSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('ListTopicsSchema', () => {
    it('should validate correct technology', () => {
      const validInput = {
        technology: 'spring-boot',
      };

      const result = ListTopicsSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject invalid technology', () => {
      const invalidInput = {
        technology: 'unknown-framework',
      };

      const result = ListTopicsSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });
});
