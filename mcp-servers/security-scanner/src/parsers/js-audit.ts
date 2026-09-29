// SPDX-License-Identifier: MIT
/**
 * npm / pnpm / yarn audit output → findings.
 *
 *  - npm 7+ (`auditReportVersion: 2`): `vulnerabilities{name: {via[], nodes[], fixAvailable}}`.
 *    It reports the vulnerable *range*, not what is installed; the installed
 *    version is read from the lockfile via `nodes` (`node_modules/a/node_modules/b`).
 *  - npm 6, pnpm, yarn berry v2/v3: the "v6" shape, `advisories{id: {findings[{version}]}}`.
 *  - yarn classic: NDJSON of `{type: "auditAdvisory", data: {advisory}}`.
 *  - yarn berry v4: NDJSON of `{value: <pkg>, children: {ID, Severity, "Tree Versions"...}}`.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ScannerSource, SecurityFinding } from '../types.js';
import { normalizeSeverity } from '../utils/normalizer.js';
import { parseJsonStream } from '../utils/report-file.js';

function ghsaFromUrl(url: string | undefined): string | undefined {
  const m = url?.match(/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i);
  return m?.[0];
}

/** Map `node_modules/...` lockfile keys to installed versions. */
export function lockfileVersions(lock: any): Map<string, string> {
  const map = new Map<string, string>();
  if (lock?.packages && typeof lock.packages === 'object') {
    for (const [k, v] of Object.entries(lock.packages as Record<string, any>)) {
      if (k && v?.version) map.set(k, String(v.version));
    }
  } else if (lock?.dependencies) {
    // lockfileVersion 1: nested dependencies tree
    const walk = (deps: Record<string, any>, prefix: string) => {
      for (const [name, v] of Object.entries(deps)) {
        const key = `${prefix}node_modules/${name}`;
        if (v?.version) map.set(key, String(v.version));
        if (v?.dependencies) walk(v.dependencies, `${key}/`);
      }
    };
    walk(lock.dependencies, '');
  }
  return map;
}

export function parseNpmAudit(report: any, manifest: string, lock?: any): SecurityFinding[] {
  if (!report || typeof report !== 'object') throw new Error('npm audit output is not a JSON object');
  if (report.error) {
    throw new Error(`npm audit error: ${report.error.summary ?? report.error.code ?? JSON.stringify(report.error)}`);
  }
  if (report.advisories && !report.vulnerabilities) return parseV6Advisories(report, 'npm-audit', manifest);
  if (!report.vulnerabilities || typeof report.vulnerabilities !== 'object') {
    throw new Error('npm audit output has neither "vulnerabilities" nor "advisories"');
  }
  const versions = lock ? lockfileVersions(lock) : new Map<string, string>();
  const findings: SecurityFinding[] = [];

  for (const [pkgName, vuln] of Object.entries(report.vulnerabilities as Record<string, any>)) {
    const installed = [...new Set(((vuln.nodes ?? []) as string[]).map((n) => versions.get(n)).filter(Boolean))] as string[];
    const fa = vuln.fixAvailable;
    let remediation: string;
    let fixedVersions: string[] | undefined;
    if (fa && typeof fa === 'object') {
      remediation = `Upgrade ${fa.name} to ${fa.version}${fa.isSemVerMajor ? ' (semver-major)' : ''}`;
      if (fa.name === pkgName) fixedVersions = [String(fa.version)];
    } else if (fa === true) {
      remediation = 'Run `npm audit fix`';
    } else {
      remediation = 'No fix available via npm audit';
    }

    for (const via of (vuln.via ?? []) as any[]) {
      if (typeof via !== 'object' || via === null) continue; // transitive pointer; reported under its own package
      const id = ghsaFromUrl(via.url) ?? `npm-${via.source ?? pkgName}`;
      findings.push({
        id,
        severity: normalizeSeverity(via.severity ?? vuln.severity, 'npm-audit'),
        category: 'vulnerability',
        source: 'npm-audit',
        title: via.title || `Vulnerability in ${pkgName}`,
        description: `${via.title ?? 'Vulnerability'} — affected range ${via.range ?? vuln.range ?? 'unknown'}`,
        location: {
          file: manifest,
          package: via.name ?? pkgName,
          version: installed.length ? installed.join(', ') : undefined,
          ecosystem: 'npm',
        },
        remediation,
        fix: { fixedVersions, remediation },
        references: via.url ? [via.url] : undefined,
        metadata: {
          vulnerableRange: via.range ?? vuln.range,
          isDirect: vuln.isDirect,
          cvssScore: via.cvss?.score || undefined,
          cwe: via.cwe,
          installedVersionUnknown: installed.length === 0 || undefined,
        },
      });
    }
  }
  return findings;
}

