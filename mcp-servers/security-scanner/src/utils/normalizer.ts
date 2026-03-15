// SPDX-License-Identifier: MIT
import type { Severity, ScanResult, SecurityFinding } from '../types.js';

export function createEmptyResult(scanner: string, toolAvailable: boolean, error?: string): ScanResult {
  return {
    scanner,
    timestamp: new Date(),
    duration: 0,
    findings: [],
    summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
    toolAvailable,
    error,
  };
}

export function calculateSummary(findings: SecurityFinding[]): ScanResult['summary'] {
  const summary = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 };

  for (const finding of findings) {
    summary.total++;
    switch (finding.severity) {
      case 'CRITICAL': summary.critical++; break;
      case 'HIGH': summary.high++; break;
      case 'MEDIUM': summary.medium++; break;
      case 'LOW': summary.low++; break;
      case 'INFO': summary.info++; break;
    }
  }

  return summary;
}

export function normalizeSeverity(severity: string, tool: string): Severity {
  const normalized = severity.toUpperCase().trim();

  // npm audit uses 'moderate' instead of 'medium'
  if (normalized === 'MODERATE') return 'MEDIUM';

  // trivy uses 'UNKNOWN'
  if (normalized === 'UNKNOWN') return 'INFO';

  // semgrep uses ERROR/WARNING/INFO
  if (tool === 'semgrep') {
    switch (normalized) {
      case 'ERROR': return 'HIGH';
      case 'WARNING': return 'MEDIUM';
      case 'INFO': return 'LOW';
    }
  }

  // Direct mapping for most tools
  if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].includes(normalized)) {
    return normalized as Severity;
  }

  return 'MEDIUM'; // Default fallback
}

export function filterBySeverity(findings: SecurityFinding[], threshold: Severity): SecurityFinding[] {
  const severityOrder: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
  const thresholdIndex = severityOrder.indexOf(threshold);

  return findings.filter(f => {
    const findingIndex = severityOrder.indexOf(f.severity);
    return findingIndex <= thresholdIndex;
  });
}

export function mergeSummaries(summaries: ScanResult['summary'][]): ScanResult['summary'] {
  return summaries.reduce(
    (acc, s) => ({
      critical: acc.critical + s.critical,
      high: acc.high + s.high,
      medium: acc.medium + s.medium,
      low: acc.low + s.low,
      info: acc.info + s.info,
      total: acc.total + s.total,
    }),
    { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 }
  );
}
