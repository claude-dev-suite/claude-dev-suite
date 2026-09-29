// SPDX-License-Identifier: MIT
/**
 * CVSS v3.x base-score calculator (FIRST specification, section 7.1) and the
 * standard qualitative rating scale. Used where a tool gives a vector but no
 * severity (cargo-audit, some OSV records), so severity is computed rather
 * than guessed.
 */

import type { Severity } from '../types.js';

const AV: Record<string, number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
const AC: Record<string, number> = { L: 0.77, H: 0.44 };
const UI: Record<string, number> = { N: 0.85, R: 0.62 };
const CIA: Record<string, number> = { H: 0.56, L: 0.22, N: 0 };

function roundUp(x: number): number {
  const i = Math.round(x * 100000);
  if (i % 10000 === 0) return i / 100000;
  return (Math.floor(i / 10000) + 1) / 10;
}

/** Returns the base score for a `CVSS:3.0/…` or `CVSS:3.1/…` vector, or null if it is not one. */
export function cvss3BaseScore(vector: string): number | null {
  if (!/^CVSS:3\.[01]\//.test(vector)) return null;
  const parts = new Map<string, string>();
  for (const seg of vector.split('/').slice(1)) {
    const [k, v] = seg.split(':');
    if (k && v) parts.set(k, v);
  }
  const s = parts.get('S');
  const av = AV[parts.get('AV') ?? ''];
  const ac = AC[parts.get('AC') ?? ''];
  const ui = UI[parts.get('UI') ?? ''];
  const c = CIA[parts.get('C') ?? ''];
  const i = CIA[parts.get('I') ?? ''];
  const a = CIA[parts.get('A') ?? ''];
  const prRaw = parts.get('PR');
  if (s !== 'U' && s !== 'C') return null;
  if ([av, ac, ui, c, i, a].some((x) => x === undefined) || !prRaw) return null;
  const pr =
    prRaw === 'N' ? 0.85 : prRaw === 'L' ? (s === 'C' ? 0.68 : 0.62) : prRaw === 'H' ? (s === 'C' ? 0.5 : 0.27) : undefined;
  if (pr === undefined) return null;

  const iss = 1 - (1 - c) * (1 - i) * (1 - a);
  const impact = s === 'U' ? 6.42 * iss : 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15);
  const exploitability = 8.22 * av * ac * pr * ui;
  if (impact <= 0) return 0;
  return s === 'U' ? roundUp(Math.min(impact + exploitability, 10)) : roundUp(Math.min(1.08 * (impact + exploitability), 10));
}

/** CVSS qualitative rating: 0 → INFO (None), 0.1–3.9 LOW, 4–6.9 MEDIUM, 7–8.9 HIGH, 9–10 CRITICAL. */
export function severityFromScore(score: number | null | undefined): Severity {
  if (score === null || score === undefined || Number.isNaN(score)) return 'UNKNOWN';
  if (score >= 9) return 'CRITICAL';
  if (score >= 7) return 'HIGH';
  if (score >= 4) return 'MEDIUM';
  if (score > 0) return 'LOW';
  return 'INFO';
}
