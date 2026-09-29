// SPDX-License-Identifier: MIT
/**
 * analyze_coverage — ingest LCOV / Cobertura / JaCoCo, summarise per file and
 * function, and join with complexity to rank risky untested code (CRAP).
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { validateFilePath } from '@dev-suite/shared';
import { isChanged, type ScopeOptions } from '../core/files.js';
import { gitChangedLines, normalizeKey } from '../core/git.js';
import { bound, mdTable, notesSection, round, truncatedLine, type ToolResult } from '../core/report.js';
import { runParse } from '../analysis/pipeline.js';
import {
  compressLines, coverageOfRange, detectFormat, discoverCoverage, mapToFiles, mtime,
  parseCobertura, parseJacoco, parseLcov, type FileCoverage,
} from '../analysis/coverage.js';

export interface CoverageInput extends ScopeOptions {
  coverageFiles?: string[];
  /** Flag functions whose CRAP score exceeds this (default 30). */
  crapThreshold?: number;
  /** Flag files/functions below this line coverage % (default 80). */
  minCoverage?: number;
  limit?: number;
}

export interface CoverageSummary {
  root: string;
  reports: Array<{ file: string; format: string }>;
  totals: { lines: number; covered: number; lineRate: number | null; branches: number; branchesCovered: number; branchRate: number | null };
  patch?: { lines: number; covered: number; rate: number | null; uncovered: Array<{ file: string; lines: string }> };
  files: Array<{ file: string; lines: number; covered: number; lineRate: number; branchRate: number | null; uncovered: string }>;
  risky: Array<{ file: string; name: string; line: number; cyclomatic: number; cognitive: number; coverage: number; crap: number }>;
  notInReport: string[];
  notes: string[];
}

export async function computeCoverage(input: CoverageInput): Promise<CoverageSummary> {
  const crapThreshold = input.crapThreshold ?? 30;
  const minCov = input.minCoverage ?? 80;
  const run = await runParse({ ...input, includeTests: input.includeTests ?? false }, { magicNumbers: false, onlyChanged: false });
  const root = run.scope.root;
  const notes = [...run.notes];

  let reportPaths: string[];
  if (input.coverageFiles?.length) {
    reportPaths = input.coverageFiles.map((f) => (path.isAbsolute(f) ? f : path.resolve(root, f)));
    for (const f of reportPaths) validateFilePath(f);
  } else {
    const dirs = new Set([root, run.scope.targetIsFile ? path.dirname(run.scope.target) : run.scope.target]);
    reportPaths = [...new Set([...dirs].flatMap((d) => discoverCoverage(d)))];
  }
  if (!reportPaths.length) {
    throw new Error(
      'No coverage report found. Run the tests with coverage first (e.g. `vitest --coverage` / `jest --coverage` → coverage/lcov.info, ' +
        '`pytest --cov --cov-report=xml` → coverage.xml, `go test -coverprofile` + gcov2lcov, `cargo llvm-cov --lcov`, JaCoCo → jacoco.xml) ' +
        'or pass coverageFiles.'
    );
  }

  const reports: Array<{ file: FileCoverage; bases: string[] }> = [];
  const reportInfo: CoverageSummary['reports'] = [];
  for (const rp of reportPaths) {
    let text: string;
    try {
      text = await fs.readFile(rp, 'utf-8');
    } catch {
      throw new Error(`Cannot read coverage report ${rp}`);
    }
    const fmt = detectFormat(text);
    if (!fmt) throw new Error(`Unrecognised coverage format in ${rp} (supported: LCOV, Cobertura XML, JaCoCo XML)`);
    reportInfo.push({ file: path.relative(root, rp) || rp, format: fmt });
    const dir = path.dirname(rp);
    const bases = [root, dir, path.dirname(dir)];
    if (fmt === 'lcov') for (const f of parseLcov(text)) reports.push({ file: f, bases });
    else if (fmt === 'cobertura') {
      const { files, sources } = parseCobertura(text);
      for (const f of files) reports.push({ file: f, bases: [...sources, ...bases] });
    } else for (const f of parseJacoco(text)) reports.push({ file: f, bases });
    const newest = Math.max(0, ...run.parsed.map((p) => mtime(p.file.abs)));
    if (mtime(rp) && newest > mtime(rp)) notes.push(`${path.basename(rp)} is older than some source files — coverage may be stale; re-run the tests.`);
  }

  const { mapped, unmatched } = mapToFiles(reports, run.parsed.map((p) => ({ abs: p.file.abs, rel: p.file.rel })));
  if (unmatched.length) notes.push(`${unmatched.length} report path(s) did not match an analysed file (outside path/excluded?): ${unmatched.slice(0, 3).join(', ')}`);

  let lines = 0;
  let covered = 0;
  let branches = 0;
  let branchesCovered = 0;
  const files: CoverageSummary['files'] = [];
  const risky: CoverageSummary['risky'] = [];
  const notInReport: string[] = [];
  for (const p of run.parsed) {
    const fc = mapped.get(p.file.abs);
    if (!fc) {
      if (!p.file.isTest && isChanged(run.scope, p.file.abs) && p.analysis.functions.length) notInReport.push(p.file.rel);
      continue;
    }
    if (!isChanged(run.scope, p.file.abs)) continue;
    let fl = 0;
    let fcov = 0;
    const unc: number[] = [];
    for (const [l, h] of fc.lines) {
      fl++;
      if (h > 0) fcov++;
      else unc.push(l);
    }
    let fb = 0;
    let fbc = 0;
    for (const [c, t] of fc.branches.values()) {
      fb += t;
      fbc += c;
    }
    lines += fl;
    covered += fcov;
    branches += fb;
    branchesCovered += fbc;
    files.push({ file: p.file.rel, lines: fl, covered: fcov, lineRate: fl ? round((fcov / fl) * 100, 1) : 100, branchRate: fb ? round((fbc / fb) * 100, 1) : null, uncovered: compressLines(unc) });
    for (const f of p.analysis.functions) {
      const c = coverageOfRange(fc, f.line, f.endLine);
      if (!c.total) continue;
      const cov = c.covered / c.total;
      const crap = round(f.cyclomatic ** 2 * (1 - cov) ** 3 + f.cyclomatic, 1);
      if (crap > crapThreshold || (cov * 100 < minCov && (f.cyclomatic > 10 || f.cognitive > 15))) {
        risky.push({ file: p.file.rel, name: f.name, line: f.line, cyclomatic: f.cyclomatic, cognitive: f.cognitive, coverage: round(cov * 100, 1), crap });
      }
    }
  }
  files.sort((a, b) => a.lineRate - b.lineRate || b.lines - a.lines);
  risky.sort((a, b) => b.crap - a.crap);

  let patch: CoverageSummary['patch'];
  if (input.changedSince && run.scope.inGit) {
    const changedLines = await gitChangedLines(root, input.changedSince);
    let pl = 0;
    let pc = 0;
    const uncovered: Array<{ file: string; lines: string }> = [];
    for (const p of run.parsed) {
      const set = changedLines.get(normalizeKey(p.file.abs));
      const fc = mapped.get(p.file.abs);
      if (!set || !fc) continue;
      const miss: number[] = [];
      for (const l of set) {
        const h = fc.lines.get(l);
        if (h === undefined) continue; // not executable
        pl++;
        if (h > 0) pc++;
        else miss.push(l);
      }
      if (miss.length) uncovered.push({ file: p.file.rel, lines: compressLines(miss) });
    }
    patch = { lines: pl, covered: pc, rate: pl ? round((pc / pl) * 100, 1) : null, uncovered };
  }

  return {
    root,
    reports: reportInfo,
    totals: {
      lines, covered, lineRate: lines ? round((covered / lines) * 100, 1) : null,
      branches, branchesCovered, branchRate: branches ? round((branchesCovered / branches) * 100, 1) : null,
    },
    patch,
    files,
    risky,
    notInReport,
    notes,
  };
}

