// SPDX-License-Identifier: MIT
/**
 * scan_all: run every applicable scan and report each one explicitly as
 * ok / partial / failed / skipped — with the reason — so a missing tool or a
 * crashed scanner can never read as "no findings".
 */

import type { ScanResult, ScanType, Summary, ThresholdSeverity } from '../types.js';
import { mergeSummaries } from '../utils/normalizer.js';
import { validateScanPath } from '../utils/paths.js';
import { scanDependencies } from './dependencies.js';
import { scanSecrets } from './secrets.js';
import { scanCode } from './code.js';
import { scanContainer } from './container.js';

export const ALL_SCAN_TYPES: ScanType[] = ['dependencies', 'secrets', 'code', 'container'];

export interface ScanAllInput {
  path: string;
  include?: ScanType[];
  containerTarget?: string;
  severityThreshold?: ThresholdSeverity;
  maxResults?: number;
  timeoutSeconds?: number;
  baseRef?: string;
  scanHistory?: boolean;
  rules?: string[];
  excludePaths?: string[];
}

export interface SubScan {
  status: 'ok' | 'partial' | 'failed' | 'skipped';
  reason?: string;
  result?: ScanResult;
}

export interface ScanAllResult {
  status: 'ok' | 'partial' | 'failed';
  timestamp: string;
  totalDuration: number;
  scans: Partial<Record<ScanType, SubScan>>;
  summary: Summary;
}

export async function scanAll(input: ScanAllInput): Promise<ScanAllResult> {
  const startedAt = Date.now();
  const root = validateScanPath(input.path, { requireDirectory: true });
  const include = new Set<ScanType>(input.include?.length ? input.include : ALL_SCAN_TYPES);
  const common = { severityThreshold: input.severityThreshold, maxResults: input.maxResults, timeoutSeconds: input.timeoutSeconds };
  const scans: Partial<Record<ScanType, SubScan>> = {};

  const runners: Partial<Record<ScanType, () => Promise<ScanResult | SubScan>>> = {
    dependencies: () => scanDependencies({ path: root, excludePaths: input.excludePaths, ...common }),
    secrets: () =>
      scanSecrets({ path: root, scanHistory: input.scanHistory, baseRef: input.baseRef, excludePaths: input.excludePaths, ...common }),
    code: () => scanCode({ path: root, rules: input.rules, baseRef: input.baseRef, excludePaths: input.excludePaths, ...common }),
    container: async () =>
      input.containerTarget
        ? scanContainer({ target: input.containerTarget, type: 'image', ...common })
        : { status: 'skipped', reason: 'no containerTarget given (pass an image name to scan one)' },
  };

  // Sequential on purpose: several scans drive trivy, whose DB cache does not tolerate concurrent processes.
  for (const type of ALL_SCAN_TYPES) {
    if (!include.has(type)) continue;
    try {
      const out = await runners[type]!();
      if (!('scanType' in out)) {
        scans[type] = out;
        continue;
      }
      const r = out;
      switch (r.status) {
        case 'ok':
          scans[type] = { status: 'ok', result: r };
          break;
        case 'partial':
          scans[type] = { status: 'partial', reason: r.warnings.slice(0, 3).join('; ') || 'part of the scope was not covered', result: r };
          break;
        case 'unavailable':
          scans[type] = { status: 'skipped', reason: `tool not installed: ${r.error}`, result: r };
          break;
        case 'skipped':
          scans[type] = { status: 'skipped', reason: r.warnings[0] ?? 'nothing applicable to scan', result: r };
          break;
        default:
          scans[type] = { status: 'failed', reason: r.error ?? 'scan failed', result: r };
      }
    } catch (err) {
      scans[type] = { status: 'failed', reason: err instanceof Error ? err.message : String(err) };
    }
  }

  const subs = Object.values(scans) as SubScan[];
  const ran = subs.filter((s) => s.status === 'ok' || s.status === 'partial');
  const bad = subs.filter((s) => s.status === 'failed' || s.status === 'partial' || (s.status === 'skipped' && s.result?.status === 'unavailable'));
  const status: ScanAllResult['status'] = bad.length === 0 ? 'ok' : ran.length === 0 ? 'failed' : 'partial';

  return {
    status,
    timestamp: new Date().toISOString(),
    totalDuration: Date.now() - startedAt,
    scans,
    summary: mergeSummaries(subs.filter((s) => s.result).map((s) => s.result!.summary)),
  };
}
