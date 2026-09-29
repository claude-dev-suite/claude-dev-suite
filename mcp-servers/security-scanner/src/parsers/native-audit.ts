// SPDX-License-Identifier: MIT
/**
 * pip-audit, cargo-audit and govulncheck output → findings.
 *
 * None of these tools reports a severity directly:
 *  - pip-audit: no severity at all → UNKNOWN (previously fabricated as HIGH
 *    whenever a fix existed).
 *  - cargo-audit: a CVSS vector per advisory → scored with the CVSS 3.x formula.
 *  - govulncheck: the Go vulndb carries no severity → UNKNOWN, with the
 *    reachability level govulncheck computed (symbol / package / module).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SecurityFinding } from '../types.js';
import { cvss3BaseScore, severityFromScore } from '../utils/cvss.js';
import { parseJsonStream } from '../utils/report-file.js';

/** pip-audit 2.x: `{dependencies: [{name, version, vulns: [{id, fix_versions, aliases, description}]}], fixes: []}`. */
export function parsePipAudit(report: any, manifest: string): SecurityFinding[] {
  // pip-audit < 2.0 emitted a bare array of dependencies.
  const deps: any[] | undefined = Array.isArray(report) ? report : report?.dependencies;
  if (!Array.isArray(deps)) throw new Error('pip-audit output has no "dependencies" array');
  const findings: SecurityFinding[] = [];
  for (const d of deps) {
    for (const v of (d.vulns ?? []) as any[]) {
      const fixed: string[] = v.fix_versions ?? [];
      const remediation = fixed.length ? `Upgrade ${d.name} to ${fixed.join(' or ')}` : 'No fixed version published yet';
      findings.push({
        id: v.id ?? 'unknown',
        severity: 'UNKNOWN',
        category: 'vulnerability',
        source: 'pip-audit',
        title: `${d.name} ${d.version}: ${v.id}`,
        description: v.description || 'No description available',
        location: { file: manifest, package: d.name, version: d.version, ecosystem: 'PyPI' },
        remediation,
        fix: { fixedVersions: fixed.length ? fixed : undefined, remediation },
        references: [`https://osv.dev/vulnerability/${v.id}`],
        aliases: v.aliases,
        metadata: { severityNote: 'pip-audit does not report severity; look up the aliases or use trivy/osv-scanner' },
      });
    }
  }
  return findings;
}

/** cargo-audit `--json`: `{vulnerabilities: {list: [{advisory, versions, package}]}, warnings: {...}}`. */
export function parseCargoAudit(report: any, manifest: string): SecurityFinding[] {
  if (!report || typeof report !== 'object' || !report.vulnerabilities) {
    throw new Error('cargo-audit output has no "vulnerabilities" section');
  }
  const findings: SecurityFinding[] = [];
  const toFinding = (entry: any, kind: string): SecurityFinding => {
    const adv = entry.advisory ?? {};
    const pkg = entry.package ?? {};
    const score = typeof adv.cvss === 'string' ? cvss3BaseScore(adv.cvss) : null;
    const patched: string[] = entry.versions?.patched ?? [];
    const remediation = patched.length ? `Upgrade ${pkg.name} to ${patched.join(' or ')}` : 'No patched version published';
    return {
      id: adv.id ?? 'unknown',
      severity: kind === 'vulnerability' ? severityFromScore(score) : 'INFO',
      category: 'vulnerability',
      source: 'cargo-audit',
      title: adv.title || `${kind} in ${pkg.name}`,
      description: adv.description || adv.title || 'No description available',
      location: { file: manifest, package: pkg.name, version: pkg.version, ecosystem: 'crates.io' },
      remediation,
      fix: { fixedVersions: patched.length ? patched : undefined, remediation },
      references: [adv.url, ...(adv.references ?? [])].filter(Boolean),
      aliases: adv.aliases,
      metadata: { kind, cvssVector: adv.cvss ?? undefined, cvssScore: score ?? undefined, informational: adv.informational ?? undefined },
    };
  };
  for (const v of (report.vulnerabilities.list ?? []) as any[]) findings.push(toFinding(v, 'vulnerability'));
  for (const [kind, list] of Object.entries((report.warnings ?? {}) as Record<string, any[]>)) {
    for (const w of list ?? []) if (w?.advisory) findings.push(toFinding(w, kind));
  }
  return findings;
}

/**
 * govulncheck `-json` (v1.x): a stream of pretty-printed JSON messages —
 * `config`, `progress`, `SBOM`, `osv` (advisory records) and `finding`
 * (`{osv, fixed_version, trace[]}`). The pre-1.0 `{vulnerability: ...}` shape
 * no longer exists, which is why the old parser always found nothing.
 */
export function parseGovulncheck(text: string, manifest: string): SecurityFinding[] {
  const { values } = parseJsonStream(text);
  if (values.length === 0) throw new Error('govulncheck produced no JSON output');
  const osv = new Map<string, any>();
  const hits = new Map<string, { osvId: string; module: string; version?: string; fixed?: string; level: number; symbol?: string }>();
  let sawConfig = false;

  for (const msg of values as any[]) {
    if (msg?.config) sawConfig = true;
    if (msg?.osv?.id) osv.set(msg.osv.id, msg.osv);
    const f = msg?.finding;
    if (!f?.osv) continue;
    const frame = (f.trace ?? [])[0] ?? {};
    const level = frame.function ? 3 : frame.package ? 2 : 1;
    const key = `${f.osv}|${frame.module ?? ''}`;
    const prev = hits.get(key);
    if (!prev || level > prev.level) {
      hits.set(key, {
        osvId: f.osv,
        module: frame.module ?? 'unknown',
        version: frame.version,
        fixed: f.fixed_version,
        level,
        symbol: frame.function ? `${frame.package ?? ''}${frame.receiver ? `.${frame.receiver}` : ''}.${frame.function}` : undefined,
      });
    }
  }
  if (!sawConfig && hits.size === 0 && osv.size === 0) {
    throw new Error('govulncheck output contained no recognised messages');
  }

  const reach = ['', 'module', 'package', 'symbol'];
  return [...hits.values()].map((h) => {
    const rec = osv.get(h.osvId) ?? {};
    const reachability = reach[h.level];
    const remediation = h.fixed ? `Upgrade ${h.module} to ${h.fixed}` : 'No fixed version published yet';
    return {
      id: h.osvId,
      severity: 'UNKNOWN' as const,
      category: 'vulnerability' as const,
      source: 'govulncheck' as const,
      title: rec.summary || `${h.osvId} in ${h.module}`,
      description:
        `${rec.details || rec.summary || 'No description available'}` +
        (reachability === 'symbol' ? ` (vulnerable symbol ${h.symbol} is called by this code)` : ` (reachability: ${reachability} — not called)`),
      location: { file: manifest, package: h.module, version: h.version, ecosystem: 'Go' },
      remediation,
      fix: { fixedVersions: h.fixed ? [h.fixed] : undefined, remediation },
      references: [rec.database_specific?.url, ...((rec.references ?? []) as any[]).map((r) => r.url)].filter(Boolean),
      aliases: rec.aliases,
      metadata: { reachability, symbol: h.symbol, severityNote: 'the Go vulnerability database carries no severity' },
    };
  });
}
