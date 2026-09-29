// SPDX-License-Identifier: MIT
/**
 * Parser tests against real tool output captured from trivy 0.74, osv-scanner
 * 2.6, npm 10.9, pip-audit 2.10, semgrep 1.178 and gitleaks 8.30 (trimmed,
 * secrets removed), plus hand-written fixtures in the documented shapes of
 * govulncheck 1.x, cargo-audit, yarn and pnpm.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseTrivyReport } from '../src/parsers/trivy.js';
import { parseOsvReport } from '../src/parsers/osv.js';
import { lockfileVersions, parseNpmAudit, parsePnpmAudit, parseYarnAudit } from '../src/parsers/js-audit.js';
import { parseCargoAudit, parseGovulncheck, parsePipAudit } from '../src/parsers/native-audit.js';
import { gitleaksSeverity, parseGitleaks, parseTrufflehog } from '../src/parsers/secrets.js';
import { parseSemgrep } from '../src/parsers/semgrep.js';

const fx = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));
const id = (p: string) => p;

describe('trivy', () => {
  const parsed = parseTrivyReport(fx('trivy-fs.json'));

  it('reads vulnerabilities, misconfigurations, secrets and licenses from one report', () => {
    const cats = new Set(parsed.findings.map((f) => f.category));
    expect(cats).toEqual(new Set(['vulnerability', 'misconfiguration', 'secret', 'license']));
  });

  it('reports the installed version and the fixed versions as structured data', () => {
    const v = parsed.findings.find((f) => f.id === 'CVE-2021-35042')!;
    expect(v.location).toMatchObject({ package: 'django', version: '3.2.0', file: 'api/requirements.txt' });
    expect(v.fix?.fixedVersions).toEqual(['3.2.5', '3.1.13']);
    expect(v.severity).toBe('CRITICAL');
  });

  it('lists every scanned target, including lockfiles with no vulnerabilities', () => {
    const langTargets = parsed.targets.filter((t) => t.class === 'lang-pkgs').map((t) => t.target);
    expect(langTargets).toContain('rust/Cargo.lock');
  });

  it('never copies the secret match or code lines out of a secret result', () => {
    const s = parsed.findings.filter((f) => f.category === 'secret');
    expect(s.length).toBeGreaterThan(0);
    expect(JSON.stringify(s)).not.toMatch(/TAILFAKE|\*\*\*\*/);
  });

  it('keeps only failed misconfiguration checks', () => {
    const report = { Results: [{ Target: 'Dockerfile', Class: 'config', Misconfigurations: [{ ID: 'A', Status: 'PASS', Severity: 'HIGH' }, { ID: 'B', Status: 'FAIL', Severity: 'LOW' }] }] };
    expect(parseTrivyReport(report).findings.map((f) => f.id)).toEqual(['B']);
  });

  it('throws on a non-object report instead of returning nothing', () => {
    expect(() => parseTrivyReport(null)).toThrow();
  });
});

describe('osv-scanner', () => {
  const parsed = parseOsvReport(fx('osv.json'), (p) => p.replace('/project/', ''));

  it('emits one finding per alias group, not per OSV record', () => {
    const django = parsed.findings.filter((f) => f.location.package === 'django');
    expect(django.length).toBe(2);
    expect(django[0].aliases).toContain('CVE-2021-35042');
  });

  it('derives severity from the group max_severity CVSS score', () => {
    const f = parsed.findings.find((x) => x.aliases?.includes('CVE-2021-35042'))!;
    expect(f.severity).toBe('CRITICAL');
    expect(f.fix?.fixedVersions).toEqual(expect.arrayContaining(['3.2.5']));
  });

  it('records which sources were scanned (coverage)', () => {
    expect(parsed.sources.map((s) => s.path)).toEqual(expect.arrayContaining(['api/requirements.txt', 'web/package-lock.json', 'rust/Cargo.lock']));
  });

  it('rejects output without a results array', () => {
    expect(() => parseOsvReport({})).toThrow(/results/);
  });
});

describe('npm audit (v2 report)', () => {
  const lock = {
    lockfileVersion: 3,
    packages: { '': {}, 'node_modules/lodash': { version: '4.17.15' }, 'node_modules/minimist': { version: '1.2.0' } },
  };

  it('reports the INSTALLED version from the lockfile, not the advisory range (regression)', () => {
    const findings = parseNpmAudit(fx('npm-audit-v2.json'), 'web/package-lock.json', lock);
    const lodash = findings.filter((f) => f.location.package === 'lodash');
    expect(lodash.length).toBeGreaterThan(0);
    for (const f of lodash) {
      expect(f.location.version).toBe('4.17.15');
      expect(f.location.version).not.toMatch(/[<>]/);
      expect(f.metadata?.vulnerableRange).toMatch(/[<>]/);
    }
    expect(lodash[0].id).toMatch(/^GHSA-/);
  });

  it('maps nested node_modules paths from lockfile v1 trees', () => {
    const m = lockfileVersions({ dependencies: { a: { version: '1.0.0', dependencies: { b: { version: '2.0.0' } } } } });
    expect(m.get('node_modules/a/node_modules/b')).toBe('2.0.0');
  });

  it('turns an npm error object into an error, not zero findings', () => {
    expect(() => parseNpmAudit({ error: { code: 'ENOLOCK', summary: 'no lockfile' } }, 'package.json')).toThrow(/no lockfile/);
  });
});

