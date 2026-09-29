// SPDX-License-Identifier: MIT
/**
 * Trivy JSON report (SchemaVersion 2) → findings.
 *
 * One report can carry four kinds of result per target: Vulnerabilities,
 * Misconfigurations, Secrets and Licenses. All four are read; the caller
 * decides which to keep. Trivy's `Match`/`Code` fields for secrets hold a
 * partially-masked copy of the secret and are never copied out.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SecurityFinding } from '../types.js';
import { normalizeSeverity } from '../utils/normalizer.js';

export interface TrivyTarget {
  target: string;
  class: string;
  type?: string;
}

export interface TrivyParsed {
  findings: SecurityFinding[];
  targets: TrivyTarget[];
  artifactName?: string;
}

export interface TrivyParseOptions {
  image?: string;
  include?: { vuln?: boolean; misconfig?: boolean; secret?: boolean; license?: boolean };
}

function maxCvssScore(cvss: any): number | undefined {
  if (!cvss || typeof cvss !== 'object') return undefined;
  let max: number | undefined;
  for (const v of Object.values(cvss) as any[]) {
    for (const k of ['V40Score', 'V3Score']) {
      if (typeof v?.[k] === 'number' && (max === undefined || v[k] > max)) max = v[k];
    }
  }
  return max;
}

export function parseTrivyReport(report: any, opts: TrivyParseOptions = {}): TrivyParsed {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('trivy report is not a JSON object');
  }
  const include = { vuln: true, misconfig: true, secret: true, license: true, ...opts.include };
  const findings: SecurityFinding[] = [];
  const targets: TrivyTarget[] = [];

  for (const r of (report.Results ?? []) as any[]) {
    const target: string = r.Target ?? '';
    targets.push({ target, class: r.Class ?? '', type: r.Type });

    if (include.vuln) {
      for (const v of (r.Vulnerabilities ?? []) as any[]) {
        const fixed = typeof v.FixedVersion === 'string' && v.FixedVersion.trim()
          ? v.FixedVersion.split(',').map((s: string) => s.trim()).filter(Boolean)
          : undefined;
        const refs = [v.PrimaryURL, ...(v.References ?? [])].filter(Boolean);
        findings.push({
          id: v.VulnerabilityID ?? 'unknown',
          severity: normalizeSeverity(v.Severity, 'trivy'),
          category: 'vulnerability',
          source: 'trivy',
          title: v.Title || `${v.VulnerabilityID} in ${v.PkgName}`,
          description: v.Description || v.Title || 'No description available',
          location: {
            file: opts.image ? undefined : target,
            package: v.PkgName,
            version: v.InstalledVersion,
            ecosystem: r.Type,
            image: opts.image,
          },
          remediation: fixed ? `Upgrade ${v.PkgName} to ${fixed.join(' or ')}` : 'No fixed version published yet',
          fix: fixed ? { fixedVersions: fixed, remediation: `Upgrade ${v.PkgName} to ${fixed.join(' or ')}` } : undefined,
          references: [...new Set(refs)] as string[],
          aliases: v.VendorIDs,
          metadata: {
            status: v.Status,
            cvssScore: maxCvssScore(v.CVSS),
            cwe: v.CweIDs,
            severitySource: v.SeveritySource,
            pkgPath: v.PkgPath,
            target: opts.image ? target : undefined,
          },
        });
      }
    }

    if (include.misconfig) {
      for (const m of (r.Misconfigurations ?? []) as any[]) {
        if (m.Status && m.Status !== 'FAIL') continue;
        findings.push({
          id: m.ID || m.AVDID || 'unknown',
          severity: normalizeSeverity(m.Severity, 'trivy'),
          category: 'misconfiguration',
          source: 'trivy',
          title: m.Title || m.ID,
          description: m.Message || m.Description || 'Misconfiguration detected',
          location: {
            file: target,
            line: m.CauseMetadata?.StartLine || undefined,
            endLine: m.CauseMetadata?.EndLine || undefined,
            image: opts.image,
          },
          remediation: m.Resolution,
          fix: m.Resolution ? { remediation: m.Resolution } : undefined,
          references: [...new Set([m.PrimaryURL, ...(m.References ?? [])].filter(Boolean))] as string[],
          metadata: {
            type: m.Type,
            iacType: r.Type,
            resource: m.CauseMetadata?.Resource,
            provider: m.CauseMetadata?.Provider,
            service: m.CauseMetadata?.Service,
          },
        });
      }
    }

    if (include.secret) {
      for (const s of (r.Secrets ?? []) as any[]) {
        findings.push({
          id: s.RuleID || 'trivy-secret',
          severity: normalizeSeverity(s.Severity, 'trivy'),
          category: 'secret',
          source: 'trivy',
          title: s.Title || `${s.Category ?? 'Secret'} detected`,
          description: `${s.Title || 'Secret'} (${s.Category ?? 'generic'}) found in ${target}`,
          location: { file: target, line: s.StartLine || undefined, endLine: s.EndLine || undefined, image: opts.image },
          remediation: 'Remove the secret from the source, rotate the credential, and load it from a secret manager',
          metadata: { category: s.Category },
        });
      }
    }

    if (include.license) {
      for (const l of (r.Licenses ?? []) as any[]) {
        findings.push({
          id: `license:${l.Name ?? 'unknown'}`,
          severity: normalizeSeverity(l.Severity, 'trivy'),
          category: 'license',
          source: 'trivy',
          title: `${l.PkgName ? `${l.PkgName}: ` : ''}${l.Name ?? 'unknown'} (${l.Category ?? 'unknown'})`,
          description: `License ${l.Name ?? 'unknown'} classified by trivy as ${l.Category ?? 'unknown'}`,
          location: { file: l.FilePath || target, package: l.PkgName || undefined, image: opts.image },
          references: l.Link ? [l.Link] : undefined,
          metadata: { license: l.Name, licenseCategory: l.Category, confidence: l.Confidence },
        });
      }
    }
  }

  return { findings, targets, artifactName: report.ArtifactName };
}
