// SPDX-License-Identifier: MIT
import { describe, it, expect, afterEach } from 'vitest';
import { analyzeSource, Interner } from '../src/parsing/analyze.js';
import { detectClones, type CloneInputFile } from '../src/analysis/clones.js';
import { findDuplicates } from '../src/tools/duplicates.js';
import { makeFixture } from './helpers.js';

async function input(files: Record<string, string>, interner = new Interner()): Promise<CloneInputFile[]> {
  const out: CloneInputFile[] = [];
  for (const [rel, content] of Object.entries(files)) {
    const a = await analyzeSource(rel.endsWith('.py') ? 'python' : 'typescript', content, { tokens: interner });
    out.push({ rel, content, loc: a.loc, tokens: a.tokens! });
  }
  return out;
}

const BLOCK = (name: string, v: string) => `export function ${name}(items: number[], limit: number) {
  const out: number[] = [];
  for (const item of items) {
    if (item > limit) {
      out.push(item * 2 + ${v});
    } else {
      out.push(item - 1);
    }
  }
  return out.filter((x) => x !== 0).map((x) => x + 1);
}
`;

describe('detectClones', () => {
  it('finds a cross-file clone with renamed identifiers (renamed mode) but not in exact mode', async () => {
    const files = await input({
      'a.ts': BLOCK('first', '1'),
      'b.ts': BLOCK('second', '1').replace(/items/g, 'values').replace(/limit/g, 'max'),
    });
    const renamed = detectClones(files, { minTokens: 60, minLines: 3, mode: 'renamed' });
    expect(renamed.groups).toHaveLength(1);
    expect(renamed.groups[0].locations.map((l) => l.file).sort()).toEqual(['a.ts', 'b.ts']);
    const exact = detectClones(files, { minTokens: 60, minLines: 3, mode: 'exact' });
    expect(exact.groups).toHaveLength(0);
  });

  it('keeps literals significant in renamed mode, abstracts them in abstract mode', async () => {
    const files = await input({ 'a.ts': BLOCK('f', '1'), 'b.ts': BLOCK('f', '7777') });
    // The literal splits the match into two shorter clones in renamed mode.
    const renamed = detectClones(files, { minTokens: 60, minLines: 3, mode: 'renamed' });
    expect(renamed.groups).toHaveLength(0);
    const abs = detectClones(files, { minTokens: 60, minLines: 3, mode: 'abstract' });
    expect(abs.groups).toHaveLength(1);
  });

  it('measures minTokens in real tokens, not whitespace-separated words', async () => {
    // One long line: ~70 tokens but only a handful of "words".
    const line = 'export const t=[a+b*c-d/e,f(g,h),i?.j??k,(l)=>m,[n,o],{p:q},r&&s||u,v<w,x>y,z%1];\n';
    const files = await input({ 'a.ts': line, 'b.ts': line.replace(/\bt\b/, 'other') });
    expect(detectClones(files, { minTokens: 50, minLines: 1, mode: 'renamed' }).groups).toHaveLength(1);
    expect(detectClones(files, { minTokens: 200, minLines: 1, mode: 'renamed' }).groups).toHaveLength(0);
  });

  it('merges overlapping copies of repetitive code instead of listing every shifted window', async () => {
    const rows = Array.from({ length: 40 }, (_, i) => `  register(table, ${i % 2 ? 'x' : 'y'}, handler${i}, options);`).join('\n');
    const files = await input({ 'r.ts': `function setup() {\n${rows}\n}\n` });
    const r = detectClones(files, { minTokens: 20, minLines: 2, mode: 'renamed' });
    for (const g of r.groups) {
      const spans = g.locations.filter((l) => l.file === 'r.ts').sort((a, b) => a.startLine - b.startLine);
      for (let i = 1; i < spans.length; i++) expect(spans[i].startLine).toBeGreaterThan(spans[i - 1].endLine);
    }
    expect(r.percentage).toBeLessThanOrEqual(100);
  });

  it('reports no clones for merely similar code', async () => {
    const files = await input({
      'a.ts': 'export function a(x: number) { return x + 1; }\n',
      'b.ts': 'export function b(s: string) { return s.trim().toUpperCase(); }\n',
    });
    expect(detectClones(files, { minTokens: 10, minLines: 1, mode: 'renamed' }).groups).toHaveLength(0);
  });
});

describe('find_duplicates tool', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  it('reports repo-relative paths and honours includeTests', async () => {
    const fx = makeFixture({
      'src/a.ts': BLOCK('first', '1'),
      'src/b.ts': BLOCK('second', '1'),
      'src/a.test.ts': BLOCK('third', '1'),
    });
    cleanup = fx.cleanup;
    const without = await findDuplicates({ path: fx.dir, minTokens: 30, minLines: 3 });
    const d1 = without.data as { clones: Array<{ locations: Array<{ file: string }> }> };
    expect(d1.clones).toHaveLength(1);
    expect(d1.clones[0].locations.map((l) => l.file).sort()).toEqual(['src/a.ts', 'src/b.ts']);
    expect(without.markdown).toContain('1 test file(s) excluded');

    const withTests = await findDuplicates({ path: fx.dir, minTokens: 30, minLines: 3, includeTests: true });
    const d2 = withTests.data as { clones: Array<{ locations: unknown[] }> };
    expect(d2.clones[0].locations).toHaveLength(3);
  });
});
