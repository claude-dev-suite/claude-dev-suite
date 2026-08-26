// SPDX-License-Identifier: MIT
/**
 * Regression tests for Tier 4 of the 2026-08 audit — packaging, ownership and
 * concurrency hygiene.
 *
 *  31  templates/rules/commands were not packaged into the Electron build, and
 *      templatesDir was resolved by counting directories up from __dirname
 *  33  `.gitignore` was edited by an install but not restored by a rollback
 *  34  `/api/uninstall` answered `success: true` while discarding `errors`
 *  37  nothing serialised the operations that rewrite the manifest
 *  38  `.dev-suite-analytics/` and `.dev-suite-live.json` were owned by nobody
 *
 * (#32 is covered in templates.service.test.ts, #35 inside each rewritten test
 * file, #36 by scripts/validate-catalog.mjs.)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import express from 'express';
import request from 'supertest';

import {
  createTempDir,
  cleanupTempDir,
  createMockDevSuiteDir,
  createMockProject,
} from './test-utils.js';
import { InstallationService } from '../src/services/installation.service.js';
import { managedSurfaces } from '../src/services/installation/managed-surfaces.js';
import { withProjectLock, isProjectLocked } from '../src/services/installation/project-lock.js';
import { installationRoutes } from '../src/routes/installation.routes.js';

// ─── 31: the packaged app ships the catalogs it reads ───────────────────────

describe('Tier 4 #31 — the Electron build packages every catalog', () => {
  const pkg = JSON.parse(
    fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')
  ) as { build: { extraResources: Array<{ from: string; to: string }> } };

  const packaged = new Set(pkg.build.extraResources.map(r => r.from));

  it.each(['../../agents', '../../skills', '../../mcp-servers', '../../registry'])(
    'still packages %s',
    (from) => {
      expect(packaged.has(from)).toBe(true);
    }
  );

  it.each(['../../templates', '../../rules', '../../commands'])(
    'packages %s, which the running app reads',
    (from) => {
      // Absent before: StepRules came up empty, the Template panel came up
      // empty, and selected rules were skipped with a warning — in release
      // builds only, so it never showed up in development.
      expect(packaged.has(from)).toBe(true);
    }
  );

  it('lands each catalog under the dev-suite resource root', () => {
    for (const entry of pkg.build.extraResources) {
      if (entry.from.startsWith('../../')) {
        expect(entry.to.startsWith('dev-suite/')).toBe(true);
      }
    }
  });

  it('resolves templatesDir through getDevSuiteDir, not a __dirname walk', () => {
    const source = fs.readFileSync(
      new URL('../src/services/templates.service.ts', import.meta.url),
      'utf-8'
    );
    expect(source).toContain("path.join(getDevSuiteDir(), 'templates')");
    // The fixed hop count only held in a source checkout. Assert the module no
    // longer derives a __dirname at all, rather than pattern-matching the old
    // expression — the comment above the fix still quotes it.
    expect(source).not.toMatch(/^\s*const __dirname\s*=/m);
  });
});

// ─── 33 / 38: what the ownership model covers ───────────────────────────────

describe('Tier 4 #33/#38 — ownership of the files an install touches', () => {
  it('includes .gitignore among the surfaces a rollback restores', () => {
    expect(managedSurfaces(['claude-code']).files).toContain('.gitignore');
    expect(managedSurfaces(['cursor']).files).toContain('.gitignore');
  });
});

describe('Tier 4 #38 — runtime artifacts are declared', () => {
  let svc: InstallationService;
  let devSuiteDir: string;
  let projectDir: string;

  beforeEach(() => {
    devSuiteDir = createTempDir('t4-devsuite-');
    projectDir = createTempDir('t4-project-');
    createMockDevSuiteDir(devSuiteDir);
    createMockProject(projectDir, { packageJson: { name: 'p' }, hasGit: true });
    svc = new InstallationService();
    process.env.DEV_SUITE_DIR = devSuiteDir;
  });

  afterEach(() => {
    cleanupTempDir(devSuiteDir);
    cleanupTempDir(projectDir);
    delete process.env.DEV_SUITE_DIR;
  });

  it('ignores the artifacts written after an install by other processes', async () => {
    await svc.install({
      projectPath: projectDir,
      agents: ['typescript-expert'],
      mcpServers: ['documentation'],
      envVars: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: ['claude-code'] as any,
    });

    const gitignore = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf-8');
    // Written by the `documentation` MCP server and the Live Performance panel
    // respectively — project working state, never committed configuration.
    expect(gitignore).toContain('.dev-suite-analytics/');
    expect(gitignore).toContain('.dev-suite-live.json');
    expect(gitignore).toContain('.dev-suite-backup-*/');
  });
});

