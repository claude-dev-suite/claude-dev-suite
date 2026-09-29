// SPDX-License-Identifier: MIT
import type {
  EngineRun,
  NotScanned,
  ScanResult,
  ScanStatus,
  ScanType,
  SecurityFinding,
  Severity,
  Summary,
  ThresholdSeverity,
} from '../types.js';

export const DEFAULT_MAX_RESULTS = 100;
export const HARD_MAX_RESULTS = 1000;
const MAX_DESCRIPTION = 600;
const MAX_REFERENCES = 5;

const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO', 'UNKNOWN'];

export function emptySummary(): Summary {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0, unknown: 0, total: 0 };
}

export function calculateSummary(findings: SecurityFinding[]): Summary {
  const summary = emptySummary();
  for (const f of findings) {
    summary.total++;
    switch (f.severity) {
      case 'CRITICAL': summary.critical++; break;
      case 'HIGH': summary.high++; break;
      case 'MEDIUM': summary.medium++; break;
      case 'LOW': summary.low++; break;
      case 'INFO': summary.info++; break;
      default: summary.unknown++; break;
    }
  }
  return summary;
}

export function mergeSummaries(summaries: Summary[]): Summary {
  const out = emptySummary();
  for (const s of summaries) {
    out.critical += s.critical;
    out.high += s.high;
    out.medium += s.medium;
    out.low += s.low;
    out.info += s.info;
    out.unknown += s.unknown ?? 0;
    out.total += s.total;
  }
  return out;
}

/**
 * Map a tool's own severity word onto the common scale. Anything
 * unrecognised becomes UNKNOWN — never a guessed MEDIUM.
 */
export function normalizeSeverity(severity: string | undefined | null, tool?: string): Severity {
  if (!severity) return 'UNKNOWN';
  const s = String(severity).toUpperCase().trim();
  if (tool === 'semgrep') {
    if (s === 'ERROR') return 'HIGH';
    if (s === 'WARNING') return 'MEDIUM';
    if (s === 'INFO') return 'LOW';
    if (s === 'INVENTORY' || s === 'EXPERIMENT') return 'INFO';
  }
  if (s === 'MODERATE') return 'MEDIUM';
  if (s === 'NONE' || s === 'NEGLIGIBLE') return 'INFO';
  if (s === 'UNKNOWN') return 'UNKNOWN';
  if ((SEVERITY_ORDER as string[]).includes(s)) return s as Severity;
  return 'UNKNOWN';
}

/** Keep findings at or above the threshold. UNKNOWN is kept: it cannot be shown to fall below. */
export function meetsThreshold(sev: Severity, threshold?: ThresholdSeverity): boolean {
  if (!threshold || sev === 'UNKNOWN') return true;
  return SEVERITY_ORDER.indexOf(sev) <= SEVERITY_ORDER.indexOf(threshold);
}

export function filterBySeverity(findings: SecurityFinding[], threshold?: ThresholdSeverity): SecurityFinding[] {
  return findings.filter((f) => meetsThreshold(f.severity, threshold));
}

export function sortFindings(findings: SecurityFinding[]): SecurityFinding[] {
  return [...findings].sort((a, b) => {
    const d = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    if (d !== 0) return d;
    const fa = a.location.file ?? a.location.package ?? '';
    const fb = b.location.file ?? b.location.package ?? '';
    if (fa !== fb) return fa < fb ? -1 : 1;
    return (a.location.line ?? 0) - (b.location.line ?? 0);
  });
}

