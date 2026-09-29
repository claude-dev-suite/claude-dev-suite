// SPDX-License-Identifier: MIT
/**
 * Statistical utility functions for performance analysis
 */

/**
 * Calculate the mean (average) of an array of numbers
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate the median of an array of numbers
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculate the standard deviation of an array of numbers
 */
export function stdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const squareDiffs = values.map(v => Math.pow(v - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

/**
 * Calculate a specific percentile from an array of numbers
 * @param values Array of numbers
 * @param p Percentile (0-100)
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

/**
 * Calculate min value
 */
export function min(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.min(...values);
}

/**
 * Calculate max value
 */
export function max(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values);
}

/**
 * Calculate operations per second from mean time in ms
 */
export function opsPerSecond(meanMs: number): number {
  if (meanMs <= 0) return 0;
  return 1000 / meanMs;
}

/**
 * Calculate all common statistics for a set of timing values
 */
export function calculateStats(timings: number[]): {
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
  opsPerSecond: number;
  percentiles: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
} {
  const meanVal = mean(timings);
  return {
    mean: round(meanVal, 4),
    median: round(median(timings), 4),
    min: round(min(timings), 4),
    max: round(max(timings), 4),
    stdDev: round(stdDev(timings), 4),
    opsPerSecond: round(opsPerSecond(meanVal), 2),
    percentiles: {
      p50: round(percentile(timings, 50), 4),
      p90: round(percentile(timings, 90), 4),
      p95: round(percentile(timings, 95), 4),
      p99: round(percentile(timings, 99), 4),
    },
  };
}

/**
 * Round a number to a specific number of decimal places
 */
export function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0 || !Number.isFinite(bytes)) return '0 B';
  const sign = bytes < 0 ? '-' : '';
  const abs = Math.abs(bytes);
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(sizes.length - 1, Math.max(0, Math.floor(Math.log(abs) / Math.log(k))));
  return `${sign}${round(abs / Math.pow(k, i), 2)} ${sizes[i]}`;
}

/**
 * Format milliseconds to human readable string
 */
export function formatMs(ms: number): string {
  if (ms < 1) return `${round(ms * 1000, 2)} μs`;
  if (ms < 1000) return `${round(ms, 2)} ms`;
  return `${round(ms / 1000, 2)} s`;
}

// ============================================================================
// Inferential statistics for benchmarks and regression checks
// ============================================================================

/** Sample (n-1) standard deviation. */
export function sampleStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let ss = 0;
  for (const v of values) ss += (v - m) * (v - m);
  return Math.sqrt(ss / (values.length - 1));
}

/** Natural log of the gamma function (Lanczos approximation). */
function logGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for the regularized incomplete beta function. */
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 300;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Two-sided p-value for Student's t with `df` degrees of freedom. */
export function tTwoSidedP(t: number, df: number): number {
  if (!Number.isFinite(t)) return 0;
  if (df <= 0) return 1;
  return incompleteBeta(df / (df + t * t), df / 2, 0.5);
}

