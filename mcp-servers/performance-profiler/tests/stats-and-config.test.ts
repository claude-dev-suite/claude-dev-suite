// SPDX-License-Identifier: MIT
/**
 * Statistics, leak verdicts, thresholds, env flags and redaction.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  incompleteBeta,
  linearRegression,
  removeOutliers,
  sampleStdDev,
  summarize,
  tCritical,
  tTwoSidedP,
  welchTTest,
} from '../src/utils/statistics.js';
import { assessLeak } from '../src/memory/leak.js';
import { evaluateThresholds, parseThreshold } from '../src/load/thresholds.js';
import { allowPrivateUrls, allowRawCode, envFlag, limits } from '../src/utils/env.js';
import { redactPath, redactRecord, redactText, redactUrl } from '../src/utils/redact.js';

describe('t distribution', () => {
  it('matches textbook critical values', () => {
    expect(tCritical(10)).toBeCloseTo(2.228, 3);
    expect(tCritical(30)).toBeCloseTo(2.042, 3);
    expect(tCritical(1000)).toBeCloseTo(1.962, 2);
  });
  it('p-values are consistent with the critical values', () => {
    expect(tTwoSidedP(2.228, 10)).toBeCloseTo(0.05, 3);
    expect(tTwoSidedP(0, 10)).toBeCloseTo(1, 6);
    expect(incompleteBeta(0.5, 2, 2)).toBeCloseTo(0.5, 10);
  });
});

describe('summarize', () => {
  it('reports a 95% CI around the mean and removes Tukey outliers', () => {
    const data = [10, 11, 9, 10, 10, 11, 9, 10, 200];
    const s = summarize(data);
    expect(s.outliersRemoved).toBe(1);
    expect(s.n).toBe(8);
    expect(s.mean).toBe(10);
    expect(s.ci95[0]).toBeLessThan(10);
    expect(s.ci95[1]).toBeGreaterThan(10);
    expect(s.stdDev).toBeCloseTo(sampleStdDev([10, 11, 9, 10, 10, 11, 9, 10]), 6);
  });
  it('can keep outliers', () => {
    expect(summarize([1, 2, 3, 100], { removeOutliers: false }).n).toBe(4);
    expect(removeOutliers([1, 1, 1, 1, 50]).removed).toBe(1);
  });
});

describe('welchTTest', () => {
  it('finds a real difference significant', () => {
    const a = Array.from({ length: 30 }, (_, i) => 10 + (i % 3) * 0.1);
    const b = Array.from({ length: 30 }, (_, i) => 12 + (i % 3) * 0.1);
    const w = welchTTest(a, b);
    expect(w.significant).toBe(true);
    expect(w.diffPct).toBeCloseTo(19.8, 0);
    expect(w.diffCi95[0]).toBeGreaterThan(0);
  });
  it('does not call noise significant', () => {
    const a = [10, 12, 11, 9, 10, 12, 11, 9];
    const b = [11, 9, 10, 12, 9, 11, 12, 10];
    const w = welchTTest(a, b);
    expect(w.significant).toBe(false);
    expect(w.pValue).toBeGreaterThan(0.5);
  });
});

describe('assessLeak', () => {
  const series = (f: (t: number) => number) => Array.from({ length: 20 }, (_, i) => ({ t: i * 500, used: f(i * 500) }));

  it('flags steady post-warm-up growth', () => {
    const r = assessLeak(series((t) => 10e6 + t * 2000), { warmupMs: 1000 });
    expect(r.verdict).toBe('likely-leak');
    expect(r.growthRate).toBeCloseTo(2_000_000, -3);
  });
  it('does not flag a flat heap after warm-up growth', () => {
    const r = assessLeak(series((t) => (t < 1000 ? 5e6 + t * 10000 : 15e6 + (t % 1000))), { warmupMs: 1500 });
    expect(r.verdict).toBe('no-leak-detected');
  });
  it('lets a snapshot comparison with no net growth veto the trend', () => {
    const r = assessLeak(series((t) => 10e6 + t * 2000), { confirmBytes: -1000 });
    expect(r.verdict).toBe('inconclusive');
  });
  it('is inconclusive with too few samples', () => {
    expect(assessLeak([{ t: 0, used: 1 }, { t: 1, used: 1e9 }]).verdict).toBe('inconclusive');
  });
  it('regression helper', () => {
    const { slope, r2 } = linearRegression([0, 1, 2, 3], [1, 3, 5, 7]);
    expect(slope).toBe(2);
    expect(r2).toBe(1);
  });
});

describe('thresholds', () => {
  it('parses k6-style expressions', () => {
    expect(parseThreshold('p95<300')).toMatchObject({ metric: 'p95', op: '<', value: 300 });
    expect(parseThreshold('p(99)<=800')).toMatchObject({ metric: 'p99', op: '<=', value: 800 });
    expect(parseThreshold('error_rate<1%')).toMatchObject({ metric: 'error_rate', value: 0.01 });
    expect(parseThreshold('avg < 200ms')).toMatchObject({ metric: 'mean', value: 200 });
    expect(() => parseThreshold('p95 is fast')).toThrow(/Invalid threshold/);
    expect(() => parseThreshold('rps<5%')).toThrow(/only valid for error_rate/);
  });
  it('evaluates pass/fail', () => {
    const res = evaluateThresholds([parseThreshold('p95<300'), parseThreshold('rps>=100'), parseThreshold('error_rate<0.01')], {
      percentile: () => 250, mean: 100, min: 1, max: 900, errorRate: 0.02, rps: 120,
    });
    expect(res.map((r) => r.passed)).toEqual([true, true, false]);
  });
});

describe('env flags', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });
  it('accepts the documented "true" as well as "1" (the old gate only accepted "1")', () => {
    for (const v of ['true', 'TRUE', '1', 'yes', 'on']) expect(envFlag(v)).toBe(true);
    for (const v of ['false', '0', '', undefined]) expect(envFlag(v)).toBe(false);
    process.env.PERF_PROFILER_ALLOW_RAW_CODE = 'true';
    process.env.PERF_PROFILER_ALLOW_PRIVATE_URLS = 'true';
    expect(allowRawCode()).toBe(true);
    expect(allowPrivateUrls()).toBe(true);
  });
  it('reads caps with sane bounds', () => {
    process.env.PERF_PROFILER_MAX_VUS = '5';
    process.env.PERF_PROFILER_MAX_DURATION_S = 'nonsense';
    expect(limits().maxVus).toBe(5);
    expect(limits().maxDurationS).toBe(600);
  });
});

describe('redaction', () => {
  it('redacts URLs, paths, text and records', () => {
    expect(redactUrl('https://u:p@h.example/x?token=abc&q=1')).toBe('https://***:***@h.example/x?token=***&q=1');
    expect(redactPath('/login?password=hunter2&next=/a')).toBe('/login?password=***&next=%2Fa');
    expect(redactText('DATABASE_URL=postgres://admin:s3cret@db:5432/app')).not.toContain('s3cret');
    expect(redactText('Authorization: Bearer abcdefghijklmnop')).not.toContain('abcdefghijklmnop');
    expect(redactText('api_key="XYZ123456"')).not.toContain('XYZ123456');
    expect(redactRecord({ SESSION_TOKEN: 'abc', userId: '42' })).toEqual({ SESSION_TOKEN: '***', userId: '42' });
  });
});
