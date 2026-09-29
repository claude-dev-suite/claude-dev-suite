// SPDX-License-Identifier: MIT
/**
 * find_duplicates — cross-file token clone detection.
 */

import { isChanged, type ScopeOptions } from '../core/files.js';
import { bound, notesSection, truncatedLine, type ToolResult } from '../core/report.js';
import { runParse } from '../analysis/pipeline.js';
import { Interner } from '../parsing/analyze.js';
import { detectClones, type CloneGroup, type CloneMode, type CloneResult } from '../analysis/clones.js';

export interface DuplicatesInput extends ScopeOptions {
  minLines?: number;
  minTokens?: number;
  mode?: CloneMode;
  limit?: number;
}

export async function computeClones(
  input: DuplicatesInput
): Promise<{ result: CloneResult; groups: CloneGroup[]; root: string; notes: string[]; files: number }> {
  const run = await runParse(
    { ...input, includeTests: input.includeTests ?? false },
    { tokens: new Interner(), magicNumbers: false, onlyChanged: false }
  );
  const result = detectClones(
    run.parsed.map((p) => ({ rel: p.file.rel, content: p.file.content, loc: p.analysis.loc, tokens: p.analysis.tokens! })),
    { minTokens: input.minTokens ?? 50, minLines: input.minLines ?? 5, mode: input.mode ?? 'renamed' }
  );
  let groups = result.groups;
  if (run.scope.changed) {
    const changedRel = new Set(run.parsed.filter((p) => isChanged(run.scope, p.file.abs)).map((p) => p.file.rel));
    groups = groups.filter((g) => g.locations.some((l) => changedRel.has(l.file)));
  }
  return { result, groups, root: run.scope.root, notes: run.notes, files: run.parsed.length };
}

export async function findDuplicates(input: DuplicatesInput): Promise<ToolResult> {
  const limit = input.limit ?? 30;
  const { result, groups, root, notes, files } = await computeClones(input);
  const b = bound(groups, limit);
  const data = {
    root,
    settings: { minTokens: input.minTokens ?? 50, minLines: input.minLines ?? 5, mode: input.mode ?? 'renamed', includeTests: input.includeTests ?? false },
    summary: {
      files,
      cloneGroups: groups.length,
      duplicatedLines: result.duplicatedLines,
      totalLines: result.totalLines,
      duplicationPercentage: result.percentage,
    },
    clones: b.items,
    truncated: b.truncated,
    notes,
  };
  const md: string[] = ['# Duplicate code report', '', `Root: \`${root}\``, ''];
  md.push(`- Files: ${files} · clone groups: **${groups.length}** · duplicated lines: ${result.duplicatedLines}/${result.totalLines} (**${result.percentage}%**)`);
  md.push(`- Settings: minTokens ${data.settings.minTokens}, minLines ${data.settings.minLines}, mode ${data.settings.mode}${data.settings.includeTests ? '' : ', tests excluded'}`);
  md.push('');
  b.items.forEach((g, i) => {
    md.push(`## Clone ${i + 1}: ${g.lines} lines, ${g.tokens} tokens, ${g.locations.length} copies`);
    for (const l of g.locations) md.push(`- ${l.file}:${l.startLine}-${l.endLine}`);
    md.push('```', g.fragment, '```', '');
  });
  if (!groups.length) md.push('No duplicated blocks at these settings.');
  md.push(truncatedLine(b, 'clone groups'));
  md.push(notesSection(notes));
  return { data, markdown: md.join('\n') };
}
