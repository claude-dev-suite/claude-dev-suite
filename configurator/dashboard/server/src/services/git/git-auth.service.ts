// SPDX-License-Identifier: MIT
/**
 * GitHub CLI Authentication Service
 *
 * Encapsulates the `gh auth login --web` device flow that was previously
 * inlined in git.routes.ts: process lifecycle, one-time-code parsing,
 * status polling, and cancel/cleanup.
 *
 * SECURITY:
 * - Every child process is spawned with shell:false and a static argument
 *   array — no user input ever reaches a shell.
 * - The one-time code is extracted with a strict pattern (XXXX-XXXX), so raw
 *   gh output is never returned to callers.
 *
 * CONCURRENCY:
 * - startLogin() is guarded against concurrent calls: a second call while a
 *   login is already in flight joins the existing flow and receives the same
 *   one-time code instead of racing on shared state or killing the process
 *   (the frontend re-shows the auth modal with the code, so returning the
 *   existing code is the coherent behaviour).
 */

import {
  execFile as nodeExecFile,
  spawn as nodeSpawn,
  spawnSync as nodeSpawnSync,
  type ChildProcess,
} from 'node:child_process';

export type GitAuthStatus = 'none' | 'pending' | 'authenticated' | 'failed';

export interface GitAuthState {
  status: GitAuthStatus;
  account: string | null;
}

export type StartLoginResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

export interface GitAuthServiceOptions {
  spawn?: typeof nodeSpawn;
  spawnSync?: typeof nodeSpawnSync;
  execFile?: typeof nodeExecFile;
  platform?: NodeJS.Platform;
  /** How long to wait for the one-time code before giving up (ms). */
  codeTimeoutMs?: number;
  /** Delay before pressing Enter / opening the browser once the code appears (ms). */
  browserOpenDelayMs?: number;
}

/** GitHub device-flow one-time codes look like "ABCD-1234". */
const ONE_TIME_CODE_PATTERN = /([A-Z0-9]{4}-[A-Z0-9]{4})/;

const GH_NOT_INSTALLED_ERROR =
  'GitHub CLI (gh) is not installed. Install it from https://cli.github.com';
const NO_CODE_ERROR = 'Failed to get one-time code from GitHub CLI';

export class GitAuthService {
  private readonly spawn: typeof nodeSpawn;
  private readonly spawnSync: typeof nodeSpawnSync;
  private readonly execFile: typeof nodeExecFile;
  private readonly platform: NodeJS.Platform;
  private readonly codeTimeoutMs: number;
  private readonly browserOpenDelayMs: number;

  private proc: ChildProcess | null = null;
  private status: GitAuthStatus = 'none';
  private account: string | null = null;
  private code: string | null = null;
  private inFlight: Promise<StartLoginResult> | null = null;

  constructor(options: GitAuthServiceOptions = {}) {
    this.spawn = options.spawn ?? nodeSpawn;
    this.spawnSync = options.spawnSync ?? nodeSpawnSync;
    this.execFile = options.execFile ?? nodeExecFile;
    this.platform = options.platform ?? process.platform;
    this.codeTimeoutMs = options.codeTimeoutMs ?? 30_000;
    this.browserOpenDelayMs = options.browserOpenDelayMs ?? 500;
  }

  /**
   * Current auth state, polled by GET /api/git/auth-status.
   */
  getState(): GitAuthState {
    return { status: this.status, account: this.account };
  }

  /**
   * Kill any running auth process and reset state.
   */
  cancel(): void {
    if (this.proc && !this.proc.killed) {
      this.proc.kill();
    }
    this.proc = null;
    this.status = 'none';
    this.account = null;
    this.code = null;
    this.inFlight = null;
  }

  /**
   * Start (or join) a `gh auth login --web` flow and resolve with the
   * one-time device code.
   *
   * Concurrency guard:
   * - If a login attempt is already awaiting its one-time code, the same
   *   in-flight promise is returned (single spawn, both callers get the code).
   * - If a login is pending and the code was already obtained, the existing
   *   code is returned without spawning a new process.
   */
  async startLogin(): Promise<StartLoginResult> {
    if (this.inFlight) {
      return this.inFlight;
    }
    if (this.status === 'pending' && this.code && this.proc && !this.proc.killed) {
      return { ok: true, code: this.code };
    }

    const attempt = this.beginLogin();
    this.inFlight = attempt;
    try {
      return await attempt;
    } finally {
      this.inFlight = null;
    }
  }

  // ============================================
  // INTERNALS
  // ============================================

