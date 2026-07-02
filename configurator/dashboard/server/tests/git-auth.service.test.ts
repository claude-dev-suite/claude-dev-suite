// SPDX-License-Identifier: MIT
/**
 * Tests for git/git-auth.service.ts — GitAuthService
 *
 * The gh process is fully mocked (EventEmitter-based fake), so no real
 * gh/git commands run. Child-process functions are injected via the
 * GitAuthService constructor options.
 */

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  GitAuthService,
  type GitAuthServiceOptions,
} from '../src/services/git/git-auth.service.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeGhProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = { write: vi.fn() };
  killed = false;
  kill = vi.fn((): boolean => {
    this.killed = true;
    return true;
  });
}

interface Harness {
  service: GitAuthService;
  procs: FakeGhProcess[];
  spawn: ReturnType<typeof vi.fn>;
  spawnSync: ReturnType<typeof vi.fn>;
  execFile: ReturnType<typeof vi.fn>;
}

function createHarness(
  overrides: Partial<GitAuthServiceOptions> = {},
  spawnSyncImpl?: (cmd: string, args: string[]) => { status: number | null; stdout: string; stderr: string }
): Harness {
  const procs: FakeGhProcess[] = [];

  const spawn = vi.fn(() => {
    const proc = new FakeGhProcess();
    procs.push(proc);
    return proc;
  });

  const spawnSync = vi.fn(
    spawnSyncImpl ?? (() => ({ status: 0, stdout: '', stderr: '' }))
  );

  const execFile = vi.fn();

  const service = new GitAuthService({
    spawn: spawn as unknown as GitAuthServiceOptions['spawn'],
    spawnSync: spawnSync as unknown as GitAuthServiceOptions['spawnSync'],
    execFile: execFile as unknown as GitAuthServiceOptions['execFile'],
    platform: 'linux',
    codeTimeoutMs: 200,
    browserOpenDelayMs: 0,
    ...overrides,
  });

  return { service, procs, spawn, spawnSync, execFile };
}

function emitCode(proc: FakeGhProcess, code = 'ABCD-1234'): void {
  proc.stdout.emit('data', Buffer.from(`! First copy your one-time code: ${code}\n`));
}

/** Wait for pending macrotasks (the browser-open setTimeout with delay 0). */
function flushTimers(ms = 10): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------

