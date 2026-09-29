// SPDX-License-Identifier: MIT
/**
 * Output parsers for external linters/type-checkers. Each returns raw
 * diagnostics with paths as the tool printed them (absolute, or relative to
 * the tool's cwd); the runner normalises paths afterwards.
 */

import type { Severity } from '../core/diagnostics.js';

export interface RawDiagnostic {
  path: string;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  severity: Severity;
  rule: string;
  message: string;
  fixable?: boolean;
}

export class ParseFailure extends Error {}

function json(text: string, what: string): any {
  const t = text.trim();
  if (!t) throw new ParseFailure(`${what} produced no output`);
  try {
    return JSON.parse(t);
  } catch {
    // Some tools print a banner before the JSON document.
    const start = t.search(/[[{]/);
    if (start > 0) {
      try {
        return JSON.parse(t.slice(start));
      } catch {
        /* fall through */
      }
    }
    throw new ParseFailure(`${what} output is not valid JSON: ${t.slice(0, 200)}`);
  }
}

/** eslint --format json */
export function parseEslint(stdout: string): RawDiagnostic[] {
  const results = json(stdout, 'eslint');
  if (!Array.isArray(results)) throw new ParseFailure('eslint JSON is not an array');
  const out: RawDiagnostic[] = [];
  for (const r of results) {
    for (const m of r.messages ?? []) {
      out.push({
        path: r.filePath,
        line: m.line ?? 1,
        column: m.column,
        endLine: m.endLine,
        endColumn: m.endColumn,
        severity: m.severity === 2 || m.fatal ? 'error' : 'warning',
        rule: m.ruleId ?? (m.fatal ? 'parse-error' : 'eslint'),
        message: m.message,
        fixable: Boolean(m.fix),
      });
    }
  }
  return out;
}

/** GitHub workflow-command reporter (`biome check --reporter=github`). */
export function parseGithubAnnotations(text: string, fallbackRule: string): RawDiagnostic[] {
  const out: RawDiagnostic[] = [];
  const re = /^::(error|warning|notice)\s+([^:]*?)::(.*)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const props: Record<string, string> = {};
    for (const part of m[2].split(',')) {
      const eq = part.indexOf('=');
      if (eq > 0) props[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).replace(/%(?![0-9A-F]{2})/gi, '%25'));
    }
    if (!props.file) continue;
    out.push({
      path: props.file,
      line: Number(props.line ?? 1),
      column: props.col ? Number(props.col) : undefined,
      endLine: props.endLine ? Number(props.endLine) : undefined,
      endColumn: props.endColumn ? Number(props.endColumn) : undefined,
      severity: m[1] === 'error' ? 'error' : m[1] === 'warning' ? 'warning' : 'info',
      rule: props.title || fallbackRule,
      message: m[3].replace(/%0A/g, '\n').replace(/%25/g, '%'),
    });
  }
  return out;
}

/** prettier --list-different: one path per line. */
export function parsePrettierList(stdout: string, fixed: boolean): RawDiagnostic[] {
  return stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('[') && !/^Checking formatting/i.test(l))
    .map((p) => ({
      path: p,
      line: 1,
      severity: fixed ? ('info' as const) : ('warning' as const),
      rule: 'prettier/format',
      message: fixed ? 'Reformatted by Prettier' : 'File is not formatted according to the Prettier config',
      fixable: true,
    }));
}

/** tsc --pretty false */
export function parseTsc(stdout: string): RawDiagnostic[] {
  const out: RawDiagnostic[] = [];
  const lines = stdout.split(/\r?\n/);
  const re = /^(.+?)\((\d+),(\d+)\): (error|warning|message) (TS\d+): (.*)$/;
  const global = /^(error|warning) (TS\d+): (.*)$/;
  let last: RawDiagnostic | null = null;
  for (const line of lines) {
    const m = re.exec(line);
    if (m) {
      last = { path: m[1], line: Number(m[2]), column: Number(m[3]), severity: m[4] === 'error' ? 'error' : m[4] === 'warning' ? 'warning' : 'info', rule: m[5], message: m[6] };
      out.push(last);
      continue;
    }
    const gm = global.exec(line);
    if (gm) {
      last = { path: '', line: 1, severity: gm[1] === 'error' ? 'error' : 'warning', rule: gm[2], message: gm[3] };
      out.push(last);
      continue;
    }
    if (last && /^\s+\S/.test(line)) last.message += '\n' + line.trim();
  }
  return out;
}