/** Critical t value for a two-sided interval at confidence `conf` (bisection). */
export function tCritical(df: number, conf = 0.95): number {
  if (df <= 0) return NaN;
  const alpha = 1 - conf;
  let lo = 0;
  let hi = 1000;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (tTwoSidedP(mid, df) > alpha) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Tukey fences: drop values outside [Q1 - k*IQR, Q3 + k*IQR]. */
export function removeOutliers(values: number[], k = 1.5): { kept: number[]; removed: number } {
  if (values.length < 4) return { kept: [...values], removed: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  const iqr = q3 - q1;
  const lo = q1 - k * iqr;
  const hi = q3 + k * iqr;
  const kept = values.filter((v) => v >= lo && v <= hi);
  return { kept, removed: values.length - kept.length };
}

export interface SampleSummary {
  n: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
  /** Relative margin of error of the mean (95% CI half-width / mean), percent. */
  rme: number;
  ci95: [number, number];
  p75: number;
  p95: number;
  p99: number;
  /** Operations per second implied by the mean, when values are milliseconds. */
  opsPerSecond: number;
  outliersRemoved: number;
}

/** Full descriptive summary with a 95% t-interval, after optional outlier removal. */
export function summarize(raw: number[], opts: { removeOutliers?: boolean; decimals?: number } = {}): SampleSummary {
  const dec = opts.decimals ?? 6;
  const { kept, removed } = opts.removeOutliers === false ? { kept: raw, removed: 0 } : removeOutliers(raw);
  const values = kept.length > 0 ? kept : raw;
  const n = values.length;
  const m = mean(values);
  const sd = sampleStdDev(values);
  const half = n > 1 ? tCritical(n - 1) * (sd / Math.sqrt(n)) : 0;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n,
    mean: round(m, dec),
    median: round(percentile(sorted, 50), dec),
    min: round(sorted[0] ?? 0, dec),
    max: round(sorted[n - 1] ?? 0, dec),
    stdDev: round(sd, dec),
    rme: m > 0 ? round((half / m) * 100, 2) : 0,
    ci95: [round(m - half, dec), round(m + half, dec)],
    p75: round(percentile(sorted, 75), dec),
    p95: round(percentile(sorted, 95), dec),
    p99: round(percentile(sorted, 99), dec),
    opsPerSecond: m > 0 ? round(1000 / m, 2) : 0,
    outliersRemoved: removed,
  };
}

export interface WelchResult {
  meanA: number;
  meanB: number;
  /** (meanB - meanA) / meanA, percent. Positive = B larger (slower, for timings). */
  diffPct: number;
  /** 95% CI of (meanB - meanA). */
  diffCi95: [number, number];
  t: number;
  df: number;
  pValue: number;
  significant: boolean;
  /** Cohen's d using the pooled SD. */
  effectSize: number;
}

/** Welch's unequal-variance t-test between two samples. */
export function welchTTest(a: number[], b: number[], alpha = 0.05): WelchResult {
  const na = a.length;
  const nb = b.length;
  const ma = mean(a);
  const mb = mean(b);
  const va = na > 1 ? sampleStdDev(a) ** 2 : 0;
  const vb = nb > 1 ? sampleStdDev(b) ** 2 : 0;
  const se2 = va / Math.max(na, 1) + vb / Math.max(nb, 1);
  const se = Math.sqrt(se2);
  const diff = mb - ma;
  let t: number;
  let df: number;
  if (se === 0) {
    t = diff === 0 ? 0 : diff > 0 ? Infinity : -Infinity;
    df = Math.max(na + nb - 2, 1);
  } else {
    t = diff / se;
    const den = (na > 1 ? (va / na) ** 2 / (na - 1) : 0) + (nb > 1 ? (vb / nb) ** 2 / (nb - 1) : 0);
    df = den > 0 ? (se2 * se2) / den : Math.max(na + nb - 2, 1);
  }
  const p = na < 2 || nb < 2 ? 1 : tTwoSidedP(Math.abs(t), df);
  const tc = df > 0 ? tCritical(df) : 1.96;
  const pooled = Math.sqrt(((na - 1) * va + (nb - 1) * vb) / Math.max(na + nb - 2, 1));
  return {
    meanA: round(ma, 6),
    meanB: round(mb, 6),
    diffPct: ma !== 0 ? round((diff / ma) * 100, 2) : 0,
    diffCi95: [round(diff - tc * se, 6), round(diff + tc * se, 6)],
    t: Number.isFinite(t) ? round(t, 4) : t,
    df: round(df, 2),
    pValue: round(p, 6),
    significant: na >= 2 && nb >= 2 && p < alpha,
    effectSize: pooled > 0 ? round(diff / pooled, 3) : 0,
  };
}

/** Least-squares slope, intercept and R² of y over x. */
export function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, r2: 0 };
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const r2 = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
  return { slope, intercept: my - slope * mx, r2 };
}
