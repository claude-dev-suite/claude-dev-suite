// SPDX-License-Identifier: MIT
/**
 * Process execution utilities.
 *
 * Invariants (all enforced here, so no caller can get them wrong):
 *  - `shell: false` always. User-supplied arguments never pass through
 *    cmd.exe or /bin/sh. The old `spawnProcess` used `shell: true` on win32,
 *    which both allowed injection through script arguments and made the
 *    timeout kill the shell instead of the target.
 *  - Timeouts kill the whole process tree (`taskkill /T /F` on Windows, the
 *    process group on POSIX), not just the direct child.
 *  - Captured output is capped; the result says when it was truncated.
 */

import { execFile, spawn } from 'child_process';
import { closeSync, existsSync, openSync, readdirSync, realpathSync, statSync } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, delimiter, dirname, extname, isAbsolute, join } from 'path';
import { pythonOverride } from './env.js';
import type { ProcessResult, Runtime } from '../types.js';

const IS_WIN = process.platform === 'win32';

/** Default per-stream capture cap. */
export const DEFAULT_MAX_OUTPUT = 1024 * 1024;

export interface SpawnOptions {
  /** Hard wall-clock limit in ms; the process tree is killed when it elapses. */
  timeout?: number;
  cwd?: string;
  env?: Record<string, string | undefined>;
  /** Per-stream capture cap in bytes (default 1 MiB). */
  maxOutputBytes?: number;
  /**
   * Polled every `pollMs`; when it resolves true the process tree is killed and
   * the result is marked `stoppedByCondition` (not an error).
   */
  stopWhen?: () => boolean | Promise<boolean>;
  pollMs?: number;
  /** Called with each complete stdout/stderr line (for readiness detection). */
  onLine?: (line: string, stream: 'stdout' | 'stderr') => void;
  /** Called once the child has a PID. */
  onSpawn?: (pid: number) => void;
  /** Aborting kills the tree. */
  signal?: AbortSignal;
  /** Write this string to stdin and close it. */
  input?: string;
  /** Stream stdout to this file instead of capturing it (for very large tool output). */
  stdoutFile?: string;
}

export interface SpawnResult extends ProcessResult {
  timedOut: boolean;
  stoppedByCondition: boolean;
  aborted: boolean;
  truncated: boolean;
  /** Set when the executable could not be started at all (e.g. ENOENT). */
  spawnError?: string;
  pid?: number;
}

/** Kill a process and all its descendants. Never throws. */
export async function killTree(pid: number): Promise<void> {
  if (!pid) return;
  if (IS_WIN) {
    await new Promise<void>((resolve) => {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve());
    });
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
}

/** Is a PID alive? Works on every platform (signal 0 only checks existence). */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

class CappedBuffer {
  private chunks: string[] = [];
  private size = 0;
  truncated = false;
  private partial = '';
  constructor(private readonly cap: number, private readonly onLine?: (l: string) => void) {}
  push(data: Buffer | string): void {
    const text = data.toString();
    if (this.onLine) {
      const combined = this.partial + text;
      const lines = combined.split(/\r?\n/);
      this.partial = lines.pop() ?? '';
      // Guard against a pathological line with no newline growing unbounded.
      if (this.partial.length > 64 * 1024) this.partial = this.partial.slice(-64 * 1024);
      for (const l of lines) this.onLine(l);
    }
    if (this.size >= this.cap) {
      this.truncated = true;
      return;
    }
    const room = this.cap - this.size;
    if (text.length > room) {
      this.chunks.push(text.slice(0, room));
      this.size = this.cap;
      this.truncated = true;
    } else {
      this.chunks.push(text);
      this.size += text.length;
    }
  }
  flushLine(): void {
    if (this.onLine && this.partial) this.onLine(this.partial);
    this.partial = '';
  }
  toString(): string {
    return this.chunks.join('');
  }
}

/**
 * Spawn a process (no shell), capture capped output, enforce a timeout by
 * killing the process tree. Never rejects: failures are reported in the result.
 */
