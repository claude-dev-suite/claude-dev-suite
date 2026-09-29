// SPDX-License-Identifier: MIT
/**
 * Normalized findings → SARIF 2.1.0, one run per engine, shaped for GitHub
 * code scanning: `security-severity` drives GitHub's severity column, and
 * every result carries a repository-relative location (package findings point
 * at the manifest that declares the package).
 */

import type { ScanResult, SecurityFinding, Severity } from '../types.js';

const SECURITY_SEVERITY: Record<Severity, string> = {
  CRITICAL: '9.5',
  HIGH: '8.0',
  MEDIUM: '5.5',
  LOW: '2.0',
  INFO: '0.0',
  UNKNOWN: '5.0',
};

const HOMEPAGES: Record<string, string> = {
  trivy: 'https://trivy.dev',
  'osv-scanner': 'https://google.github.io/osv-scanner/',
  semgrep: 'https://semgrep.dev',
  gitleaks: 'https://gitleaks.io',
  trufflehog: 'https://trufflesecurity.com/trufflehog',
  'npm-audit': 'https://docs.npmjs.com/cli/commands/npm-audit',
  'pnpm-audit': 'https://pnpm.io/cli/audit',
  'yarn-audit': 'https://yarnpkg.com',
  'pip-audit': 'https://pypi.org/project/pip-audit/',
  'cargo-audit': 'https://rustsec.org',
  govulncheck: 'https://go.dev/security/vuln/',
};

function level(sev: Severity): 'error' | 'warning' | 'note' {
  if (sev === 'CRITICAL' || sev === 'HIGH') return 'error';
  if (sev === 'MEDIUM' || sev === 'UNKNOWN') return 'warning';
  return 'note';
}

function uriFor(f: SecurityFinding): string {
  const raw = f.location.file ?? f.location.image ?? '.';
  return raw.replace(/\\/g, '/').replace(/^\.\//, '') || '.';
}

function ruleId(f: SecurityFinding): string {
  return f.id;
}

function messageFor(f: SecurityFinding): string {
  const parts = [f.title];
  if (f.location.package) parts.push(`Package: ${f.location.package}${f.location.version ? `@${f.location.version}` : ''}`);
  if (f.fix?.fixedVersions?.length) parts.push(`Fixed in: ${f.fix.fixedVersions.join(', ')}`);
  else if (f.remediation) parts.push(f.remediation);
  return parts.join('. ');
}

export function toSarif(results: ScanResult[], toolVersions: Record<string, string | undefined> = {}): Record<string, unknown> {
  const byEngine = new Map<string, { findings: SecurityFinding[]; scans: ScanResult[] }>();
  for (const r of results) {
    const engines = r.engines.filter((e) => e.status === 'ok').map((e) => e.engine);
    for (const e of engines) {
      if (!byEngine.has(e)) byEngine.set(e, { findings: [], scans: [] });
      byEngine.get(e)!.scans.push(r);
    }
    for (const f of r.findings) {
      if (!byEngine.has(f.source)) byEngine.set(f.source, { findings: [], scans: [r] });
      byEngine.get(f.source)!.findings.push(f);
    }
  }

  const runs = [...byEngine.entries()].map(([engine, { findings, scans }]) => {
    const rules = new Map<string, Record<string, unknown>>();
    for (const f of findings) {
      const id = ruleId(f);
      if (rules.has(id)) continue;
      rules.set(id, {
        id,
        name: id,
        shortDescription: { text: f.title.slice(0, 200) },
        fullDescription: { text: f.description.slice(0, 1000) },
        helpUri: f.references?.[0],
        help: { text: f.fix?.remediation ?? f.remediation ?? f.description.slice(0, 1000) },
        properties: {
          'security-severity': SECURITY_SEVERITY[f.severity],
          tags: ['security', f.category],
        },
      });
    }
    return {
      tool: {
        driver: {
          name: engine,
          version: toolVersions[engine],
          informationUri: HOMEPAGES[engine],
          rules: [...rules.values()],
        },
      },
      results: findings.map((f) => {
        const region: Record<string, number> = {};
        if (f.location.line) region.startLine = f.location.line;
        if (f.location.endLine && f.location.line && f.location.endLine >= f.location.line) region.endLine = f.location.endLine;
        if (f.location.column) region.startColumn = f.location.column;
        return {
          ruleId: ruleId(f),
          level: level(f.severity),
          message: { text: messageFor(f) },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: uriFor(f) },
                ...(Object.keys(region).length ? { region } : {}),
              },
            },
          ],
          partialFingerprints: {
            'devSuite/v1': [f.source, f.id, uriFor(f), f.location.package ?? '', f.location.line ?? ''].join('|'),
          },
          properties: {
            severity: f.severity,
            category: f.category,
            package: f.location.package,
            installedVersion: f.location.version,
            fixedVersions: f.fix?.fixedVersions,
          },
        };
      }),
      properties: {
        scanTypes: [...new Set(scans.map((s) => s.scanType))],
        truncated: scans.some((s) => s.truncated),
      },
    };
  });

  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs,
  };
}
