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
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${round(bytes / Math.pow(k, i), 2)} ${sizes[i]}`;
}

/**
 * Format milliseconds to human readable string
 */
export function formatMs(ms: number): string {
  if (ms < 1) return `${round(ms * 1000, 2)} μs`;
  if (ms < 1000) return `${round(ms, 2)} ms`;
  return `${round(ms / 1000, 2)} s`;
}
