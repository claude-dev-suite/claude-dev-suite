// SPDX-License-Identifier: MIT
/**
 * The one place the server starts a child process.
 *
 * Always `shell: false` with an argument array, an explicit `cwd`, a timeout
 * and a cap on captured output. The implementation is swappable so tests can
 * feed recorded linter output without the linter being installed.
 */

import { spawn } from 'child_process';

export interface ExecOptions {
  cwd: string;
  timeoutMs?: number;
  /** Cap per stream; the stream is cut and `truncated` set when exceeded. */
  maxOutputBytes?: number;
  env?: NodeJS.ProcessEnv;
}

export interface ExecResult {
  /** Exit code, or null when killed / failed to start. */
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  /** Set when the process could not be started (ENOENT, EACCES, EINVAL…). */
  spawnError?: string;
}

export type ProcessRunner = (command: string, args: string[], options: ExecOptions) => Promise<ExecResult>;

export const DEFAULT_TIMEOUT_MS = 300_000;
export const DEFAULT_MAX_OUTPUT = 64 * 1024 * 1024;

const spawnRunner: ProcessRunner = (command, args, options) =>
  new Promise((resolve) => {
    const max = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
    let stdout = '';
    let stderr = '';
    let outBytes = 0;
    let errBytes = 0;
    let truncated = false;
    let timedOut = false;
    let settled = false;

    let child;
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        shell: false,
        windowsHide: true,
        env: options.env ?? process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({
        code: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        truncated: false,
        spawnError: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => {
      if (outBytes >= max) {
        truncated = true;
        return;
      }
      outBytes += Buffer.byteLength(chunk);
      stdout += chunk;
      if (outBytes >= max) truncated = true;
    });
    child.stderr.on('data', (chunk: string) => {
      if (errBytes >= max) return;
      errBytes += Buffer.byteLength(chunk);
      stderr += chunk;
    });

    const finish = (result: ExecResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    child.on('error', (err) => {
      finish({ code: null, stdout, stderr, timedOut, truncated, spawnError: err.message });
    });
    child.on('close', (code) => {
      finish({ code, stdout, stderr, timedOut, truncated });
    });
  });

let current: ProcessRunner = spawnRunner;

export function runProcess(command: string, args: string[], options: ExecOptions): Promise<ExecResult> {
  return current(command, args, options);
}

/** Test hook: replace the process runner. Returns a restore function. */
export function setProcessRunner(fn: ProcessRunner): () => void {
  const previous = current;
  current = fn;
  return () => {
    current = previous;
  };
}
