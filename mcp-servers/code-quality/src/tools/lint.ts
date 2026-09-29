// SPDX-License-Identifier: MIT
/**
 * check_style / check_types — the project's own linters, formatters and
 * type-checkers, normalised into one diagnostic shape (+ SARIF).
 */

import { pathToFileURL } from 'url';
import { resolveScope, scopeNotes, type ScopeOptions } from '../core/files.js';
import { countBySeverity, toSarif } from '../core/diagnostics.js';
import { bound, mdTable, notesSection, truncatedLine, type ToolResult } from '../core/report.js';
import { runLinters, type LintOutcome } from '../linters/runner.js';
import type { LinterCategory } from '../linters/defs.js';

export interface LintInput extends ScopeOptions {
  fix?: boolean;
  rules?: string[];
  linters?: string[];
  timeoutSec?: number;
  limit?: number;
}

export async function collectLint(input: LintInput, categories: LinterCategory[]): Promise<LintOutcome & { root: string; notes: string[] }> {
  const scope = await resolveScope(input);
  const outcome = await runLinters({
    scope,
    categories,
    only: input.linters,
    fix: input.fix ?? false,
    changedSince: input.changedSince,
    timeoutMs: input.timeoutSec ? input.timeoutSec * 1000 : undefined,
  });
  let diagnostics = outcome.diagnostics;
  if (input.rules?.length) {
    const rules = input.rules;
    diagnostics = diagnostics.filter((d) => rules.some((r) => d.rule === r || d.rule.startsWith(r + '/') || d.rule.endsWith('/' + r) || d.rule.startsWith(r)));
  }
  return { ...outcome, diagnostics, root: scope.root, notes: scopeNotes(scope) };
}

export async function runLintTool(input: LintInput, categories: LinterCategory[], title: string, format: 'markdown' | 'json' | 'sarif'): Promise<ToolResult> {
  const limit = input.limit ?? 200;
  const { runs, diagnostics, toolVersions, root, notes } = await collectLint(input, categories);
  const order = { error: 0, warning: 1, info: 2 };
  diagnostics.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);
  const b = bound(diagnostics, limit);
  const sev = countBySeverity(diagnostics);
  const ran = runs.filter((r) => r.status === 'ran');
  const failed = runs.filter((r) => r.status === 'failed' || r.status === 'timeout');
  const data = {
    root,
    summary: {
      total: diagnostics.length,
      ...sev,
      fixable: diagnostics.filter((d) => d.fixable).length,
      toolsRan: [...new Set(ran.map((r) => r.tool))],
      toolsFailed: failed.map((r) => `${r.tool}@${r.project}`),
    },
    runs,
    diagnostics: b.items,
    truncated: b.truncated,
    notes,
  };

  const md: string[] = [`# ${title}`, '', `Root: \`${root}\``, ''];
  if (!runs.length) {
    md.push(`No ${categories.join('/')} tool applies to the files in scope (supported: JS/TS, Python, Go, Rust, Java, C#).`);
  } else {
    md.push('## Tools', '');
    md.push(
      mdTable(
        ['Tool', 'Project', 'Status', 'Issues', 'Details'],
        runs.map((r) => [
          r.tool,
          r.project,
          r.status === 'ran' ? (r.fixApplied ? 'ran (fix applied)' : 'ran') : `**${r.status}**`,
          r.status === 'ran' ? r.issues : '—',
          [r.message, r.config ? `config: ${r.config}` : '', r.command ? `\`${r.command}\`` : ''].filter(Boolean).join(' · '),
        ])
      )
    );
    md.push('');
    if (!ran.length) {
      md.push('**No tool actually ran** — the result below is not evidence of clean code. See statuses above.', '');
    }
    md.push(`Issues: **${diagnostics.length}** (errors ${sev.error}, warnings ${sev.warning}, info ${sev.info}; fixable ${data.summary.fixable})`, '');
    if (b.items.length) {
      md.push(mdTable(['Severity', 'Location', 'Rule', 'Message', 'Tool'], b.items.map((d) => [d.severity, `${d.file}:${d.line}${d.column ? ':' + d.column : ''}`, d.rule, d.message.split('\n')[0], d.tool])));
      md.push(truncatedLine(b, 'diagnostics'));
    }
  }
  md.push(notesSection(notes));
  return {
    data,
    markdown: md.join('\n'),
    sarif: format === 'sarif' ? toSarif(b.items, pathToFileURL(root).href, toolVersions, { truncated: b.truncated, total: b.total, runs }) : undefined,
  };
}
