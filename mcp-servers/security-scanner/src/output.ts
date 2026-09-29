// SPDX-License-Identifier: MIT
/**
 * Rendering scan results for the model: normalized JSON or SARIF, optional
 * write to a file (opt-in, no overwrite by default), redaction always.
 */

import { writeFileSync } from 'fs';
import type { ScanResult } from './types.js';
import type { ScanAllResult } from './scanners/all.js';
import { redactDeep } from './utils/redact.js';
import { toSarif } from './utils/sarif.js';
import { validateOutputFile } from './scanners/sbom.js';

export interface OutputOptions {
  format?: 'json' | 'sarif';
  outputFile?: string;
  overwrite?: boolean;
}

type Content = { type: 'text'; text: string };

function versions(results: ScanResult[]): Record<string, string | undefined> {
  const v: Record<string, string | undefined> = {};
  for (const r of results) for (const e of r.engines) if (e.version) v[e.engine] = e.version;
  return v;
}

function write(file: string, doc: unknown, overwrite: boolean): string {
  const abs = validateOutputFile(file, overwrite);
  writeFileSync(abs, JSON.stringify(doc, null, 2), { flag: overwrite ? 'w' : 'wx' });
  return abs;
}

function statusOnly(r: ScanResult): Record<string, unknown> {
  const { findings: _f, ...rest } = r;
  return rest;
}

export function renderScan(result: ScanResult, opts: OutputOptions): Content[] {
  const safe = redactDeep(result);
  if ((opts.format ?? 'json') === 'json') {
    const written = opts.outputFile ? write(opts.outputFile, safe, opts.overwrite ?? false) : undefined;
    return [{ type: 'text', text: JSON.stringify(written ? { ...safe, outputFile: written } : safe, null, 2) }];
  }
  const sarif = toSarif([safe], versions([safe]));
  const written = opts.outputFile ? write(opts.outputFile, sarif, opts.overwrite ?? false) : undefined;
  const meta = { ...statusOnly(safe), format: 'sarif', outputFile: written };
  return written
    ? [{ type: 'text', text: JSON.stringify(meta, null, 2) }]
    : [
        { type: 'text', text: JSON.stringify(meta, null, 2) },
        { type: 'text', text: JSON.stringify(sarif) },
      ];
}

export function renderScanAll(result: ScanAllResult, opts: OutputOptions): Content[] {
  const safe = redactDeep(result);
  if ((opts.format ?? 'json') === 'json') {
    const written = opts.outputFile ? write(opts.outputFile, safe, opts.overwrite ?? false) : undefined;
    return [{ type: 'text', text: JSON.stringify(written ? { ...safe, outputFile: written } : safe, null, 2) }];
  }
  const results = Object.values(safe.scans)
    .map((s) => s?.result)
    .filter((r): r is ScanResult => !!r);
  const sarif = toSarif(results, versions(results));
  const written = opts.outputFile ? write(opts.outputFile, sarif, opts.overwrite ?? false) : undefined;
  const meta = {
    status: safe.status,
    summary: safe.summary,
    scans: Object.fromEntries(
      Object.entries(safe.scans).map(([k, s]) => [k, { status: s!.status, reason: s!.reason, truncated: s!.result?.truncated }])
    ),
    format: 'sarif',
    outputFile: written,
  };
  return written
    ? [{ type: 'text', text: JSON.stringify(meta, null, 2) }]
    : [
        { type: 'text', text: JSON.stringify(meta, null, 2) },
        { type: 'text', text: JSON.stringify(sarif) },
      ];
}
