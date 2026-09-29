// SPDX-License-Identifier: MIT
/**
 * Coverage report ingestion: LCOV, Cobertura XML, JaCoCo XML.
 *
 * Each parser yields per-file line hits (and branch counts where the format
 * has them) keyed by the path as written in the report; `mapToFiles` then
 * resolves those paths onto the analysed source files.
 */

import { existsSync, readdirSync, statSync } from 'fs';
import * as path from 'path';
import { toPosix } from '../core/paths.js';
import { unescapeXml } from '../linters/parsers.js';

export interface FileCoverage {
  /** Path as written in the report. */
  reportPath: string;
  /** line → hit count, for every executable line the report knows. */
  lines: Map<number, number>;
  /** line → [covered, total] branches. */
  branches: Map<number, [number, number]>;
  functions: Array<{ name: string; line: number; hits: number }>;
  /** For JaCoCo: package path to join with the file name. */
  packagePath?: string;
}

export type CoverageFormat = 'lcov' | 'cobertura' | 'jacoco';

export function detectFormat(text: string): CoverageFormat | null {
  const head = text.slice(0, 2000);
  if (/^(TN:|SF:)/m.test(head)) return 'lcov';
  if (/<report\b/.test(head) && /jacoco|<sessioninfo|<package\b/i.test(text.slice(0, 20000))) return 'jacoco';
  if (/<coverage\b/.test(head)) return 'cobertura';
  return null;
}

export function parseLcov(text: string): FileCoverage[] {
  const out: FileCoverage[] = [];
  let cur: FileCoverage | null = null;
  const fnLines = new Map<string, number>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('SF:')) {
      cur = { reportPath: line.slice(3), lines: new Map(), branches: new Map(), functions: [] };
      fnLines.clear();
      out.push(cur);
    } else if (!cur) {
      continue;
    } else if (line.startsWith('DA:')) {
      const [ln, hits] = line.slice(3).split(',');
      const n = Number(ln);
      cur.lines.set(n, (cur.lines.get(n) ?? 0) + Number(hits));
    } else if (line.startsWith('FN:')) {
      const rest = line.slice(3);
      const comma = rest.indexOf(',');
      const parts = rest.split(',');
      // FN:<line>,<name> or (lcov 2) FN:<line>,<end line>,<name>
      const name = parts.length >= 3 && /^\d+$/.test(parts[1]) ? parts.slice(2).join(',') : rest.slice(comma + 1);
      fnLines.set(name, Number(parts[0]));
    } else if (line.startsWith('FNDA:')) {
      const rest = line.slice(5);
      const comma = rest.indexOf(',');
      const name = rest.slice(comma + 1);
      cur.functions.push({ name, line: fnLines.get(name) ?? 0, hits: Number(rest.slice(0, comma)) });
    } else if (line.startsWith('BRDA:')) {
      const [ln, , , taken] = line.slice(5).split(',');
      const n = Number(ln);
      const b = cur.branches.get(n) ?? [0, 0];
      b[1]++;
      if (taken !== '-' && Number(taken) > 0) b[0]++;
      cur.branches.set(n, b);
    } else if (line === 'end_of_record') {
      cur = null;
    }
  }
  return out;
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = unescapeXml(m[2]);
  return out;
}

export function parseCobertura(text: string): { files: FileCoverage[]; sources: string[] } {
  const sources = [...text.matchAll(/<source>([\s\S]*?)<\/source>/g)].map((m) => unescapeXml(m[1].trim()));
  const byFile = new Map<string, FileCoverage>();
  for (const m of text.matchAll(/<class\b([^>]*)>([\s\S]*?)<\/class>/g)) {
    const a = attrs(m[1]);
    const filename = a.filename;
    if (!filename) continue;
    let fc = byFile.get(filename);
    if (!fc) byFile.set(filename, (fc = { reportPath: filename, lines: new Map(), branches: new Map(), functions: [] }));
    const body = m[2];
    for (const mm of body.matchAll(/<method\b([^>]*)>([\s\S]*?)<\/method>/g)) {
      const ma = attrs(mm[1]);
      const first = /<line\b([^>]*)\/?>/.exec(mm[2]);
      const la = first ? attrs(first[1]) : {};
      fc.functions.push({ name: ma.name ?? '?', line: Number(la.number ?? 0), hits: Number(la.hits ?? 0) });
    }
    const classLines = body.replace(/<methods>[\s\S]*?<\/methods>/g, '');
    for (const lm of classLines.matchAll(/<line\b([^>]*?)\/?>/g)) {
      const la = attrs(lm[1]);
      const n = Number(la.number);
      if (!n) continue;
      fc.lines.set(n, Math.max(fc.lines.get(n) ?? 0, Number(la.hits ?? 0)));
      const cc = /\((\d+)\/(\d+)\)/.exec(la['condition-coverage'] ?? '');
      if (la.branch === 'true' && cc) fc.branches.set(n, [Number(cc[1]), Number(cc[2])]);
    }
  }
  return { files: [...byFile.values()], sources };
}