describe('GitAuthService', () => {
  // ----------------------------------------------------------------
  // Initial state
  // ----------------------------------------------------------------
  describe('getState', () => {
    it('should start with status none and no account', () => {
      const { service } = createHarness();
      expect(service.getState()).toEqual({ status: 'none', account: null });
    });
  });

  // ----------------------------------------------------------------
  // gh availability check
  // ----------------------------------------------------------------
  describe('gh CLI availability', () => {
    it('should return an error when gh is not installed', async () => {
      const { service, spawn } = createHarness({}, () => ({
        status: 1,
        stdout: '',
        stderr: 'command not found',
      }));

      const result = await service.startLogin();

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/not installed/i);
      expect(spawn).not.toHaveBeenCalled();
      expect(service.getState().status).toBe('none');
    });

    it('should check gh with shell:false and static args', async () => {
      const { service, spawnSync } = createHarness({}, () => ({
        status: 1,
        stdout: '',
        stderr: '',
      }));

      await service.startLogin();

      expect(spawnSync).toHaveBeenCalledWith(
        'gh',
        ['--version'],
        expect.objectContaining({ shell: false })
      );
    });

    it('should use gh.cmd on Windows', async () => {
      const { service, spawnSync } = createHarness({ platform: 'win32' }, () => ({
        status: 1,
        stdout: '',
        stderr: '',
      }));

      await service.startLogin();

      expect(spawnSync).toHaveBeenCalledWith('gh.cmd', ['--version'], expect.anything());
    });
  });

  // ----------------------------------------------------------------
  // Happy path: one-time code
  // ----------------------------------------------------------------
  describe('startLogin — one-time code', () => {
    it('should spawn gh auth login with shell:false and return the parsed code', async () => {
      const { service, procs, spawn } = createHarness();

      const promise = service.startLogin();
      expect(procs).toHaveLength(1);
      emitCode(procs[0]!, 'WXYZ-9876');

      const result = await promise;

      expect(spawn).toHaveBeenCalledWith(
        'gh',
        ['auth', 'login', '--web', '--git-protocol', 'https'],
        expect.objectContaining({ shell: false, stdio: ['pipe', 'pipe', 'pipe'] })
      );
      expect(result).toEqual({ ok: true, code: 'WXYZ-9876' });
      expect(service.getState().status).toBe('pending');
    });

    it('should also parse the code from stderr', async () => {
      const { service, procs } = createHarness();

      const promise = service.startLogin();
      procs[0]!.stderr.emit('data', Buffer.from('one-time code: AB12-CD34\n'));

      const result = await promise;
      expect(result).toEqual({ ok: true, code: 'AB12-CD34' });
    });

    it('should return only the strict code match, never raw gh output', async () => {
      const { service, procs } = createHarness();

      const promise = service.startLogin();
      procs[0]!.stdout.emit(
        'data',
        Buffer.from('[1m! garbage $(rm -rf) before...\ncode: QRST-0001 trailing junk\n')
      );

      const result = await promise;
      expect(result).toEqual({ ok: true, code: 'QRST-0001' });
    });

    it('should handle the code arriving across multiple chunks', async () => {
      const { service, procs } = createHarness();

      const promise = service.startLogin();
      procs[0]!.stdout.emit('data', Buffer.from('! First copy your one-time code: AB'));
      procs[0]!.stdout.emit('data', Buffer.from('CD-1234\n'));

      const result = await promise;
      expect(result).toEqual({ ok: true, code: 'ABCD-1234' });
    });

    it('should press Enter and open the browser after the code appears', async () => {
      const { service, procs, execFile } = createHarness();

      const promise = service.startLogin();
      emitCode(procs[0]!);
      await promise;
      await flushTimers();

      expect(procs[0]!.stdin.write).toHaveBeenCalledWith('\n');
      expect(execFile).toHaveBeenCalledWith(
        'xdg-open',
        ['https://github.com/login/device'],
        expect.objectContaining({ shell: false }),
        expect.any(Function)
      );
    });

    it('should open the browser via cmd /c start on Windows', async () => {
      const { service, procs, execFile } = createHarness({ platform: 'win32' });

      const promise = service.startLogin();
      emitCode(procs[0]!);
      await promise;
      await flushTimers();

      expect(execFile).toHaveBeenCalledWith(
        'cmd',
        ['/c', 'start', '', 'https://github.com/login/device'],
        expect.objectContaining({ shell: false }),
        expect.any(Function)
      );
    });
  });

  // ----------------------------------------------------------------
  // Failure paths
  // ----------------------------------------------------------------
  describe('startLogin — failure paths', () => {
    it('should time out, kill the process, and reset to none when no code appears', async () => {
      const { service, procs } = createHarness({ codeTimeoutMs: 20 });

      const result = await service.startLogin();

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/one-time code/i);
      expect(procs[0]!.kill).toHaveBeenCalled();
      expect(service.getState().status).toBe('none');
    });

    it('should return an error when the process emits an error event', async () => {
      const { service, procs } = createHarness();

      const promise = service.startLogin();
      procs[0]!.emit('error', new Error('spawn ENOENT'));

      const result = await promise;
      expect(result.ok).toBe(false);
      expect(service.getState().status).toBe('none');
    });

    it('should not let a stale close event override state after a timeout', async () => {
      const { service, procs } = createHarness({ codeTimeoutMs: 20 });

      await service.startLogin(); // times out, kills process
      procs[0]!.emit('close', 1); // late close from the killed process

      expect(service.getState().status).toBe('none');
    });
  });

  // ----------------------------------------------------------------
  // Process exit → status transitions
  // ----------------------------------------------------------------
  describe('process close handling', () => {
    it('should become authenticated, run setup-git, and parse the account on exit 0', async () => {
      const { service, procs, spawnSync } = createHarness({}, (_cmd, args) => {
        if (args[0] === 'auth' && args[1] === 'status') {
          return {
            status: 0,
            stdout: 'github.com\n  ✓ Logged in to github.com account claude-dev-suite (keyring)\n',
            stderr: '',
          };
        }
        return { status: 0, stdout: '', stderr: '' };
      });

      const promise = service.startLogin();
      emitCode(procs[0]!);
      await promise;

      procs[0]!.emit('close', 0);

      expect(service.getState()).toEqual({
        status: 'authenticated',
        account: 'claude-dev-suite',
      });
      expect(spawnSync).toHaveBeenCalledWith(
        'gh',
        ['auth', 'setup-git'],
        expect.objectContaining({ shell: false })
      );
      expect(spawnSync).toHaveBeenCalledWith(
        'gh',
        ['auth', 'status'],
        expect.objectContaining({ shell: false })
      );
    });

    it('should parse the older "Logged in to ... as <account>" format', async () => {
      const { service, procs } = createHarness({}, (_cmd, args) => {
        if (args[0] === 'auth' && args[1] === 'status') {
          return {
            status: 0,
            stdout: '',
            stderr: '✓ Logged in to github.com as octocat (oauth_token)\n',
          };
        }
        return { status: 0, stdout: '', stderr: '' };
      });

      const promise = service.startLogin();
      emitCode(procs[0]!);
      await promise;
      procs[0]!.emit('close', 0);

      expect(service.getState().account).toBe('octocat');
    });

    it('should fall back to "unknown" account when gh auth status is unparseable', async () => {
      const { service, procs } = createHarness();

      const promise = service.startLogin();
      emitCode(procs[0]!);
      await promise;
      procs[0]!.emit('close', 0);

      expect(service.getState()).toEqual({ status: 'authenticated', account: 'unknown' });
    });

    it('should become failed on non-zero exit', async () => {
      const { service, procs } = createHarness();

      const promise = service.startLogin();
      emitCode(procs[0]!);
      await promise;
      procs[0]!.emit('close', 1);

      expect(service.getState().status).toBe('failed');
    });
  });

  // ----------------------------------------------------------------
  // Concurrency guard
  // ----------------------------------------------------------------
  describe('concurrency guard', () => {
    it('should join an in-flight login: single spawn, same code for both callers', async () => {
      const { service, procs, spawn } = createHarness();

      const p1 = service.startLogin();
      const p2 = service.startLogin();
      emitCode(procs[0]!, 'SAME-0001');

      const [r1, r2] = await Promise.all([p1, p2]);

      expect(spawn).toHaveBeenCalledTimes(1);
      expect(r1).toEqual({ ok: true, code: 'SAME-0001' });
      expect(r2).toEqual({ ok: true, code: 'SAME-0001' });
    });

    it('should return the existing code while a login is still pending', async () => {
      const { service, procs, spawn } = createHarness();

      const p1 = service.startLogin();
      emitCode(procs[0]!, 'SAME-0002');
      await p1;

      // Login still pending (process alive, user has not completed the flow)
      const r2 = await service.startLogin();

      expect(spawn).toHaveBeenCalledTimes(1);
      expect(procs[0]!.kill).not.toHaveBeenCalled();
      expect(r2).toEqual({ ok: true, code: 'SAME-0002' });
    });

    it('should start a fresh login after a previous attempt failed', async () => {
      const { service, procs, spawn } = createHarness();

      const p1 = service.startLogin();
      emitCode(procs[0]!);
      await p1;
      procs[0]!.emit('close', 1); // → failed

      const p2 = service.startLogin();
      expect(spawn).toHaveBeenCalledTimes(2);
      emitCode(procs[1]!, 'NEWL-0003');

      const r2 = await p2;
      expect(r2).toEqual({ ok: true, code: 'NEWL-0003' });
      expect(service.getState().status).toBe('pending');
    });

    it('should start a fresh login after a timeout', async () => {
      const { service, procs, spawn } = createHarness({ codeTimeoutMs: 20 });

      const r1 = await service.startLogin(); // times out
      expect(r1.ok).toBe(false);

      const p2 = service.startLogin();
      expect(spawn).toHaveBeenCalledTimes(2);
      emitCode(procs[1]!, 'NEWL-0004');

      const r2 = await p2;
      expect(r2).toEqual({ ok: true, code: 'NEWL-0004' });
    });
  });

  // ----------------------------------------------------------------
  // cancel()
  // ----------------------------------------------------------------
  describe('cancel', () => {
    it('should kill the process and reset all state', async () => {
      const { service, procs } = createHarness();

      const promise = service.startLogin();
      emitCode(procs[0]!);
      await promise;

      service.cancel();

      expect(procs[0]!.kill).toHaveBeenCalled();
      expect(service.getState()).toEqual({ status: 'none', account: null });
    });

    it('should ignore close events from a cancelled process', async () => {
      const { service, procs } = createHarness();

      const promise = service.startLogin();
      emitCode(procs[0]!);
      await promise;

      service.cancel();
      procs[0]!.emit('close', 0); // late close must not flip status to authenticated

      expect(service.getState().status).toBe('none');
    });

    it('should be a no-op when nothing is running', () => {
      const { service } = createHarness();
      expect(() => service.cancel()).not.toThrow();
      expect(service.getState()).toEqual({ status: 'none', account: null });
    });
  });
});
