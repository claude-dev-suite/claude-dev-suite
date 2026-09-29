// SPDX-License-Identifier: MIT
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SecurityFinding } from '../types.js';
import { normalizeSeverity } from '../utils/normalizer.js';

export interface SemgrepParsed {
  findings: SecurityFinding[];
  errors: string[];
  fatal: boolean;
  scannedFiles?: number;
}

function categorize(ruleId: string, meta: any): SecurityFinding['category'] {
  const cat = String(meta?.category ?? '').toLowerCase();
  const id = ruleId.toLowerCase();
  if (/secret|hardcoded|credential|password|api-key|token/.test(id)) return 'secret';
  if (cat === 'security' || /injection|sqli|xss|traversal|deserializ|ssrf|xxe|eval|exec/.test(id)) return 'vulnerability';
  if (/config|header|cors|csrf|tls|ssl/.test(id)) return 'misconfiguration';
  return 'code-smell';
}

/**
 * Semgrep's own severities are ERROR/WARNING/INFO (mapped HIGH/MEDIUM/LOW);
 * newer registries also emit CRITICAL/HIGH/MEDIUM/LOW directly, which pass through.
 */
export function parseSemgrep(report: any, toRel: (p: string) => string): SemgrepParsed {
  if (!report || typeof report !== 'object' || !Array.isArray(report.results)) {
    throw new Error('semgrep output has no "results" array');
  }
  const errors: string[] = [];
  let fatal = false;
  for (const e of (report.errors ?? []) as any[]) {
    const level = String(e.level ?? 'error').toLowerCase();
    const msg = `${e.type ?? 'error'}${e.path ? ` in ${toRel(String(e.path))}` : ''}: ${String(e.message ?? '').split('\n')[0]}`.slice(0, 400);
    errors.push(`[${level}] ${msg}`);
    // Rule/config errors invalidate the run; per-file parse errors do not.
    if (level === 'error' && /rule|config|invalid|missing/i.test(String(e.type ?? ''))) fatal = true;
  }
  const findings: SecurityFinding[] = (report.results as any[]).map((r) => {
    const meta = r.extra?.metadata ?? {};
    const fix = r.extra?.fix ?? meta.fix;
    return {
      id: r.check_id || 'semgrep-finding',
      severity: normalizeSeverity(r.extra?.severity, 'semgrep'),
      category: categorize(String(r.check_id ?? ''), meta),
      source: 'semgrep' as const,
      title: String(r.extra?.message ?? r.check_id).split('\n')[0].slice(0, 200),
      description: r.extra?.message || 'Security issue detected by Semgrep',
      location: {
        file: r.path ? toRel(String(r.path)) : undefined,
        line: r.start?.line,
        endLine: r.end?.line,
        column: r.start?.col,
      },
      remediation: fix ? `Suggested autofix: ${fix}` : undefined,
      fix: fix ? { remediation: `Suggested autofix: ${fix}` } : undefined,
      references: [meta.source, ...(Array.isArray(meta.references) ? meta.references : [])].filter(Boolean),
      metadata: {
        ruleId: r.check_id,
        cwe: meta.cwe,
        owasp: meta.owasp,
        confidence: meta.confidence,
        likelihood: meta.likelihood,
        impact: meta.impact,
      },
    };
  });
  return { findings, errors, fatal, scannedFiles: report.paths?.scanned?.length };
}