/** ruff check --output-format=json */
export function parseRuff(stdout: string): RawDiagnostic[] {
  const arr = json(stdout, 'ruff');
  if (!Array.isArray(arr)) throw new ParseFailure('ruff JSON is not an array');
  return arr.map((d: any) => ({
    path: d.filename,
    line: d.location?.row ?? 1,
    column: d.location?.column,
    endLine: d.end_location?.row,
    endColumn: d.end_location?.column,
    severity: d.code && /^(E9|F8[2-3]|F63|F7)/.test(d.code) ? 'error' : d.code === null || d.code === undefined ? 'error' : 'warning',
    rule: d.code ?? 'syntax-error',
    message: d.message,
    fixable: Boolean(d.fix),
  }));
}

/** ruff format --check: "Would reformat: path" */
export function parseRuffFormat(text: string): RawDiagnostic[] {
  const out: RawDiagnostic[] = [];
  for (const m of text.matchAll(/^Would reformat:\s+(.+)$/gm)) {
    out.push({ path: m[1].trim(), line: 1, severity: 'warning', rule: 'ruff-format', message: 'File is not formatted according to ruff format', fixable: true });
  }
  return out;
}

/** pylint --output-format=json */
export function parsePylint(stdout: string): RawDiagnostic[] {
  const arr = json(stdout, 'pylint');
  if (!Array.isArray(arr)) throw new ParseFailure('pylint JSON is not an array');
  return arr.map((d: any) => ({
    path: d.path,
    line: d.line ?? 1,
    column: typeof d.column === 'number' ? d.column + 1 : undefined,
    endLine: d.endLine ?? undefined,
    severity: d.type === 'error' || d.type === 'fatal' ? 'error' : d.type === 'convention' || d.type === 'info' ? 'info' : 'warning',
    rule: d.symbol ?? d['message-id'] ?? 'pylint',
    message: d.message,
  }));
}

/** mypy text output with --show-column-numbers --show-error-codes */
export function parseMypy(stdout: string): RawDiagnostic[] {
  const out: RawDiagnostic[] = [];
  const re = /^(.+?):(\d+):(?:(\d+):)?\s*(error|warning|note):\s*(.*?)(?:\s{2}\[([\w-]+)\])?$/;
  for (const line of stdout.split(/\r?\n/)) {
    const m = re.exec(line);
    if (!m) continue;
    if (m[4] === 'note' && out.length && out[out.length - 1].path === m[1] && out[out.length - 1].line === Number(m[2])) {
      out[out.length - 1].message += `\n${m[5]}`;
      continue;
    }
    out.push({
      path: m[1],
      line: Number(m[2]),
      column: m[3] ? Number(m[3]) : undefined,
      severity: m[4] === 'error' ? 'error' : m[4] === 'warning' ? 'warning' : 'info',
      rule: m[6] ?? 'mypy',
      message: m[5],
    });
  }
  return out;
}

/** pyright --outputjson */
export function parsePyright(stdout: string): RawDiagnostic[] {
  const doc = json(stdout, 'pyright');
  return (doc.generalDiagnostics ?? []).map((d: any) => ({
    path: d.file,
    line: (d.range?.start?.line ?? 0) + 1,
    column: (d.range?.start?.character ?? 0) + 1,
    endLine: d.range?.end ? d.range.end.line + 1 : undefined,
    endColumn: d.range?.end ? d.range.end.character + 1 : undefined,
    severity: d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'info',
    rule: d.rule ?? 'pyright',
    message: d.message,
  }));
}

/** golangci-lint JSON (v1 --out-format=json, v2 --output.json.path). */
export function parseGolangci(text: string): RawDiagnostic[] {
  const doc = json(text, 'golangci-lint');
  return (doc.Issues ?? []).map((i: any) => ({
    path: i.Pos?.Filename ?? '',
    line: i.Pos?.Line ?? 1,
    column: i.Pos?.Column || undefined,
    severity: i.Severity === 'error' ? 'error' : i.Severity === 'info' ? 'info' : i.Severity === 'warning' ? 'warning' : 'warning',
    rule: i.FromLinter ?? 'golangci-lint',
    message: i.Text,
    fixable: Boolean(i.SuggestedFixes?.length || i.Replacement),
  }));
}

