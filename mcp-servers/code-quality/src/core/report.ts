// SPDX-License-Identifier: MIT
/**
 * Output helpers: bounded lists, markdown tables, redaction.
 */

export type OutputFormat = 'markdown' | 'json' | 'sarif';

export interface ToolResult {
  /** Structured result (returned for format=json). */
  data: unknown;
  /** Human/model-readable report (format=markdown). */
  markdown: string;
  /** SARIF 2.1.0 log, for tools that produce diagnostics. */
  sarif?: unknown;
  /** Tool-level failure: rendered with isError. */
  isError?: boolean;
}

export interface Bounded<T> {
  items: T[];
  total: number;
  truncated: boolean;
}

export function bound<T>(items: T[], limit: number): Bounded<T> {
  return { items: items.slice(0, limit), total: items.length, truncated: items.length > limit };
}

export function mdTable(headers: string[], rows: Array<Array<string | number>>): string {
  const esc = (v: string | number) => String(v).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`),
  ].join('\n');
}

export function truncatedLine(b: Bounded<unknown>, what: string): string {
  return b.truncated ? `\n_…${b.total - b.items.length} more ${what} not shown (truncated: raise \`limit\`)._\n` : '';
}

export function notesSection(notes: string[]): string {
  return notes.length ? `\n## Scope notes\n${notes.map((n) => `- ${n}`).join('\n')}\n` : '';
}

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/([a-z][a-z0-9+.-]*:\/\/)([^\s:@/]+):([^\s@/]+)@/gi, '$1$2:***@'],
  [/\b((?:api[_-]?key|token|secret|password|passwd|pwd|authorization)\s*[=:]\s*)(["']?)[^\s"']{6,}\2/gi, '$1$2***$2'],
  [/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g, '***'],
];

/** Strip credentials from tool output (stderr, messages) before it reaches the model. */
export function redact(text: string): string {
  let out = text;
  for (const [re, rep] of SECRET_PATTERNS) out = out.replace(re, rep);
  return out;
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
