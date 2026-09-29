// SPDX-License-Identifier: MIT
/**
 * The one place the server starts a process.
 *
 * Every docker invocation goes through `runDocker`: argument array, shell:false,
 * explicit cwd, a timeout, and a per-stream output cap. The raw process runner
 * is swappable (`setRawRunner`) so tests can feed recorded CLI output without a
 * daemon, while still exercising the error classification below.
 */

import { spawn } from "child_process";
import { getConfig } from "./config.js";

export type KeepMode = "head" | "tail";

export interface RawRunOptions {
  cwd: string;
  timeoutMs: number;
  maxBytes: number;
  keep: KeepMode;
  stdin?: string;
  env?: NodeJS.ProcessEnv;
}

export interface RawRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  /** Set when the process could not be started at all (e.g. ENOENT). */
  spawnError?: NodeJS.ErrnoException;
}

export type RawRunner = (bin: string, args: string[], opts: RawRunOptions) => Promise<RawRunResult>;

/** Collects a stream while keeping at most `max` bytes from the head or the tail. */
class CappedBuffer {
  private chunks: Buffer[] = [];
  private size = 0;
  truncated = false;
  constructor(private readonly max: number, private readonly keep: KeepMode) {}

  push(chunk: Buffer): void {
    if (this.keep === "head") {
      if (this.size >= this.max) {
        this.truncated = true;
        return;
      }
      const room = this.max - this.size;
      if (chunk.length > room) {
        this.chunks.push(chunk.subarray(0, room));
        this.size += room;
        this.truncated = true;
      } else {
        this.chunks.push(chunk);
        this.size += chunk.length;
      }
      return;
    }
    this.chunks.push(chunk);
    this.size += chunk.length;
    // Compact occasionally rather than on every chunk.
    if (this.size > this.max * 2) this.compact();
  }

  private compact(): void {
    if (this.size <= this.max) return;
    const all = Buffer.concat(this.chunks);
    this.chunks = [all.subarray(all.length - this.max)];
    this.size = this.max;
    this.truncated = true;
  }

  toString(): string {
    if (this.keep === "tail") this.compact();
    return Buffer.concat(this.chunks).toString("utf8");
  }
}

export const spawnRunner: RawRunner = (bin, args, opts) =>
  new Promise((resolve) => {
    const out = new CappedBuffer(opts.maxBytes, opts.keep);
    const err = new CappedBuffer(opts.maxBytes, opts.keep);
    let timedOut = false;
    let settled = false;

    let child;
    try {
      child = spawn(bin, args, {
        cwd: opts.cwd,
        env: opts.env ?? process.env,
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e) {
      resolve({
        stdout: "", stderr: "", exitCode: null, timedOut: false,
        stdoutTruncated: false, stderrTruncated: false,
        spawnError: e as NodeJS.ErrnoException,
      });
      return;
    }

    const finish = (exitCode: number | null, spawnError?: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      resolve({
        stdout: out.toString(),
        stderr: err.toString(),
        exitCode,
        timedOut,
        stdoutTruncated: out.truncated,
        stderrTruncated: err.truncated,
        spawnError,
      });
    };

    let killTimer: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
      killTimer.unref();
    }, opts.timeoutMs);
    timer.unref();

    child.stdout.on("data", (c: Buffer) => out.push(c));
    child.stderr.on("data", (c: Buffer) => err.push(c));
    child.on("error", (e: NodeJS.ErrnoException) => finish(null, e));
    child.on("close", (code) => finish(code));

    child.stdin.on("error", () => { /* child exited before reading stdin */ });
    if (opts.stdin !== undefined) child.stdin.end(opts.stdin);
    else child.stdin.end();
  });

let rawRunner: RawRunner = spawnRunner;

/** Replace the process runner (tests). Returns the previous one. */
export function setRawRunner(runner: RawRunner): RawRunner {
  const prev = rawRunner;
  rawRunner = runner;
  return prev;
}

// ============================================================================
// Errors
// ============================================================================

export type DockerErrorCode =
  | "DOCKER_CLI_NOT_FOUND"
  | "DOCKER_DAEMON_UNAVAILABLE"
  | "TIMEOUT"
  | "NOT_FOUND"
  | "COMMAND_FAILED"
  | "INVALID_ARGUMENT"
  | "PARSE_ERROR";

export class DockerError extends Error {
  constructor(
    public readonly code: DockerErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "DockerError";
  }
}

const DAEMON_DOWN_PATTERNS = [
  /cannot connect to the docker daemon/i,
  /failed to connect to the docker api/i,
  /error during connect/i,
  /is the docker daemon running/i,
  /docker daemon is not running/i,
  /the system cannot find the file specified.*pipe/i,
  /pipe.*the system cannot find the file specified/i,
  /cannot connect to podman/i,
  /unable to connect to podman/i,
];

