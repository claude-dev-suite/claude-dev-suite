// SPDX-License-Identifier: MIT
/**
 * Make driver values JSON-safe and bounded.
 */

export const DEFAULT_MAX_CELL_CHARS = 2000;

export interface CellStats {
  truncatedCells: number;
}

export function serializeValue(v: unknown, maxChars: number, stats: CellStats): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return isNaN(v.getTime()) ? String(v) : v.toISOString();
  if (v instanceof Uint8Array) {
    const hex = Buffer.from(v.subarray(0, 32)).toString("hex");
    return { type: "binary", bytes: v.length, hexPrefix: hex };
  }
  if (typeof v === "string") {
    if (v.length > maxChars) {
      stats.truncatedCells++;
      return `${v.slice(0, maxChars)}…[truncated ${v.length - maxChars} chars]`;
    }
    return v;
  }
  if (typeof v === "object") {
    // JSON/array columns: serialize, bound, and keep structure when small.
    let s: string;
    try {
      s = JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
    } catch {
      s = String(v);
    }
    if (s.length > maxChars) {
      stats.truncatedCells++;
      return `${s.slice(0, maxChars)}…[truncated ${s.length - maxChars} chars]`;
    }
    return JSON.parse(s);
  }
  return v;
}

export function serializeRows(
  rows: Record<string, unknown>[],
  maxChars = DEFAULT_MAX_CELL_CHARS
): { rows: Record<string, unknown>[]; truncatedCells: number } {
  const stats: CellStats = { truncatedCells: 0 };
  const out = rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) o[k] = serializeValue(v, maxChars, stats);
    return o;
  });
  return { rows: out, truncatedCells: stats.truncatedCells };
}