export function spawnProcess(command: string, args: string[], options: SpawnOptions = {}): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const cap = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
    const out = new CappedBuffer(cap, options.onLine ? (l) => options.onLine!(l, 'stdout') : undefined);
    const err = new CappedBuffer(cap, options.onLine ? (l) => options.onLine!(l, 'stderr') : undefined);
    let timedOut = false;
    let stoppedByCondition = false;
    let aborted = false;
    let settled = false;
    let pollTimer: NodeJS.Timeout | undefined;
    let timeoutTimer: NodeJS.Timeout | undefined;

    let proc: ReturnType<typeof spawn>;
    let outFd: number | undefined;
    try {
      if (options.stdoutFile) outFd = openSync(options.stdoutFile, 'w');
      proc = spawn(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env } as NodeJS.ProcessEnv,
        shell: false,
        windowsHide: true,
        // A new process group on POSIX so the whole tree can be signalled.
        detached: !IS_WIN,
        stdio: ['pipe', outFd ?? 'pipe', 'pipe'],
      });
    } catch (e) {
      if (outFd !== undefined) closeSync(outFd);
      resolve({
        stdout: '', stderr: '', exitCode: -1, duration: 0, timedOut: false, stoppedByCondition: false,
        aborted: false, truncated: false, spawnError: e instanceof Error ? e.message : String(e),
      });
      return;
    }

    const finish = (exitCode: number, spawnError?: string) => {
      if (settled) return;
      settled = true;
      if (outFd !== undefined) {
        try {
          closeSync(outFd);
        } catch {
          // already closed
        }
      }
      if (pollTimer) clearInterval(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      options.signal?.removeEventListener('abort', onAbort);
      out.flushLine();
      err.flushLine();
      resolve({
        stdout: out.toString(),
        stderr: err.toString(),
        exitCode,
        duration: Date.now() - startTime,
        timedOut,
        stoppedByCondition,
        aborted,
        truncated: out.truncated || err.truncated,
        spawnError,
        pid: proc.pid,
      });
    };

    const stop = () => {
      if (proc.pid) void killTree(proc.pid);
    };
    const onAbort = () => {
      aborted = true;
      stop();
    };

    if (options.signal) {
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener('abort', onAbort, { once: true });
    }

    if (proc.pid && options.onSpawn) options.onSpawn(proc.pid);

    proc.stdout?.on('data', (d) => out.push(d));
    proc.stderr?.on('data', (d) => err.push(d));
    proc.stdin?.on('error', () => {});
    if (options.input !== undefined) proc.stdin?.end(options.input);
    else proc.stdin?.end();

    timeoutTimer = setTimeout(() => {
      timedOut = true;
      stop();
    }, options.timeout ?? 60_000);

    if (options.stopWhen) {
      let busy = false;
      pollTimer = setInterval(async () => {
        if (busy || settled) return;
        busy = true;
        try {
          if (await options.stopWhen!()) {
            stoppedByCondition = true;
            if (pollTimer) clearInterval(pollTimer);
            stop();
          }
        } catch {
          // a failing predicate never stops the process
        } finally {
          busy = false;
        }
      }, options.pollMs ?? 250);
    }

    proc.on('error', (e) => finish(-1, e.message));
    proc.on('close', (code, signal) => finish(code ?? (signal ? 128 : 1)));
  });
}

/**
 * Run a short command to completion. Accepts `{cmd, args}` (preferred) or a
 * plain string that is split on whitespace — never a shell string: there is no
 * shell path any more, so `|`, `>` and `2>/dev/null` are passed literally.
 */
export async function runCommand(
  command: string | { cmd: string; args: string[] },
  options: SpawnOptions = {}
): Promise<SpawnResult> {
  let cmd: string;
  let args: string[];
  if (typeof command === 'string') {
    const parts = command.trim().split(/\s+/);
    cmd = parts[0];
    args = parts.slice(1);
  } else {
    cmd = command.cmd;
    args = command.args;
  }
  const result = await spawnProcess(cmd, args, { maxOutputBytes: 50 * 1024 * 1024, ...options });
  if (result.spawnError && !result.stderr) result.stderr = result.spawnError;
  return result;
}

// ---------------------------------------------------------------------------
// Executable discovery
// ---------------------------------------------------------------------------

/** Locate an executable on PATH (honours PATHEXT on Windows). */
export function findOnPath(name: string): string | null {
  if (isAbsolute(name)) return existsSync(name) ? name : null;
  const dirs = (process.env.PATH ?? process.env.Path ?? '').split(delimiter).filter(Boolean);
  const exts = IS_WIN
    ? ['', ...(process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').map((e) => e.toLowerCase())]
    : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = join(dir, name + ext);
      try {
        if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
      } catch {
        // unreadable entry
      }
    }
  }
  return null;
}

