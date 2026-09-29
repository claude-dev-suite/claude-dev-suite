// SPDX-License-Identifier: MIT
/**
 * analyze_complexity — per-function cyclomatic, cognitive (Sonar), nesting,
 * Halstead and maintainability index, from real syntax trees.
 */

import type { ScopeOptions } from '../core/files.js';
import { bound, mdTable, notesSection, round, truncatedLine, type ToolResult } from '../core/report.js';
import { runParse, type ParsedFile } from '../analysis/pipeline.js';

export interface ComplexityInput extends ScopeOptions {
  /** Cyclomatic threshold (default 10). */
  threshold?: number;
  /** Cognitive threshold (default 15). */
  cognitiveThreshold?: number;
  includeAll?: boolean;
  sortBy?: 'cognitive' | 'cyclomatic' | 'maintainability' | 'loc';
  limit?: number;
}

export interface FunctionRow {
  file: string;
  name: string;
  line: number;
  endLine: number;
  cyclomatic: number;
  cognitive: number;
  maxNesting: number;
  params: number;
  loc: number;
  sloc: number;
  maintainability: number;
  halsteadVolume: number;
  halsteadDifficulty: number;
  halsteadEffort: number;
  overThreshold: boolean;
}

export function functionRows(parsed: ParsedFile[], cc: number, cog: number): FunctionRow[] {
  const rows: FunctionRow[] = [];
  for (const p of parsed) {
    for (const f of p.analysis.functions) {
      rows.push({
        file: p.file.rel,
        name: f.name,
        line: f.line,
        endLine: f.endLine,
        cyclomatic: f.cyclomatic,
        cognitive: f.cognitive,
        maxNesting: f.maxNesting,
        params: f.params.length,
        loc: f.loc,
        sloc: f.sloc,
        maintainability: f.maintainability,
        halsteadVolume: f.halstead.volume,
        halsteadDifficulty: f.halstead.difficulty,
        halsteadEffort: f.halstead.effort,
        overThreshold: f.cyclomatic > cc || f.cognitive > cog,
      });
    }
  }
  return rows;
}

export async function analyzeComplexity(input: ComplexityInput): Promise<ToolResult> {
  const cc = input.threshold ?? 10;
  const cog = input.cognitiveThreshold ?? 15;
  const limit = input.limit ?? 50;
  const run = await runParse(input, { magicNumbers: false, onlyChanged: true });
  const all = functionRows(run.parsed, cc, cog);
  const sortKey = input.sortBy ?? 'cognitive';
  const sorters: Record<string, (a: FunctionRow, b: FunctionRow) => number> = {
    cognitive: (a, b) => b.cognitive - a.cognitive || b.cyclomatic - a.cyclomatic,
    cyclomatic: (a, b) => b.cyclomatic - a.cyclomatic || b.cognitive - a.cognitive,
    maintainability: (a, b) => a.maintainability - b.maintainability,
    loc: (a, b) => b.loc - a.loc,
  };
  const listed = (input.includeAll ? all : all.filter((r) => r.overThreshold)).sort(sorters[sortKey]);
  const b = bound(listed, limit);
  const n = all.length || 1;
  const summary = {
    files: run.parsed.length,
    functions: all.length,
    overThreshold: all.filter((r) => r.overThreshold).length,
    averageCyclomatic: round(all.reduce((s, r) => s + r.cyclomatic, 0) / n),
    averageCognitive: round(all.reduce((s, r) => s + r.cognitive, 0) / n),
    maxCyclomatic: all.reduce((m, r) => Math.max(m, r.cyclomatic), 0),
    maxCognitive: all.reduce((m, r) => Math.max(m, r.cognitive), 0),
    averageMaintainability: round(all.reduce((s, r) => s + r.maintainability, 0) / n, 1),
  };
  const data = {
    root: run.scope.root,
    thresholds: { cyclomatic: cc, cognitive: cog },
    summary,
    functions: b.items,
    truncated: b.truncated,
    totalListed: b.total,
    notes: run.notes,
  };

  const md: string[] = ['# Complexity report', ''];
  md.push(`Root: \`${run.scope.root}\``);
  md.push(
    `- Files: ${summary.files} · functions: ${summary.functions} · over threshold (cyclomatic > ${cc} or cognitive > ${cog}): **${summary.overThreshold}**`
  );
  md.push(`- Average cyclomatic ${summary.averageCyclomatic} (max ${summary.maxCyclomatic}) · average cognitive ${summary.averageCognitive} (max ${summary.maxCognitive}) · average maintainability ${summary.averageMaintainability}/100`);
  md.push('');
  if (b.items.length) {
    md.push(`## ${input.includeAll ? 'Functions' : 'Functions over threshold'} (sorted by ${sortKey})`, '');
    md.push(
      mdTable(
        ['Location', 'Function', 'Cyclo', 'Cognitive', 'Nesting', 'Params', 'LOC', 'MI'],
        b.items.map((r) => [
          `${r.file}:${r.line}`,
          r.name,
          r.cyclomatic > cc ? `**${r.cyclomatic}**` : r.cyclomatic,
          r.cognitive > cog ? `**${r.cognitive}**` : r.cognitive,
          r.maxNesting,
          r.params,
          r.loc,
          r.maintainability,
        ])
      )
    );
    md.push(truncatedLine(b, 'functions'));
  } else if (summary.functions > 0) {
    md.push(`No function exceeds the thresholds.`);
  } else {
    md.push('No functions found in the analysed files.');
  }
  md.push(notesSection(run.notes));
  return { data, markdown: md.join('\n') };
}