// ─── 34: the uninstall route reports what happened ──────────────────────────

describe('Tier 4 #34 — /api/uninstall propagates its result', () => {
  let devSuiteDir: string;
  let projectDir: string;

  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api', installationRoutes);
    return app;
  }

  beforeEach(() => {
    devSuiteDir = createTempDir('t4-un-devsuite-');
    projectDir = createTempDir('t4-un-project-');
    createMockDevSuiteDir(devSuiteDir);
    createMockProject(projectDir, { packageJson: { name: 'p' }, hasGit: true });
    process.env.DEV_SUITE_DIR = devSuiteDir;
  });

  afterEach(() => {
    cleanupTempDir(devSuiteDir);
    cleanupTempDir(projectDir);
    delete process.env.DEV_SUITE_DIR;
  });

  it('returns the removed list rather than a bare success flag', async () => {
    await new InstallationService().install({
      projectPath: projectDir,
      agents: ['typescript-expert'],
      mcpServers: [],
      envVars: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: ['claude-code'] as any,
    });

    const res = await request(buildApp())
      .post('/api/uninstall')
      .send({ projectPath: projectDir });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Both fields were discarded before, so a partial uninstall looked clean.
    expect(Array.isArray(res.body.removed)).toBe(true);
    expect(res.body.removed.length).toBeGreaterThan(0);
    expect(res.body.errors).toEqual([]);
  });
});

// ─── 37: operations that rewrite the manifest are serialised ────────────────

describe('Tier 4 #37 — the per-project lock', () => {
  const projectA = path.resolve('/tmp/lock-project-a');
  const projectB = path.resolve('/tmp/lock-project-b');

  it('runs two operations on one project strictly in sequence', async () => {
    const events: string[] = [];

    const first = withProjectLock(projectA, 'first', async () => {
      events.push('first:start');
      await new Promise(r => setTimeout(r, 30));
      events.push('first:end');
    });
    const second = withProjectLock(projectA, 'second', async () => {
      events.push('second:start');
      events.push('second:end');
    });

    await Promise.all([first, second]);

    // Without the lock, `second:start` interleaves before `first:end`, and both
    // read the same pre-existing manifest as their "previously managed" set.
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('does not serialise across different projects', async () => {
    const events: string[] = [];

    await Promise.all([
      withProjectLock(projectA, 'a', async () => {
        events.push('a:start');
        await new Promise(r => setTimeout(r, 20));
        events.push('a:end');
      }),
      withProjectLock(projectB, 'b', async () => {
        events.push('b:start');
        await new Promise(r => setTimeout(r, 20));
        events.push('b:end');
      }),
    ]);

    // Interleaved, so one project's install never blocks another's.
    expect(events.indexOf('b:start')).toBeLessThan(events.indexOf('a:end'));
  });

  it('is re-entrant, so a nested acquisition cannot deadlock', async () => {
    // reinstall and the Manage tab both take the lock and then call install(),
    // which takes it again. A plain mutex would hang here.
    const result = await withProjectLock(projectA, 'outer', async () =>
      withProjectLock(projectA, 'inner', async () => 'done')
    );

    expect(result).toBe('done');
  });

  it('releases the lock when the operation throws', async () => {
    await expect(
      withProjectLock(projectA, 'boom', async () => {
        throw new Error('failed');
      })
    ).rejects.toThrow('failed');

    // A failure must not wedge the project forever.
    await expect(withProjectLock(projectA, 'after', async () => 'ok')).resolves.toBe('ok');
    expect(isProjectLocked(projectA)).toBe(false);
  });

  it('treats different spellings of one project as the same lock', async () => {
    const events: string[] = [];
    const upper = projectA.toUpperCase();

    await Promise.all([
      withProjectLock(projectA, 'a', async () => {
        events.push('a:start');
        await new Promise(r => setTimeout(r, 20));
        events.push('a:end');
      }),
      withProjectLock(upper, 'b', async () => {
        events.push('b:start');
      }),
    ]);

    expect(events).toEqual(['a:start', 'a:end', 'b:start']);
  });
});
