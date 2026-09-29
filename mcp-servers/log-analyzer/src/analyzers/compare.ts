// SPDX-License-Identifier: MIT
/**
 * compare_logs: compare a baseline and a comparison source (e.g. before and
 * after a deploy) by level distribution, known problem patterns, time
 * distribution, error fingerprints, or message templates. Streaming — each
 * side is read once.
 */

import type { LogLevel, SourceInput } from '../types.js';
import { LOG_LEVELS } from '../types.js';
import { scan, type PipelineDeps, type ScanSummary } from '../pipeline/index.js';
import { StatsAccumulator } from './stats.js';
import { PatternAccumulator } from './patterns.js';
import { ErrorAccumulator } from './errors.js';
import { Drain, templateText } from '../core/drain.js';
import { describeScan } from './output.js';

export type CompareBy = 'level' | 'pattern' | 'time' | 'errors' | 'templates';

interface Comparison {
  metric: string;
  baseline: number;
  comparison: number;
  change: number | null; // percent; null when baseline is 0
  significance: 'none' | 'minor' | 'major' | 'critical';
}

function pct(a: number, b: number): number | null {
  if (a === 0) return b === 0 ? 0 : null;
  return Math.round(((b - a) / a) * 10000) / 100;
}

function sig(change: number | null, isNew: boolean, thresholds: [number, number, number]): Comparison['significance'] {
  if (isNew) return thresholds[0] <= 50 ? 'critical' : 'major';
  if (change === null) return 'none';
  const a = Math.abs(change);
  if (a >= thresholds[0]) return 'critical';
  if (a >= thresholds[1]) return 'major';
  if (a >= thresholds[2]) return 'minor';
  return 'none';
}

interface Side {
  stats: StatsAccumulator;
  patterns?: PatternAccumulator;
  errors?: ErrorAccumulator;
  drain?: Drain;
  summary: ScanSummary;
}

async function readSide(input: SourceInput, by: CompareBy, deps: PipelineDeps): Promise<Side> {
  const stats = new StatsAccumulator('hour');
  const patterns = by === 'pattern' ? new PatternAccumulator() : undefined;
  const errors = by === 'errors' ? new ErrorAccumulator(false) : undefined;
  const drain = by === 'templates' ? new Drain({ maxClusters: 3000 }) : undefined;
  const summary = await scan(input, {}, (e) => {
    stats.add(e);
    patterns?.add(e);
    errors?.add(e);
    if (drain) drain.add(e.message.split('\n')[0].slice(0, 2000));
  }, deps);
  return { stats, patterns, errors, drain, summary };
}

