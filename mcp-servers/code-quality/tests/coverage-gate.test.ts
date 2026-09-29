// SPDX-License-Identifier: MIT
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import { parseCobertura, parseJacoco, parseLcov, detectFormat, compressLines } from '../src/analysis/coverage.js';
import { analyzeCoverage, computeCoverage } from '../src/tools/coverage.js';
import { qualityGate } from '../src/tools/quality-gate.js';
import { makeFixture, hasGit, git } from './helpers.js';

let cleanup = () => {};
afterEach(() => cleanup());

const RISKY = `export function risky(a: number, b: number) {
  if (a > 1) { return 1; }
  if (a > 2) { return 2; }
  if (b > 3) { return 3; }
  if (b > 4) { return 4; }
  if (a && b) { return 5; }
  return 0;
}
export function safe(x: number) {
  return x + 1;
}
`;

describe('coverage parsers', () => {
  it('LCOV incl. functions and branches', () => {
    const f = parseLcov('TN:\nSF:src/a.ts\nFN:1,risky\nFNDA:0,risky\nDA:1,1\nDA:2,0\nBRDA:2,0,0,1\nBRDA:2,0,1,-\nend_of_record\n')[0];
    expect(f.reportPath).toBe('src/a.ts');
    expect([...f.lines]).toEqual([[1, 1], [2, 0]]);
    expect(f.branches.get(2)).toEqual([1, 2]);
    expect(f.functions).toEqual([{ name: 'risky', line: 1, hits: 0 }]);
  });

  it('Cobertura with sources and condition coverage', () => {
    const xml = `<?xml version="1.0"?><coverage line-rate="0.5"><sources><source>/proj/src</source></sources><packages><package name="p"><classes>
<class name="a" filename="a.py" line-rate="0.5"><methods><method name="f" signature=""><lines><line number="1" hits="1"/></lines></method></methods>
<lines><line number="1" hits="1"/><line number="2" hits="0" branch="true" condition-coverage="50% (1/2)"/></lines></class></classes></package></packages></coverage>`;
    expect(detectFormat(xml)).toBe('cobertura');
    const { files, sources } = parseCobertura(xml);
    expect(sources).toEqual(['/proj/src']);
    expect([...files[0].lines]).toEqual([[1, 1], [2, 0]]);
    expect(files[0].branches.get(2)).toEqual([1, 2]);
    expect(files[0].functions[0]).toMatchObject({ name: 'f', line: 1, hits: 1 });
  });

  it('JaCoCo with package paths', () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE report><report name="x"><sessioninfo id="s"/><package name="com/acme"><class name="com/acme/A" sourcefilename="A.java"><method name="run" desc="()V" line="3"><counter type="METHOD" missed="0" covered="1"/></method></class>
<sourcefile name="A.java"><line nr="3" mi="0" ci="2" mb="1" cb="1"/><line nr="4" mi="3" ci="0" mb="0" cb="0"/></sourcefile></package></report>`;
    expect(detectFormat(xml)).toBe('jacoco');
    const f = parseJacoco(xml)[0];
    expect(f.reportPath).toBe('com/acme/A.java');
    expect([...f.lines]).toEqual([[3, 2], [4, 0]]);
    expect(f.branches.get(3)).toEqual([1, 2]);
    expect(f.functions[0]).toMatchObject({ name: 'run', line: 3, hits: 1 });
  });

  it('compresses line lists', () => {
    expect(compressLines([7, 3, 4, 5, 12, 20, 21])).toBe('3-5, 7, 12, 20-21');
  });
});

describe('analyze_coverage', () => {
  it('maps report paths to files, joins complexity and ranks by CRAP', async () => {
    const fx = makeFixture({
      'package.json': '{}',
      'src/a.ts': RISKY,
      'coverage/lcov.info': `SF:${path.join('src', 'a.ts')}\n` + Array.from({ length: 11 }, (_, i) => `DA:${i + 1},${i >= 8 ? 1 : 0}`).join('\n') + '\nend_of_record\n',
    });
    cleanup = fx.cleanup;
    const s = await computeCoverage({ path: fx.dir });
    expect(s.reports[0].format).toBe('lcov');
    expect(s.totals.lines).toBe(11);
    expect(s.totals.covered).toBe(3);
    expect(s.risky.map((r) => r.name)).toEqual(['risky']);
    expect(s.risky[0].crap).toBeGreaterThan(30);
    expect(s.files[0].uncovered).toBe('1-8');
  });

  it('fails clearly when there is no report', async () => {
    const fx = makeFixture({ 'package.json': '{}', 'src/a.ts': RISKY });
    cleanup = fx.cleanup;
    await expect(analyzeCoverage({ path: fx.dir })).rejects.toThrow(/No coverage report found/);
  });

  it.runIf(hasGit)('computes patch coverage for lines changed since a ref', async () => {
    const fx = makeFixture({ 'package.json': '{}', 'src/a.ts': RISKY });
    cleanup = fx.cleanup;
    git(fx.dir, 'init', '-q');
    git(fx.dir, 'add', '.');
    git(fx.dir, 'commit', '-q', '-m', 'base');
    writeFileSync(path.join(fx.dir, 'src', 'a.ts'), RISKY.replace('return x + 1;', 'const y = x * 2;\n  return y + 1;'));
    writeFileSync(path.join(fx.dir, 'lcov.info'), 'SF:src/a.ts\nDA:10,1\nDA:11,0\nend_of_record\n');
    const s = await computeCoverage({ path: fx.dir, changedSince: 'HEAD' });
    expect(s.patch).toMatchObject({ lines: 2, covered: 1, rate: 50 });
  });
});

describe('quality_gate', () => {
  it('save is a dry run unless confirmed, refuses to overwrite, and check reports only new issues', async () => {
    const fx = makeFixture({ 'package.json': '{}', 'src/a.ts': RISKY });
    cleanup = fx.cleanup;
    const baseline = path.join(fx.dir, '.code-quality-baseline.json');

    const dry = await qualityGate({ path: fx.dir, action: 'save', checks: ['antipatterns'] });
    expect((dry.data as { status: string }).status).toBe('dry-run');
    expect(existsSync(baseline)).toBe(false);

    const saved = await qualityGate({ path: fx.dir, action: 'save', checks: ['antipatterns'], confirm: true });
    expect((saved.data as { status: string }).status).toBe('written');
    const count = JSON.parse(readFileSync(baseline, 'utf-8')).items.length;
    expect(count).toBeGreaterThan(0);

    const again = await qualityGate({ path: fx.dir, action: 'save', checks: ['antipatterns'], confirm: true });
    expect((again.data as { status: string }).status).toBe('refused-exists');

    const clean = await qualityGate({ path: fx.dir, checks: ['antipatterns'] });
    expect((clean.data as { passed: boolean; counts: { new: number } }).passed).toBe(true);
    expect((clean.data as { counts: { new: number } }).counts.new).toBe(0);

    // Moving the code down does not make old findings new; adding a smell does.
    writeFileSync(path.join(fx.dir, 'src', 'a.ts'), '\n\n\n' + RISKY + 'try { risky(1, 2); } catch (e) {}\n');
    const dirty = await qualityGate({ path: fx.dir, checks: ['antipatterns'] });
    const d = dirty.data as { passed: boolean; newIssues: Array<{ rule: string }>; reasons: string[] };
    expect(d.passed).toBe(false);
    expect(d.newIssues.map((i) => i.rule)).toEqual(['empty-catch']);
    expect(dirty.markdown).toContain('FAILED');
  });

  it('keeps the baseline inside the repository', async () => {
    const fx = makeFixture({ 'package.json': '{}', 'src/a.ts': RISKY });
    cleanup = fx.cleanup;
    await expect(qualityGate({ path: fx.dir, action: 'save', baselineFile: '../outside.json', confirm: true })).rejects.toThrow(/escapes/);
  });

  it('fails a threshold that needs a check which was not run', async () => {
    const fx = makeFixture({ 'package.json': '{}', 'src/a.ts': RISKY });
    cleanup = fx.cleanup;
    const r = await qualityGate({ path: fx.dir, checks: ['antipatterns'], thresholds: { maxNewIssues: 1000, minCoverage: 80 } });
    expect((r.data as { reasons: string[] }).reasons.join(' ')).toMatch(/needs the "coverage" check/);
  });
});