function clip(text: string | undefined, max: number): string | undefined {
  if (text === undefined) return undefined;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Bound the size of one finding. */
export function compactFinding(f: SecurityFinding): SecurityFinding {
  return {
    ...f,
    title: clip(f.title, 300) ?? '',
    description: clip(f.description, MAX_DESCRIPTION) ?? '',
    references: f.references?.filter(Boolean).slice(0, MAX_REFERENCES),
    aliases: f.aliases?.slice(0, 10),
  };
}

export function clampMaxResults(n?: number): number {
  if (n === undefined || !Number.isFinite(n)) return DEFAULT_MAX_RESULTS;
  return Math.max(1, Math.min(HARD_MAX_RESULTS, Math.floor(n)));
}

/** Remove duplicate findings that several engines (or passes) reported for the same thing. */
export function dedupeFindings(findings: SecurityFinding[], key: (f: SecurityFinding) => string): SecurityFinding[] {
  const seen = new Map<string, SecurityFinding>();
  for (const f of findings) {
    const k = key(f);
    const prev = seen.get(k);
    if (!prev || SEVERITY_ORDER.indexOf(f.severity) < SEVERITY_ORDER.indexOf(prev.severity)) seen.set(k, f);
  }
  return [...seen.values()];
}

export interface BuildResultArgs {
  scanType: ScanType;
  engines: EngineRun[];
  findings: SecurityFinding[];
  startedAt: number;
  severityThreshold?: ThresholdSeverity;
  maxResults?: number;
  warnings?: string[];
  notScanned?: NotScanned[];
  excludedByPath?: number;
  diffBase?: string;
  extra?: Record<string, unknown>;
  /** Force a status (e.g. 'skipped' when nothing applied). */
  status?: ScanStatus;
  error?: string;
}

/**
 * Assemble a ScanResult and decide its status from what actually ran:
 * nothing succeeded → failed/unavailable; something failed or scope was left
 * uncovered → partial. A scan never reports "ok, 0 findings" unless every
 * engine it needed completed.
 */
export function buildResult(a: BuildResultArgs): ScanResult {
  const warnings = [...(a.warnings ?? [])];
  const ok = a.engines.filter((e) => e.status === 'ok');
  const failed = a.engines.filter((e) => e.status === 'failed');
  const unavailable = a.engines.filter((e) => e.status === 'unavailable');

  let status: ScanStatus;
  let error = a.error;
  if (a.status) {
    status = a.status;
  } else if (ok.length === 0) {
    if (failed.length > 0) {
      status = 'failed';
    } else if (unavailable.length > 0) {
      status = 'unavailable';
    } else {
      status = 'failed';
    }
    error ??= [...failed, ...unavailable].map((e) => `${e.engine}: ${e.error ?? e.status}`).join('; ') || 'no engine ran';
  } else if (failed.length > 0 || (a.notScanned?.length ?? 0) > 0 || warnings.length > 0) {
    status = 'partial';
    for (const e of failed) warnings.push(`${e.engine}${e.target ? ` (${e.target})` : ''} failed: ${e.error}`);
  } else {
    status = 'ok';
  }

  const above = filterBySeverity(a.findings, a.severityThreshold);
  const sorted = sortFindings(above);
  const cap = clampMaxResults(a.maxResults);
  const returned = sorted.slice(0, cap).map(compactFinding);

  const result: ScanResult = {
    scanType: a.scanType,
    status,
    scanner: [...new Set(ok.map((e) => e.engine))].join(',') || [...new Set(a.engines.map((e) => e.engine))].join(','),
    engines: a.engines,
    timestamp: new Date().toISOString(),
    duration: Date.now() - a.startedAt,
    findings: returned,
    summary: calculateSummary(above),
    totalFindings: above.length,
    returnedFindings: returned.length,
    truncated: above.length > returned.length,
    warnings,
    toolAvailable: unavailable.length < a.engines.length || a.engines.length === 0,
  };
  if (a.severityThreshold) result.belowThreshold = a.findings.length - above.length;
  if (a.excludedByPath) result.excludedByPath = a.excludedByPath;
  if (a.notScanned?.length) result.notScanned = a.notScanned;
  if (a.diffBase) result.diffBase = a.diffBase;
  if (a.extra) result.extra = a.extra;
  if (error && status !== 'ok') result.error = error;
  return result;
}

/** A result for a scan that could not start at all. */
export function errorResult(scanType: ScanType, status: ScanStatus, engine: string, error: string, startedAt = Date.now()): ScanResult {
  return buildResult({
    scanType,
    engines: [{ engine, status: status === 'unavailable' ? 'unavailable' : 'failed', error }],
    findings: [],
    startedAt,
    status,
    error,
  });
}
