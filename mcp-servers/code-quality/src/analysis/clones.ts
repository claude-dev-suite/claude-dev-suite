// SPDX-License-Identifier: MIT
/**
 * Token-based clone detection (jscpd-style), O(total tokens).
 *
 * Tokens come from the syntax tree (comments and import statements
 * excluded). `exact` compares token text; `renamed` (default) normalises
 * identifiers, so copy-paste with renamed variables is found; `abstract` also
 * normalises literals (full type-2 clones — noisy on data tables). A Rabin-Karp rolling hash over `minTokens`-token windows finds
 * candidate matches against the first occurrence of each window; every
 * candidate is re-verified token by token, so a hash collision can never be
 * reported as a duplicate (the old 32-bit line-hash with no re-check could).
 * Consecutive matching windows are merged into one maximal clone.
 */

import type { TokenStream } from '../parsing/analyze.js';

export interface CloneInputFile {
  rel: string;
  content: string;
  loc: number;
  tokens: TokenStream;
}

export interface CloneLocation {
  file: string;
  startLine: number;
  endLine: number;
}

export interface CloneGroup {
  tokens: number;
  lines: number;
  locations: CloneLocation[];
  fragment: string;
}

export interface CloneResult {
  groups: CloneGroup[];
  duplicatedLines: number;
  totalLines: number;
  percentage: number;
  byFile: Record<string, number>;
}

export type CloneMode = 'exact' | 'renamed' | 'abstract';

export interface CloneOptions {
  minTokens: number;
  minLines: number;
  mode: CloneMode;
}

const P = 1_000_000_007;
const B = 1_000_003;

function mulmod(a: number, b: number): number {
  // a, b < 2^30: split b to keep every product under 2^53.
  const hi = Math.floor(b / 65536);
  const lo = b % 65536;
  return (((a * hi) % P) * 65536 + a * lo) % P;
}

interface Pair {
  srcFile: number;
  srcStart: number;
  dstFile: number;
  dstStart: number;
  windows: number;
}

export function detectClones(files: CloneInputFile[], opts: CloneOptions): CloneResult {
  const K = Math.max(5, opts.minTokens);
  const arrays = files.map((f) => (opts.mode === 'exact' ? f.tokens.exact : opts.mode === 'renamed' ? f.tokens.renamed : f.tokens.normalized));
  let BK = 1;
  for (let i = 0; i < K - 1; i++) BK = mulmod(BK, B);

  const first = new Map<number, number[]>(); // hash → [fileIdx, pos] of first occurrence
  const pairs: Pair[] = [];

  const equal = (fa: number, pa: number, fb: number, pb: number): boolean => {
    const a = arrays[fa];
    const b = arrays[fb];
    for (let i = 0; i < K; i++) if (a[pa + i] !== b[pb + i]) return false;
    return true;
  };

  for (let f = 0; f < arrays.length; f++) {
    const arr = arrays[f];
    if (arr.length < K) continue;
    let h = 0;
    for (let i = 0; i < K; i++) h = (mulmod(h, B) + arr[i] + 1) % P;
    let active: Pair | null = null;
    for (let pos = 0; pos + K <= arr.length; pos++) {
      if (pos > 0) {
        h = (h - mulmod(arr[pos - 1] + 1, BK) + P) % P;
        h = (mulmod(h, B) + arr[pos + K - 1] + 1) % P;
      }
      // Extend the running clone by direct comparison first: following the
      // hash map's first occurrence would split periodic code into fragments.
      if (active) {
        const srcArr = arrays[active.srcFile];
        const srcNext = active.srcStart + active.windows;
        const fits = srcNext + K - 1 < srcArr.length;
        const noOverlap = active.srcFile !== f || srcNext + K - 1 < active.dstStart;
        if (fits && noOverlap && srcArr[srcNext + K - 1] === arr[pos + K - 1]) {
          active.windows++;
          if (!first.has(h)) first.set(h, [f, pos]);
          continue;
        }
        pairs.push(active);
        active = null;
      }
      const prev = first.get(h);
      if (!prev) {
        first.set(h, [f, pos]);
        continue;
      }
      const [pf, pp] = prev;
      const overlapping = pf === f && pos - pp < K;
      if (!overlapping && equal(pf, pp, f, pos)) {
        active = { srcFile: pf, srcStart: pp, dstFile: f, dstStart: pos, windows: 1 };
      }
    }
    if (active) pairs.push(active);
  }

  // Group pairs sharing the same source span.
  const groups = new Map<string, { src: [number, number, number]; dsts: Array<[number, number, number]> }>();
  for (const p of pairs) {
    const len = p.windows + K - 1;
    const key = `${p.srcFile}:${p.srcStart}:${len}`;
    let g = groups.get(key);
    if (!g) {
      g = { src: [p.srcFile, p.srcStart, len], dsts: [] };
      groups.set(key, g);
    }
    g.dsts.push([p.dstFile, p.dstStart, len]);
  }

  const toLoc = ([fi, start, len]: [number, number, number]): CloneLocation => {
    const t = files[fi].tokens;
    return { file: files[fi].rel, startLine: t.line[start], endLine: t.endLine[start + len - 1] };
  };

  const result: CloneGroup[] = [];
  const covered = new Map<number, Set<number>>();
  for (const g of groups.values()) {
    const src = toLoc(g.src);
    const lines = src.endLine - src.startLine + 1;
    if (lines < opts.minLines) continue;
    // Copies of repetitive code overlap each other: merge them per file.
    const dsts = g.dsts
      .map((d) => ({ fi: d[0], loc: toLoc(d) }))
      .sort((a, b) => a.fi - b.fi || a.loc.startLine - b.loc.startLine);
    const merged: Array<{ fi: number; loc: CloneLocation }> = [{ fi: g.src[0], loc: { ...src } }];
    for (const d of dsts) {
      const overl = merged.find((m) => m.fi === d.fi && d.loc.startLine <= m.loc.endLine && d.loc.endLine >= m.loc.startLine);
      if (overl) {
        if (overl !== merged[0]) overl.loc.endLine = Math.max(overl.loc.endLine, d.loc.endLine);
        continue;
      }
      merged.push({ fi: d.fi, loc: { ...d.loc } });
    }
    if (merged.length < 2) continue;
    const locations = merged.map((m) => m.loc);
    for (const { fi, loc: span } of merged) {
      let set = covered.get(fi);
      if (!set) covered.set(fi, (set = new Set()));
      for (let l = span.startLine; l <= span.endLine; l++) set.add(l);
    }
    const srcLines = files[g.src[0]].content.split('\n').slice(src.startLine - 1, Math.min(src.endLine, src.startLine + 11));
    let fragment = srcLines.join('\n');
    if (fragment.length > 800) fragment = fragment.slice(0, 800) + '…';
    result.push({ tokens: g.src[2], lines, locations, fragment });
  }
  result.sort((a, b) => b.tokens * b.locations.length - a.tokens * a.locations.length);

  let duplicatedLines = 0;
  const byFile: Record<string, number> = {};
  for (const [fi, set] of covered) {
    duplicatedLines += set.size;
    byFile[files[fi].rel] = set.size;
  }
  const totalLines = files.reduce((s, f) => s + f.loc, 0);
  return {
    groups: result,
    duplicatedLines,
    totalLines,
    percentage: totalLines ? Math.round((duplicatedLines / totalLines) * 10000) / 100 : 0,
    byFile,
  };
}