describe('pnpm / yarn', () => {
  const advisory = {
    id: 1,
    module_name: 'lodash',
    severity: 'high',
    title: 'Prototype Pollution',
    url: 'https://github.com/advisories/GHSA-p6mc-m468-83gw',
    vulnerable_versions: '<4.17.19',
    patched_versions: '>=4.17.19',
    findings: [{ version: '4.17.15', paths: ['lodash'] }],
    cves: ['CVE-2020-8203'],
  };

  it('parses pnpm audit (npm v6 advisory shape)', () => {
    const [f] = parsePnpmAudit({ advisories: { 1: advisory } }, 'pnpm-lock.yaml');
    expect(f).toMatchObject({ id: 'GHSA-p6mc-m468-83gw', severity: 'HIGH', source: 'pnpm-audit' });
    expect(f.location.version).toBe('4.17.15');
    expect(f.fix?.fixedVersions).toEqual(['>=4.17.19']);
  });

  it('parses yarn classic NDJSON and merges duplicate advisory lines', () => {
    const text = [
      JSON.stringify({ type: 'auditAdvisory', data: { resolution: { path: 'a>lodash' }, advisory } }),
      JSON.stringify({ type: 'auditAdvisory', data: { resolution: { path: 'b>lodash' }, advisory } }),
      JSON.stringify({ type: 'auditSummary', data: {} }),
    ].join('\n');
    const findings = parseYarnAudit(text, 'yarn.lock');
    expect(findings).toHaveLength(1);
  });

  it('parses yarn berry v4 NDJSON', () => {
    const text = JSON.stringify({
      value: 'lodash',
      children: { ID: 1106913, Issue: 'Command Injection in lodash', URL: 'https://github.com/advisories/GHSA-35jh-r3h4-6jhm', Severity: 'high', 'Vulnerable Versions': '<4.17.21', 'Tree Versions': ['4.17.15'], Dependents: ['web@workspace:.'] },
    });
    const [f] = parseYarnAudit(text, 'yarn.lock');
    expect(f).toMatchObject({ id: 'GHSA-35jh-r3h4-6jhm', severity: 'HIGH' });
    expect(f.location.version).toBe('4.17.15');
  });

  it('errors on unrecognised yarn output', () => {
    expect(() => parseYarnAudit('{"foo":1}', 'yarn.lock')).toThrow();
  });
});

describe('pip-audit (2.x)', () => {
  it('parses the {dependencies:[...]} object that pip-audit 2.x emits (regression: code expected an array)', () => {
    const findings = parsePipAudit(fx('pip-audit.json'), 'api/requirements.txt');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].location).toMatchObject({ package: 'django', ecosystem: 'PyPI' });
  });

  it('does not fabricate severity (regression: HIGH whenever a fix existed)', () => {
    const findings = parsePipAudit(fx('pip-audit.json'), 'api/requirements.txt');
    expect(findings.every((f) => f.severity === 'UNKNOWN')).toBe(true);
    expect(findings[0].fix?.fixedVersions?.length).toBeGreaterThan(0);
  });

  it('throws on output that has no dependencies', () => {
    expect(() => parsePipAudit({ nope: 1 }, 'r.txt')).toThrow();
  });
});

describe('govulncheck (1.x streaming JSON)', () => {
  // govulncheck -json prints pretty-printed objects back to back.
  const stream = [
    { config: { protocol_version: 'v1.0.0', scanner_name: 'govulncheck' } },
    { progress: { message: 'Scanning your code...' } },
    { osv: { id: 'GO-2021-0113', summary: 'Out-of-bounds read in golang.org/x/text/language', aliases: ['CVE-2021-38561'], database_specific: { url: 'https://pkg.go.dev/vuln/GO-2021-0113' } } },
    { finding: { osv: 'GO-2021-0113', fixed_version: 'v0.3.7', trace: [{ module: 'golang.org/x/text', version: 'v0.3.5' }] } },
    { finding: { osv: 'GO-2021-0113', fixed_version: 'v0.3.7', trace: [{ module: 'golang.org/x/text', version: 'v0.3.5', package: 'golang.org/x/text/language', function: 'Parse' }, { module: 'example.com/svc', package: 'example.com/svc', function: 'main' }] } },
  ]
    .map((o) => JSON.stringify(o, null, 2))
    .join('\n');

  it('reads osv/finding messages (regression: old parser read entry.vulnerability and always found 0)', () => {
    const findings = parseGovulncheck(stream, 'svc/go.mod');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: 'GO-2021-0113', location: { package: 'golang.org/x/text', version: 'v0.3.5' } });
    expect(findings[0].fix?.fixedVersions).toEqual(['v0.3.7']);
  });

  it('keeps the strongest reachability and does not invent a severity', () => {
    const [f] = parseGovulncheck(stream, 'svc/go.mod');
    expect(f.metadata?.reachability).toBe('symbol');
    expect(f.severity).toBe('UNKNOWN');
  });

  it('throws when the stream holds nothing recognisable', () => {
    expect(() => parseGovulncheck('go: command not found', 'go.mod')).toThrow();
  });
});

