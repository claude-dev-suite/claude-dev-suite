// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { cvss3BaseScore, severityFromScore } from '../src/utils/cvss.js';
import { redactDeep, redactText } from '../src/utils/redact.js';
import { toSarif } from '../src/utils/sarif.js';
import { defaultRunner, parseCmdShim, runTool } from '../src/utils/exec.js';
import { makeExcludeMatcher, safeGlobToRegex } from '../src/utils/paths.js';
import { parseJsonStream } from '../src/utils/report-file.js';
import { buildResult, normalizeSeverity } from '../src/utils/normalizer.js';
import { evaluateLicense } from '../src/scanners/licenses.js';
import { schemas, jsonSchemaFor, type ToolName } from '../src/tools.js';
import type { SecurityFinding } from '../src/types.js';

describe('cvss', () => {
  it('matches reference CVSS 3.1 base scores', () => {
    expect(cvss3BaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toBe(9.8);
    expect(cvss3BaseScore('CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H')).toBe(7.2);
    expect(cvss3BaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L')).toBe(5.3);
    expect(cvss3BaseScore('CVSS:3.0/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N')).toBe(6.1);
    expect(cvss3BaseScore('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N')).toBe(0);
    expect(cvss3BaseScore('AV:N/AC:L/Au:N/C:P/I:P/A:P')).toBeNull();
  });
  it('maps scores to the qualitative scale', () => {
    expect([9.8, 7.0, 5.3, 0.1, 0, undefined].map(severityFromScore)).toEqual(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO', 'UNKNOWN']);
  });
});

describe('severity normalisation', () => {
  it('never guesses MEDIUM for an unknown word', () => {
    expect(normalizeSeverity('weird')).toBe('UNKNOWN');
    expect(normalizeSeverity(undefined)).toBe('UNKNOWN');
    expect(normalizeSeverity('moderate')).toBe('MEDIUM');
    expect(normalizeSeverity('ERROR', 'semgrep')).toBe('HIGH');
  });
});

describe('buildResult', () => {
  it('never reports ok when every engine failed', () => {
    const r = buildResult({ scanType: 'code', engines: [{ engine: 'x', status: 'failed', error: 'boom' }], findings: [], startedAt: Date.now() });
    expect(r.status).toBe('failed');
    expect(r.error).toMatch(/boom/);
  });
  it('keeps UNKNOWN-severity findings under a threshold', () => {
    const f = (severity: SecurityFinding['severity']): SecurityFinding => ({ id: severity, severity, category: 'vulnerability', source: 'pip-audit', title: '', description: '', location: {} });
    const r = buildResult({ scanType: 'dependencies', engines: [{ engine: 'x', status: 'ok' }], findings: [f('LOW'), f('UNKNOWN'), f('HIGH')], startedAt: 0, severityThreshold: 'HIGH' });
    expect(r.findings.map((x) => x.id)).toEqual(['HIGH', 'UNKNOWN']);
    expect(r.belowThreshold).toBe(1);
  });
});

describe('redaction', () => {
  it('redacts credentials in URLs and well-known token formats', () => {
    const t = redactText(`postgres://admin:${'hunter2'}@db:5432/x token ${'ghp_'}${'x'.repeat(36)} key ${'AKIA'}${'ABCDEFGHIJKLMNOP'} password=${'s3cretvalue'}`);
    expect(t).not.toMatch(/hunter2|xxxxxxxx|ABCDEFGHIJKLMNOP|s3cretvalue/);
    expect(t).toMatch(/postgres:\/\/admin:\*\*\*@db/);
  });
  it('walks nested values', () => {
    expect(redactDeep({ a: [{ b: `https://u:${'pw123456'}@h` }] })).toEqual({ a: [{ b: 'https://u:***@h' }] });
  });
  it('leaves advisory text alone', () => {
    const s = 'CVE-2021-35042: potential SQL injection via QuerySet.order_by()';
    expect(redactText(s)).toBe(s);
  });
});

describe('sarif', () => {
  it('emits one run per engine with security-severity and relative locations', () => {
    const findings: SecurityFinding[] = [
      { id: 'CVE-1', severity: 'CRITICAL', category: 'vulnerability', source: 'trivy', title: 'bad', description: 'd', location: { file: 'web/package-lock.json', package: 'lodash', version: '1.0.0' }, fix: { fixedVersions: ['1.0.1'] } },
      { id: 'rule.x', severity: 'MEDIUM', category: 'code-smell', source: 'semgrep', title: 't', description: 'd', location: { file: 'src/a.py', line: 3 } },
    ];
    const r = buildResult({ scanType: 'code', engines: [{ engine: 'trivy', status: 'ok' }, { engine: 'semgrep', status: 'ok' }], findings, startedAt: 0 });
    const sarif = toSarif([r]) as { version: string; runs: Array<{ tool: { driver: { name: string; rules: Array<{ properties: Record<string, string> }> } }; results: Array<Record<string, any>> }> };
    expect(sarif.version).toBe('2.1.0');
    const trivy = sarif.runs.find((x) => x.tool.driver.name === 'trivy')!;
    expect(trivy.tool.driver.rules[0].properties['security-severity']).toBe('9.5');
    expect(trivy.results[0].level).toBe('error');
    expect(trivy.results[0].message.text).toMatch(/Fixed in: 1\.0\.1/);
    const semgrep = sarif.runs.find((x) => x.tool.driver.name === 'semgrep')!;
    expect(semgrep.results[0].locations[0].physicalLocation).toEqual({ artifactLocation: { uri: 'src/a.py' }, region: { startLine: 3 } });
  });
});

describe('exec', () => {
  it('finds the JS entry of npm and corepack cmd shims', () => {
    const dir = mkdtempSync(join(tmpdir(), 'shim-'));
    try {
      const npmCli = join(dir, 'node_modules', 'npm', 'bin');
      const corepack = join(dir, 'node_modules', 'corepack', 'dist');
      for (const [d, f] of [[npmCli, 'npm-cli.js'], [npmCli, 'npm-prefix.js'], [corepack, 'pnpm.js']]) {
        mkdirSync(d, { recursive: true });
        writeFileSync(join(d, f), '');
      }
      const npmShim = '@ECHO OFF\nSET "NPM_PREFIX_JS=%~dp0\\node_modules\\npm\\bin\\npm-prefix.js"\nSET "NPM_CLI_JS=%~dp0\\node_modules\\npm\\bin\\npm-cli.js"\n"%NODE_EXE%" "%NPM_CLI_JS%" %*\n';
      expect(parseCmdShim(join(dir, 'npm.cmd'), npmShim)).toBe(join(npmCli, 'npm-cli.js'));
      const pnpmShim = '@IF EXIST "%~dp0\\node.exe" (\n  "%~dp0\\node.exe"  "%~dp0\\node_modules\\corepack\\dist\\pnpm.js" %*\n)';
      expect(parseCmdShim(join(dir, 'pnpm.CMD'), pnpmShim)).toBe(join(corepack, 'pnpm.js'));
      expect(parseCmdShim(join(dir, 'x.cmd'), '@echo off\ncalc.exe %*')).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const node = { command: process.execPath, prefixArgs: [], source: 'node' };

  it('kills a process at the timeout and reports it', async () => {
    await expect(runTool(node, ['-e', 'setTimeout(() => {}, 20000)'], { cwd: tmpdir(), timeoutMs: 300 }, 'sleeper')).rejects.toThrow(/timed out/);
  });

  it('caps stdout and refuses to hand back truncated output', async () => {
    await expect(
      runTool(node, ['-e', 'process.stdout.write("x".repeat(200000))'], { cwd: tmpdir(), timeoutMs: 10000, maxOutputBytes: 1000 }, 'chatty')
    ).rejects.toThrow(/more than/);
  });

  it('returns non-zero exit codes to the caller with stderr', async () => {
    const r = await defaultRunner(node, ['-e', 'console.error("bad"); process.exit(3)'], { cwd: tmpdir(), timeoutMs: 10000 });
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toMatch(/bad/);
  });
});

describe('paths', () => {
  it('exclude matcher: segments, sub-paths and globs', () => {
    const m = makeExcludeMatcher(['dist', 'src/gen', '*.min.js']);
    expect(m('dist/a.js')).toBe(true);
    expect(m('pkg/dist/a.js')).toBe(true);
    expect(m('src/gen/x.ts')).toBe(true);
    expect(m('app.min.js')).toBe(true);
    expect(m('rebuild/dist.ts')).toBe(false);
    expect(m('src/generated.ts')).toBe(false);
  });
  it('safeGlobToRegex rejects ReDoS shapes and overlong patterns', () => {
    expect(() => safeGlobToRegex('(a+)+')).toThrow(/ReDoS/);
    expect(() => safeGlobToRegex('a'.repeat(501))).toThrow(/too long/);
    expect(safeGlobToRegex('**/*.map').test('a/b/c.map')).toBe(true);
  });
});

describe('parseJsonStream', () => {
  it('splits pretty-printed concatenated objects and skips log lines', () => {
    const text = 'log line\n{\n  "a": "}{"\n}\n{"b": [1, {"c": 2}]}\nanother log\n';
    const r = parseJsonStream(text);
    expect(r.values).toEqual([{ a: '}{' }, { b: [1, { c: 2 }] }]);
    expect(r.skipped).toBe(2);
  });
});

describe('license policy', () => {
  it('evaluates SPDX expressions against allow/deny lists', () => {
    expect(evaluateLicense('MIT', ['MIT'], [])).toBe('allowed');
    expect(evaluateLicense('GPL-3.0-only', [], ['GPL-3.0-only'])).toBe('denied');
    expect(evaluateLicense('MIT OR GPL-3.0-only', [], ['GPL-3.0-only'])).toBe('allowed');
    expect(evaluateLicense('MIT AND GPL-3.0-only', [], ['gpl-3.0-only'])).toBe('denied');
    expect(evaluateLicense('(MIT OR Apache-2.0) AND BSD-3-Clause', ['MIT', 'BSD-3-Clause'], [])).toBe('allowed');
    expect(evaluateLicense('MPL-2.0', ['MIT'], [])).toBe('not-allowed');
    expect(evaluateLicense('GPL-2.0-only WITH Classpath-exception-2.0', [], ['GPL-2.0-only'])).toBe('denied');
    expect(evaluateLicense('non-standard', ['MIT'], [])).toBe('unknown');
  });
});

describe('catalog consistency', () => {
  const dir = join(__dirname, '..');
  const metadata = JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const index = readFileSync(join(dir, 'src', 'index.ts'), 'utf8');

  it('metadata.tools, the ListTools literal and the dispatch schemas agree', () => {
    const listed = [...index.matchAll(/name:\s*'([a-z_]+)',\s*\n\s*description:/g)].map((m) => m[1]);
    expect(new Set(listed)).toEqual(new Set(metadata.tools));
    expect(new Set(Object.keys(schemas))).toEqual(new Set(metadata.tools));
  });

  it('package.json version equals the version passed to new Server()', () => {
    expect(index).toContain(`version: '${pkg.version}'`);
  });

  it('every input schema is a JSON-Schema object', () => {
    for (const name of Object.keys(schemas) as ToolName[]) expect(jsonSchemaFor(name).type).toBe('object');
  });
});