export async function analyzeCoverage(input: CoverageInput): Promise<ToolResult> {
  const limit = input.limit ?? 30;
  const s = await computeCoverage(input);
  const bf = bound(s.files, limit);
  const br = bound(s.risky, limit);
  const bn = bound(s.notInReport, limit);
  const data = { ...s, files: bf.items, risky: br.items, notInReport: bn.items, truncated: bf.truncated || br.truncated || bn.truncated };
  const md: string[] = ['# Coverage report', '', `Root: \`${s.root}\``, ''];
  md.push(`- Reports: ${s.reports.map((r) => `${r.file} (${r.format})`).join(', ')}`);
  md.push(`- Line coverage: **${s.totals.lineRate ?? 'n/a'}%** (${s.totals.covered}/${s.totals.lines})${s.totals.branchRate !== null ? ` · branch coverage ${s.totals.branchRate}% (${s.totals.branchesCovered}/${s.totals.branches})` : ''}`);
  if (s.patch) md.push(`- Patch coverage (changed lines since ${input.changedSince}): **${s.patch.rate ?? 'n/a'}%** (${s.patch.covered}/${s.patch.lines})`);
  md.push('');
  if (br.items.length) {
    md.push(`## Risky untested code (CRAP > ${input.crapThreshold ?? 30}, or complex and under ${input.minCoverage ?? 80}% covered)`, '');
    md.push(mdTable(['Location', 'Function', 'Cyclo', 'Cognitive', 'Coverage %', 'CRAP'], br.items.map((r) => [`${r.file}:${r.line}`, r.name, r.cyclomatic, r.cognitive, r.coverage, r.crap])));
    md.push(truncatedLine(br, 'functions'));
  }
  if (s.patch?.uncovered.length) {
    md.push('', '## Uncovered changed lines', '');
    for (const u of s.patch.uncovered.slice(0, limit)) md.push(`- ${u.file}: ${u.lines}`);
  }
  if (bf.items.length) {
    md.push('', '## Files (lowest coverage first)', '');
    md.push(mdTable(['File', 'Line %', 'Branch %', 'Lines', 'Uncovered lines'], bf.items.map((f) => [f.file, f.lineRate, f.branchRate ?? '—', f.lines, f.uncovered.length > 80 ? f.uncovered.slice(0, 80) + '…' : f.uncovered || '—'])));
    md.push(truncatedLine(bf, 'files'));
  }
  if (bn.items.length) {
    md.push('', '## Source files absent from the coverage report', '');
    md.push(bn.items.map((f) => `- ${f}`).join('\n'));
    md.push(truncatedLine(bn, 'files'));
  }
  md.push(notesSection(s.notes));
  return { data, markdown: md.join('\n') };
}
