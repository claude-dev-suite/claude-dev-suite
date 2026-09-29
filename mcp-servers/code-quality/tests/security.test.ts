// SPDX-License-Identifier: MIT
/**
 * Input validation and guards, against the schemas the server really uses
 * (the previous version re-declared copies of them, which could drift).
 */

import { describe, it, expect } from 'vitest';
import {
  AnalyzeComplexitySchema, AnalyzeImportGraphSchema, CheckStyleSchema, CodeMetricsSchema, DetectAntiPatternsSchema,
  FindDeadCodeSchema, FindDuplicatesSchema, QualityGateSchema, jsonSchema,
} from '../src/schemas.js';
import { dispatch } from '../src/dispatch.js';
import { validateGitRef } from '../src/core/git.js';
import { resolveScope } from '../src/core/files.js';
import { redact } from '../src/core/report.js';

describe('schemas', () => {
  it('accept the historical argument shapes agents already send', () => {
    expect(AnalyzeComplexitySchema.safeParse({ path: '/src', threshold: 15, includeAll: true }).success).toBe(true);
    expect(FindDuplicatesSchema.safeParse({ path: '/src', minLines: 6, minTokens: 50 }).success).toBe(true);
    expect(CheckStyleSchema.safeParse({ path: '/src', fix: false, rules: ['no-console'] }).success).toBe(true);
    expect(DetectAntiPatternsSchema.safeParse({ path: '/src', patterns: ['god-class', 'long-method'], thresholds: { maxCyclomaticComplexity: 10, maxNestingDepth: 4 } }).success).toBe(true);
    expect(FindDeadCodeSchema.safeParse({ path: '/src', includeTests: true, confidence: 'high' }).success).toBe(true);
    expect(AnalyzeImportGraphSchema.safeParse({ path: '/p', maxDepth: 5, excludeNodeModules: true }).success).toBe(true);
    for (const sortBy of ['loc', 'complexity', 'functions']) expect(CodeMetricsSchema.safeParse({ path: '/src', sortBy }).success).toBe(true);
  });

  it('reject malformed input', () => {
    expect(AnalyzeComplexitySchema.safeParse({ threshold: 5 }).success).toBe(false);
    expect(AnalyzeComplexitySchema.safeParse({ path: '' }).success).toBe(false);
    expect(AnalyzeComplexitySchema.safeParse({ path: '/src', threshold: 'high' }).success).toBe(false);
    expect(AnalyzeComplexitySchema.safeParse({ path: '/src', bogus: 1 }).success).toBe(false);
    expect(DetectAntiPatternsSchema.safeParse({ path: '/src', patterns: ['sql-injection'] }).success).toBe(false);
    expect(CheckStyleSchema.safeParse({ path: '/src', linters: ['rm'] }).success).toBe(false);
    expect(QualityGateSchema.safeParse({ path: '/src', action: 'delete' }).success).toBe(false);
  });

  it('advertise JSON Schema derived from the same definitions', () => {
    const js = jsonSchema(CheckStyleSchema) as { type: string; required: string[]; properties: Record<string, unknown> };
    expect(js.type).toBe('object');
    expect(js.required).toEqual(['path']);
    expect(Object.keys(js.properties)).toEqual(expect.arrayContaining(['path', 'fix', 'rules', 'linters', 'changedSince', 'format', 'limit']));
  });
});

describe('dispatch', () => {
  it('returns isError for invalid arguments and for thrown errors, never crashes', async () => {
    const bad = await dispatch('analyze_complexity', AnalyzeComplexitySchema, async () => ({ data: {}, markdown: '' }), { path: 42 });
    expect(bad.isError).toBe(true);
    expect(bad.content[0].text).toMatch(/Invalid arguments for analyze_complexity: path/);
    const thrown = await dispatch('analyze_complexity', AnalyzeComplexitySchema, async () => {
      throw new Error('boom');
    }, { path: '/x' });
    expect(thrown).toEqual({ content: [{ type: 'text', text: 'Error: boom' }], isError: true });
  });

  it('caps oversized output with an explicit marker', async () => {
    const r = await dispatch('code_metrics', CodeMetricsSchema, async () => ({ data: {}, markdown: 'x'.repeat(500_000) }), { path: '/x' });
    expect(r.content[0].text.length).toBeLessThan(401_000);
    expect(r.content[0].text).toContain('[truncated');
  });
});

describe('guards', () => {
  it('require absolute paths without null bytes', async () => {
    await expect(resolveScope({ path: 'relative/dir' })).rejects.toThrow(/absolute/);
    await expect(resolveScope({ path: '/safe/path\0attack' })).rejects.toThrow(/null byte/);
  });

  it('refuse option-like or malformed git refs', () => {
    for (const ok of ['main', 'origin/main', 'HEAD~3', 'v1.2.0', 'a1b2c3d', 'feature/x-y_z']) expect(() => validateGitRef(ok)).not.toThrow();
    for (const bad of ['--upload-pack=x', '-n', 'a b', 'main;rm', 'a..b', '$(id)']) expect(() => validateGitRef(bad)).toThrow();
  });

  it('redact credentials from tool output', () => {
    expect(redact('postgres://admin:s3cret@db:5432/x')).toBe('postgres://admin:***@db:5432/x');
    expect(redact('token=abcdef123456')).toBe('token=***');
    expect(redact('using ghp_0123456789abcdefghijABCDEFGHIJ')).toBe('using ***');
  });
});
