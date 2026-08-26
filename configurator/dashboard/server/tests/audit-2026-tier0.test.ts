// SPDX-License-Identifier: MIT
/**
 * Regression tests for the Tier 0 findings of the 2026-08 functional/technical
 * audit — the seven small, high-severity defects.
 *
 * Each test here fails against the pre-fix code. Where the audit found that an
 * existing test passed *because* it exercised a helper in isolation rather than
 * the wired-up system (M3/errorLogger is the clearest case), the test below
 * drives the real composition instead.
 *
 *   1  .mcp.json overwritten instead of merged     → user's MCP servers deleted
 *   2  errorLogger registered before the routes    → mitigation never reached
 *   3  createChildLogger built a whole new logger  → transport/listener leak
 *   4  custom agent/skill ids unvalidated          → path traversal to rmSync
 *   5  repoPath unvalidated in the *ForRepo hooks  → writes outside the project
 *   7  outputDir prefix strip compared one segment → files written twice-nested
 *
 * Finding 6 (the wizard redirect latch) is a frontend concern and is covered in
 * `src/__tests__/App.wizard-redirect.test.tsx`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';

import {
  createTempDir,
  cleanupTempDir,
  createMockDevSuiteDir,
  createMockProject,
} from './test-utils.js';
import { InstallationService } from '../src/services/installation.service.js';
import { CustomAgentsService } from '../src/services/custom-agents.service.js';
import { GitHooksService } from '../src/services/hooks/git-hooks.service.js';
import { CodeGenService } from '../src/services/codegen.service.js';
import { installErrorHandler } from '../src/server.js';
import { getLogger } from '../src/utils/logger.js';
import {
  DeleteCustomSkillRequestSchema,
  DeleteCustomAgentRequestSchema,
  GetCustomAgentRequestSchema,
} from '../src/validation/schemas.js';

// ─── 1: `.mcp.json` is a shared config, not dev-suite's to overwrite ──────────

describe('Tier 0 #1 — .mcp.json merge preserves the user\'s own MCP servers', () => {
  let svc: InstallationService;
  let devSuiteDir: string;
  let projectDir: string;

  beforeEach(() => {
    devSuiteDir = createTempDir('t0-devsuite-');
    projectDir = createTempDir('t0-project-');
    createMockDevSuiteDir(devSuiteDir);
    createMockProject(projectDir, { packageJson: { name: 'test-project' }, hasGit: true });
    svc = new InstallationService();
    process.env.DEV_SUITE_DIR = devSuiteDir;
  });

  afterEach(() => {
    cleanupTempDir(devSuiteDir);
    cleanupTempDir(projectDir);
    delete process.env.DEV_SUITE_DIR;
  });

  const mcpPath = () => path.join(projectDir, '.mcp.json');

  it('keeps a pre-existing user server and adds dev-suite\'s alongside it', async () => {
    fs.writeFileSync(
      mcpPath(),
      JSON.stringify(
        {
          mcpServers: {
            'my-own-server': { command: 'node', args: ['./scripts/mine.js'] },
          },
        },
        null,
        2
      )
    );

    await svc.install({
      projectPath: projectDir,
      agents: ['typescript-expert'],
      mcpServers: ['documentation'],
      envVars: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: ['claude-code'] as any,
    });

    const merged = JSON.parse(fs.readFileSync(mcpPath(), 'utf-8'));

    // The user's entry survives, untouched.
    expect(merged.mcpServers['my-own-server']).toEqual({
      command: 'node',
      args: ['./scripts/mine.js'],
    });
    // dev-suite's entry is added next to it, not instead of it.
    expect(merged.mcpServers['documentation']).toBeDefined();
  });

  it('preserves unrelated top-level keys in the file', async () => {
    fs.writeFileSync(
      mcpPath(),
      JSON.stringify({ $schema: './schema.json', mcpServers: {} }, null, 2)
    );

    await svc.install({
      projectPath: projectDir,
      agents: ['typescript-expert'],
      mcpServers: ['documentation'],
      envVars: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: ['claude-code'] as any,
    });

    const merged = JSON.parse(fs.readFileSync(mcpPath(), 'utf-8'));
    expect(merged.$schema).toBe('./schema.json');
  });

  it('reports an unparseable .mcp.json as skipped instead of destroying it', async () => {
    fs.writeFileSync(mcpPath(), '{ this is not json');

    const result = await svc.install({
      projectPath: projectDir,
      agents: ['typescript-expert'],
      mcpServers: ['documentation'],
      envVars: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: ['claude-code'] as any,
    });

    expect(fs.readFileSync(mcpPath(), 'utf-8')).toBe('{ this is not json');
    const skipped = (result as { skipped?: Array<{ capability: string }> }).skipped ?? [];
    expect(skipped.some(s => s.capability === 'mcp')).toBe(true);
  });
});

// ─── 2: the error handler is only reached when mounted after the routes ───────

describe('Tier 0 #2 — errorLogger is wired after the routes', () => {
  const origEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = origEnv;
    delete process.env.DEV_SUITE_DEBUG_ERRORS;
  });

  function throwingRoute() {
    const r = express.Router();
    r.get('/boom', () => {
      throw new Error('Internal details that must not leak');
    });
    return r;
  }

  it('handles a thrown route error without leaking the stack', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DEV_SUITE_DEBUG_ERRORS;

    const app = express();
    app.use(throwingRoute());
    installErrorHandler(app); // ← after the routes, as index.ts now does

    const res = await request(app).get('/boom');

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('Internal details that must not leak');
    expect(JSON.stringify(res.body)).not.toMatch(/\bat .*\.ts:\d+/);
  });

  it('does NOT cover routes mounted after it — the bug this replaced', async () => {
    process.env.NODE_ENV = 'production';

    const app = express();
    installErrorHandler(app); // ← the old ordering: handler first
    app.use(throwingRoute());

    const res = await request(app).get('/boom');

    // Express falls through to its own finalhandler, which is exactly what made
    // the M3 mitigation inert while its unit test kept passing.
    expect(res.status).toBe(500);
    expect(res.body).toEqual({});
  });
});

// ─── 3: a child logger shares transports instead of building its own ─────────

describe('Tier 0 #3 — createChildLogger does not leak transports or listeners', () => {
  it('shares the parent\'s transports', () => {
    const parent = getLogger('LeakTest');
    const child = parent.createChildLogger({ correlationId: 'abc' });

    expect(child.transports).toBe(parent.transports);
  });

  it('adds no process listeners when called once per request', () => {
    const parent = getLogger('LeakTest');
    const before = process.listenerCount('uncaughtException');

    for (let i = 0; i < 50; i++) {
      parent.createChildLogger({ correlationId: `req-${i}` });
    }

    expect(process.listenerCount('uncaughtException')).toBe(before);
  });

  it('keeps the dev-suite extensions on the child', () => {
    const parent = getLogger('LeakTest');
    const child = parent.createChildLogger({ correlationId: 'abc' });

    expect(typeof child.createChildLogger).toBe('function');
    expect(typeof child.time).toBe('function');

    const grandchild = child.createChildLogger({ component: 'nested' });
    expect(grandchild.transports).toBe(parent.transports);

    const done = child.time('operation');
    expect(typeof done).toBe('function');
    done();
  });
});

// ─── 4: custom component ids can never contribute a path segment ─────────────

describe('Tier 0 #4 — custom agent/skill ids are validated on every path', () => {
  let svc: CustomAgentsService;
  let projectDir: string;
  let outsideDir: string;

  beforeEach(() => {
    projectDir = createTempDir('t0-ids-project-');
    outsideDir = createTempDir('t0-ids-outside-');
    createMockProject(projectDir, { packageJson: { name: 'p' } });
    svc = new CustomAgentsService();
  });

  afterEach(() => {
    cleanupTempDir(projectDir);
    cleanupTempDir(outsideDir);
  });

  const traversals = ['../../etc', '..%2F..%2Fsrc', '../sibling', 'a/b', 'a\\b', '.', '..', ''];

  it.each(traversals)('deleteCustomSkill rejects %j', async (id) => {
    await expect(svc.deleteCustomSkill(projectDir, id)).rejects.toThrow(/Invalid skill ID/i);
  });

  it.each(traversals)('deleteCustomAgent rejects %j', async (id) => {
    await expect(svc.deleteCustomAgent(projectDir, id)).rejects.toThrow(/Invalid agent ID/i);
  });

  it.each(traversals)('getCustomAgent rejects %j', async (id) => {
    await expect(svc.getCustomAgent(projectDir, id)).rejects.toThrow(/Invalid agent ID/i);
  });

  it.each(traversals)('getCustomSkill rejects %j', async (id) => {
    await expect(svc.getCustomSkill(projectDir, id)).rejects.toThrow(/Invalid skill ID/i);
  });

  it('does not remove a directory outside the project', async () => {
    const victim = path.join(outsideDir, 'victim');
    fs.mkdirSync(victim, { recursive: true });
    fs.writeFileSync(path.join(victim, 'keep.txt'), 'keep me');

    const rel = path
      .relative(path.join(projectDir, '.claude', 'skills', 'custom'), victim)
      .split(path.sep)
      .join('/');

    await expect(svc.deleteCustomSkill(projectDir, rel)).rejects.toThrow();
    expect(fs.existsSync(path.join(victim, 'keep.txt'))).toBe(true);
  });

  it('still accepts ordinary ids', async () => {
    // No throw — resolves to "not found" rather than being rejected as invalid.
    await expect(svc.getCustomAgent(projectDir, 'my-agent_2')).resolves.toBeNull();
  });

  it('rejects traversing ids at the Zod layer too', () => {
    expect(
      DeleteCustomSkillRequestSchema.safeParse({ projectPath: '/p', skillId: '../../x' }).success
    ).toBe(false);
    expect(
      DeleteCustomAgentRequestSchema.safeParse({ projectPath: '/p', agentId: '../../x' }).success
    ).toBe(false);
    expect(GetCustomAgentRequestSchema.safeParse({ path: '/p', id: 'a/b' }).success).toBe(false);

    expect(
      DeleteCustomSkillRequestSchema.safeParse({ projectPath: '/p', skillId: 'good-id' }).success
    ).toBe(true);
  });
});

// ─── 5: repoPath cannot escape the project in the *ForRepo hook methods ──────

describe('Tier 0 #5 — repoPath is contained to the project', () => {
  let svc: GitHooksService;
  let projectDir: string;
  let outsideDir: string;

  beforeEach(() => {
    projectDir = createTempDir('t0-hooks-project-');
    outsideDir = createTempDir('t0-hooks-outside-');
    createMockProject(projectDir, { packageJson: { name: 'p' }, hasGit: true });
    fs.mkdirSync(path.join(outsideDir, '.git', 'hooks'), { recursive: true });
    svc = new GitHooksService();
  });

  afterEach(() => {
    cleanupTempDir(projectDir);
    cleanupTempDir(outsideDir);
  });

  /** A relative path from the project to the sibling temp dir. */
  const escapeRel = () =>
    path.relative(projectDir, outsideDir).split(path.sep).join('/');

  it('installHooksForRepo refuses an escaping repoPath', () => {
    expect(() =>
      svc.installHooksForRepo(projectDir, escapeRel(), { useHusky: false, hooks: {} } as never)
    ).toThrow(/escapes the project/i);

    expect(fs.existsSync(path.join(outsideDir, '.git', 'hooks', 'pre-commit'))).toBe(false);
  });

  it('uninstallHooksForRepo refuses an escaping repoPath', () => {
    const marker = path.join(outsideDir, '.git', 'hooks', 'pre-commit');
    fs.writeFileSync(marker, '#!/bin/sh\n# dev-suite hook\n');

    expect(() => svc.uninstallHooksForRepo(projectDir, escapeRel(), false)).toThrow(
      /escapes the project/i
    );
    expect(fs.existsSync(marker)).toBe(true);
  });

  it('getHooksStatusForRepo refuses an escaping repoPath', () => {
    expect(() => svc.getHooksStatusForRepo(projectDir, escapeRel())).toThrow(
      /escapes the project/i
    );
  });

  it('refuses an absolute repoPath', () => {
    expect(() => svc.getHooksStatusForRepo(projectDir, outsideDir)).toThrow(/must be relative/i);
  });

  it('still accepts "." and a real subdirectory', () => {
    const sub = path.join(projectDir, 'packages', 'api');
    fs.mkdirSync(path.join(sub, '.git', 'hooks'), { recursive: true });

    expect(() => svc.getHooksStatusForRepo(projectDir, '.')).not.toThrow();
    expect(() => svc.getHooksStatusForRepo(projectDir, 'packages/api')).not.toThrow();
  });
});

