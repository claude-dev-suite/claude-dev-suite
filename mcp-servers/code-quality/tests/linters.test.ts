// SPDX-License-Identifier: MIT
/**
 * Linter wrappers: output parsers against recorded tool output, and the
 * runner against a fake process runner (no linter needs to be installed).
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'path';
import {
  parseCargo, parseCheckstyle, parseDotnetFormat, parseEslint, parseGithubAnnotations, parseGolangci, parseMypy,
  parsePmd, parsePrettierList, parsePyright, parseRuff, parseTsc,
} from '../src/linters/parsers.js';
import { runLinters } from '../src/linters/runner.js';
import { resolveScope } from '../src/core/files.js';
import { setProcessRunner, type ExecOptions } from '../src/core/process.js';
import { jsEntryFromCmdShim } from '../src/core/binaries.js';
import { collectLint } from '../src/tools/lint.js';
import { makeFixture, onPath } from './helpers.js';

describe('parsers', () => {
  it('eslint JSON', () => {
    const out = JSON.stringify([
      { filePath: '/p/a.ts', messages: [{ ruleId: 'no-unused-vars', severity: 2, message: "'x' is unused", line: 3, column: 7, fix: { range: [0, 1], text: '' } }, { ruleId: null, fatal: true, severity: 2, message: 'Parsing error', line: 9, column: 1 }] },
    ]);
    expect(parseEslint(out)).toEqual([
      { path: '/p/a.ts', line: 3, column: 7, endLine: undefined, endColumn: undefined, severity: 'error', rule: 'no-unused-vars', message: "'x' is unused", fixable: true },
      { path: '/p/a.ts', line: 9, column: 1, endLine: undefined, endColumn: undefined, severity: 'error', rule: 'parse-error', message: 'Parsing error', fixable: false },
    ]);
  });

  it('biome GitHub annotations', () => {
    const out = '::error title=lint/suspicious/noDoubleEquals,file=src/a.ts,line=3,endLine=3,col=7,endColumn=9::Use === instead of ==\n::warning title=format,file=src/b%2Cc.ts,line=1,endLine=1,col=1,endColumn=1::File not formatted\n';
    const d = parseGithubAnnotations(out, 'biome');
    expect(d.map((x) => [x.path, x.line, x.column, x.severity, x.rule])).toEqual([
      ['src/a.ts', 3, 7, 'error', 'lint/suspicious/noDoubleEquals'],
      ['src/b,c.ts', 1, 1, 'warning', 'format'],
    ]);
  });

  it('prettier --list-different', () => {
    expect(parsePrettierList('src/a.ts\nsrc/b.tsx\n', false).map((d) => d.path)).toEqual(['src/a.ts', 'src/b.tsx']);
  });

  it('tsc with multi-line messages and global errors', () => {
    const out = "src/a.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'.\n  Details here.\nerror TS5058: The specified path does not exist: 'x'.\n";
    const d = parseTsc(out);
    expect(d[0]).toMatchObject({ path: 'src/a.ts', line: 3, column: 7, rule: 'TS2322', severity: 'error' });
    expect(d[0].message).toContain('Details here.');
    expect(d[1]).toMatchObject({ path: '', rule: 'TS5058' });
  });

  it('ruff JSON', () => {
    const out = JSON.stringify([{ code: 'F401', message: '`os` imported but unused', filename: 'C:\\p\\m.py', location: { row: 1, column: 8 }, end_location: { row: 1, column: 10 }, fix: { applicability: 'safe' } }]);
    expect(parseRuff(out)[0]).toMatchObject({ path: 'C:\\p\\m.py', line: 1, column: 8, rule: 'F401', fixable: true, severity: 'warning' });
  });

  it('mypy text output', () => {
    const out = 'pkg/m.py:10:5: error: Incompatible return value type (got "str", expected "int")  [return-value]\npkg/m.py:10:5: note: See docs\n';
    const d = parseMypy(out);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ path: 'pkg/m.py', line: 10, column: 5, rule: 'return-value', severity: 'error' });
  });

  it('pyright JSON (0-based positions)', () => {
    const out = JSON.stringify({ generalDiagnostics: [{ file: '/p/m.py', severity: 'error', message: 'x', range: { start: { line: 4, character: 2 }, end: { line: 4, character: 5 } }, rule: 'reportGeneralTypeIssues' }] });
    expect(parsePyright(out)[0]).toMatchObject({ line: 5, column: 3, rule: 'reportGeneralTypeIssues' });
  });

  it('golangci-lint JSON', () => {
    const out = JSON.stringify({ Issues: [{ FromLinter: 'errcheck', Text: 'Error return value is not checked', Severity: '', Pos: { Filename: 'cmd/main.go', Line: 12, Column: 3 } }], Report: {} });
    expect(parseGolangci(out)[0]).toMatchObject({ path: 'cmd/main.go', line: 12, rule: 'errcheck', severity: 'warning' });
  });

  it('cargo clippy NDJSON: primary span, relative paths, de-duplicated across targets', () => {
    const msg = { reason: 'compiler-message', message: { level: 'warning', message: 'length comparison to zero', code: { code: 'clippy::len_zero' }, spans: [{ file_name: 'src/main.rs', line_start: 7, line_end: 7, column_start: 8, column_end: 20, is_primary: true }], children: [{ spans: [{ suggested_replacement: 'v.is_empty()' }] }] } };
    const out = [JSON.stringify({ reason: 'compiler-artifact' }), JSON.stringify(msg), JSON.stringify(msg), JSON.stringify({ reason: 'compiler-message', message: { level: 'warning', message: '2 warnings emitted', spans: [] } })].join('\n');
    const d = parseCargo(out);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ path: 'src/main.rs', line: 7, rule: 'clippy::len_zero', fixable: true });
  });

  it('checkstyle XML, PMD JSON, dotnet format report', () => {
    const xml = '<?xml version="1.0"?><checkstyle version="10"><file name="/p/A.java"><error line="3" column="5" severity="warning" message="Missing a Javadoc comment &amp; more." source="com.puppycrawl.tools.checkstyle.checks.javadoc.MissingJavadocMethodCheck"/></file></checkstyle>';
    expect(parseCheckstyle(xml)[0]).toMatchObject({ path: '/p/A.java', line: 3, column: 5, rule: 'MissingJavadocMethod', message: 'Missing a Javadoc comment & more.' });
    expect(() => parseCheckstyle('Checkstyle ends with 1 errors.')).toThrow();
    const pmd = JSON.stringify({ files: [{ filename: '/p/A.java', violations: [{ beginline: 4, begincolumn: 2, endline: 4, endcolumn: 9, description: 'Avoid unused', rule: 'UnusedPrivateField', priority: 3 }] }] });
    expect(parsePmd(pmd)[0]).toMatchObject({ line: 4, rule: 'UnusedPrivateField', severity: 'warning' });
    const dn = JSON.stringify([{ FilePath: 'C:\\p\\C.cs', FileChanges: [{ LineNumber: 5, CharNumber: 9, DiagnosticId: 'WHITESPACE', FormatDescription: 'Fix whitespace formatting.' }] }]);
    expect(parseDotnetFormat(dn)[0]).toMatchObject({ path: 'C:\\p\\C.cs', line: 5, rule: 'WHITESPACE' });
  });

  it('npm .cmd shims point at the JS entry that runs without a shell', () => {
    const fx = makeFixture({
      'npm/eslint.cmd': '@ECHO off\r\nGOTO start\r\n:start\r\nSETLOCAL\r\n"%_prog%"  "%dp0%\\node_modules\\eslint\\bin\\eslint.js" %*\r\n',
      'npm/node_modules/eslint/bin/eslint.js': '',
    });
    try {
      expect(jsEntryFromCmdShim(path.join(fx.dir, 'npm', 'eslint.cmd'))).toBe(path.join(fx.dir, 'npm', 'node_modules', 'eslint', 'bin', 'eslint.js'));
    } finally {
      fx.cleanup();
    }
  });
});

describe('runner', () => {
  let restore = () => {};
  let cleanup = () => {};
  afterEach(() => {
    restore();
    cleanup();
  });

  function recordCalls(respond: (cmd: string, args: string[], o: ExecOptions) => { code: number; stdout?: string; stderr?: string }) {
    const calls: Array<{ cmd: string; args: string[]; cwd: string }> = [];
    restore = setProcessRunner(async (cmd, args, o) => {
      calls.push({ cmd, args, cwd: o.cwd });
      const r = respond(cmd, args, o);
      return { code: r.code, stdout: r.stdout ?? '', stderr: r.stderr ?? '', timedOut: false, truncated: false };
    });
    return calls;
  }

  const eslintProject = {
    'web/package.json': JSON.stringify({ name: 'web' }),
    'web/eslint.config.js': 'export default [];\n',
    'web/node_modules/eslint/package.json': JSON.stringify({ name: 'eslint', version: '9.1.0', bin: { eslint: './bin/eslint.js' } }),
    'web/node_modules/eslint/bin/eslint.js': '',
    'web/src/a.ts': 'export const a = 1;\n',
    'web/src/b.ts': 'export const b = 2;\n',
  };

  it('runs a locally installed ESLint once per project, via node (no npx/.cmd), in the project dir, passing --fix', async () => {
    const fx = makeFixture(eslintProject);
    cleanup = fx.cleanup;
    const scope = await resolveScope({ path: fx.dir });
    const calls = recordCalls((cmd, args) => {
      if (args.includes('--version')) return { code: 0, stdout: 'v9.1.0' };
      return {
        code: 1,
        stdout: JSON.stringify([{ filePath: path.join(fx.dir, 'web', 'src', 'a.ts'), messages: [{ ruleId: 'prefer-const', severity: 1, message: 'Use const', line: 1, column: 1 }] }]),
      };
    });
    const out = await runLinters({ scope, categories: ['lint'], only: ['eslint'], fix: true });
    const lintCalls = calls.filter((c) => !c.args.includes('--version'));
    expect(lintCalls).toHaveLength(1);
    expect(lintCalls[0].cmd).toBe(process.execPath);
    expect(lintCalls[0].args[0]).toBe(path.join(fx.dir, 'web', 'node_modules', 'eslint', 'bin', 'eslint.js'));
    expect(lintCalls[0].args).toContain('--fix');
    expect(lintCalls[0].args).toContain('.');
    expect(path.resolve(lintCalls[0].cwd)).toBe(path.join(fx.dir, 'web'));
    expect(out.runs[0]).toMatchObject({ tool: 'eslint', project: 'web', status: 'ran', issues: 1, fixApplied: true });
    expect(out.diagnostics[0]).toMatchObject({ file: 'web/src/a.ts', rule: 'prefer-const', tool: 'eslint' });
  });

  it('reports not-installed and no-config instead of silently falling back', async () => {
    const fx = makeFixture({
      'a/package.json': '{}',
      'a/eslint.config.js': 'export default [];\n',
      'a/x.ts': 'export const x = 1;\n',
      'b/package.json': '{}',
      'b/y.ts': 'export const y = 1;\n',
    });
    cleanup = fx.cleanup;
    const scope = await resolveScope({ path: fx.dir });
    const calls = recordCalls(() => ({ code: 0 }));
    const out = await runLinters({ scope, categories: ['lint'], only: ['eslint'], fix: false });
    const byProject = Object.fromEntries(out.runs.map((r) => [r.project, r.status]));
    expect(byProject).toEqual({ a: 'not-installed', b: 'no-config' });
    expect(calls).toHaveLength(0);
    expect(out.diagnostics).toHaveLength(0);
  });

  it('marks a crashing linter as failed with its stderr (not as clean)', async () => {
    const fx = makeFixture(eslintProject);
    cleanup = fx.cleanup;
    const scope = await resolveScope({ path: fx.dir });
    recordCalls(() => ({ code: 2, stderr: 'Oops! Something went wrong: token=ghp_abcdefghijklmnopqrstuvwxyz1234' }));
    const out = await runLinters({ scope, categories: ['lint'], only: ['eslint'], fix: false });
    expect(out.runs[0].status).toBe('failed');
    expect(out.runs[0].message).toContain('Something went wrong');
    expect(out.runs[0].message).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz1234');
  });

  it('passes changed files explicitly in diff mode and filters whole-project tools to the requested path', async () => {
    const fx = makeFixture({
      'tsconfig.json': '{ "compilerOptions": {} }',
      'node_modules/typescript/package.json': JSON.stringify({ name: 'typescript', version: '5.4.0', bin: { tsc: './bin/tsc' } }),
      'node_modules/typescript/bin/tsc': '',
      'src/a.ts': 'export const a: number = 1;\n',
      'other/b.ts': 'export const b: number = 2;\n',
    });
    cleanup = fx.cleanup;
    recordCalls(() => ({ code: 2, stdout: "src/a.ts(1,14): error TS2322: bad\nother/b.ts(1,14): error TS2322: bad\n" }));
    const scope = await resolveScope({ path: path.join(fx.dir, 'src') });
    const out = await runLinters({ scope, categories: ['types'], fix: false });
    expect(out.runs[0]).toMatchObject({ tool: 'tsc', status: 'ran', issues: 1 });
    expect(out.diagnostics.map((d) => d.file)).toEqual(['src/a.ts']);
  });

  it('golangci-lint: v2 writes JSON to a report file, v1 uses --out-format', async () => {
    const fx = makeFixture({ 'go.mod': 'module x\n', 'main.go': 'package main\nfunc main() {}\n' });
    cleanup = fx.cleanup;
    const { resolveNative } = await import('../src/core/binaries.js');
    if (!('command' in resolveNative('golangci-lint', fx.dir, fx.dir))) {
      // Resolution needs a real binary; the invocation builder is tested directly instead.
      const { golangci } = await import('../src/linters/defs.js');
      const base = { repoRoot: fx.dir, projectDir: fx.dir, targets: ['.'], wholeProject: true, fix: false, config: null, tmpDir: fx.dir };
      const v2 = golangci.invocation({ ...base, version: 'golangci-lint has version 2.1.6 built with go1.24' });
      expect(v2.args).toContain('--show-stats=false');
      expect(v2.args.some((a) => a.startsWith('--output.json.path='))).toBe(true);
      expect(v2.reportFile).toBeDefined();
      const v1 = golangci.invocation({ ...base, version: 'golangci-lint has version v1.59.1 built with go1.22' });
      expect(v1.args).toContain('--out-format=json');
      expect(v1.args).not.toContain('--output.json.path');
      const diff = golangci.invocation({ ...base, version: '2.1.0', changedSince: 'main' });
      expect(diff.args).toContain('--new-from-rev=main');
    }
  });

  it.runIf(onPath('cargo'))('clippy runs once per Cargo workspace, from its root, and maps its relative paths', async () => {
    const fx = makeFixture({
      'Cargo.toml': '[workspace]\nmembers = ["crates/*"]\n',
      'crates/a/Cargo.toml': '[package]\nname = "a"\n',
      'crates/a/src/lib.rs': 'pub fn a() {}\n',
      'crates/b/Cargo.toml': '[package]\nname = "b"\n',
      'crates/b/src/lib.rs': 'pub fn b() {}\n',
    });
    cleanup = fx.cleanup;
    const scope = await resolveScope({ path: fx.dir });
    const msg = { reason: 'compiler-message', message: { level: 'warning', message: 'w', code: { code: 'clippy::x' }, spans: [{ file_name: 'crates/b/src/lib.rs', line_start: 1, line_end: 1, column_start: 1, column_end: 2, is_primary: true }] } };
    const calls = recordCalls((_c, args) => (args.includes('--version') ? { code: 0, stdout: 'clippy 0.1.80' } : { code: 0, stdout: JSON.stringify(msg) }));
    const out = await runLinters({ scope, categories: ['lint'], only: ['clippy'], fix: false });
    const runs = calls.filter((c) => !c.args.includes('--version'));
    expect(runs).toHaveLength(1);
    expect(path.resolve(runs[0].cwd)).toBe(fx.dir);
    expect(out.diagnostics.map((d) => `${d.file}:${d.line}`)).toEqual(['crates/b/src/lib.rs:1']);
  });

  it('checkstyle and PMD never run without a config found in the repo', async () => {
    const fx = makeFixture({ 'pom.xml': '<project/>', 'src/main/java/A.java': 'class A {}\n' });
    cleanup = fx.cleanup;
    const scope = await resolveScope({ path: fx.dir });
    const calls = recordCalls(() => ({ code: 0 }));
    const out = await runLinters({ scope, categories: ['lint'], only: ['checkstyle', 'pmd'], fix: false });
    expect(out.runs.map((r) => r.status)).toEqual(['no-config', 'no-config']);
    expect(calls).toHaveLength(0);
  });
});

describe.runIf(onPath('ruff'))('integration: real ruff', () => {
  it('lints a Python project with its own config', async () => {
    const fx = makeFixture({
      'pyproject.toml': '[project]\nname = "demo"\n\n[tool.ruff]\nline-length = 100\n',
      'pkg/__init__.py': '',
      'pkg/mod.py': 'import os\n\n\ndef f(x):\n    return x == None\n',
    });
    try {
      const r = await collectLint({ path: fx.dir, linters: ['ruff'] }, ['lint']);
      expect(r.runs[0].status).toBe('ran');
      expect(r.diagnostics.map((d) => `${d.file}:${d.line}:${d.rule}`).sort()).toEqual(['pkg/mod.py:1:F401', 'pkg/mod.py:5:E711']);
    } finally {
      fx.cleanup();
    }
  }, 60_000);
});