  /**
   * Resolve gh executable name cross-platform.
   * On Windows `gh` is installed as `gh.cmd` (or `gh.exe` on PATH); using
   * shell:false requires the exact executable name so we check the platform.
   */
  private ghExecutable(): string {
    return this.platform === 'win32' ? 'gh.cmd' : 'gh';
  }

  private isGhInstalled(): boolean {
    const check = this.spawnSync(this.ghExecutable(), ['--version'], {
      encoding: 'utf-8',
      shell: false,
    });
    return check.status === 0;
  }

  private async beginLogin(): Promise<StartLoginResult> {
    try {
      if (!this.isGhInstalled()) {
        return { ok: false, error: GH_NOT_INSTALLED_ERROR };
      }

      // Kill any stale auth process from a previous attempt (defensive:
      // completed/failed attempts already cleared this.proc).
      if (this.proc && !this.proc.killed) {
        this.proc.kill();
      }

      this.status = 'pending';
      this.account = null;
      this.code = null;

      // Spawn gh auth login --web  (shell:false — args are static, no injection risk)
      const proc = this.spawn(
        this.ghExecutable(),
        ['auth', 'login', '--web', '--git-protocol', 'https'],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
        }
      );
      this.proc = proc;

      proc.on('close', (exitCode) => {
        // Ignore close events from stale processes — a newer login owns the state.
        if (this.proc !== proc) return;
        this.handleClose(exitCode);
      });

      const code = await this.waitForCode(proc);

      if (!code) {
        // Process may have errored, exited early, or timed out
        if (this.proc === proc) {
          if (!proc.killed) proc.kill();
          this.proc = null;
          this.status = 'none';
        }
        return { ok: false, error: NO_CODE_ERROR };
      }

      this.code = code;
      return { ok: true, code };
    } catch (err) {
      this.status = 'none';
      this.proc = null;
      this.code = null;
      throw err;
    }
  }

  /**
   * Wait (up to codeTimeoutMs) for the one-time code to appear on the gh
   * process stdout/stderr. Only the strict XXXX-XXXX match is ever returned.
   */
  private waitForCode(proc: ChildProcess): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      let outputBuffer = '';
      let settled = false;

      const settle = (value: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      };

      const timeout = setTimeout(() => settle(null), this.codeTimeoutMs);

      const handleData = (chunk: Buffer | string) => {
        if (settled) return;
        outputBuffer += chunk.toString();
        const match = outputBuffer.match(ONE_TIME_CODE_PATTERN);
        if (match?.[1]) {
          this.pressEnterAndOpenBrowser(proc);
          settle(match[1]);
        }
      };

      proc.stdout?.on('data', handleData);
      proc.stderr?.on('data', handleData);

      proc.on('error', () => settle(null));
    });
  }

  /**
   * gh waits for an Enter keypress before opening the browser; send it and
   * open the device-login page ourselves as a fallback (the stdin write may
   * not work on Windows).
   */
  private pressEnterAndOpenBrowser(proc: ChildProcess): void {
    setTimeout(() => {
      try {
        proc.stdin?.write('\n');
      } catch {
        // stdin may already be closed
      }
      // SECURITY: Use execFile with argument array to prevent command injection
      const openCmd =
        this.platform === 'win32' ? 'cmd' : this.platform === 'darwin' ? 'open' : 'xdg-open';
      const openArgs =
        this.platform === 'win32'
          ? ['/c', 'start', '', 'https://github.com/login/device']
          : ['https://github.com/login/device'];
      this.execFile(openCmd, openArgs, { shell: false }, () => {
        /* ignore result */
      });
    }, this.browserOpenDelayMs);
  }

  private handleClose(exitCode: number | null): void {
    const ghExe = this.ghExecutable();

    if (exitCode === 0) {
      this.status = 'authenticated';

      // Configure git credentials  (shell:false — static args)
      this.spawnSync(ghExe, ['auth', 'setup-git'], { shell: false });

      // Get the authenticated account  (shell:false — static args)
      const whoami = this.spawnSync(ghExe, ['auth', 'status'], {
        encoding: 'utf-8',
        shell: false,
      });
      const output = `${whoami.stdout ?? ''}${whoami.stderr ?? ''}`;
      const accountMatch =
        output.match(/Logged in to [^ ]+ account (\S+)/i) ||
        output.match(/Logged in to [^ ]+ as (\S+)/i);
      this.account = accountMatch?.[1] || 'unknown';
    } else {
      this.status = 'failed';
    }

    this.proc = null;
    this.code = null;
  }
}

/** Shared instance used by the git routes. */
export const gitAuthService = new GitAuthService();