/** npm-6 / pnpm / yarn classic / yarn berry v3 advisory shape. */
export function parseV6Advisories(report: any, source: ScannerSource, manifest: string): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  for (const adv of Object.values((report.advisories ?? {}) as Record<string, any>)) {
    findings.push(...advisoryToFindings(adv, source, manifest));
  }
  return findings;
}

function advisoryToFindings(adv: any, source: ScannerSource, manifest: string): SecurityFinding[] {
  const versions = [...new Set(((adv.findings ?? []) as any[]).map((f) => f.version).filter(Boolean))] as string[];
  const patched = adv.patched_versions && adv.patched_versions !== '<0.0.0' ? String(adv.patched_versions) : undefined;
  const id = adv.github_advisory_id ?? ghsaFromUrl(adv.url) ?? `advisory-${adv.id}`;
  const remediation = patched ? `Upgrade ${adv.module_name} to ${patched}` : adv.recommendation || 'No patched version published';
  return [
    {
      id,
      severity: normalizeSeverity(adv.severity, source),
      category: 'vulnerability',
      source,
      title: adv.title || `Vulnerability in ${adv.module_name}`,
      description: adv.overview || adv.title || 'No description available',
      location: {
        file: manifest,
        package: adv.module_name,
        version: versions.length ? versions.join(', ') : undefined,
        ecosystem: 'npm',
      },
      remediation,
      fix: { fixedVersions: patched ? [patched] : undefined, remediation },
      references: adv.url ? [adv.url] : undefined,
      aliases: adv.cves,
      metadata: { vulnerableRange: adv.vulnerable_versions, cwe: adv.cwe },
    },
  ];
}

export function parsePnpmAudit(report: any, manifest: string): SecurityFinding[] {
  if (!report || typeof report !== 'object') throw new Error('pnpm audit output is not a JSON object');
  if (report.error) throw new Error(`pnpm audit error: ${report.error.message ?? report.error.code ?? 'unknown'}`);
  if (!report.advisories) throw new Error('pnpm audit output has no "advisories"');
  return parseV6Advisories(report, 'pnpm-audit', manifest);
}

/** yarn classic (`yarn audit --json`) and berry (`yarn npm audit --json`) output. */
export function parseYarnAudit(text: string, manifest: string): SecurityFinding[] {
  const { values } = parseJsonStream(text);
  if (values.length === 0) throw new Error('yarn audit produced no JSON output');
  const byKey = new Map<string, SecurityFinding>();
  let recognised = false;

  for (const v of values as any[]) {
    // yarn classic
    if (v?.type === 'auditAdvisory' && v.data?.advisory) {
      recognised = true;
      for (const f of advisoryToFindings(v.data.advisory, 'yarn-audit', manifest)) {
        const k = `${f.id}|${f.location.package}`;
        const prev = byKey.get(k);
        if (prev) {
          const merged = new Set([...(prev.location.version ?? '').split(', '), ...(f.location.version ?? '').split(', ')].filter(Boolean));
          prev.location.version = [...merged].join(', ') || undefined;
        } else byKey.set(k, f);
      }
      continue;
    }
    if (v?.type === 'auditSummary' || v?.type === 'info' || v?.type === 'warning') {
      recognised = true;
      continue;
    }
    if (v?.type === 'error') throw new Error(`yarn audit error: ${v.data ?? 'unknown'}`);
    // yarn berry v2/v3 single object
    if (v?.advisories) {
      recognised = true;
      for (const f of parseV6Advisories(v, 'yarn-audit', manifest)) byKey.set(`${f.id}|${f.location.package}`, f);
      continue;
    }
    // yarn berry v4 NDJSON
    if (v?.value && v?.children) {
      recognised = true;
      const c = v.children;
      const id = ghsaFromUrl(c.URL) ?? `advisory-${c.ID}`;
      const versions: string[] = c['Tree Versions'] ?? [];
      byKey.set(`${id}|${v.value}`, {
        id,
        severity: normalizeSeverity(c.Severity, 'yarn-audit'),
        category: 'vulnerability',
        source: 'yarn-audit',
        title: c.Issue || `Vulnerability in ${v.value}`,
        description: `${c.Issue ?? 'Vulnerability'} — vulnerable versions ${c['Vulnerable Versions'] ?? 'unknown'}`,
        location: { file: manifest, package: v.value, version: versions.join(', ') || undefined, ecosystem: 'npm' },
        remediation: `Upgrade ${v.value} outside ${c['Vulnerable Versions'] ?? 'the vulnerable range'}`,
        fix: { remediation: `Upgrade ${v.value} outside ${c['Vulnerable Versions'] ?? 'the vulnerable range'}` },
        references: c.URL ? [c.URL] : undefined,
        metadata: { vulnerableRange: c['Vulnerable Versions'], dependents: c.Dependents },
      });
    }
  }
  if (!recognised) throw new Error('yarn audit output was JSON but not in a recognised format');
  return [...byKey.values()];
}