describe('cargo-audit', () => {
  it('computes severity from the advisory CVSS vector', () => {
    const report = {
      vulnerabilities: {
        found: true,
        count: 1,
        list: [
          {
            advisory: { id: 'RUSTSEC-2021-0003', title: 'Buffer overflow in SmallVec::insert_many', cvss: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', url: 'https://github.com/servo/rust-smallvec/issues/252' },
            versions: { patched: ['>=1.6.1'] },
            package: { name: 'smallvec', version: '1.6.0' },
          },
        ],
      },
      warnings: { unmaintained: [{ kind: 'unmaintained', advisory: { id: 'RUSTSEC-2020-0036', title: 'failure is unmaintained' }, package: { name: 'failure', version: '0.1.8' } }] },
    };
    const findings = parseCargoAudit(report, 'Cargo.lock');
    expect(findings[0]).toMatchObject({ id: 'RUSTSEC-2021-0003', severity: 'CRITICAL', location: { version: '1.6.0' } });
    expect(findings[0].fix?.fixedVersions).toEqual(['>=1.6.1']);
    expect(findings[1]).toMatchObject({ id: 'RUSTSEC-2020-0036', severity: 'INFO' });
  });
});

describe('secret parsers', () => {
  it('gitleaks: relative paths, commit, and rule-based severity instead of blanket HIGH', () => {
    const findings = parseGitleaks(fx('gitleaks-git.json'), id);
    const pat = findings.find((f) => f.id === 'github-pat')!;
    expect(pat.severity).toBe('CRITICAL');
    expect(pat.location.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(findings.find((f) => f.id === 'generic-api-key')!.severity).toBe('MEDIUM');
    expect(JSON.stringify(findings)).not.toContain('REDACTED"');
  });

  it('gitleaks severity map', () => {
    expect(gitleaksSeverity('private-key')).toBe('CRITICAL');
    expect(gitleaksSeverity('aws-access-token')).toBe('CRITICAL');
    expect(gitleaksSeverity('jwt')).toBe('MEDIUM');
    expect(gitleaksSeverity('some-new-rule')).toBe('HIGH');
  });

  it('gitleaks: throws on a non-array report', () => {
    expect(() => parseGitleaks({}, id)).toThrow();
  });

  it('trufflehog: never returns Raw/RawV2/Redacted/SecretParts, and verified is CRITICAL', () => {
    const line = (verified: boolean, file: string) =>
      JSON.stringify({
        SourceMetadata: { Data: { Git: { commit: 'abc123', file, line: 3 } } },
        DetectorName: 'AWS',
        DetectorType: 2,
        Verified: verified,
        Raw: 'FAKE-RAW-SECRET-VALUE',
        RawV2: 'FAKE-RAW-SECRET-VALUE:other',
        Redacted: 'FAKE-REDACTED',
        SecretParts: { key: 'FAKE-RAW-SECRET-VALUE' },
      });
    const text = ['{"level":"info","msg":"running source"}', line(true, 'a.env'), line(false, 'b.env')].join('\n');
    const findings = parseTrufflehog(text, id);
    expect(findings.map((f) => f.severity)).toEqual(['CRITICAL', 'HIGH']);
    expect(findings[0].location).toMatchObject({ file: 'a.env', line: 3, commit: 'abc123' });
    expect(JSON.stringify(findings)).not.toMatch(/FAKE-RAW|FAKE-REDACTED/);
  });
});

describe('semgrep', () => {
  it('maps ERROR/WARNING to HIGH/MEDIUM and makes paths relative', () => {
    const parsed = parseSemgrep(fx('semgrep.json'), (p) => p.replace('C:\\project\\', '').replace(/\\/g, '/'));
    expect(parsed.findings.map((f) => f.severity).sort()).toEqual(['HIGH', 'MEDIUM']);
    expect(parsed.findings[0].location.file).toBe('api/app.py');
    expect(parsed.fatal).toBe(false);
  });

  it('flags rule/config errors as fatal', () => {
    const p = parseSemgrep({ results: [], errors: [{ level: 'error', type: 'InvalidRuleSchemaError', message: 'bad rule' }] }, id);
    expect(p.fatal).toBe(true);
  });
});