export function parseJacoco(text: string): FileCoverage[] {
  const out: FileCoverage[] = [];
  for (const pm of text.matchAll(/<package\b([^>]*)>([\s\S]*?)<\/package>/g)) {
    const pkg = attrs(pm[1]).name ?? '';
    const body = pm[2];
    const methods: Array<{ cls: string; name: string; line: number; covered: number }> = [];
    for (const cm of body.matchAll(/<class\b([^>]*)>([\s\S]*?)<\/class>/g)) {
      const ca = attrs(cm[1]);
      for (const mm of cm[2].matchAll(/<method\b([^>]*)>([\s\S]*?)<\/method>/g)) {
        const ma = attrs(mm[1]);
        const counter = /<counter\b[^>]*type="METHOD"[^>]*>/.exec(mm[2]);
        const covered = counter ? Number(attrs(counter[0]).covered ?? 0) : 0;
        methods.push({ cls: ca.sourcefilename ?? '', name: ma.name ?? '?', line: Number(ma.line ?? 0), covered });
      }
    }
    for (const sm of body.matchAll(/<sourcefile\b([^>]*)>([\s\S]*?)<\/sourcefile>/g)) {
      const name = attrs(sm[1]).name ?? '';
      const fc: FileCoverage = { reportPath: pkg ? `${pkg}/${name}` : name, lines: new Map(), branches: new Map(), functions: [], packagePath: pkg };
      for (const lm of sm[2].matchAll(/<line\b([^>]*?)\/?>/g)) {
        const la = attrs(lm[1]);
        const n = Number(la.nr);
        if (!n) continue;
        const ci = Number(la.ci ?? 0);
        const mi = Number(la.mi ?? 0);
        if (ci + mi === 0) continue;
        fc.lines.set(n, ci);
        const mb = Number(la.mb ?? 0);
        const cb = Number(la.cb ?? 0);
        if (mb + cb > 0) fc.branches.set(n, [cb, mb + cb]);
      }
      fc.functions = methods.filter((m) => m.cls === name).map((m) => ({ name: m.name, line: m.line, hits: m.covered }));
      out.push(fc);
    }
  }
  return out;
}

const CANDIDATES = [
  'coverage/lcov.info', 'lcov.info', 'coverage/lcov/lcov.info', 'coverage/cobertura-coverage.xml', 'coverage/coverage.xml',
  'coverage.xml', 'cobertura.xml', 'coverage/cobertura.xml', 'target/site/jacoco/jacoco.xml',
  'build/reports/jacoco/test/jacocoTestReport.xml', 'target/cobertura/coverage.xml', 'target/coverage/lcov.info', 'coverage.lcov',
];

/** Coverage reports at conventional locations under `dir` (plus C# TestResults/<guid>/). */
export function discoverCoverage(dir: string): string[] {
  const found = CANDIDATES.map((c) => path.join(dir, c)).filter((f) => existsSync(f));
  const tr = path.join(dir, 'TestResults');
  try {
    for (const sub of readdirSync(tr)) {
      const f = path.join(tr, sub, 'coverage.cobertura.xml');
      if (existsSync(f)) found.push(f);
    }
  } catch {
    /* none */
  }
  return found;
}

export function mtime(file: string): number {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Map report paths onto analysed files: try absolute, relative to the report's
 * sources/directory/repo root, then a unique path-suffix match.
 */
export function mapToFiles(
  reports: Array<{ file: FileCoverage; bases: string[] }>,
  sourceFiles: Array<{ abs: string; rel: string }>
): { mapped: Map<string, FileCoverage>; unmatched: string[] } {
  const byAbs = new Map<string, string>();
  const key = (p: string) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
  for (const f of sourceFiles) byAbs.set(key(f.abs), f.abs);
  const mapped = new Map<string, FileCoverage>();
  const unmatched: string[] = [];
  for (const { file, bases } of reports) {
    const rp = file.reportPath.replace(/^file:\/\//, '');
    let hit: string | undefined;
    if (path.isAbsolute(rp)) hit = byAbs.get(key(rp));
    for (const b of bases) {
      if (hit) break;
      hit = byAbs.get(key(path.resolve(b, rp)));
    }
    if (!hit) {
      const suffix = '/' + toPosix(rp).replace(/^\.?\//, '');
      const matches = sourceFiles.filter((f) => ('/' + f.rel).endsWith(suffix));
      if (matches.length === 1) hit = matches[0].abs;
    }
    if (!hit) {
      unmatched.push(file.reportPath);
      continue;
    }
    const prev = mapped.get(hit);
    if (prev) {
      for (const [l, h] of file.lines) prev.lines.set(l, Math.max(prev.lines.get(l) ?? 0, h));
    } else {
      mapped.set(hit, file);
    }
  }
  return { mapped, unmatched };
}

export function coverageOfRange(fc: FileCoverage, from: number, to: number): { covered: number; total: number } {
  let covered = 0;
  let total = 0;
  for (const [l, h] of fc.lines) {
    if (l < from || l > to) continue;
    total++;
    if (h > 0) covered++;
  }
  return { covered, total };
}

/** "3-7, 12, 20-21" */
export function compressLines(lines: number[]): string {
  const s = [...lines].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < s.length) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    parts.push(i === j ? `${s[i]}` : `${s[i]}-${s[j]}`);
    i = j + 1;
  }
  return parts.join(', ');
}
