// SPDX-License-Identifier: MIT
/**
 * Tool-level behaviour on fixture projects: thresholds, labels, repo-relative
 * paths, diff mode, SARIF.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync } from 'fs';
import * as path from 'path';
import { analyzeComplexity } from '../src/tools/complexity.js';
import { codeMetrics } from '../src/tools/metrics.js';
import { detectAntiPatterns } from '../src/tools/antipatterns.js';
import { analyzeImportGraph } from '../src/tools/import-graph.js';
import { makeFixture, hasGit, git } from './helpers.js';

let cleanup = () => {};
afterEach(() => cleanup());

const COMPLEX = `export function tangled(a: number, b: number, c: number) {
  let r = 0;
  if (a > 0) { if (b > 0) { if (c > 0) { r = 1; } else { r = 2; } } else if (b < -5) { r = 3; } }
  for (let i = 0; i < a; i++) { if (i % 2 && b || c) { r += i; } }
  while (r > 100) { r = r / 2; }
  return r > 0 ? r : -r;
}
`;

describe('analyze_complexity', () => {
  it('honours the thresholds it is given and reports repo-relative locations', async () => {
    const fx = makeFixture({ 'package.json': '{}', 'src/deep/tangled.ts': COMPLEX, 'src/simple.ts': 'export const f = (x: number) => x + 1;\n' });
    cleanup = fx.cleanup;
    const strict = await analyzeComplexity({ path: fx.dir, threshold: 5, cognitiveThreshold: 5 });
    expect(strict.markdown).toContain('src/deep/tangled.ts:1');
    expect((strict.data as { summary: { overThreshold: number } }).summary.overThreshold).toBe(1);
    const lax = await analyzeComplexity({ path: fx.dir, threshold: 50, cognitiveThreshold: 50 });
    expect((lax.data as { summary: { overThreshold: number } }).summary.overThreshold).toBe(0);
    expect(lax.markdown).toContain('No function exceeds the thresholds');
  });
});

describe('caps', () => {
  it('stops at maxFiles and says so instead of silently dropping files', async () => {
    const fx = makeFixture({ 'package.json': '{}', 'a.ts': 'export const a = 1;\n', 'b.ts': 'export const b = 1;\n', 'c.ts': 'export const c = 1;\n' });
    cleanup = fx.cleanup;
    const r = await codeMetrics({ path: fx.dir, maxFiles: 2 });
    expect((r.data as { totals: { files: number } }).totals.files).toBe(2);
    expect(r.markdown).toContain('File cap reached');
  });
});

describe('code_metrics', () => {
  it('labels JavaScript as javascript (was reported as typescript)', async () => {
    const fx = makeFixture({ 'package.json': '{}', 'a.js': 'function a() { return 1; }\n', 'b.ts': 'export const b = 1;\n', 'c.py': 'def c():\n    return 1\n' });
    cleanup = fx.cleanup;
    const r = await codeMetrics({ path: fx.dir });
    const d = r.data as { byLanguage: Record<string, { files: number }>; files: Array<{ file: string; language: string }> };
    expect(Object.keys(d.byLanguage).sort()).toEqual(['javascript', 'python', 'typescript']);
    expect(d.files.find((f) => f.file === 'a.js')?.language).toBe('javascript');
  });
});

describe('detect_antipatterns', () => {
  it('labels high complexity as complex-method (not god-class) and honours custom thresholds', async () => {
    const fx = makeFixture({ 'package.json': '{}', 'src/t.ts': COMPLEX });
    cleanup = fx.cleanup;
    const r = await detectAntiPatterns({ path: fx.dir, thresholds: { maxCyclomaticComplexity: 4, maxCognitiveComplexity: 4 } }, 'markdown');
    const d = r.data as { findings: Array<{ rule: string }> };
    expect(d.findings.map((f) => f.rule)).toContain('complex-method');
    expect(d.findings.map((f) => f.rule)).not.toContain('god-class');
    const relaxed = await detectAntiPatterns({ path: fx.dir, patterns: ['complex-method'], thresholds: { maxCyclomaticComplexity: 99, maxCognitiveComplexity: 99 } }, 'markdown');
    expect((relaxed.data as { findings: unknown[] }).findings).toHaveLength(0);
  });

  it('duplicate-code and data-clump are real detectors now (they were no-ops)', async () => {
    const body = (n: string) => `export function ${n}(host: string, port: number, user: string) {
  const url = new URL('http://' + host + ':' + port);
  url.username = user;
  const parts = [url.protocol, url.hostname, url.port, url.username];
  if (parts.some((p) => p.length === 0)) { throw new Error('bad ' + parts.join('/')); }
  return parts.map((p) => p.trim().toLowerCase()).join('|');
}
`;
    const fx = makeFixture({ 'package.json': '{}', 'a.ts': body('connectA'), 'b.ts': body('connectB'), 'c.ts': body('connectC') });
    cleanup = fx.cleanup;
    const r = await detectAntiPatterns({ path: fx.dir, patterns: ['duplicate-code', 'data-clump'], thresholds: { minDuplicateLines: 3 } }, 'markdown');
    const rules = (r.data as { findings: Array<{ rule: string; message: string }> }).findings.map((f) => f.rule);
    expect(rules).toContain('duplicate-code');
    expect(rules).toContain('data-clump');
  });

  it('emits SARIF 2.1.0 with repo-relative URIs', async () => {
    const fx = makeFixture({ 'package.json': '{}', 'src/t.ts': COMPLEX });
    cleanup = fx.cleanup;
    const r = await detectAntiPatterns({ path: fx.dir, patterns: ['complex-method'], thresholds: { maxCyclomaticComplexity: 2 } }, 'sarif');
    const sarif = r.sarif as { version: string; runs: Array<{ results: Array<{ ruleId: string; locations: Array<{ physicalLocation: { artifactLocation: { uri: string } } }> }> }> };
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0].results[0].ruleId).toBe('complex-method');
    expect(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe('src/t.ts');
  });
});

describe.runIf(hasGit)('diff mode (changedSince)', () => {
  it('reports only files changed since the ref, across tools', async () => {
    const fx = makeFixture({ 'package.json': '{}', 'src/old.ts': COMPLEX.replace('tangled', 'oldTangled'), 'src/a.ts': "export const a = 1;\n" });
    cleanup = fx.cleanup;
    git(fx.dir, 'init', '-q');
    git(fx.dir, 'add', '.');
    git(fx.dir, 'commit', '-q', '-m', 'base');
    writeFileSync(path.join(fx.dir, 'src', 'new.ts'), COMPLEX.replace('tangled', 'newTangled'));
    writeFileSync(path.join(fx.dir, 'src', 'a.ts'), "import { b } from './b';\nexport const a = b;\n");
    writeFileSync(path.join(fx.dir, 'src', 'b.ts'), "import { a } from './a';\nexport const b = a;\n");

    const c = await analyzeComplexity({ path: fx.dir, threshold: 3, changedSince: 'HEAD' });
    expect(c.markdown).toContain('newTangled');
    expect(c.markdown).not.toContain('oldTangled');

    const g = await analyzeImportGraph({ path: fx.dir, changedSince: 'HEAD' });
    expect((g.data as { summary: { cycles: number } }).summary.cycles).toBe(1);

    await expect(analyzeComplexity({ path: fx.dir, changedSince: '--output=/tmp/x' })).rejects.toThrow(/Invalid git ref/);
  });
});
