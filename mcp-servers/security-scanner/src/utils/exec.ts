// SPDX-License-Identifier: MIT
/**
 * Running external scanners safely.
 *
 * Every tool is spawned with `shell: false`, an argument array, an explicit
 * cwd, a timeout and an output cap. On Windows, package-manager launchers
 * (npm, pnpm, yarn) are `.cmd` batch shims that cannot be spawned without a
 * shell; `resolveCommand` reads the shim, finds the JavaScript entry it would
 * run, and returns `process.execPath <entry>` instead — so no user-controlled
 * string ever reaches cmd.exe.
 *
 * Both the resolver and the runner are swappable so tests can fake a CLI
 * without touching `child_process`.
 */

import { spawn } from 'child_process';
import { accessSync, constants, existsSync, readFileSync, statSync } from 'fs';
import { delimiter, dirname, isAbsolute, join, resolve } from 'path';

export interface ResolvedCommand {
  /** Executable actually spawned. */
  command: string;
  /** Arguments that must precede the caller's (e.g. the JS entry of a .cmd shim). */
  prefixArgs: string[];
  /** Where the tool was found, for reporting. */
  source: string;
}

export interface RunOptions {
  cwd: string;
  timeoutMs: number;
  /** Stop reading stdout beyond this many bytes and mark the run truncated. */
  maxOutputBytes?: number;
  env?: Record<string, string | undefined>;
}

export interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  signal?: string | null;
}

export type Resolver = (name: string) => ResolvedCommand | null;
export type Runner = (cmd: ResolvedCommand, args: string[], opts: RunOptions) => Promise<RunResult>;

const DEFAULT_MAX_OUTPUT = 64 * 1024 * 1024;
const STDERR_KEEP = 64 * 1024;
const IS_WINDOWS = process.platform === 'win32';
const WINDOWS_EXTS = ['.exe', '.com', '.cmd', '.bat'];

function isExecutableFile(p: string): boolean {
  try {
    if (!statSync(p).isFile()) return false;
    if (IS_WINDOWS) return true;
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find the JS entry point a cmd-shim (npm's or corepack's) would run.
 * Returns null when the shim is not in a recognised shape.
 */
export function parseCmdShim(shimPath: string, content: string): string | null {
  const dir = dirname(shimPath);
  const re = /%(?:~dp0|dp0)%?\\?([^"%\r\n]+?\.(?:c|m)?js)"/gi;
  const candidates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const rel = m[1].replace(/^\\+/, '');
    if (/prefix\.js$/i.test(rel)) continue; // npm.cmd's helper, not the CLI
    candidates.push(join(dir, rel));
  }
  for (let i = candidates.length - 1; i >= 0; i--) {
    if (existsSync(candidates[i])) return candidates[i];
  }
  return null;
}

function pathDirs(): string[] {
  // process.env is case-insensitive on Windows, so this also reads `Path`.
  const raw = process.env.PATH ?? '';
  return raw.split(delimiter).filter(Boolean);
}

export const defaultResolver: Resolver = (name: string) => {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return null;
  for (const dir of pathDirs()) {
    if (IS_WINDOWS) {
      for (const ext of WINDOWS_EXTS) {
        const candidate = join(dir, name + ext);
        if (!isExecutableFile(candidate)) continue;
        if (ext === '.cmd' || ext === '.bat') {
          let content: string;
          try {
            content = readFileSync(candidate, 'utf8');
          } catch {
            continue;
          }
          const entry = parseCmdShim(candidate, content);
          if (entry) return { command: process.execPath, prefixArgs: [entry], source: candidate };
          continue; // unknown batch file: never run it through a shell
        }
        return { command: candidate, prefixArgs: [], source: candidate };
      }
    } else {
      const candidate = join(dir, name);
      if (isExecutableFile(candidate)) return { command: candidate, prefixArgs: [], source: candidate };
    }
  }
  return null;
};

export const defaultRunner: Runner = (cmd, args, opts) =>
  new Promise((resolvePromise, reject) => {
    if (!isAbsolute(opts.cwd)) {
      reject(new Error(`cwd must be absolute: ${opts.cwd}`));
      return;
    }
    const maxOut = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
    const child = spawn(cmd.command, [...cmd.prefixArgs, ...args], {
      cwd: resolve(opts.cwd),
      shell: false,
      windowsHide: true,
      env: { ...process.env, ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const outChunks: Buffer[] = [];
    let outBytes = 0;
    let stderr = '';
    let truncated = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, opts.timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      if (truncated) return;
      if (outBytes + chunk.length > maxOut) {
        outChunks.push(chunk.subarray(0, maxOut - outBytes));
        outBytes = maxOut;
        truncated = true;
        child.kill('SIGKILL');
        return;
      }
      outChunks.push(chunk);
      outBytes += chunk.length;
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > STDERR_KEEP * 2) stderr = stderr.slice(-STDERR_KEEP);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolvePromise({
        exitCode: code,
        stdout: Buffer.concat(outChunks).toString('utf8'),
        stderr: stderr.slice(-STDERR_KEEP),
        timedOut,
        truncated,
        signal,
      });
    });
  });

let resolver: Resolver = defaultResolver;
let runner: Runner = defaultRunner;

/** Test hook: replace the resolver and/or runner. Call with no args to restore defaults. */
export function setExecImpl(impl?: { resolver?: Resolver; runner?: Runner }): void {
  resolver = impl?.resolver ?? defaultResolver;
  runner = impl?.runner ?? defaultRunner;
}

export function resolveCommand(name: string): ResolvedCommand | null {
  return resolver(name);
}

export class ToolRunError extends Error {
  constructor(message: string, readonly result?: RunResult) {
    super(message);
    this.name = 'ToolRunError';
  }
}

/** Last non-empty lines of stderr, for error messages. */
export function stderrTail(stderr: string, lines = 6): string {
  return stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-lines)
    .join(' | ')
    .slice(0, 1500);
}

/**
 * Run a resolved tool. Throws ToolRunError on spawn failure, timeout or output
 * overflow — conditions whose partial output must never be parsed as a result.
 * Non-zero exit codes are returned to the caller, because several scanners use
 * them to mean "findings present".
 */
export async function runTool(
  cmd: ResolvedCommand,
  args: string[],
  opts: RunOptions,
  label: string
): Promise<RunResult> {
  let result: RunResult;
  try {
    result = await runner(cmd, args, opts);
  } catch (err) {
    throw new ToolRunError(`${label} could not be started: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (result.timedOut) {
    throw new ToolRunError(
      `${label} timed out after ${Math.round(opts.timeoutMs / 1000)}s (raise timeoutSeconds or narrow the path)`,
      result
    );
  }
  if (result.truncated) {
    throw new ToolRunError(
      `${label} produced more than ${Math.round((opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT) / 1048576)} MB of output; narrow the scan`,
      result
    );
  }
  return result;
}
