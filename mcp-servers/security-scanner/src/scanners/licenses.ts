// SPDX-License-Identifier: MIT
/**
 * Dependency license inventory and policy check.
 *
 * Engines: osv-scanner (licenses from deps.dev for every resolved package)
 * or trivy (licenses from package metadata, classified forbidden/restricted/…).
 * Policy: `deny` wins; with an `allow` list, anything not satisfiable from it
 * is a violation. SPDX expressions are evaluated — `MIT OR GPL-3.0` passes a
 * deny of GPL-3.0 because MIT can be chosen; `MIT AND GPL-3.0` does not.
 */

import type { EngineRun, ScanLicensesInput, ScanResult, SecurityFinding, Severity } from '../types.js';
import { buildResult } from '../utils/normalizer.js';
import { toRelPosix, validateScanPath } from '../utils/paths.js';
import { getTool, unavailableMessage } from '../utils/tool-checker.js';
import { parseOsvReport } from '../parsers/osv.js';
import { parseTrivyReport } from '../parsers/trivy.js';
import { runOsvScanner, runTrivyJson } from './engines.js';

// ---------------------------------------------------------------------------
// SPDX expression evaluation
// ---------------------------------------------------------------------------

type Expr = { op: 'OR' | 'AND'; left: Expr; right: Expr } | { id: string };

export function parseSpdx(expr: string): Expr {
  const tokens = expr.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').split(/\s+/).filter(Boolean);
  let i = 0;
  const parsePrimary = (): Expr => {
    const t = tokens[i++];
    if (t === '(') {
      const e = parseOr();
      if (tokens[i] === ')') i++;
      return e;
    }
    let id = t ?? '';
    // "GPL-2.0-only WITH Classpath-exception-2.0" → keep the exception attached.
    if (tokens[i]?.toUpperCase() === 'WITH' && tokens[i + 1]) {
      id = `${id} WITH ${tokens[i + 1]}`;
      i += 2;
    }
    return { id };
  };
  const parseAnd = (): Expr => {
    let left = parsePrimary();
    while (tokens[i]?.toUpperCase() === 'AND') {
      i++;
      left = { op: 'AND', left, right: parsePrimary() };
    }
    return left;
  };
  const parseOr = (): Expr => {
    let left = parseAnd();
    while (tokens[i]?.toUpperCase() === 'OR') {
      i++;
      left = { op: 'OR', left, right: parseAnd() };
    }
    return left;
  };
  return parseOr();
}

function leaves(e: Expr): string[] {
  return 'id' in e ? [e.id] : [...leaves(e.left), ...leaves(e.right)];
}

const UNKNOWN_IDS = new Set(['', 'UNKNOWN', 'NON-STANDARD', 'NOASSERTION', 'NONE', 'UNLICENSED', 'SEE LICENSE IN LICENSE']);

export type LicenseVerdict = 'allowed' | 'denied' | 'not-allowed' | 'unknown';

export function evaluateLicense(expression: string, allow: string[], deny: string[]): LicenseVerdict {
  const norm = (s: string) => s.trim().toUpperCase();
  const allowSet = new Set(allow.map(norm));
  const denySet = new Set(deny.map(norm));
  if (UNKNOWN_IDS.has(norm(expression))) return 'unknown';
  const tree = parseSpdx(expression);
  const base = (id: string) => norm(id).split(' WITH ')[0];
  const leafOk = (id: string) => {
    const full = norm(id);
    if (denySet.has(full) || denySet.has(base(id))) return false;
    if (allowSet.size === 0) return true;
    return allowSet.has(full) || allowSet.has(base(id));
  };
  const sat = (e: Expr): boolean => ('id' in e ? leafOk(e.id) : e.op === 'OR' ? sat(e.left) || sat(e.right) : sat(e.left) && sat(e.right));
  if (sat(tree)) return 'allowed';
  if (leaves(tree).some((l) => UNKNOWN_IDS.has(norm(l)))) return 'unknown';
  return leaves(tree).some((l) => denySet.has(norm(l)) || denySet.has(base(l))) ? 'denied' : 'not-allowed';
}

// ---------------------------------------------------------------------------

interface PackageLicense {
  name: string;
  version?: string;
  ecosystem?: string;
  file?: string;
  license: string;
  trivySeverity?: Severity;
  trivyCategory?: string;
}

const VERDICT_SEVERITY: Record<Exclude<LicenseVerdict, 'allowed'>, Severity> = {
  denied: 'HIGH',
  'not-allowed': 'MEDIUM',
  unknown: 'LOW',
};

