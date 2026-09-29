// SPDX-License-Identifier: MIT
/**
 * Leak verdict from a heap-usage time series of the *target* process.
 *
 * A single "grew by N bytes" comparison of first vs last sample flags every
 * warm-up and every GC-timing artefact as a leak. Instead: drop the warm-up
 * window, fit a line, and require both a steady trend (R²) and a material
 * amount of growth — then let a snapshot/histogram diff, when available,
 * confirm or veto it.
 */

import { formatBytes, linearRegression, round } from '../utils/statistics.js';

export type LeakVerdict = 'likely-leak' | 'no-leak-detected' | 'inconclusive';

export interface LeakAssessment {
  verdict: LeakVerdict;
  reason: string;
  /** Bytes per second over the post-warm-up window. */
  growthRate: number;
  r2: number;
  growthBytes: number;
  samplesUsed: number;
}

export function assessLeak(
  samples: Array<{ t: number; used: number }>,
  opts: { warmupMs?: number; confirmBytes?: number; forcedGc?: boolean } = {}
): LeakAssessment {
  const warm = opts.warmupMs ?? 0;
  let window = samples.filter((s) => s.t >= warm);
  if (window.length < 4) window = samples.slice(Math.min(1, samples.length - 1));
  const n = window.length;
  if (n < 4) {
    return {
      verdict: 'inconclusive',
      reason: `Only ${n} usable sample(s) after warm-up; run longer or sample more often.`,
      growthRate: 0, r2: 0, growthBytes: 0, samplesUsed: n,
    };
  }
  const xs = window.map((s) => s.t / 1000);
  const ys = window.map((s) => s.used);
  const { slope, r2 } = linearRegression(xs, ys);
  const span = xs[n - 1] - xs[0];
  const growth = slope * span;
  const base = Math.max(ys[0], 1);
  const material = Math.max(1024 * 1024, 0.1 * base);
  const negligible = Math.max(512 * 1024, 0.05 * base);
  const gcNote = opts.forcedGc === false ? ' (samples not taken after a forced GC, so noise is higher)' : '';

  let verdict: LeakVerdict;
  let reason: string;
  if (slope > 0 && r2 >= 0.6 && growth >= material) {
    verdict = 'likely-leak';
    reason = `Heap grew steadily by ~${formatBytes(growth)} over ${round(span, 1)}s (${formatBytes(slope)}/s, R²=${round(r2, 2)})${gcNote}.`;
    if (opts.confirmBytes !== undefined && opts.confirmBytes <= 0) {
      verdict = 'inconclusive';
      reason += ` The snapshot/histogram comparison shows no net growth (${formatBytes(opts.confirmBytes)}), so this may be GC timing.`;
    } else if (opts.confirmBytes !== undefined) {
      reason += ` Confirmed by the snapshot/histogram comparison (+${formatBytes(opts.confirmBytes)} retained).`;
    }
  } else if (growth < negligible || slope <= 0) {
    verdict = 'no-leak-detected';
    reason = `No material heap growth after warm-up (${formatBytes(Math.max(growth, 0))} over ${round(span, 1)}s)${gcNote}.`;
  } else {
    verdict = 'inconclusive';
    reason = `Heap grew ~${formatBytes(growth)} over ${round(span, 1)}s but not steadily (R²=${round(r2, 2)}); run longer${gcNote}.`;
  }
  return { verdict, reason, growthRate: round(slope, 2), r2: round(r2, 3), growthBytes: Math.round(growth), samplesUsed: n };
}
