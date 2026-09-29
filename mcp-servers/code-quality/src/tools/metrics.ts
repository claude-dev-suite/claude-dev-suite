// SPDX-License-Identifier: MIT
/**
 * code_metrics — size and shape of a codebase from syntax trees: exact
 * code/comment/blank lines, functions, classes, imports/exports, complexity
 * and maintainability per file, with per-language totals.
 */

import type { ScopeOptions } from '../core/files.js';
import { familyOf } from '../core/paths.js';
import { bound, mdTable, notesSection, round, truncatedLine, type ToolResult } from '../core/report.js';
import { runParse } from '../analysis/pipeline.js';

export interface MetricsInput extends ScopeOptions {
  sortBy?: 'loc' | 'sloc' | 'complexity' | 'functions' | 'maintainability';
  limit?: number;
}

export async function codeMetrics(input: MetricsInput): Promise<ToolResult> {
  const limit = input.limit ?? 20;
  const run = await runParse(input, { magicNumbers: false, modules: true, onlyChanged: true });
  const files = run.parsed.map((p) => {
    const a = p.analysis;
    const fns = a.functions;
    const totalCC = fns.reduce((s, f) => s + f.cyclomatic, 0);
    return {
      file: p.file.rel,
      language: familyOf(p.file.lang),
      loc: a.loc,
      sloc: a.sloc,
      comments: a.commentLines,
      blanks: a.blankLines,
      functions: fns.length,
      classes: a.classes.length,
      imports: p.module?.imports.length ?? 0,
      exports: (p.module?.exports.length ?? 0) + (p.module?.reexports.filter((r) => r.names === null).length ?? 0),
      avgCyclomatic: fns.length ? round(totalCC / fns.length) : 0,
      maxCyclomatic: fns.reduce((m, f) => Math.max(m, f.cyclomatic), 0),
      totalCyclomatic: totalCC,
      maintainability: a.maintainability,
      halsteadVolume: a.halstead.volume,
      parseErrors: a.parseErrors,
    };
  });

  const byLanguage: Record<string, { files: number; loc: number; sloc: number; comments: number; blanks: number; functions: number; classes: number }> = {};
  const totals = { files: files.length, loc: 0, sloc: 0, comments: 0, blanks: 0, functions: 0, classes: 0 };
  for (const f of files) {
    const l = (byLanguage[f.language] ??= { files: 0, loc: 0, sloc: 0, comments: 0, blanks: 0, functions: 0, classes: 0 });
    l.files++;
    for (const k of ['loc', 'sloc', 'comments', 'blanks', 'functions', 'classes'] as const) {
      l[k] += f[k];
      totals[k] += f[k];
    }
  }
  const sortBy = input.sortBy ?? 'loc';
  const sorted = [...files].sort((a, b) => {
    switch (sortBy) {
      case 'complexity':
        return b.totalCyclomatic - a.totalCyclomatic;
      case 'functions':
        return b.functions - a.functions;
      case 'maintainability':
        return a.maintainability - b.maintainability;
      case 'sloc':
        return b.sloc - a.sloc;
      default:
        return b.loc - a.loc;
    }
  });
  const b = bound(sorted, limit);
  const averages = {
    locPerFile: files.length ? round(totals.loc / files.length, 1) : 0,
    functionsPerFile: files.length ? round(totals.functions / files.length, 1) : 0,
    commentRatio: totals.sloc + totals.comments ? round(totals.comments / (totals.sloc + totals.comments), 3) : 0,
    maintainability: files.length ? round(files.reduce((s, f) => s + f.maintainability, 0) / files.length, 1) : 0,
  };
  const data = { root: run.scope.root, totals, averages, byLanguage, files: b.items, truncated: b.truncated, totalFiles: b.total, notes: run.notes };

  const md: string[] = ['# Code metrics', '', `Root: \`${run.scope.root}\``, ''];
  md.push(`- Files: ${totals.files} · LOC ${totals.loc} · code ${totals.sloc} · comments ${totals.comments} · blank ${totals.blanks}`);
  md.push(`- Functions ${totals.functions} · classes ${totals.classes} · comment ratio ${averages.commentRatio} · average maintainability ${averages.maintainability}/100`);
  md.push('', '## By language', '');
  md.push(mdTable(['Language', 'Files', 'LOC', 'Code', 'Comments', 'Functions', 'Classes'], Object.entries(byLanguage).map(([k, v]) => [k, v.files, v.loc, v.sloc, v.comments, v.functions, v.classes])));
  md.push('', `## Files (sorted by ${sortBy})`, '');
  md.push(
    mdTable(
      ['File', 'Lang', 'LOC', 'Code', 'Comments', 'Fns', 'Classes', 'Imports', 'Exports', 'Avg CC', 'Max CC', 'MI'],
      b.items.map((f) => [f.file, f.language, f.loc, f.sloc, f.comments, f.functions, f.classes, f.imports, f.exports, f.avgCyclomatic, f.maxCyclomatic, f.maintainability])
    )
  );
  md.push(truncatedLine(b, 'files'));
  md.push(notesSection(run.notes));
  return { data, markdown: md.join('\n') };
}
