// SPDX-License-Identifier: MIT
/**
 * Pass/fail thresholds for load tests, k6-style: "p95<300", "p(99)<=800",
 * "avg<200", "error_rate<0.01", "error_rate<1%", "rps>=50".
 * Latency values are milliseconds.
 */

export interface Threshold {
  expression: string;
  metric: string;
  op: '<' | '<=' | '>' | '>=';
  value: number;
}

export interface ThresholdResult extends Threshold {
  actual: number;
  passed: boolean;
}

const ALIASES: Record<string, string> = {
  avg: 'mean',
  mean: 'mean',
  med: 'p50',
  median: 'p50',
  min: 'min',
  max: 'max',
  error_rate: 'error_rate',
  errors: 'error_rate',
  err_rate: 'error_rate',
  rps: 'rps',
  throughput: 'rps',
};

export function parseThreshold(expr: string): Threshold {
  const m = expr.trim().match(/^([a-z_]+|p\(?\d+(?:\.\d+)?\)?)\s*(<=|>=|<|>)\s*(\d+(?:\.\d+)?)\s*(%|ms)?$/i);
  if (!m) {
    throw new Error(
      `Invalid threshold "${expr}". Use e.g. "p95<300", "p(99)<=800", "avg<200", "error_rate<0.01", "error_rate<1%", "rps>=50".`
    );
  }
  const rawMetric = m[1].toLowerCase();
  let metric: string;
  const pm = rawMetric.match(/^p\(?(\d+(?:\.\d+)?)\)?$/);
  if (pm) {
    const p = Number(pm[1]);
    if (p <= 0 || p > 100) throw new Error(`Invalid percentile in threshold "${expr}"`);
    metric = `p${pm[1]}`;
  } else if (ALIASES[rawMetric]) {
    metric = ALIASES[rawMetric];
  } else {
    throw new Error(`Unknown threshold metric "${m[1]}" in "${expr}"`);
  }
  let value = Number(m[3]);
  if (m[4] === '%') {
    if (metric !== 'error_rate') throw new Error(`"%" is only valid for error_rate in "${expr}"`);
    value = value / 100;
  }
  return { expression: expr.trim(), metric, op: m[2] as Threshold['op'], value };
}

export function evaluateThresholds(
  thresholds: Threshold[],
  metrics: { percentile: (p: number) => number; mean: number; min: number; max: number; errorRate: number; rps: number }
): ThresholdResult[] {
  return thresholds.map((t) => {
    let actual: number;
    if (t.metric.startsWith('p')) actual = metrics.percentile(Number(t.metric.slice(1)));
    else if (t.metric === 'mean') actual = metrics.mean;
    else if (t.metric === 'min') actual = metrics.min;
    else if (t.metric === 'max') actual = metrics.max;
    else if (t.metric === 'error_rate') actual = metrics.errorRate;
    else actual = metrics.rps;
    const passed =
      Number.isFinite(actual) &&
      (t.op === '<' ? actual < t.value : t.op === '<=' ? actual <= t.value : t.op === '>' ? actual > t.value : actual >= t.value);
    return { ...t, actual: Math.round(actual * 1000) / 1000, passed };
  });
}