/** True when `cmd` exists on PATH and `cmd args` exits 0. Cached per process. */
const availabilityCache = new Map<string, Promise<boolean>>();
export function commandAvailable(cmd: string, args: string[] = ['--version']): Promise<boolean> {
  const key = `${cmd}\0${args.join('\0')}`;
  let p = availabilityCache.get(key);
  if (!p) {
    p = runCommand({ cmd, args }, { timeout: 15_000 }).then((r) => r.exitCode === 0 && !r.spawnError);
    availabilityCache.set(key, p);
  }
  return p;
}

/** For tests. */
export function clearAvailabilityCache(): void {
  availabilityCache.clear();
  pythonCache = undefined;
}

export interface Interpreter {
  cmd: string;
  prefixArgs: string[];
  version: string;
}

let pythonCache: Promise<Interpreter | null> | undefined;

/**
 * Resolve a Python 3 interpreter. `python3` is not a given on Windows (the
 * Store alias exits non-zero), so try the platform's usual names in order,
 * honouring PERF_PROFILER_PYTHON first.
 */
export function resolvePython(): Promise<Interpreter | null> {
  if (pythonCache) return pythonCache;
  pythonCache = (async () => {
    const override = pythonOverride();
    const candidates: Array<{ cmd: string; prefixArgs: string[] }> = override
      ? [{ cmd: override, prefixArgs: [] }]
      : IS_WIN
        ? [
            { cmd: 'python', prefixArgs: [] },
            { cmd: 'py', prefixArgs: ['-3'] },
            { cmd: 'python3', prefixArgs: [] },
          ]
        : [
            { cmd: 'python3', prefixArgs: [] },
            { cmd: 'python', prefixArgs: [] },
          ];
    for (const c of candidates) {
      const r = await runCommand({ cmd: c.cmd, args: [...c.prefixArgs, '--version'] }, { timeout: 15_000 });
      const text = `${r.stdout} ${r.stderr}`;
      const m = text.match(/Python (3\.\d+(?:\.\d+)?)/);
      if (r.exitCode === 0 && m) return { ...c, version: m[1] };
    }
    return null;
  })();
  return pythonCache;
}

export async function requirePython(): Promise<Interpreter> {
  const py = await resolvePython();
  if (!py) {
    throw new Error(
      'No Python 3 interpreter found (tried ' +
        (IS_WIN ? 'python, py -3, python3' : 'python3, python') +
        '). Install Python 3 or set PERF_PROFILER_PYTHON to the interpreter path.'
    );
  }
  return py;
}

// ---------------------------------------------------------------------------
// Runtime detection and command construction
// ---------------------------------------------------------------------------

/** Detect runtime from a file extension or a directory's marker files. */
export function detectRuntime(filePath: string): Runtime {
  let isDir = false;
  try {
    isDir = statSync(filePath).isDirectory();
  } catch {
    // not on disk: fall back to the extension
  }
  if (isDir) {
    if (existsSync(join(filePath, 'go.mod'))) return 'go';
    if (existsSync(join(filePath, 'package.json'))) return 'nodejs';
    try {
      const entries = readdirSync(filePath);
      if (entries.some((e) => e.endsWith('.go'))) return 'go';
      if (entries.some((e) => /\.(cs|fs)proj$/.test(e))) return 'dotnet';
    } catch {
      // ignore
    }
    throw new Error(`Cannot detect the runtime of directory ${filePath}; pass "runtime" explicitly.`);
  }
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case '.js':
    case '.mjs':
    case '.cjs':
    case '.ts':
    case '.mts':
    case '.cts':
      return 'nodejs';
    case '.java':
    case '.jar':
    case '.class':
      return 'java';
    case '.py':
    case '.pyw':
      return 'python';
    case '.go':
      return 'go';
    case '.dll':
    case '.csproj':
    case '.fsproj':
      return 'dotnet';
    default:
      throw new Error(`Cannot detect the runtime of ${basename(filePath)} from its extension; pass "runtime" explicitly.`);
  }
}

/** Probe that a runtime's launcher exists. */
export async function checkRuntimeAvailable(runtime: Runtime): Promise<boolean> {
  switch (runtime) {
    case 'nodejs':
      return true; // we are running on Node
    case 'java':
      return commandAvailable('java', ['-version']);
    case 'python':
      return (await resolvePython()) !== null;
    case 'go':
      return commandAvailable('go', ['version']);
    case 'dotnet':
      return commandAvailable('dotnet', ['--version']);
    default:
      return false;
  }
}

