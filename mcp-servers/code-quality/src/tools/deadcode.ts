// SPDX-License-Identifier: MIT
/**
 * find_dead_code — unused files, exports, dependencies, imports and private
 * functions, built on the resolved import graph.
 */

import { isChanged, type ScopeOptions } from '../core/files.js';
import { isTestFile } from '../core/paths.js';
import { bound, mdTable, notesSection, truncatedLine, type ToolResult } from '../core/report.js';
import { runParse } from '../analysis/pipeline.js';
import { buildGraph } from '../analysis/graph.js';
import { analyzeDeadCode, type Confidence, type DeadItem, type DeadKind } from '../analysis/deadcode.js';

export interface DeadCodeInput extends ScopeOptions {
  confidence?: Confidence;
  entries?: string[];
  kinds?: DeadKind[];
  limit?: number;
}

const RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

export async function collectDeadCode(input: DeadCodeInput): Promise<{ items: DeadItem[]; root: string; notes: string[]; files: number }> {
  // Tests always take part as consumers; `includeTests` only controls reporting inside them.
  const run = await runParse({ ...input, includeTests: true }, { magicNumbers: false, modules: true, identifiers: true, onlyChanged: false });
  const g = buildGraph(run.parsed, run.scope.root);
  const { items, notes } = analyzeDeadCode(g, run.scope.root, { entries: input.entries });
  const min = RANK[input.confidence ?? 'medium'];
  const changedRel = new Set(run.parsed.filter((p) => isChanged(run.scope, p.file.abs)).map((p) => p.file.rel));
  const kinds = input.kinds?.length ? new Set(input.kinds) : null;
  const filtered = items.filter(
    (i) =>
      RANK[i.confidence] >= min &&
      (!kinds || kinds.has(i.kind)) &&
      (input.includeTests || !isTestFile(i.file)) &&
      (run.scope.changed === null || changedRel.has(i.file) || i.kind === 'dependency')
  );
  const order: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };
  filtered.sort((a, b) => order[a.confidence] - order[b.confidence] || a.kind.localeCompare(b.kind) || a.file.localeCompare(b.file) || a.line - b.line);
  return { items: filtered, root: run.scope.root, notes: [...run.notes, ...notes], files: run.parsed.length };
}

export async function findDeadCode(input: DeadCodeInput): Promise<ToolResult> {
  const limit = input.limit ?? 100;
  const { items, root, notes, files } = await collectDeadCode(input);
  const byKind: Record<string, number> = {};
  for (const i of items) byKind[i.kind] = (byKind[i.kind] ?? 0) + 1;
  const b = bound(items, limit);
  const data = { root, summary: { files, total: items.length, byKind, minConfidence: input.confidence ?? 'medium' }, items: b.items, truncated: b.truncated, notes };
  const md: string[] = ['# Dead code report', '', `Root: \`${root}\``, ''];
  md.push(`- Files analysed: ${files} · findings: **${items.length}** (confidence ≥ ${input.confidence ?? 'medium'})`);
  if (items.length) {
    md.push('', mdTable(['Kind', 'Count'], Object.entries(byKind)), '');
    md.push(mdTable(['Confidence', 'Kind', 'Name', 'Location', 'Why'], b.items.map((i) => [i.confidence, i.kind, i.name, `${i.file}:${i.line}`, i.reason])));
    md.push(truncatedLine(b, 'findings'));
  } else {
    md.push('', 'No unused code found at this confidence level.');
  }
  md.push('', '_Dynamic access (reflection, string-based imports, framework conventions) is invisible to static analysis — verify before deleting._');
  md.push(notesSection(notes));
  return { data, markdown: md.join('\n') };
}