export async function scanLicenses(input: ScanLicensesInput): Promise<ScanResult> {
  const startedAt = Date.now();
  const root = validateScanPath(input.path, { requireDirectory: true });
  const allow = input.allow ?? [];
  const deny = input.deny ?? [];
  const hasPolicy = allow.length > 0 || deny.length > 0;
  const engine = input.engine ?? 'auto';
  const engines: EngineRun[] = [];
  const warnings: string[] = [];
  let packages: PackageLicense[] | undefined;
  let coverageNote: string | undefined;

  const order = engine === 'auto' ? (['osv-scanner', 'trivy'] as const) : ([engine] as const);
  for (const e of order) {
    const t = await getTool(e);
    if (!t.available) {
      engines.push({ engine: e, status: 'unavailable', error: unavailableMessage(e, t) });
      continue;
    }
    const started = Date.now();
    try {
      if (e === 'osv-scanner') {
        const r = await runOsvScanner(root, ['--all-packages', '--licenses'], { timeoutSeconds: input.timeoutSeconds });
        const parsed = r.noPackages ? { packages: [] } : parseOsvReport(r.report, (p) => toRelPosix(root, p));
        packages = parsed.packages.map((p) => ({
          name: p.name,
          version: p.version,
          ecosystem: p.ecosystem,
          file: p.source,
          license: (p.licenses ?? []).length ? (p.licenses ?? []).join(' AND ') : 'UNKNOWN',
        }));
        engines.push({ engine: e, version: r.version, status: 'ok', target: '.', durationMs: Date.now() - started });
      } else {
        const { report, version } = await runTrivyJson('fs', ['--scanners', 'license', '--skip-dirs', '**/.git'], root, {
          cwd: root,
          timeoutSeconds: input.timeoutSeconds,
        });
        const parsed = parseTrivyReport(report, { include: { license: true, vuln: false, misconfig: false, secret: false } });
        packages = parsed.findings.map((f) => ({
          name: f.location.package ?? f.location.file ?? 'unknown',
          file: f.location.file ? toRelPosix(root, f.location.file) : undefined,
          license: String(f.metadata?.license ?? 'UNKNOWN'),
          trivySeverity: f.severity,
          trivyCategory: String(f.metadata?.licenseCategory ?? ''),
        }));
        engines.push({ engine: e, version, status: 'ok', target: '.', durationMs: Date.now() - started });
        coverageNote = 'trivy reads licenses from package metadata on disk; ecosystems without it (e.g. Python requirements, npm without node_modules) may be missing';
      }
      break;
    } catch (err) {
      engines.push({ engine: e, version: t.version, status: 'failed', target: '.', durationMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (!packages) return buildResult({ scanType: 'licenses', engines, findings: [], startedAt });

  const findings: SecurityFinding[] = [];
  const inventory = new Map<string, number>();
  for (const p of packages) {
    inventory.set(p.license, (inventory.get(p.license) ?? 0) + 1);
    const verdict = evaluateLicense(p.license, allow, deny);
    let severity: Severity | undefined;
    let reason: string | undefined;
    if (verdict !== 'allowed') {
      severity = VERDICT_SEVERITY[verdict];
      reason =
        verdict === 'denied'
          ? `license ${p.license} is on the deny list`
          : verdict === 'not-allowed'
            ? `license ${p.license} is not on the allow list`
            : 'license could not be determined';
    } else if (!hasPolicy && p.trivySeverity && ['forbidden', 'restricted'].includes(p.trivyCategory ?? '')) {
      severity = p.trivySeverity;
      reason = `license ${p.license} is classified ${p.trivyCategory} by trivy`;
    }
    if (!severity) continue;
    findings.push({
      id: verdict === 'allowed' ? `license-${p.trivyCategory}` : `license-${verdict}`,
      severity,
      category: 'license',
      source: engines.find((e) => e.status === 'ok')?.engine === 'trivy' ? 'trivy' : 'osv-scanner',
      title: `${p.name}${p.version ? `@${p.version}` : ''}: ${p.license}`,
      description: `${p.name}: ${reason}`,
      location: { file: p.file, package: p.name, version: p.version, ecosystem: p.ecosystem },
      remediation:
        verdict === 'unknown'
          ? 'Check the package license manually and record it in your policy'
          : 'Replace the dependency, obtain a different license, or record an approved exception',
      metadata: { license: p.license, verdict },
    });
  }

  const inv = [...inventory.entries()].sort((a, b) => b[1] - a[1]).map(([license, count]) => ({ license, count }));
  return buildResult({
    scanType: 'licenses',
    engines,
    findings,
    startedAt,
    severityThreshold: input.severityThreshold,
    maxResults: input.maxResults,
    warnings: packages.length === 0 ? [...warnings, 'No packages with license information were found'] : warnings,
    extra: {
      policy: hasPolicy ? { allow, deny } : 'none (only unknown licenses and trivy forbidden/restricted classes are flagged)',
      packagesChecked: packages.length,
      coverageNote,
      ...(input.includeInventory !== false ? { inventory: inv.slice(0, 100) } : {}),
    },
  });
}
