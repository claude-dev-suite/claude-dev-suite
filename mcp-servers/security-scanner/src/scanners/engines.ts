// SPDX-License-Identifier: MIT
/**
 * Invocation of the broad engines (trivy, osv-scanner) shared by several
 * scan types. Each returns the parsed report or throws with an actionable
 * message; nothing here turns a failure into an empty result.
 */

import { join } from 'path';
import { Semaphore } from '@dev-suite/shared';
import { runTool, stderrTail } from '../utils/exec.js';
import { parseJson, readReport, withTempDir } from '../utils/report-file.js';
import { getTool, unavailableMessage, type ToolStatus } from '../utils/tool-checker.js';

// Concurrent trivy processes contend for the same vulnerability-DB cache lock
// and fail with "cache may be in use by another process"; queue them.
const trivyQueue = new Semaphore(1);

export const DEFAULT_TIMEOUT_S = 600;

export function timeoutMs(seconds?: number): number {
  const s = seconds && seconds > 0 ? Math.min(seconds, 3600) : DEFAULT_TIMEOUT_S;
  return s * 1000;
}

export class ToolUnavailableError extends Error {
  constructor(readonly tool: string, message: string) {
    super(message);
    this.name = 'ToolUnavailableError';
  }
}

export async function requireTool(id: Parameters<typeof getTool>[0]): Promise<ToolStatus & { command: NonNullable<ToolStatus['command']> }> {
  const t = await getTool(id);
  if (!t.available || !t.command) throw new ToolUnavailableError(id, unavailableMessage(id, t));
  return t as ToolStatus & { command: NonNullable<ToolStatus['command']> };
}

export interface TrivyRun {
  report: unknown;
  version?: string;
}

/**
 * Run `trivy <subcommand> ... --format json --output <tmp> [-- target]` and parse the report.
 * `args` must not contain --format/--output.
 */
export async function runTrivyJson(
  subcommand: 'fs' | 'image' | 'config' | 'repo',
  args: string[],
  target: string,
  opts: { cwd: string; timeoutSeconds?: number; format?: string }
): Promise<TrivyRun & { raw: string }> {
  const tool = await requireTool('trivy');
  const ms = timeoutMs(opts.timeoutSeconds);
  return trivyQueue.run(() =>
    withTempDir(async (dir) => {
      const out = join(dir, 'trivy-report.json');
      const format = opts.format ?? 'json';
      const fullArgs = [
        subcommand,
        '--quiet',
        '--format',
        format,
        '--output',
        out,
        // trivy's own default timeout is 5m; align it with ours so trivy does not abort first.
        '--timeout',
        `${Math.floor(ms / 1000)}s`,
        ...args,
        '--',
        target,
      ];
      const r = await runTool(tool.command, fullArgs, { cwd: opts.cwd, timeoutMs: ms + 15000, maxOutputBytes: 8 * 1024 * 1024 }, 'trivy');
      if (r.exitCode !== 0) {
        throw new Error(`trivy ${subcommand} exited with ${r.exitCode}: ${stderrTail(r.stderr) || 'no error output'}`);
      }
      const raw = readReport(out, 'trivy');
      if (raw === null || raw.trim() === '') throw new Error(`trivy ${subcommand} wrote no report: ${stderrTail(r.stderr)}`);
      return { report: format === 'json' ? parseJson(raw, 'trivy') : null, raw, version: tool.version };
    })
  );
}

/** osv-scanner v2 uses `scan source`; v1 takes the flags directly. */
export async function runOsvScanner(
  root: string,
  extraArgs: string[],
  opts: { timeoutSeconds?: number; format?: string }
): Promise<{ report: unknown; raw: string; version?: string; noPackages: boolean }> {
  const tool = await requireTool('osv-scanner');
  const ms = timeoutMs(opts.timeoutSeconds);
  const v2 = !tool.version || !/^1\./.test(tool.version);
  return withTempDir(async (dir) => {
    const out = join(dir, 'osv-report');
    const format = opts.format ?? 'json';
    const args = [
      ...(v2 ? ['scan', 'source'] : []),
      '--recursive',
      '--format',
      format,
      v2 ? '--output-file' : '--output',
      out,
      ...extraArgs,
      root,
    ];
    const r = await runTool(tool.command, args, { cwd: root, timeoutMs: ms, maxOutputBytes: 8 * 1024 * 1024 }, 'osv-scanner');
    // 0 = clean, 1 = vulnerabilities (or license violations) found, 128 = no packages found.
    if (r.exitCode === 128) return { report: null, raw: '', version: tool.version, noPackages: true };
    if (r.exitCode !== 0 && r.exitCode !== 1) {
      throw new Error(`osv-scanner exited with ${r.exitCode}: ${stderrTail(r.stderr) || 'no error output'}`);
    }
    const raw = readReport(out, 'osv-scanner');
    if (raw === null || raw.trim() === '') throw new Error(`osv-scanner wrote no report: ${stderrTail(r.stderr)}`);
    return { report: format === 'json' ? parseJson(raw, 'osv-scanner') : null, raw, version: tool.version, noPackages: false };
  });
}
