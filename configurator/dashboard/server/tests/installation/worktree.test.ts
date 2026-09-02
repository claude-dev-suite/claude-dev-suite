/**
 * Worktree detection has to be right *and* total.
 *
 * Right, because a linked worktree is missing exactly the files dev-suite keeps
 * out of git, and no code path noticed before. Total, because detection runs on
 * every project the dashboard opens: an absent `git`, a directory that is not a
 * repository, or a malformed `.git` file must resolve to "not a worktree", not
 * to an exception that breaks the install.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'node:child_process';
import {
  detectWorktree,
  missingLocalInstallFiles,
} from '../../src/services/installation/worktree.js';
import { createTempDir, cleanupTempDir } from '../test-utils.js';

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawnSync: vi.fn(actual.spawnSync) };
});

describe('detectWorktree', () => {
  let dir: string;
  beforeEach(() => {
    dir = createTempDir('worktree-');
    vi.mocked(spawnSync).mockClear();
  });
  afterEach(() => { cleanupTempDir(dir); vi.restoreAllMocks(); });

  it('detects a linked worktree from a .git FILE containing gitdir:', () => {
    const main = path.join(dir, 'main');
    const linked = path.join(dir, 'wt');
    fs.mkdirSync(path.join(main, '.git', 'worktrees', 'wt'), { recursive: true });
    fs.mkdirSync(linked, { recursive: true });
    fs.writeFileSync(
      path.join(linked, '.git'),
      `gitdir: ${path.join(main, '.git', 'worktrees', 'wt')}\n`
    );

    const info = detectWorktree(linked);
    expect(info.isWorktree).toBe(true);
    expect(info.mainCheckout).toBe(path.resolve(main));
  });

  it('accepts a relative gitdir: pointer', () => {
    const main = path.join(dir, 'main');
    const linked = path.join(dir, 'wt');
    fs.mkdirSync(path.join(main, '.git', 'worktrees', 'wt'), { recursive: true });
    fs.mkdirSync(linked, { recursive: true });
    fs.writeFileSync(path.join(linked, '.git'), 'gitdir: ../main/.git/worktrees/wt\n');

    const info = detectWorktree(linked);
    expect(info.isWorktree).toBe(true);
    expect(info.mainCheckout).toBe(path.resolve(main));
  });

  it('does not treat a normal checkout (.git directory) as a worktree', () => {
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    expect(detectWorktree(dir).isWorktree).toBe(false);
  });

  it('does not treat a non-repository directory as a worktree', () => {
    expect(detectWorktree(dir).isWorktree).toBe(false);
  });

  it('does not throw when the path does not exist', () => {
    const info = detectWorktree(path.join(dir, 'missing'));
    expect(info.isWorktree).toBe(false);
    expect(info.missingLocalFiles).toEqual([]);
  });

  it('does not crash when git is unavailable', () => {
    vi.mocked(spawnSync).mockImplementation(() => {
      throw new Error('spawnSync git ENOENT');
    });
    expect(() => detectWorktree(dir)).not.toThrow();
    expect(detectWorktree(dir).isWorktree).toBe(false);
  });

  it('does not crash when git exits non-zero', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 128, stdout: '', stderr: 'not a git repository', pid: 0, output: [], signal: null,
    } as ReturnType<typeof spawnSync>);
    expect(detectWorktree(dir).isWorktree).toBe(false);
  });

  it('ignores a .git file with no gitdir: line', () => {
    fs.writeFileSync(path.join(dir, '.git'), 'garbage\n');
    vi.mocked(spawnSync).mockReturnValue({
      status: 128, stdout: '', stderr: '', pid: 0, output: [], signal: null,
    } as ReturnType<typeof spawnSync>);
    expect(detectWorktree(dir).isWorktree).toBe(false);
  });

  it('falls back to git when the git dir differs from the common git dir', () => {
    vi.mocked(spawnSync).mockImplementation(((_cmd: string, args: string[]) => {
      const flag = args[args.length - 1];
      const value = flag === '--git-common-dir'
        ? path.join(dir, 'main', '.git')
        : path.join(dir, 'main', '.git', 'worktrees', 'wt');
      return { status: 0, stdout: `${value}\n`, stderr: '', pid: 0, output: [], signal: null };
    }) as unknown as typeof spawnSync);

    const info = detectWorktree(dir);
    expect(info.isWorktree).toBe(true);
    expect(info.mainCheckout).toBe(path.join(dir, 'main'));
  });

  it('never passes the project path through a shell', () => {
    detectWorktree(dir);
    for (const call of vi.mocked(spawnSync).mock.calls) {
      expect((call[2] as { shell?: boolean } | undefined)?.shell).toBe(false);
    }
  });
});

describe('missingLocalInstallFiles', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir('worktree-missing-'); });
  afterEach(() => { cleanupTempDir(dir); });

  it('reports nothing for a project that never ran the wizard', () => {
    expect(missingLocalInstallFiles(dir)).toEqual([]);
  });

  it('reports the gitignored MCP config a worktree cannot inherit', () => {
    fs.writeFileSync(
      path.join(dir, '.dev-suite.json'),
      JSON.stringify({ targets: ['claude-code'], mcpServers: { enabled: ['documentation'] } })
    );
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# routing\n');
    fs.mkdirSync(path.join(dir, '.claude', 'agents'), { recursive: true });

    expect(missingLocalInstallFiles(dir)).toEqual(['.mcp.json']);
  });

  it('covers every selected target, not just Claude Code', () => {
    fs.writeFileSync(
      path.join(dir, '.dev-suite.json'),
      JSON.stringify({ targets: ['cursor', 'copilot'] })
    );
    const missing = missingLocalInstallFiles(dir);
    expect(missing).toContain('.cursor/mcp.json');
    expect(missing).toContain('.vscode/mcp.json');
    expect(missing).toContain('.github/mcp.json');
    expect(missing).toContain('AGENTS.md');
  });

  it('does not report .mcp-servers/ — worktrees use the main checkout’s bundles', () => {
    fs.writeFileSync(path.join(dir, '.dev-suite.json'), JSON.stringify({ targets: ['claude-code'] }));
    expect(missingLocalInstallFiles(dir).some(f => f.startsWith('.mcp-servers'))).toBe(false);
  });

  it('does not mistake a submodule for a worktree', () => {
    // Submodules use the same `.git`-as-a-file mechanism, pointing at
    // `.git/modules/<name>`. Reading that as a worktree told anyone working in
    // a submodule that their normal checkout was missing its local files, and
    // steered them towards materialization — which rewrites the MCP configs.
    const dir = createTempDir('submodule-');
    try {
      fs.writeFileSync(
        path.join(dir, '.git'),
        'gitdir: ../../.git/modules/vendor/thing\n'
      );

      const info = detectWorktree(dir);

      // Assert on the path that changed rather than on the verdict: whatever
      // git makes of a scratch directory (it may discover an unrelated
      // repository above it), the `.git` file must no longer be accepted as
      // proof on its own.
      expect(info.reason).not.toContain('.git is a file');
    } finally {
      cleanupTempDir(dir);
    }
  });
});
