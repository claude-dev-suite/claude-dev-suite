// SPDX-License-Identifier: MIT
/**
 * Bounded numeric summary: exact count/sum/min/max plus percentiles from a
 * uniform reservoir sample. Below `capacity` values the percentiles are exact;
 * above, they are estimates and `approximate` says so.
 */

export class Reservoir {
  private values: number[] = [];
  count = 0;
  sum = 0;
  min = Infinity;
  max = -Infinity;
  private seed = 0x9e3779b9;

  constructor(private readonly capacity = 20000) {}

  add(v: number): void {
    if (!Number.isFinite(v)) return;
    this.count++;
    this.sum += v;
    if (v < this.min) this.min = v;
    if (v > this.max) this.max = v;
    if (this.values.length < this.capacity) {
      this.values.push(v);
      return;
    }
    // Algorithm R with a deterministic xorshift PRNG (reproducible results).
    const j = this.rand() % this.count;
    if (j < this.capacity) this.values[j] = v;
  }

  private rand(): number {
    let x = this.seed;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.seed = x;
    return x;
  }

  get approximate(): boolean {
    return this.count > this.capacity;
  }

  /** Percentiles (0-100) using linear interpolation between closest ranks. */
  percentiles(ps: number[]): Record<string, number | null> {
    const out: Record<string, number | null> = {};
    if (this.values.length === 0) {
      for (const p of ps) out[`p${p}`] = null;
      return out;
    }
    const sorted = [...this.values].sort((a, b) => a - b);
    for (const p of ps) {
      const rank = (Math.min(Math.max(p, 0), 100) / 100) * (sorted.length - 1);
      const lo = Math.floor(rank);
      const hi = Math.ceil(rank);
      const v = sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
      out[`p${p}`] = round(v);
    }
    return out;
  }

  summary(ps: number[] = [50, 95, 99]): Record<string, unknown> {
    return {
      count: this.count,
      min: this.count ? round(this.min) : null,
      max: this.count ? round(this.max) : null,
      avg: this.count ? round(this.sum / this.count) : null,
      ...this.percentiles(ps),
      ...(this.approximate ? { approximate: true } : {}),
    };
  }
}

export function round(v: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Top-k over a Map of counts. */
export function topK<K>(map: Map<K, number>, k: number): Array<[K, number]> {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, k);
}

/** Increment a bounded counter map; new keys beyond `maxKeys` go to `overflowKey`. */
export function bump<K>(map: Map<K, number>, key: K, maxKeys: number, overflowKey: K, by = 1): boolean {
  if (map.has(key) || map.size < maxKeys) {
    map.set(key, (map.get(key) ?? 0) + by);
    return false;
  }
  map.set(overflowKey, (map.get(overflowKey) ?? 0) + by);
  return true;
}