/** cargo clippy --message-format=json (NDJSON). */
export function parseCargo(stdout: string): RawDiagnostic[] {
  const out: RawDiagnostic[] = [];
  const seen = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith('{')) continue;
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.reason !== 'compiler-message' || !msg.message) continue;
    const m = msg.message;
    if (m.level !== 'error' && m.level !== 'warning') continue;
    if (/^(aborting due to|could not compile)/.test(m.message) || /^\d+ warnings? emitted/.test(m.message)) continue;
    const span = (m.spans ?? []).find((s: any) => s.is_primary) ?? m.spans?.[0];
    if (!span) continue;
    const d: RawDiagnostic = {
      path: span.file_name,
      line: span.line_start,
      column: span.column_start,
      endLine: span.line_end,
      endColumn: span.column_end,
      severity: m.level === 'error' ? 'error' : 'warning',
      rule: m.code?.code ?? 'rustc',
      message: m.message,
      fixable: (m.children ?? []).some((c: any) => (c.spans ?? []).some((s: any) => s.suggested_replacement != null)),
    };
    const key = `${d.path}:${d.line}:${d.column}:${d.rule}:${d.message}`;
    if (seen.has(key)) continue; // lib + test targets report the same warning
    seen.add(key);
    out.push(d);
  }
  return out;
}

function xmlAttrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = unescapeXml(m[2]);
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*'([^']*)'/g)) out[m[1]] = unescapeXml(m[2]);
  return out;
}

export function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

/** Checkstyle XML (`-f xml`). */
export function parseCheckstyle(text: string): RawDiagnostic[] {
  if (!/<checkstyle\b/.test(text)) throw new ParseFailure(`checkstyle output is not XML: ${text.slice(0, 200)}`);
  const out: RawDiagnostic[] = [];
  const fileRe = /<file\b([^>]*)>([\s\S]*?)<\/file>/g;
  let fm: RegExpExecArray | null;
  while ((fm = fileRe.exec(text)) !== null) {
    const file = xmlAttrs(fm[1]).name;
    for (const em of fm[2].matchAll(/<error\b([^>]*?)\/?>/g)) {
      const a = xmlAttrs(em[1]);
      out.push({
        path: file,
        line: Number(a.line ?? 1),
        column: a.column ? Number(a.column) : undefined,
        severity: a.severity === 'error' ? 'error' : a.severity === 'info' || a.severity === 'ignore' ? 'info' : 'warning',
        rule: (a.source ?? 'checkstyle').replace(/^com\.puppycrawl\.tools\.checkstyle\.checks\.(\w+\.)*/, '').replace(/Check$/, ''),
        message: a.message ?? '',
      });
    }
  }
  return out;
}

/** PMD `-f json`. */
export function parsePmd(text: string): RawDiagnostic[] {
  const doc = json(text, 'pmd');
  const out: RawDiagnostic[] = [];
  for (const f of doc.files ?? []) {
    for (const v of f.violations ?? []) {
      const pr = Number(v.priority ?? 3);
      out.push({
        path: f.filename,
        line: v.beginline ?? 1,
        column: v.begincolumn,
        endLine: v.endline,
        endColumn: v.endcolumn,
        severity: pr <= 2 ? 'error' : pr >= 5 ? 'info' : 'warning',
        rule: v.rule ?? 'pmd',
        message: v.description ?? '',
      });
    }
  }
  return out;
}

/** `dotnet format --report` JSON. */
export function parseDotnetFormat(text: string): RawDiagnostic[] {
  const doc = json(text, 'dotnet format report');
  const out: RawDiagnostic[] = [];
  for (const d of Array.isArray(doc) ? doc : []) {
    for (const c of d.FileChanges ?? []) {
      out.push({
        path: d.FilePath ?? d.FileName,
        line: c.LineNumber ?? 1,
        column: c.CharNumber,
        severity: 'warning',
        rule: c.DiagnosticId ?? 'dotnet-format',
        message: c.FormatDescription ?? 'Formatting issue',
        fixable: true,
      });
    }
  }
  return out;
}