// ─── 7: the whole outputDir prefix is stripped, not just its last segment ────

describe('Tier 0 #7 — acceptFiles does not nest the output directory twice', () => {
  let svc: CodeGenService;
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempDir('t0-codegen-');
    createMockProject(projectDir, { packageJson: { name: 'p' } });
    svc = new CodeGenService();
  });

  afterEach(() => cleanupTempDir(projectDir));

  const file = (p: string) => ({ path: p, content: '// generated\n' }) as never;

  it('strips a multi-segment outputDir prefix (the default src/generated)', () => {
    const { written, skipped } = svc.acceptFiles(projectDir, 'src/generated', [
      file('src/generated/models.ts'),
      file('src/generated/routes/routes.ts'),
    ]);

    expect(skipped).toEqual([]);
    expect(fs.existsSync(path.join(projectDir, 'src', 'generated', 'models.ts'))).toBe(true);
    expect(
      fs.existsSync(path.join(projectDir, 'src', 'generated', 'routes', 'routes.ts'))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(projectDir, 'src', 'generated', 'src', 'generated', 'models.ts'))
    ).toBe(false);
    expect(written).toHaveLength(2);
  });

  it('still strips a single-segment outputDir prefix', () => {
    svc.acceptFiles(projectDir, 'generated', [file('generated/models/models.go')]);

    expect(
      fs.existsSync(path.join(projectDir, 'generated', 'models', 'models.go'))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(projectDir, 'generated', 'generated', 'models', 'models.go'))
    ).toBe(false);
  });

  it('leaves an unprefixed path alone', () => {
    svc.acceptFiles(projectDir, 'src/generated', [file('models.ts')]);

    expect(fs.existsSync(path.join(projectDir, 'src', 'generated', 'models.ts'))).toBe(true);
  });

  it('does not strip a partial prefix match', () => {
    // `src/` alone is not the whole `src/generated` prefix, so nothing is trimmed.
    svc.acceptFiles(projectDir, 'src/generated', [file('src/models.ts')]);

    expect(
      fs.existsSync(path.join(projectDir, 'src', 'generated', 'src', 'models.ts'))
    ).toBe(true);
  });

  it('preserves the generator directory structure it was written to keep', () => {
    svc.acceptFiles(projectDir, 'src/generated', [
      file('src/generated/models/models.go'),
      file('src/generated/handlers/handlers.go'),
    ]);

    const base = path.join(projectDir, 'src', 'generated');
    expect(fs.existsSync(path.join(base, 'models', 'models.go'))).toBe(true);
    expect(fs.existsSync(path.join(base, 'handlers', 'handlers.go'))).toBe(true);
  });
});
