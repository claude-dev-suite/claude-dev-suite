/**
 * End-to-end: install → commit → `git worktree add` → materialize.
 *
 * This is the scenario nothing in the suite covered, and the one a multi-agent
 * fan-out with `isolation: 'worktree'` hits on every run. It asserts the two
 * halves of the contract at once:
 *
 *  - **Security.** No value declared `secret: true` reaches a tracked file. The
 *    check is `git ls-files` + a scan of what git actually stores, not a
 *    re-reading of the `.gitignore` we just wrote.
 *  - **Recovery.** A fresh worktree is detectably a worktree, is missing exactly
 *    the gitignored MCP config, and `await materializeLocal()` restores it — with the
 *    credential from the out-of-repo store and server paths pointing at the
 *    main checkout's bundles.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'fs';
import * as path from 'path';
import { updateGitignore } from '../../src/services/installation/gitignore.js';
import { detectWorktree } from '../../src/services/installation/worktree.js';
import { materializeLocal } from '../../src/services/installation/materialize-local.js';
import { recoverEnvVars } from '../../src/services/installation/install-recovery.js';
import { SecretEnvStore } from '../../src/services/installation/secret-store.js';
import { createTempDir, cleanupTempDir } from '../test-utils.js';

const DB_URL = 'postgres://app:s3cr3t-pw@db.internal:5432/prod';

function git(cwd: string, ...args: string[]): { status: number; stdout: string } {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8', shell: false, windowsHide: true });
  return { status: result.status ?? -1, stdout: result.stdout ?? '' };
}

// Resolved at collection time: `it.runIf` is evaluated before any hook runs, so
// a `beforeAll` probe would always read `false` and silently skip the suite.
const gitAvailable = spawnSync('git', ['--version'], { shell: false }).status === 0;

describe('worktree end-to-end', () => {
  let root: string;
  let repo: string;
  let home: string;
  let store: SecretEnvStore;

  /** Everything a dev-suite install writes, minus the parts we do not exercise. */
  function fakeInstall(): void {
    fs.mkdirSync(path.join(repo, '.claude', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.claude', 'agents', 'react-expert.md'), '---\nname: react-expert\n---\n');
    fs.writeFileSync(path.join(repo, 'AGENTS.md'), '# Routing\n');

    const serverDir = path.join(repo, '.mcp-servers', 'database-query');
    fs.mkdirSync(path.join(serverDir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(serverDir, 'dist', 'index.js'), '// bundle\n');
    fs.writeFileSync(
      path.join(serverDir, 'metadata.json'),
      JSON.stringify({ name: 'database-query', envVars: [{ name: 'DATABASE_URL', required: true, secret: true, default: '', description: '' }] })
    );

    fs.writeFileSync(
      path.join(repo, '.dev-suite.json'),
      JSON.stringify({ targets: ['claude-code'], mcpServers: { enabled: ['database-query'] } }, null, 2)
    );
    fs.writeFileSync(
      path.join(repo, '.dev-suite-manifest.json'),
      JSON.stringify({ targets: ['claude-code'], mcpServers: ['database-query'], files: [] }, null, 2)
    );
    fs.writeFileSync(
      path.join(repo, '.mcp.json'),
      JSON.stringify(
        {
          mcpServers: {
            'database-query': {
              command: 'node',
              args: [path.join(serverDir, 'dist', 'index.js')],
              env: { DATABASE_URL: DB_URL },
            },
          },
        },
        null,
        2
      )
    );

    updateGitignore(repo, ['claude-code'], [DB_URL]);
  }

  beforeEach(() => {
    root = createTempDir('wt-e2e-');
    repo = path.join(root, 'main');
    home = createTempDir('wt-e2e-home-');
    store = new SecretEnvStore(home);
    fs.mkdirSync(repo, { recursive: true });
  });
  afterEach(() => { cleanupTempDir(root); cleanupTempDir(home); });

  it.runIf(gitAvailable)('keeps every secret out of git and rebuilds the worktree', async () => {
    expect(git(repo, 'init', '-b', 'main').status).toBe(0);
    git(repo, 'config', 'user.email', 'test@example.test');
    git(repo, 'config', 'user.name', 'Test');
    git(repo, 'config', 'commit.gpgsign', 'false');

    fakeInstall();

    expect(git(repo, 'add', '-A').status).toBe(0);
    expect(git(repo, 'commit', '-m', 'install dev-suite').status).toBe(0);

    // ---- Security: nothing secret is tracked --------------------------
    const tracked = git(repo, 'ls-files').stdout.split('\n').filter(Boolean);
    expect(tracked).toContain('AGENTS.md');
    expect(tracked).toContain('.dev-suite.json');
    expect(tracked).toContain('.claude/agents/react-expert.md');
    expect(tracked).not.toContain('.mcp.json');
    // The bundles are committed on purpose now — they are what makes a clone
    // work without installing dev-suite. They carry no credential, which the
    // per-file check below enforces for every tracked file including these.
    expect(tracked.some(f => f.startsWith('.mcp-servers/'))).toBe(true);

    for (const file of tracked) {
      const content = git(repo, 'show', `HEAD:${file}`).stdout;
      expect(content).not.toContain(DB_URL);
      expect(content).not.toContain('s3cr3t-pw');
    }
    // A `git add -A` after the install must leave nothing secret staged either.
    expect(git(repo, 'status', '--porcelain').stdout.trim()).toBe('');

    // ---- The store is what survives the checkout boundary ------------
    // In production this is written by the install; here the legacy migration
    // path does it, which is the same code a pre-store project runs.
    recoverEnvVars(repo, ['claude-code'], { store });
    expect(store.read(repo)).toEqual({ DATABASE_URL: DB_URL });

    // ---- Add a linked worktree ---------------------------------------
    const worktree = path.join(root, 'wt');
    const added = git(repo, 'worktree', 'add', worktree, '-b', 'agent-1');
    expect(added.status).toBe(0);

    // Committed content came along; the gitignored config did not.
    expect(fs.existsSync(path.join(worktree, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(worktree, '.dev-suite.json'))).toBe(true);
    expect(fs.existsSync(path.join(worktree, '.claude', 'agents', 'react-expert.md'))).toBe(true);
    expect(fs.existsSync(path.join(worktree, '.mcp.json'))).toBe(false);
    // Committed now, so a worktree checks them out like any other tracked file
    // — one less thing materializeLocal has to borrow from the main checkout.
    expect(fs.existsSync(path.join(worktree, '.mcp-servers'))).toBe(true);

    // ---- Detection ----------------------------------------------------
    const info = detectWorktree(worktree);
    expect(info.isWorktree).toBe(true);
    expect(fs.realpathSync(info.mainCheckout!)).toBe(fs.realpathSync(repo));
    expect(info.missingLocalFiles).toContain('.mcp.json');

    // Without the store this checkout would recover nothing — the exact bug.
    expect(recoverEnvVars(worktree, ['claude-code'], { store, migrate: false }))
      .toEqual({ DATABASE_URL: DB_URL });

    // ---- Materialize ---------------------------------------------------
    const result = await materializeLocal(worktree, { store });
    expect(result.isWorktree).toBe(true);
    expect(result.written).toContain('.mcp.json');
    expect(result.secretsApplied).toEqual(['DATABASE_URL']);

    const raw = fs.readFileSync(path.join(worktree, '.mcp.json'), 'utf-8');
    const config = JSON.parse(raw);
    const entry = config.mcpServers['database-query'];

    // The credential is referenced, never written: it stays in the store, and
    // the rebuilt config carries nothing worth hiding.
    expect(entry.env).toEqual({ DATABASE_URL: '${DATABASE_URL}' });
    expect(raw).not.toContain(DB_URL);
    expect(raw).not.toContain('s3cr3t-pw');

    // The bundles are tracked, so the worktree has its own copy and the entry
    // resolves inside it — no borrowing from the main checkout any more.
    expect(entry.args[0]).toBe('${CLAUDE_PROJECT_DIR:-.}/.mcp-servers/database-query/dist/index.js');
    expect(fs.existsSync(path.join(worktree, '.mcp-servers', 'database-query', 'dist', 'index.js')))
      .toBe(true);

    git(repo, 'worktree', 'remove', '--force', worktree);
  });
});
