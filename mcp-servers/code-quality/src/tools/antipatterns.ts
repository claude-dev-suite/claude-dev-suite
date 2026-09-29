// SPDX-License-Identifier: MIT
/**
 * detect_antipatterns — code smells from syntax trees, with real thresholds.
 */

import { pathToFileURL } from 'url';
import { isChanged, type ScopeOptions } from '../core/files.js';
import { countBySeverity, toSarif, type Diagnostic } from '../core/diagnostics.js';
import { bound, mdTable, notesSection, truncatedLine, type ToolResult } from '../core/report.js';
import { runParse } from '../analysis/pipeline.js';
import { Interner } from '../parsing/analyze.js';
import { detectClones } from '../analysis/clones.js';
import { DEFAULT_SMELL_THRESHOLDS, SMELL_TYPES, detectSmells, type SmellThresholds, type SmellType } from '../analysis/smells.js';

export interface AntiPatternsInput extends ScopeOptions {
  patterns?: SmellType[];
  thresholds?: Partial<SmellThresholds> & { minDuplicateLines?: number; minDuplicateTokens?: number };
  limit?: number;
}

export async function collectSmells(input: AntiPatternsInput): Promise<{ diagnostics: Diagnostic[]; root: string; notes: string[]; files: number }> {
  const enabledSet = new Set<SmellType>(input.patterns?.length ? input.patterns : SMELL_TYPES);
  const thresholds: SmellThresholds = { ...DEFAULT_SMELL_THRESHOLDS };
  for (const [k, v] of Object.entries(input.thresholds ?? {})) {
    if (typeof v === 'number' && k in thresholds) (thresholds as unknown as Record<string, number>)[k] = v;
  }
  const wantDup = enabledSet.has('duplicate-code');
  const run = await runParse(input, { tokens: wantDup ? new Interner() : undefined, onlyChanged: !wantDup && !enabledSet.has('data-clump') });
  const changedRel = new Set(run.parsed.filter((p) => isChanged(run.scope, p.file.abs)).map((p) => p.file.rel));
  const reportable = (rel: string) => changedRel.has(rel);

  const diagnostics = detectSmells(run.parsed, thresholds, (t) => enabledSet.has(t), reportable);

  if (wantDup) {
    const clones = detectClones(
      run.parsed.filter((p) => !p.file.isTest).map((p) => ({ rel: p.file.rel, content: p.file.content, loc: p.analysis.loc, tokens: p.analysis.tokens! })),
      { minTokens: input.thresholds?.minDuplicateTokens ?? 50, minLines: input.thresholds?.minDuplicateLines ?? 6, mode: 'renamed' }
    );
    for (const g of clones.groups) {
      const [first, ...rest] = g.locations;
      const at = g.locations.find((l) => reportable(l.file));
      if (!at) continue;
      const others = g.locations.filter((l) => l !== at).map((l) => `${l.file}:${l.startLine}-${l.endLine}`);
      diagnostics.push({
        tool: 'code-quality', file: at.file, line: at.startLine, endLine: at.endLine, severity: g.lines > 30 ? 'warning' : 'info',
        rule: 'duplicate-code', symbol: `${first.file}:${rest.length}`,
        message: `${g.lines} duplicated lines (${g.tokens} tokens), also at ${others.slice(0, 4).join(', ')}`,
        suggestion: 'Extract the shared logic into one function/module',
        details: { locations: g.locations },
      });
    }
  }
  const order = { error: 0, warning: 1, info: 2 };
  diagnostics.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);
  return { diagnostics, root: run.scope.root, notes: run.notes, files: run.parsed.length };
}

export async function detectAntiPatterns(input: AntiPatternsInput, format: 'markdown' | 'json' | 'sarif'): Promise<ToolResult> {
  const limit = input.limit ?? 100;
  const { diagnostics, root, notes, files } = await collectSmells(input);
  const summary: Record<string, number> = {};
  for (const d of diagnostics) summary[d.rule] = (summary[d.rule] ?? 0) + 1;
  const b = bound(diagnostics, limit);
  const bySeverity = countBySeverity(diagnostics);
  const data = { root, summary: { files, total: diagnostics.length, bySeverity, byPattern: summary }, findings: b.items, truncated: b.truncated, notes };

  const md: string[] = ['# Anti-pattern report', '', `Root: \`${root}\``, ''];
  md.push(`- Files: ${files} · findings: **${diagnostics.length}** (errors ${bySeverity.error}, warnings ${bySeverity.warning}, info ${bySeverity.info})`, '');
  if (diagnostics.length) {
    md.push(mdTable(['Pattern', 'Count'], Object.entries(summary).sort((a, b) => b[1] - a[1])), '');
    md.push(mdTable(['Severity', 'Location', 'Pattern', 'Finding'], b.items.map((d) => [d.severity, `${d.file}:${d.line}`, d.rule, d.message])));
    md.push(truncatedLine(b, 'findings'));
  } else {
    md.push('No anti-patterns found at these thresholds.');
  }
  md.push(notesSection(notes));
  return {
    data,
    markdown: md.join('\n'),
    sarif: format === 'sarif' ? toSarif(b.items, pathToFileURL(root).href, {}, { truncated: b.truncated, total: b.total }) : undefined,
  };
}
