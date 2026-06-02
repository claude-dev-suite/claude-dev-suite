// SPDX-License-Identifier: MIT
/**
 * Security regression tests for code-quality MCP server (finding C2).
 *
 * These tests cover:
 * 1. Zod input validation schemas — verifying that malformed or missing
 *    arguments are rejected before reaching any tool implementation.
 * 2. Path validation helper — null bytes and relative paths are rejected.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { isAbsolute, normalize } from 'path';

// ── Re-declare the schemas (matches src/index.ts exactly) ────────────────────

const AnalyzeComplexitySchema = z.object({
  path: z.string().min(1),
  threshold: z.number().optional(),
  includeAll: z.boolean().optional(),
});

const FindDuplicatesSchema = z.object({
  path: z.string().min(1),
  minLines: z.number().optional(),
  minTokens: z.number().optional(),
});

const CheckStyleSchema = z.object({
  path: z.string().min(1),
  fix: z.boolean().optional(),
  rules: z.array(z.string()).optional(),
});

const AntiPatternTypeSchema = z.enum([
  'god-class', 'long-method', 'deep-nesting', 'excessive-parameters',
  'magic-numbers', 'empty-catch', 'duplicate-code', 'feature-envy',
  'data-clump', 'primitive-obsession',
]);

const DetectAntiPatternsSchema = z.object({
  path: z.string().min(1),
  patterns: z.array(AntiPatternTypeSchema).optional(),
  thresholds: z.object({
    maxCyclomaticComplexity: z.number().optional(),
    maxCognitiveComplexity: z.number().optional(),
    maxFunctionLines: z.number().optional(),
    maxClassLines: z.number().optional(),
    maxNestingDepth: z.number().optional(),
    maxParameters: z.number().optional(),
    maxFileLines: z.number().optional(),
  }).optional(),
});

const FindDeadCodeSchema = z.object({
  path: z.string().min(1),
  includeTests: z.boolean().optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
});

const AnalyzeImportGraphSchema = z.object({
  path: z.string().min(1),
  maxDepth: z.number().optional(),
  excludeNodeModules: z.boolean().optional(),
});

const CodeMetricsSchema = z.object({
  path: z.string().min(1),
  sortBy: z.enum(['loc', 'complexity', 'functions']).optional(),
  limit: z.number().optional(),
});

// ── Path validation helper (matches analyzers/*.ts) ────────────────────────

function validateFilePath(filePath: string): void {
  if (filePath.includes('\0')) {
    throw new Error('Invalid file path: contains null byte');
  }
  if (!isAbsolute(normalize(filePath))) {
    throw new Error('File path must be absolute');
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Zod input validation — analyze_complexity', () => {
  it('accepts a valid absolute path', () => {
    const r = AnalyzeComplexitySchema.safeParse({ path: '/src/foo.ts' });
    expect(r.success).toBe(true);
  });

  it('accepts optional fields', () => {
    const r = AnalyzeComplexitySchema.safeParse({
      path: '/src/foo.ts',
      threshold: 15,
      includeAll: true,
    });
    expect(r.success).toBe(true);
  });

  it('rejects missing path', () => {
    const r = AnalyzeComplexitySchema.safeParse({ threshold: 5 });
    expect(r.success).toBe(false);
  });

  it('rejects empty path string', () => {
    const r = AnalyzeComplexitySchema.safeParse({ path: '' });
    expect(r.success).toBe(false);
  });

  it('rejects non-string path', () => {
    const r = AnalyzeComplexitySchema.safeParse({ path: 42 });
    expect(r.success).toBe(false);
  });

  it('rejects string threshold (type coercion not allowed)', () => {
    const r = AnalyzeComplexitySchema.safeParse({ path: '/src', threshold: 'high' });
    expect(r.success).toBe(false);
  });
});

describe('Zod input validation — find_duplicates', () => {
  it('accepts valid input', () => {
    const r = FindDuplicatesSchema.safeParse({ path: '/src', minLines: 6, minTokens: 50 });
    expect(r.success).toBe(true);
  });

  it('rejects missing path', () => {
    const r = FindDuplicatesSchema.safeParse({ minLines: 6 });
    expect(r.success).toBe(false);
  });
});

describe('Zod input validation — check_style', () => {
  it('accepts valid input with rules array', () => {
    const r = CheckStyleSchema.safeParse({
      path: '/src/app.js',
      fix: false,
      rules: ['no-console', 'max-line-length'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects non-array rules', () => {
    const r = CheckStyleSchema.safeParse({ path: '/src', rules: 'no-console' });
    expect(r.success).toBe(false);
  });
});

describe('Zod input validation — detect_antipatterns', () => {
  it('accepts valid pattern list', () => {
    const r = DetectAntiPatternsSchema.safeParse({
      path: '/src',
      patterns: ['god-class', 'long-method'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown pattern names', () => {
    const r = DetectAntiPatternsSchema.safeParse({
      path: '/src',
      patterns: ['god-class', 'sql-injection'], // sql-injection is not in enum
    });
    expect(r.success).toBe(false);
  });

  it('accepts valid thresholds object', () => {
    const r = DetectAntiPatternsSchema.safeParse({
      path: '/src',
      thresholds: { maxCyclomaticComplexity: 10, maxNestingDepth: 4 },
    });
    expect(r.success).toBe(true);
  });

  it('rejects string threshold values inside thresholds object', () => {
    const r = DetectAntiPatternsSchema.safeParse({
      path: '/src',
      thresholds: { maxCyclomaticComplexity: 'high' }, // should be number
    });
    expect(r.success).toBe(false);
  });
});

describe('Zod input validation — find_dead_code', () => {
  it('accepts valid confidence level', () => {
    const r = FindDeadCodeSchema.safeParse({ path: '/src', confidence: 'high' });
    expect(r.success).toBe(true);
  });

  it('rejects invalid confidence level', () => {
    const r = FindDeadCodeSchema.safeParse({ path: '/src', confidence: 'ultra' });
    expect(r.success).toBe(false);
  });
});

describe('Zod input validation — analyze_import_graph', () => {
  it('accepts valid input', () => {
    const r = AnalyzeImportGraphSchema.safeParse({
      path: '/project',
      maxDepth: 5,
      excludeNodeModules: true,
    });
    expect(r.success).toBe(true);
  });

  it('rejects missing path', () => {
    const r = AnalyzeImportGraphSchema.safeParse({ maxDepth: 5 });
    expect(r.success).toBe(false);
  });
});

describe('Zod input validation — code_metrics', () => {
  it('accepts valid sort options', () => {
    for (const sortBy of ['loc', 'complexity', 'functions'] as const) {
      const r = CodeMetricsSchema.safeParse({ path: '/src', sortBy });
      expect(r.success).toBe(true);
    }
  });

  it('rejects invalid sortBy value', () => {
    const r = CodeMetricsSchema.safeParse({ path: '/src', sortBy: 'name' });
    expect(r.success).toBe(false);
  });
});

describe('Path validation helper (null bytes and relative paths)', () => {
  it('throws on null byte in path', () => {
    expect(() => validateFilePath('/safe/path\0attack')).toThrow(/null byte/);
  });

  it('throws on relative path', () => {
    expect(() => validateFilePath('relative/path/file.ts')).toThrow(/absolute/);
  });

  it('throws on path traversal that resolves to relative', () => {
    // normalize('../../etc/passwd') = '../../etc/passwd' — not absolute
    expect(() => validateFilePath('../../etc/passwd')).toThrow(/absolute/);
  });

  it('accepts a well-formed absolute path', () => {
    // Should not throw
    expect(() => validateFilePath('/usr/src/project/file.ts')).not.toThrow();
  });

  it('accepts a Windows absolute path', () => {
    // On all platforms normalize() preserves absolute Windows-style paths
    expect(() => validateFilePath('C:\\Users\\project\\file.ts')).not.toThrow();
  });
});