const NOT_FOUND_PATTERNS = [
  /no such (container|image|object|network|volume|service)/i,
  /error: no such/i,
  /not found/i,
];

export function isDaemonUnavailable(stderr: string): boolean {
  return DAEMON_DOWN_PATTERNS.some((re) => re.test(stderr));
}

// ============================================================================
// runDocker
// ============================================================================

export interface RunDockerOptions {
  cwd?: string;
  timeoutMs?: number;
  maxBytes?: number;
  keep?: KeepMode;
  stdin?: string;
  /** Docker context to run against (`--context`), validated by the caller. */
  context?: string;
  /** Return non-zero exits instead of throwing (the caller inspects exitCode). */
  allowNonZero?: boolean;
  /** Binary override (docker-compose v1 fallback). Defaults to DOCKER_CLI. */
  bin?: string;
  /** Values to scrub from any output before it is returned (env values, passwords). */
  secrets?: string[];
  /** Extra environment for this call only (e.g. DOCKER_CONTEXT for standalone docker-compose). */
  extraEnv?: Record<string, string>;
  /** Return a timed-out run instead of throwing (bounded `logs --follow`). */
  allowTimeout?: boolean;
}

export interface RunDockerResult extends RawRunResult {
  command: string;
  durationMs: number;
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

export function scrubSecrets(text: string, secrets: string[] | undefined): string {
  if (!secrets || secrets.length === 0 || !text) return text;
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 4) out = out.split(s).join("***");
  }
  return out;
}

export async function runDocker(args: string[], opts: RunDockerOptions = {}): Promise<RunDockerResult> {
  const cfg = getConfig();
  const bin = opts.bin ?? cfg.cli;
  const fullArgs = opts.context ? ["--context", opts.context, ...args] : [...args];
  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? cfg.timeoutMs;

  const raw = await rawRunner(bin, fullArgs, {
    cwd: opts.cwd ?? cfg.allowedRoots[0],
    timeoutMs,
    maxBytes: opts.maxBytes ?? cfg.maxOutputBytes,
    keep: opts.keep ?? "head",
    stdin: opts.stdin,
    env: {
      ...process.env,
      // Plain, colourless output that parses the same everywhere.
      NO_COLOR: "1",
      COMPOSE_ANSI: "never",
      BUILDKIT_PROGRESS: "plain",
      DOCKER_CLI_HINTS: "false",
      ...(opts.extraEnv ?? {}),
    },
  });

  const clean = (s: string) => scrubSecrets(s.replace(ANSI_RE, ""), opts.secrets);
  // The command line is echoed back in errors, so it is scrubbed too.
  const command = clean([bin, ...fullArgs].join(" "));
  const result: RunDockerResult = {
    ...raw,
    stdout: clean(raw.stdout),
    stderr: clean(raw.stderr),
    command,
    durationMs: Date.now() - started,
  };

  if (raw.spawnError) {
    if (raw.spawnError.code === "ENOENT") {
      throw new DockerError(
        "DOCKER_CLI_NOT_FOUND",
        `The '${bin}' CLI was not found on PATH. Install Docker (or set DOCKER_CLI to the path of a compatible CLI such as podman).`,
        { cli: bin },
      );
    }
    throw new DockerError("COMMAND_FAILED", `Could not start '${bin}': ${raw.spawnError.message}`, { command });
  }

  if (raw.timedOut) {
    if (opts.allowTimeout) return result;
    throw new DockerError(
      "TIMEOUT",
      `Command timed out after ${timeoutMs} ms and was killed: ${command}`,
      {
        command,
        timeoutMs,
        partialStdout: result.stdout.slice(-4000),
        partialStderr: result.stderr.slice(-4000),
      },
    );
  }

  if (raw.exitCode !== 0 && !opts.allowNonZero) {
    throw classifyFailure(result);
  }
  return result;
}

export function classifyFailure(result: RunDockerResult): DockerError {
  const stderr = result.stderr.trim();
  const tail = stderr.slice(-4000);
  if (isDaemonUnavailable(stderr)) {
    return new DockerError(
      "DOCKER_DAEMON_UNAVAILABLE",
      "The Docker CLI is installed but the daemon is not reachable. Start Docker Desktop / the docker service, " +
        "or check DOCKER_HOST / DOCKER_CONTEXT.",
      { command: result.command, stderr: tail },
    );
  }
  const code: DockerErrorCode = NOT_FOUND_PATTERNS.some((re) => re.test(stderr)) ? "NOT_FOUND" : "COMMAND_FAILED";
  return new DockerError(code, tail || `Command exited with code ${result.exitCode}`, {
    command: result.command,
    exitCode: result.exitCode,
    stdout: result.stdout.slice(-2000) || undefined,
  });
}
