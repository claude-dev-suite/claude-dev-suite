// SPDX-License-Identifier: MIT
/**
 * Normalised diagnostics (one shape for every linter and analyzer) and SARIF.
 */

import { createHash } from 'crypto';

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  /** Repo-relative POSIX path. */
  file: string;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  severity: Severity;
  /** Rule / code, e.g. `no-unused-vars`, `E501`, `TS2322`, `long-method`. */
  rule: string;
  message: string;
  /** Producing tool: eslint, ruff, tsc, code-quality… */
  tool: string;
  fixable?: boolean;
  suggestion?: string;
  /** Symbol the finding is about (function/class name), for stable fingerprints. */
  symbol?: string;
  details?: Record<string, unknown>;
}

const SARIF_LEVEL: Record<Severity, string> = { error: 'error', warning: 'warning', info: 'note' };

/** SARIF 2.1.0 log with one run per tool; URIs are relative to %SRCROOT%. */
export function toSarif(
  diagnostics: Diagnostic[],
  rootUri: string,
  toolVersions: Record<string, string | undefined> = {},
  properties?: Record<string, unknown>
): unknown {
  const byTool = new Map<string, Diagnostic[]>();
  for (const d of diagnostics) {
    const list = byTool.get(d.tool) ?? [];
    list.push(d);
    byTool.set(d.tool, list);
  }
  if (byTool.size === 0) byTool.set('code-quality', []);
  const runs = [...byTool.entries()].map(([tool, diags]) => {
    const rules = [...new Set(diags.map((d) => d.rule))].map((id) => ({ id }));
    return {
      tool: { driver: { name: tool, ...(toolVersions[tool] ? { version: toolVersions[tool] } : {}), rules } },
      originalUriBaseIds: { SRCROOT: { uri: rootUri.endsWith('/') ? rootUri : rootUri + '/' } },
      results: diags.map((d) => ({
        ruleId: d.rule,
        level: SARIF_LEVEL[d.severity],
        message: { text: d.message },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: d.file, uriBaseId: 'SRCROOT' },
              region: {
                startLine: Math.max(1, d.line),
                ...(d.column ? { startColumn: d.column } : {}),
                ...(d.endLine ? { endLine: d.endLine } : {}),
                ...(d.endColumn ? { endColumn: d.endColumn } : {}),
              },
            },
          },
        ],
        partialFingerprints: { primaryLocationLineHash: fingerprint(d) },
      })),
    };
  });
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    ...(properties ? { properties } : {}),
    runs,
  };
}

/**
 * Line-independent identity of a finding: tool, file, rule, symbol and the
 * message with numbers blanked — so moving code does not make it "new".
 */
export function fingerprint(d: Pick<Diagnostic, 'tool' | 'file' | 'rule' | 'symbol' | 'message'>): string {
  const msg = d.message.replace(/\d+(\.\d+)?/g, '#').replace(/\s+/g, ' ').trim();
  return createHash('sha1').update(`${d.tool}\0${d.file}\0${d.rule}\0${d.symbol ?? ''}\0${msg}`).digest('hex').slice(0, 20);
}

export function countBySeverity(diags: Diagnostic[]): Record<Severity, number> {
  const out: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const d of diags) out[d.severity]++;
  return out;
}
