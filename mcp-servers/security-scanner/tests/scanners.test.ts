// SPDX-License-Identifier: MIT
/**
 * Scanner behaviour against faked CLIs: what is invoked, with which
 * arguments, and — above all — that a failing or missing tool surfaces as a
 * failure instead of "0 findings".
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { argAfter, fakeExec, resetExec } from './helpers/fake-exec.js';
import { scanDependencies } from '../src/scanners/dependencies.js';
import { scanSecrets } from '../src/scanners/secrets.js';
import { scanCode } from '../src/scanners/code.js';
import { scanContainer, scanIac } from '../src/scanners/container.js';
import { scanLicenses } from '../src/scanners/licenses.js';
import { scanAll } from '../src/scanners/all.js';
import { generateSbom } from '../src/scanners/sbom.js';

const trivyFixture = readFileSync(join(__dirname, 'fixtures', 'trivy-fs.json'), 'utf8');
const npmFixture = readFileSync(join(__dirname, 'fixtures', 'npm-audit-v2.json'), 'utf8');
const pipFixture = readFileSync(join(__dirname, 'fixtures', 'pip-audit.json'), 'utf8');
const semgrepFixture = readFileSync(join(__dirname, 'fixtures', 'semgrep.json'), 'utf8');

let root: string;
const w = (rel: string, content: string) => {
  const p = join(root, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, content);
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'secscan-test-'));
});
afterEach(() => {
  resetExec();
  rmSync(root, { recursive: true, force: true });
});

function monorepo() {
  w('web/package.json', '{"name":"web"}');
  w('web/package-lock.json', JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/lodash': { version: '4.17.15' }, 'node_modules/minimist': { version: '1.2.0' } } }));
  w('api/requirements.txt', 'django==3.2.0\n');
  w('svc/go.mod', 'module x\n');
  w('rust/Cargo.lock', 'version = 3\n');
  w('php/composer.lock', '{"packages":[]}');
  w('app/yarn.lock', '# yarn lockfile v1\n');
  w('ui/pnpm-lock.yaml', "lockfileVersion: '9.0'\n");
  w('node_modules/evil/package-lock.json', '{}'); // must never be discovered
}

describe('scan_dependencies', () => {
  it('discovers manifests recursively in a monorepo and falls back to native auditors (no broad engine)', async () => {
    monorepo();
    const calls = fakeExec({
      npm: () => ({ exitCode: 1, stdout: npmFixture }),
      'pip-audit': () => ({ exitCode: 1, stdout: pipFixture }),
      pnpm: () => ({ exitCode: 0, stdout: JSON.stringify({ advisories: {} }) }),
      yarn: () => ({ exitCode: 0, stdout: JSON.stringify({ type: 'auditSummary', data: {} }) }),
    });
    const r = await scanDependencies({ path: root, maxResults: 500 });

    const npmCall = calls.find((c) => c.tool === 'npm')!;
    expect(npmCall.cwd).toBe(join(root, 'web'));
    expect(npmCall.args).toEqual(['audit', '--json', '--package-lock-only']);
    // pip-audit audits the project's requirements, not the server's own environment (regression)
    const pipCall = calls.find((c) => c.tool === 'pip-audit')!;
    expect(argAfter(pipCall.args, '-r')).toBe(join(root, 'api', 'requirements.txt'));
    // yarn and pnpm lockfiles are audited by their own tools (regression: only npm was handled)
    expect(calls.find((c) => c.tool === 'pnpm')?.cwd).toBe(join(root, 'ui'));
    expect(calls.find((c) => c.tool === 'yarn')?.args).toEqual(['audit', '--json']);

    // lodash reported at its installed version
    expect(r.findings.find((f) => f.location.package === 'lodash')?.location.version).toBe('4.17.15');
    // uncovered ecosystems are listed, never silently treated as clean
    const gaps = r.notScanned!.map((g) => g.path).sort();
    expect(gaps).toEqual(['php/composer.lock', 'rust/Cargo.lock', 'svc/go.mod']);
    expect(r.status).toBe('partial');
    expect(JSON.stringify(r)).not.toContain('node_modules/evil');
  });

  it('uses trivy as the broad engine and only falls back for files trivy did not report', async () => {
    monorepo();
    const calls = fakeExec({
      trivy: (args) => {
        writeFileSync(argAfter(args, '--output')!, trivyFixture);
        return {};
      },
      npm: () => ({ stdout: npmFixture }),
    });
    const r = await scanDependencies({ path: root });
    const trivyCall = calls.find((c) => c.tool === 'trivy')!;
    expect(trivyCall.args[0]).toBe('fs');
    expect(argAfter(trivyCall.args, '--scanners')).toBe('vuln');
    expect(trivyCall.args.at(-1)).toBe(root);
    // trivy's fixture covers web/, api/, svc/, rust/, php/ — only yarn and pnpm are left
    expect(calls.some((c) => c.tool === 'npm')).toBe(false);
    expect(r.notScanned!.map((g) => g.path).sort()).toEqual(['app/yarn.lock', 'ui/pnpm-lock.yaml']);
    expect(r.engines[0]).toMatchObject({ engine: 'trivy', status: 'ok' });
    expect(r.findings.every((f) => f.source === 'trivy')).toBe(true);
  });

  it('a crashing auditor is a failure, not 0 findings (regression)', async () => {
    w('package-lock.json', '{"lockfileVersion":3,"packages":{}}');
    fakeExec({ npm: () => ({ exitCode: 1, stdout: '', stderr: 'npm ERR! network ECONNREFUSED' }) });
    const r = await scanDependencies({ path: root, engine: 'native' });
    expect(r.status).toBe('failed');
    expect(r.error).toMatch(/ECONNREFUSED/);
    expect(r.engines[0].status).toBe('failed');
  });

  it('a timed-out trivy is reported as failed with the reason', async () => {
    w('package-lock.json', '{}');
    fakeExec({ trivy: () => ({ timedOut: true, exitCode: null }) });
    const r = await scanDependencies({ path: root, engine: 'trivy', timeoutSeconds: 10 });
    expect(r.status).toBe('failed');
    expect(r.error).toMatch(/timed out/);
  });

  it('with nothing to scan, says so (skipped) instead of ok/0', async () => {
    w('README.md', '# hi');
    fakeExec({});
    const r = await scanDependencies({ path: root });
    expect(r.status).toBe('skipped');
    expect(r.warnings[0]).toMatch(/No dependency manifests/);
  });

  it('flags package.json without a lockfile, but not workspace members under a root lockfile', async () => {
    w('package-lock.json', '{}');
    w('package.json', '{}');
    w('packages/a/package.json', '{}');
    w('other/package.json', '{}');
    fakeExec({ npm: () => ({ stdout: JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} }) }) });
    const r = await scanDependencies({ path: root, engine: 'native' });
    expect(r.notScanned ?? []).toEqual([]);
    rmSync(join(root, 'package-lock.json'));
    const r2 = await scanDependencies({ path: root, engine: 'native' });
    expect(r2.notScanned?.map((g) => g.path).sort()).toEqual(['other/package.json', 'package.json', 'packages/a/package.json']);
  });

  it('applies the severity threshold and the result cap with an explicit truncated flag', async () => {
    w('web/package-lock.json', '{"lockfileVersion":3,"packages":{}}');
    fakeExec({ npm: () => ({ stdout: npmFixture }) });
    const r = await scanDependencies({ path: root, engine: 'native', severityThreshold: 'HIGH', maxResults: 1 });
    expect(r.findings).toHaveLength(1);
    expect(r.truncated).toBe(true);
    expect(r.totalFindings).toBeGreaterThan(1);
    expect(r.belowThreshold).toBeGreaterThan(0);
    expect(r.findings[0].severity).toBe('CRITICAL');
  });
});

describe('scan_secrets', () => {
  const gitleaksReport = (file: string) =>
    JSON.stringify([
      { RuleID: 'aws-access-token', Description: 'AWS', File: file, StartLine: 1, Secret: 'REDACTED', Match: 'REDACTED' },
      { RuleID: 'generic-api-key', Description: 'Generic', File: join(root, 'fixtures', 'x.env'), StartLine: 2, Secret: 'REDACTED' },
    ]);

  it('gitleaks writes to a temp report file, never /dev/stdout (regression: broke on Windows)', async () => {
    const calls = fakeExec({
      gitleaks: (args) => {
        writeFileSync(argAfter(args, '--report-path')!, gitleaksReport(join(root, 'config.env')));
        return {};
      },
    });
    const r = await scanSecrets({ path: root });
    const call = calls.find((c) => c.tool === 'gitleaks')!;
    expect(call.args[0]).toBe('dir');
    expect(argAfter(call.args, '--report-path')).not.toBe('/dev/stdout');
    expect(call.args).toContain('--redact');
    expect(r.status).toBe('ok');
    expect(r.findings.map((f) => [f.location.file, f.severity])).toEqual([
      ['config.env', 'CRITICAL'],
      ['fixtures/x.env', 'MEDIUM'],
    ]);
  });

  it('honours excludePaths for external engines (regression: ignored by gitleaks/trufflehog)', async () => {
    fakeExec({
      gitleaks: (args) => {
        writeFileSync(argAfter(args, '--report-path')!, gitleaksReport(join(root, 'config.env')));
        return {};
      },
    });
    const r = await scanSecrets({ path: root, excludePaths: ['fixtures'] });
    expect(r.findings.map((f) => f.location.file)).toEqual(['config.env']);
    expect(r.excludedByPath).toBe(1);
  });

  it('a gitleaks crash is a failure, not 0 findings (regression)', async () => {
    fakeExec({ gitleaks: () => ({ exitCode: 126, stderr: 'fatal: bad config' }) });
    const r = await scanSecrets({ path: root });
    expect(r.status).toBe('failed');
    expect(r.error).toMatch(/bad config/);
  });

  it('history scan with trufflehog passes a file:// URL, not a raw path (regression)', async () => {
    const calls = fakeExec({
      git: (args) => ({ stdout: args[0] === 'rev-parse' ? 'true\n' : '' }),
      trufflehog: () => ({ stdout: '' }),
    });
    const r = await scanSecrets({ path: root, tool: 'trufflehog', scanHistory: true });
    const gitCall = calls.find((c) => c.tool === 'trufflehog' && c.args[0] === 'git')!;
    expect(gitCall.args[1]).toBe(`file://${root.replace(/\\/g, '/')}`);
    expect(gitCall.args).toContain('--no-verification');
    const fsCall = calls.find((c) => c.tool === 'trufflehog' && c.args[0] === 'filesystem')!;
    expect(fsCall.args).toContain('--exclude-paths');
    expect(r.extra?.historyScanned).toBe(true);
  });

  it('the built-in fallback says it cannot scan history instead of silently ignoring scanHistory (regression)', async () => {
    w('app.js', `const k = "${'AKIA'}${'Q3EGUIWPLHZ6S2VR'}";\n`);
    fakeExec({ git: () => ({ stdout: 'true\n' }) });
    const r = await scanSecrets({ path: root, scanHistory: true });
    expect(r.scanner).toBe('builtin-secrets');
    expect(r.status).toBe('partial');
    expect(r.warnings.join(' ')).toMatch(/cannot scan git history/);
    expect(r.findings[0]).toMatchObject({ id: 'builtin-aws-access-key-id', location: { file: 'app.js', line: 1 } });
  });

  it('a requested tool that is not installed is "unavailable" with an install hint', async () => {
    fakeExec({});
    const r = await scanSecrets({ path: root, tool: 'gitleaks' });
    expect(r.status).toBe('unavailable');
    expect(r.error).toMatch(/Install:/);
  });

  it('diff mode scans only files changed since baseRef', async () => {
    w('changed.js', `x = "${'ghp_'}${'a'.repeat(36)}"\n`);
    w('old.js', `x = "${'ghp_'}${'b'.repeat(36)}"\n`);
    const calls = fakeExec({
      git: (args) => {
        if (args[0] === 'merge-base') return { stdout: 'abc123\n' };
        if (args.includes('diff')) return { stdout: 'changed.js\0' };
        return { stdout: '' };
      },
    });
    const r = await scanSecrets({ path: root, tool: 'builtin', baseRef: 'main' });
    expect(r.diffBase).toBe('abc123');
    expect(r.findings.map((f) => f.location.file)).toEqual(['changed.js']);
    const diff = calls.find((c) => c.tool === 'git' && c.args.includes('diff'))!;
    expect(diff.args).toContain('abc123');
  });

  it('rejects a baseRef that could be read as an option', async () => {
    fakeExec({ git: () => ({ stdout: '' }) });
    await expect(scanSecrets({ path: root, tool: 'builtin', baseRef: '--output=/tmp/x' })).rejects.toThrow(/Invalid baseRef/);
  });
});

describe('scan_code', () => {
  it('passes rulesets as single --config=<x> args and filters by severity', async () => {
    const calls = fakeExec({ semgrep: () => ({ stdout: semgrepFixture.replace(/C:\\\\project\\\\/g, root.replace(/\\/g, '\\\\') + '\\\\') }) });
    const r = await scanCode({ path: root, rules: ['p/owasp-top-ten', 'p/python'], severityThreshold: 'HIGH' });
    const args = calls[0].args;
    expect(args).toEqual(expect.arrayContaining(['--config=p/owasp-top-ten', '--config=p/python', '--json', '--metrics=off']));
    expect(r.status).toBe('ok');
    expect(r.findings.every((f) => f.severity === 'HIGH')).toBe(true);
    expect(r.belowThreshold).toBe(1);
  });

  it('a semgrep crash with no JSON is a failure (regression: parsed "{}" as 0 findings)', async () => {
    fakeExec({ semgrep: () => ({ exitCode: 2, stdout: '', stderr: 'Invalid config' }) });
    const r = await scanCode({ path: root });
    expect(r.status).toBe('failed');
    expect(r.error).toMatch(/Invalid config/);
  });

  it('rejects a rule that looks like a flag', async () => {
    fakeExec({ semgrep: () => ({ stdout: '{"results":[]}' }) });
    await expect(scanCode({ path: root, rules: ['--dangerous'] })).rejects.toThrow(/Invalid semgrep/);
  });

  it('is "unavailable" with an install hint when semgrep is missing', async () => {
    fakeExec({});
    const r = await scanCode({ path: root });
    expect(r.status).toBe('unavailable');
    expect(r.error).toMatch(/semgrep/);
  });
});

describe('scan_container / scan_iac', () => {
  it('filesystem scans enable the misconfig scanner and keep secrets and licenses (regression)', async () => {
    const calls = fakeExec({
      trivy: (args) => {
        writeFileSync(argAfter(args, '--output')!, trivyFixture);
        return {};
      },
    });
    const r = await scanContainer({ target: root, type: 'filesystem', includeLicenses: true, maxResults: 1000 });
    expect(argAfter(calls[0].args, '--scanners')).toBe('vuln,secret,misconfig,license');
    const cats = new Set(r.findings.map((f) => f.category));
    expect(cats).toEqual(new Set(['vulnerability', 'misconfiguration', 'secret', 'license']));
  });

  it('image scans pass --timeout matching ours so trivy does not abort at its 5m default', async () => {
    const calls = fakeExec({
      trivy: (args) => {
        writeFileSync(argAfter(args, '--output')!, JSON.stringify({ ArtifactName: 'alpine:3.20', Results: [] }));
        return {};
      },
    });
    const r = await scanContainer({ target: 'alpine:3.20', type: 'image', timeoutSeconds: 1200 });
    expect(argAfter(calls[0].args, '--timeout')).toBe('1200s');
    expect(calls[0].args.slice(-2)).toEqual(['--', 'alpine:3.20']);
    expect(r.status).toBe('ok');
  });

  it('a trivy failure (e.g. image not found) is failed, not 0 findings (regression)', async () => {
    fakeExec({ trivy: () => ({ exitCode: 1, stderr: 'FATAL unable to find the specified image' }) });
    const r = await scanContainer({ target: 'nope:latest', type: 'image' });
    expect(r.status).toBe('failed');
    expect(r.error).toMatch(/unable to find/);
  });

  it('scan_iac reports misconfigurations per IaC type', async () => {
    const calls = fakeExec({
      trivy: (args) => {
        writeFileSync(argAfter(args, '--output')!, trivyFixture);
        return {};
      },
    });
    const r = await scanIac({ path: root, maxResults: 1000 });
    expect(calls[0].args[0]).toBe('config');
    expect(r.findings.every((f) => f.category === 'misconfiguration')).toBe(true);
    expect(r.extra?.iacTypes).toEqual(expect.arrayContaining(['dockerfile', 'kubernetes', 'terraform']));
  });
});

describe('scan_licenses', () => {
  const osvWithLicenses = (dir: string) =>
    JSON.stringify({
      results: [
        {
          source: { path: join(dir, 'package-lock.json'), type: 'lockfile' },
          packages: [
            { package: { name: 'a', version: '1.0.0', ecosystem: 'npm' }, licenses: ['MIT'] },
            { package: { name: 'b', version: '1.0.0', ecosystem: 'npm' }, licenses: ['GPL-3.0-only'] },
            { package: { name: 'c', version: '1.0.0', ecosystem: 'npm' }, licenses: ['MIT OR GPL-3.0-only'] },
            { package: { name: 'd', version: '1.0.0', ecosystem: 'npm' }, licenses: ['UNKNOWN'] },
            { package: { name: 'e', version: '1.0.0', ecosystem: 'npm' }, licenses: ['MPL-2.0'] },
          ],
        },
      ],
    });

  it('evaluates allow/deny policy with SPDX expressions', async () => {
    fakeExec({
      'osv-scanner': (args) => {
        writeFileSync(argAfter(args, '--output-file')!, osvWithLicenses(root));
        return {};
      },
    });
    const r = await scanLicenses({ path: root, allow: ['MIT', 'Apache-2.0'], deny: ['GPL-3.0-only'] });
    const verdicts = Object.fromEntries(r.findings.map((f) => [f.location.package, f.metadata?.verdict]));
    expect(verdicts).toEqual({ b: 'denied', d: 'unknown', e: 'not-allowed' });
    expect(r.extra?.packagesChecked).toBe(5);
  });
});

describe('scan_all', () => {
  it('reports each sub-scan with a status and reason; missing container target is skipped, not dropped (regression)', async () => {
    w('package-lock.json', '{"lockfileVersion":3,"packages":{}}');
    fakeExec({ npm: () => ({ stdout: JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} }) }) });
    const r = await scanAll({ path: root, include: ['dependencies', 'code', 'iac', 'container', 'secrets'] });
    expect(r.scans.dependencies?.status).toBe('partial'); // native only: broad engine missing is a warning
    expect(r.scans.code).toMatchObject({ status: 'skipped' });
    expect(r.scans.code?.reason).toMatch(/not installed/);
    expect(r.scans.iac?.status).toBe('skipped');
    expect(r.scans.container).toMatchObject({ status: 'skipped', reason: expect.stringMatching(/containerTarget/) });
    expect(r.scans.secrets).toMatchObject({ status: 'partial', reason: expect.stringMatching(/built-in patterns/) });
    expect(r.status).toBe('partial');
  });

  it('passes the severity threshold through to every sub-scan', async () => {
    w('web/package-lock.json', '{"lockfileVersion":3,"packages":{}}');
    fakeExec({ npm: () => ({ stdout: npmFixture }) });
    const r = await scanAll({ path: root, include: ['dependencies'], severityThreshold: 'CRITICAL' });
    const findings = r.scans.dependencies!.result!.findings;
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.severity === 'CRITICAL')).toBe(true);
  });
});

describe('generate_sbom', () => {
  it('refuses to overwrite an existing outputFile unless overwrite is set', async () => {
    w('out.json', 'keep me');
    fakeExec({
      trivy: (args) => {
        writeFileSync(argAfter(args, '--output')!, JSON.stringify({ bomFormat: 'CycloneDX', components: [{ name: 'a', version: '1' }] }));
        return {};
      },
    });
    await expect(generateSbom({ path: root, outputFile: join(root, 'out.json') })).rejects.toThrow(/already exists/);
    expect(readFileSync(join(root, 'out.json'), 'utf8')).toBe('keep me');
    const r = await generateSbom({ path: root, outputFile: join(root, 'out.json'), overwrite: true });
    expect(r).toMatchObject({ status: 'ok', engine: 'trivy', componentCount: 1 });
    expect(JSON.parse(readFileSync(join(root, 'out.json'), 'utf8')).bomFormat).toBe('CycloneDX');
  });

  it('reports unavailable when no SBOM engine is installed', async () => {
    fakeExec({});
    const r = await generateSbom({ path: root });
    expect(r.status).toBe('unavailable');
  });
});
