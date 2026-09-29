// SPDX-License-Identifier: MIT
/**
 * Live sources read through external CLIs: `docker logs`, `docker compose logs`,
 * `kubectl logs`, `journalctl -o json`.
 *
 * Every command runs with spawn(shell:false), an argument array, an explicit
 * cwd, a timeout and an output cap. Arguments that come from the caller are
 * validated against strict patterns and may never start with "-", so they
 * cannot be read as options. A missing CLI is reported as an actionable error,
 * never as "no logs".
 */

import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { stat } from 'fs/promises';
import type { LiveSource } from '../types.js';
import type { EnvelopeName } from '../parsers/envelopes.js';
import type { RawLine } from './files.js';
import { validateLogPath } from '../utils.js';

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  truncated: boolean;
}

export type ExecFn = (
  cmd: string, args: string[], opts: { cwd: string; timeoutMs: number; maxBytes: number },
) => Promise<ExecResult>;

export const DEFAULT_TAIL = 2000;
export const MAX_TAIL = 100000;
export const DEFAULT_TIMEOUT_S = 30;
export const MAX_TIMEOUT_S = 180;
export const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

/** Default executor: spawn without a shell, cap output, kill on timeout. */
export const spawnExec: ExecFn = (cmd, args, opts) =>
  new Promise((resolvePromise, reject) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd: opts.cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      reject(err);
      return;
    }
    const out: Buffer[] = [];
    const errBuf: Buffer[] = [];
    let size = 0;
    let truncated = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, opts.timeoutMs);
    const onData = (target: Buffer[]) => (chunk: Buffer) => {
      if (truncated) return;
      size += chunk.length;
      if (size > opts.maxBytes) {
        truncated = true;
        target.push(chunk.subarray(0, Math.max(0, chunk.length - (size - opts.maxBytes))));
        child.kill('SIGKILL');
        return;
      }
      target.push(chunk);
    };
    child.stdout!.on('data', onData(out));
    child.stderr!.on('data', onData(errBuf));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({
        stdout: Buffer.concat(out).toString('utf-8'),
        stderr: Buffer.concat(errBuf).toString('utf-8'),
        code,
        timedOut,
        truncated,
      });
    });
  });

// ---------- argument validation ----------

const NAME = /^[A-Za-z0-9][A-Za-z0-9_.\-]{0,252}$/;            // container / service / pod / deployment
const K8S_NAME = /^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$/;
const SELECTOR = /^[A-Za-z0-9][A-Za-z0-9_.\-\/=!,() ]{0,500}$/;
const UNIT = /^[A-Za-z0-9][A-Za-z0-9_.@:\\\-]{0,250}$/;
const SINCE = /^(\d+(?:s|m|h|d)|\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?)$/;

function check(value: string | undefined, re: RegExp, what: string): string | undefined {
  if (value === undefined) return undefined;
  if (!re.test(value) || value.startsWith('-')) throw new Error(`Invalid ${what}: "${value}"`);
  return value;
}

export interface LiveCommand {
  cmd: string;
  args: string[];
  cwd: string;
  envelope: EnvelopeName | null;
  label: string;
  /** docker logs writes the container's stderr to its own stderr. */
  stderrIsData: boolean;
}

/** journalctl wants "-10m" style relative times; docker/kubectl accept "10m". */
function journalSince(since: string): string {
  const m = since.match(/^(\d+)([smhd])$/);
  if (!m) return since.replace('T', ' ').replace(/Z$/, '');
  const unit = { s: 's', m: 'min', h: 'h', d: 'd' }[m[2] as 's' | 'm' | 'h' | 'd'];
  return `-${m[1]}${unit}`;
}