/** Walk up from `start` looking for node_modules/<pkg>/package.json. */
export function findPackageUp(start: string, pkg: string): string | null {
  let dir = start;
  for (;;) {
    const candidate = join(dir, 'node_modules', pkg, 'package.json');
    if (existsSync(candidate)) return dirname(candidate);
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Node flags needed to execute a TypeScript entry point, or [] for JS. */
export function nodeTsFlags(scriptPath: string): string[] {
  if (!/\.(ts|mts|cts)$/i.test(scriptPath)) return [];
  if (findPackageUp(dirname(scriptPath), 'tsx')) return ['--import', 'tsx'];
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major > 22 || (major === 22 && minor >= 6)) return ['--experimental-strip-types'];
  throw new Error(
    'Running a .ts entry needs `tsx` installed in the project (npm i -D tsx) or Node >= 22.6 for --experimental-strip-types.'
  );
}

export interface RunSpec {
  cmd: string;
  args: string[];
  cwd: string;
}

/**
 * Build the argv that runs `scriptPath` for `runtime`, with extra runtime
 * flags inserted before the script (e.g. `--require agent.cjs`, `-XX:...`).
 */
export async function buildRunSpec(
  runtime: Runtime,
  scriptPath: string,
  args: string[] = [],
  runtimeFlags: string[] = []
): Promise<RunSpec> {
  const cwd = dirname(scriptPath);
  switch (runtime) {
    case 'nodejs':
      return { cmd: process.execPath, args: [...runtimeFlags, ...nodeTsFlags(scriptPath), scriptPath, ...args], cwd };
    case 'python': {
      const py = await requirePython();
      return { cmd: py.cmd, args: [...py.prefixArgs, ...runtimeFlags, scriptPath, ...args], cwd };
    }
    case 'java': {
      if (scriptPath.endsWith('.jar')) return { cmd: 'java', args: [...runtimeFlags, '-jar', scriptPath, ...args], cwd };
      if (scriptPath.endsWith('.class')) {
        return { cmd: 'java', args: [...runtimeFlags, '-cp', cwd, basename(scriptPath, '.class'), ...args], cwd };
      }
      return { cmd: 'java', args: [...runtimeFlags, scriptPath, ...args], cwd };
    }
    case 'dotnet': {
      if (scriptPath.endsWith('.dll')) return { cmd: 'dotnet', args: [scriptPath, ...args], cwd };
      return { cmd: 'dotnet', args: ['run', '-c', 'Release', '--project', scriptPath, '--', ...args], cwd };
    }
    case 'go': {
      const dir = statSync(scriptPath).isDirectory() ? scriptPath : dirname(scriptPath);
      return { cmd: 'go', args: ['run', '.', ...args], cwd: dir };
    }
    default:
      throw new Error(`Unsupported runtime: ${runtime}`);
  }
}

// ---------------------------------------------------------------------------
// Path validation and temp dirs
// ---------------------------------------------------------------------------

/**
 * Validate that a script path is absolute, has no NUL byte, and exists.
 * No root confinement: this is a single-user local profiling tool and the
 * operator chooses what to run.
 */
export function validateScriptPath(scriptPath: string): void {
  if (!scriptPath || typeof scriptPath !== 'string') {
    throw new Error('Script path must be a non-empty string');
  }
  if (scriptPath.includes('\0')) {
    throw new Error('Script path must not contain null bytes');
  }
  if (!isAbsolute(scriptPath)) {
    throw new Error(`Script path must be absolute, got: "${scriptPath}"`);
  }
  if (!existsSync(scriptPath)) {
    throw new Error(`Script not found: ${scriptPath}`);
  }
  try {
    realpathSync(scriptPath);
  } catch {
    throw new Error(`Script path is not accessible: "${scriptPath}"`);
  }
}

export async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `${prefix}-`));
}

export async function cleanupTempDir(dirPath: string): Promise<void> {
  try {
    await rm(dirPath, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

/** Last `n` chars of a (possibly long) output, for error messages. */
export function tail(text: string, n = 2000): string {
  return text.length > n ? '…' + text.slice(-n) : text;
}
