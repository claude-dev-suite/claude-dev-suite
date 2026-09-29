// SPDX-License-Identifier: MIT
/** Output bounding helpers — every large result carries an explicit `truncated` marker. */

export function truncateText(text: string, maxChars: number): { text: string; truncated: boolean; totalChars: number } {
  if (text.length <= maxChars) return { text, truncated: false, totalChars: text.length };
  return { text: text.slice(0, maxChars), truncated: true, totalChars: text.length };
}

export function capList<T>(items: T[], limit: number): { items: T[]; truncated: boolean; total: number } {
  if (items.length <= limit) return { items, truncated: false, total: items.length };
  return { items: items.slice(0, limit), truncated: true, total: items.length };
}

/** Stringify for display with a size cap; never throws on cycles. */
export function previewValue(value: unknown, maxChars = 500): unknown {
  if (value === undefined) return undefined;
  let s: string;
  try {
    s = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
  if (s === undefined) return undefined;
  if (s.length <= maxChars) return value;
  return `${s.slice(0, maxChars)}… [${s.length} chars, truncated]`;
}

export function clampInt(v: number | undefined, def: number, min: number, max: number): number {
  if (v === undefined || !Number.isFinite(v)) return def;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

export function envInt(raw: string | undefined, def: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === '') return def;
  const n = Number(raw);
  return clampInt(Number.isFinite(n) ? n : undefined, def, min, max);
}

export function envFlag(raw: string | undefined): boolean {
  if (!raw) return false;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}