export async function compareLogs(
  baseline: SourceInput,
  comparison: SourceInput,
  by: CompareBy = 'level',
  deps: PipelineDeps = {},
): Promise<Record<string, unknown>> {
  const [b, c] = await Promise.all([readSide(baseline, by, deps), readSide(comparison, by, deps)]);
  const comparisons: Comparison[] = [];
  let appeared: unknown[] = [];
  let disappeared: unknown[] = [];

  const bs = b.stats.result().stats;
  const cs = c.stats.result().stats;
  const totalRow = (): Comparison => ({ metric: 'Total entries', baseline: bs.totalEntries, comparison: cs.totalEntries, change: pct(bs.totalEntries, cs.totalEntries), significance: 'none' });

  switch (by) {
    case 'level': {
      for (const level of LOG_LEVELS as LogLevel[]) {
        const x = bs.byLevel[level];
        const y = cs.byLevel[level];
        const change = pct(x, y);
        const th: [number, number, number] = level === 'ERROR' || level === 'FATAL' ? [50, 20, 5] : level === 'WARN' ? [300, 100, 30] : [1e9, 1e9, 200];
        comparisons.push({ metric: `${level} count`, baseline: x, comparison: y, change, significance: sig(change, x === 0 && y > 0 && (level === 'ERROR' || level === 'FATAL'), th) });
      }
      comparisons.push(totalRow());
      const rate = (s: typeof bs) => (s.totalEntries ? ((s.byLevel.ERROR + s.byLevel.FATAL) / s.totalEntries) * 100 : 0);
      const br = Math.round(rate(bs) * 100) / 100;
      const cr = Math.round(rate(cs) * 100) / 100;
      const change = pct(br, cr);
      comparisons.push({ metric: 'Error rate (%)', baseline: br, comparison: cr, change, significance: sig(change, br === 0 && cr > 0, [50, 20, 5]) });
      break;
    }
    case 'time': {
      const perHour = (s: typeof bs) => (s.byHour.length ? (s.totalEntries - s.entriesWithoutTimestamp) / s.byHour.length : 0);
      const x = Math.round(perHour(bs) * 100) / 100;
      const y = Math.round(perHour(cs) * 100) / 100;
      comparisons.push({ metric: 'Avg entries/hour (active hours)', baseline: x, comparison: y, change: pct(x, y), significance: sig(pct(x, y), false, [1e9, 50, 20]) });
      const peak = (s: typeof bs) => s.byHour.reduce((m, h) => Math.max(m, h.total), 0);
      comparisons.push({ metric: 'Peak hour entries', baseline: peak(bs), comparison: peak(cs), change: pct(peak(bs), peak(cs)), significance: sig(pct(peak(bs), peak(cs)), false, [1e9, 100, 30]) });
      const peakErr = (s: typeof bs) => s.byHour.reduce((m, h) => Math.max(m, h.errors), 0);
      comparisons.push({ metric: 'Peak hour errors', baseline: peakErr(bs), comparison: peakErr(cs), change: pct(peakErr(bs), peakErr(cs)), significance: sig(pct(peakErr(bs), peakErr(cs)), peakErr(bs) === 0 && peakErr(cs) > 0, [100, 50, 20]) });
      comparisons.push(totalRow());
      break;
    }
    case 'pattern': {
      const bp = new Map(b.patterns!.patterns(1).map((p) => [p.description, p]));
      const cp = new Map(c.patterns!.patterns(1).map((p) => [p.description, p]));
      for (const [d, p] of cp) {
        const base = bp.get(d);
        const change = pct(base?.count ?? 0, p.count);
        comparisons.push({ metric: `${base ? '' : 'NEW: '}${d}`, baseline: base?.count ?? 0, comparison: p.count, change, significance: base ? sig(change, false, p.severity === 'critical' ? [20, 10, 5] : [100, 50, 20]) : (p.severity === 'critical' ? 'critical' : 'major') });
      }
      for (const [d, p] of bp) {
        if (!cp.has(d)) comparisons.push({ metric: `RESOLVED: ${d}`, baseline: p.count, comparison: 0, change: -100, significance: 'none' });
      }
      appeared = [...cp.keys()].filter((d) => !bp.has(d));
      disappeared = [...bp.keys()].filter((d) => !cp.has(d));
      break;
    }
    case 'errors': {
      const bg = b.errors!.groups;
      const cg = c.errors!.groups;
      appeared = [...cg.values()].filter((g) => !bg.has(g.fingerprint)).sort((x, y) => y.count - x.count).slice(0, 50)
        .map((g) => ({ fingerprint: g.fingerprint, type: g.type, message: g.message, count: g.count }));
      disappeared = [...bg.values()].filter((g) => !cg.has(g.fingerprint)).sort((x, y) => y.count - x.count).slice(0, 50)
        .map((g) => ({ fingerprint: g.fingerprint, type: g.type, message: g.message, count: g.count }));
      for (const g of [...cg.values()].filter((g) => bg.has(g.fingerprint)).sort((x, y) => y.count - x.count).slice(0, 30)) {
        const base = bg.get(g.fingerprint)!.count;
        const change = pct(base, g.count);
        comparisons.push({ metric: `${g.type}: ${g.normalizedMessage.slice(0, 80)}`, baseline: base, comparison: g.count, change, significance: sig(change, false, [100, 50, 20]) });
      }
      comparisons.push({ metric: 'Errors', baseline: b.errors!.errors, comparison: c.errors!.errors, change: pct(b.errors!.errors, c.errors!.errors), significance: sig(pct(b.errors!.errors, c.errors!.errors), b.errors!.errors === 0 && c.errors!.errors > 0, [50, 20, 5]) });
      break;
    }
    case 'templates': {
      const tb = new Map(b.drain!.clusters.map((cl) => [templateText(cl), cl.size]));
      const tc = new Map(c.drain!.clusters.map((cl) => [templateText(cl), cl.size]));
      appeared = [...tc.entries()].filter(([t]) => !tb.has(t)).sort((x, y) => y[1] - x[1]).slice(0, 50).map(([template, count]) => ({ template, count }));
      disappeared = [...tb.entries()].filter(([t]) => !tc.has(t)).sort((x, y) => y[1] - x[1]).slice(0, 50).map(([template, count]) => ({ template, count }));
      const shared = [...tc.entries()].filter(([t]) => tb.has(t)).map(([t, n]) => ({ t, n, base: tb.get(t)!, change: pct(tb.get(t)!, n) }));
      shared.sort((x, y) => Math.abs(y.change ?? 0) * Math.log1p(y.n) - Math.abs(x.change ?? 0) * Math.log1p(x.n));
      for (const s of shared.slice(0, 30)) comparisons.push({ metric: s.t.slice(0, 120), baseline: s.base, comparison: s.n, change: s.change, significance: sig(s.change, false, [300, 100, 50]) });
      comparisons.push(totalRow());
      break;
    }
  }

  const critical = comparisons.filter((x) => x.significance === 'critical');
  const major = comparisons.filter((x) => x.significance === 'major');
  const lines: string[] = [];
  if (critical.length) lines.push(`CRITICAL: ${critical.map((x) => `${x.metric} ${x.change === null ? '(new)' : (x.change > 0 ? '+' : '') + x.change + '%'}`).join('; ')}`);
  if (major.length) lines.push(`MAJOR: ${major.length} significant change(s)`);
  if (appeared.length) lines.push(`${appeared.length} item(s) appeared only in the comparison`);
  if (disappeared.length) lines.push(`${disappeared.length} item(s) no longer present`);
  if (!critical.length && !major.length && !appeared.length) lines.push('No significant changes detected');

  return {
    compareBy: by,
    baselineTimeRange: b.stats.span.toJSON(),
    comparisonTimeRange: c.stats.span.toJSON(),
    comparisons,
    ...(by === 'pattern' ? { newPatterns: appeared, resolvedPatterns: disappeared } : {}),
    ...(by === 'errors' ? { newErrors: appeared, resolvedErrors: disappeared } : {}),
    ...(by === 'templates' ? { newTemplates: appeared, vanishedTemplates: disappeared } : {}),
    summary: lines.join('\n'),
    baselineScan: describeScan(b.summary),
    comparisonScan: describeScan(c.summary),
  };
}
