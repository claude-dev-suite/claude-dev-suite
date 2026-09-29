// SPDX-License-Identifier: MIT
/**
 * osv-scanner (v1 and v2) JSON → findings.
 *
 * osv-scanner groups aliases of one vulnerability (`groups[].ids`) and gives a
 * `max_severity` CVSS score per group, so one finding is emitted per group,
 * not per OSV record — otherwise GHSA-x and CVE-y for the same bug count twice.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SecurityFinding } from '../types.js';
import { cvss3BaseScore, severityFromScore } from '../utils/cvss.js';

export interface OsvSource {
  path: string;
  type?: string;
  packages: number;
}

export interface OsvPackage {
  name: string;
  version: string;
  ecosystem: string;
  source: string;
  licenses?: string[];
}

export interface OsvParsed {
  findings: SecurityFinding[];
  sources: OsvSource[];
  packages: OsvPackage[];
}

function fixedVersionsFor(vulns: any[], pkgName: string): string[] {
  const out = new Set<string>();
  const lname = pkgName.toLowerCase();
  for (const v of vulns) {
    for (const aff of (v.affected ?? []) as any[]) {
      if (aff.package?.name && String(aff.package.name).toLowerCase() !== lname) continue;
      for (const range of (aff.ranges ?? []) as any[]) {
        for (const ev of (range.events ?? []) as any[]) if (ev.fixed) out.add(String(ev.fixed));
      }
    }
  }
  return [...out];
}

function scoreFromRecords(vulns: any[]): number | undefined {
  let max: number | undefined;
  for (const v of vulns) {
    for (const s of (v.severity ?? []) as any[]) {
      const score = typeof s.score === 'string' ? cvss3BaseScore(s.score) : null;
      if (score !== null && (max === undefined || score > max)) max = score;
    }
  }
  return max;
}

export function parseOsvReport(report: any, toRel: (p: string) => string = (p) => p): OsvParsed {
  if (!report || typeof report !== 'object' || !Array.isArray(report.results)) {
    throw new Error('osv-scanner report has no "results" array');
  }
  const findings: SecurityFinding[] = [];
  const sources = new Map<string, OsvSource>();
  const packages: OsvPackage[] = [];

  for (const res of report.results as any[]) {
    const path = toRel(String(res.source?.path ?? ''));
    const src = sources.get(path) ?? { path, type: res.source?.type, packages: 0 };
    sources.set(path, src);

    for (const p of (res.packages ?? []) as any[]) {
      const pkg = p.package ?? {};
      src.packages++;
      packages.push({
        name: pkg.name,
        version: pkg.version,
        ecosystem: pkg.ecosystem,
        source: path,
        licenses: Array.isArray(p.licenses) ? p.licenses : undefined,
      });
      const vulns: any[] = p.vulnerabilities ?? [];
      if (vulns.length === 0) continue;

      const groups: any[] = Array.isArray(p.groups) && p.groups.length
        ? p.groups
        : vulns.map((v) => ({ ids: [v.id], aliases: v.aliases ?? [] }));

      for (const g of groups) {
        const ids: string[] = g.ids ?? [];
        const members = vulns.filter((v) => ids.includes(v.id));
        const primary = members.find((v) => v.summary) ?? members[0] ?? {};
        const parsedMax = g.max_severity !== undefined && g.max_severity !== '' ? parseFloat(g.max_severity) : NaN;
        const score = Number.isFinite(parsedMax) ? parsedMax : scoreFromRecords(members);
        const fixed = fixedVersionsFor(members, pkg.name ?? '');
        const id = ids.find((i) => i.startsWith('GHSA-')) ?? ids[0] ?? primary.id ?? 'unknown';
        const aliases = [...new Set([...(g.aliases ?? []), ...ids])].filter((a) => a !== id);
        findings.push({
          id,
          severity: severityFromScore(score),
          category: 'vulnerability',
          source: 'osv-scanner',
          title: primary.summary || `${id} in ${pkg.name}`,
          description: primary.details || primary.summary || 'No description available',
          location: { file: path, package: pkg.name, version: pkg.version, ecosystem: pkg.ecosystem },
          remediation: fixed.length ? `Upgrade ${pkg.name} to a fixed version: ${fixed.join(', ')}` : 'No fixed version published yet',
          fix: fixed.length ? { fixedVersions: fixed, remediation: `Upgrade ${pkg.name} to ${fixed.join(' or ')}` } : undefined,
          references: ((primary.references ?? []) as any[]).map((r) => r.url).filter(Boolean),
          aliases,
          metadata: { cvssScore: score, osvIds: ids },
        });
      }
    }
  }

  return { findings, sources: [...sources.values()], packages };
}