/** Build the exact command for a live source (pure; exported for tests). */
export async function buildLiveCommand(src: LiveSource): Promise<LiveCommand> {
  const tail = Math.min(Math.max(1, Math.floor(src.tail ?? DEFAULT_TAIL)), MAX_TAIL);
  const since = check(src.since, SINCE, 'since (use e.g. 15m, 2h, or an ISO date)');
  const cwd = tmpdir();

  switch (src.type) {
    case 'docker': {
      const container = check(src.container, NAME, 'container');
      if (!container) throw new Error('source.container is required for docker');
      const args = ['logs', '--timestamps', '--tail', String(tail)];
      if (since) args.push('--since', since);
      args.push(container);
      return { cmd: 'docker', args, cwd, envelope: 'ts-prefix', label: `docker:${container}`, stderrIsData: true };
    }
    case 'compose': {
      const args = ['compose'];
      let workDir = cwd;
      if (src.projectDir) {
        validateLogPath(src.projectDir);
        const st = await stat(src.projectDir).catch(() => null);
        if (!st?.isDirectory()) throw new Error(`source.projectDir is not a directory: ${src.projectDir}`);
        workDir = src.projectDir;
        args.push('--project-directory', src.projectDir);
      }
      if (src.composeFile) {
        validateLogPath(src.composeFile);
        args.push('-f', src.composeFile);
      }
      if (!src.projectDir && !src.composeFile) throw new Error('source.projectDir or source.composeFile is required for compose');
      args.push('logs', '--no-color', '--timestamps', '--tail', String(tail));
      if (since) args.push('--since', since);
      for (const s of src.services ?? []) args.push(check(s, NAME, 'service')!);
      return { cmd: 'docker', args, cwd: workDir, envelope: 'compose', label: `compose:${(src.services ?? ['*']).join(',')}`, stderrIsData: false };
    }
    case 'kubectl': {
      const args = ['logs'];
      const ns = check(src.namespace, K8S_NAME, 'namespace');
      if (ns) args.push('-n', ns);
      const ctx = check(src.context, NAME, 'context');
      if (ctx) args.push('--context', ctx);
      let target: string;
      if (src.pod) target = check(src.pod, K8S_NAME, 'pod')!;
      else if (src.deployment) target = `deployment/${check(src.deployment, K8S_NAME, 'deployment')}`;
      else if (src.selector) {
        args.push('-l', check(src.selector, SELECTOR, 'selector')!);
        target = '';
      } else throw new Error('source.pod, source.deployment or source.selector is required for kubectl');
      if (target) args.push(target);
      if (src.container) args.push('-c', check(src.container, K8S_NAME, 'container')!);
      else if (src.allContainers) args.push('--all-containers=true');
      if (src.previous) args.push('--previous');
      // --tail is always explicit: with -l kubectl otherwise defaults to 10 lines.
      args.push(`--tail=${tail}`, '--timestamps', '--prefix');
      if (src.selector) args.push('--max-log-requests=20');
      if (since) {
        if (/^\d+[smhd]$/.test(since)) args.push(`--since=${since}`);
        else args.push(`--since-time=${new Date(since).toISOString()}`);
      }
      return { cmd: 'kubectl', args, cwd, envelope: 'kubectl', label: `kubectl:${ns ?? 'default'}/${target || src.selector}`, stderrIsData: false };
    }
    case 'journald': {
      const args = ['-o', 'json', '--no-pager', '-n', String(tail)];
      const unit = check(src.unit, UNIT, 'unit');
      if (unit) args.push('-u', unit);
      if (since) args.push('--since', journalSince(since));
      return { cmd: 'journalctl', args, cwd, envelope: null, label: `journald:${unit ?? 'all'}`, stderrIsData: false };
    }
    default:
      throw new Error(`Unknown live source type: ${(src as { type: string }).type}`);
  }
}

export interface LiveFetch {
  label: string;
  command: string;
  envelope: EnvelopeName | null;
  lines: RawLine[];
  truncated: boolean;
  timedOut: boolean;
  warnings: string[];
}

const INSTALL_HINT: Record<string, string> = {
  docker: 'Install Docker (https://docs.docker.com/get-docker/) and make sure the daemon is running.',
  kubectl: 'Install kubectl (https://kubernetes.io/docs/tasks/tools/) and configure a kubeconfig context.',
  journalctl: 'journalctl is only available on systemd-based Linux hosts.',
};

/** Run a live source and return its lines, with stdout/stderr attributed. */
export async function fetchLive(src: LiveSource, exec: ExecFn = spawnExec): Promise<LiveFetch> {
  const c = await buildLiveCommand(src);
  const timeoutMs = Math.min(Math.max(1, src.timeoutSeconds ?? DEFAULT_TIMEOUT_S), MAX_TIMEOUT_S) * 1000;
  let res: ExecResult;
  try {
    res = await exec(c.cmd, c.args, { cwd: c.cwd, timeoutMs, maxBytes: MAX_OUTPUT_BYTES });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(`"${c.cmd}" was not found on PATH, so the ${src.type} source cannot be read. ${INSTALL_HINT[c.cmd] ?? ''}`.trim());
    }
    throw new Error(`Failed to run ${c.cmd}: ${(err as Error).message}`);
  }
  const warnings: string[] = [];
  if (res.timedOut) warnings.push(`${c.cmd} timed out after ${timeoutMs / 1000}s; output is partial`);
  if (res.truncated) warnings.push(`output exceeded ${MAX_OUTPUT_BYTES} bytes and was cut`);
  if (res.code !== 0 && !res.timedOut && !res.truncated) {
    const msg = res.stderr.trim().split('\n').slice(-3).join(' ').slice(0, 500);
    // docker logs forwards the container's stderr; only fail when there was no output at all.
    if (!c.stderrIsData || (!res.stdout && !/^\d{4}-\d{2}-\d{2}T/.test(res.stderr))) {
      throw new Error(`${c.cmd} exited with code ${res.code}: ${msg || '(no stderr)'}`);
    }
  }

  const toLines = (text: string, stream?: string): RawLine[] =>
    text.split(/\r?\n/).filter((l, i, arr) => !(i === arr.length - 1 && l === '')).map((t, i) => ({ text: t, lineNumber: i + 1, stream }));

  let lines: RawLine[];
  if (c.stderrIsData) {
    // Merge stdout and stderr back into time order by their --timestamps prefix.
    const tagged = [...toLines(res.stdout, 'stdout'), ...toLines(res.stderr, 'stderr')];
    const tsOf = (l: RawLine) => l.text.slice(0, 35).match(/^\S+/)?.[0] ?? '';
    lines = tagged
      .map((l, i) => ({ l, i, t: tsOf(l) }))
      .sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.i - b.i))
      .map(({ l }, i) => ({ ...l, lineNumber: i + 1 }));
  } else {
    lines = toLines(res.stdout);
    if (res.stderr.trim()) warnings.push(`${c.cmd} stderr: ${res.stderr.trim().split('\n').slice(-2).join(' ').slice(0, 300)}`);
  }
  return {
    label: c.label,
    command: [c.cmd, ...c.args].join(' '),
    envelope: c.envelope,
    lines,
    truncated: res.truncated,
    timedOut: res.timedOut,
    warnings,
  };
}
