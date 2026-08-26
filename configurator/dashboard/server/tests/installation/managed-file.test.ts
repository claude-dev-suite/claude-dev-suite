/**
 * Never overwrite a file dev-suite did not write.
 *
 * Four writers did an unconditional `fs.writeFileSync` into a path the user may
 * already own — `.gemini/agents/<id>.md`, `.kimi-code/agents/<id>.md`,
 * `.claude/agents/<id>.md` and the path-scoped rule files. A hand-written
 * subagent prompt was replaced with no backup and no report, and then recorded
 * in the manifest as dev-suite's, so a later uninstall deleted what had been the
 * user's file.
 *
 * Gemini and Kimi are the sharp cases: assistant detection pre-selects them
 * *because* the user already has those directories.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { InstallationService } from '../../src/services/installation.service.js';
import {
  readPreviouslyManagedPaths,
  writeManagedFile,
} from '../../src/services/installation/managed-file.js';
import {
  createTempDir,
  cleanupTempDir,
  createMockDevSuiteDir,
  createMockProject,
} from '../test-utils.js';

describe('writeManagedFile', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir('managed-'); });
  afterEach(() => { cleanupTempDir(dir); });

  const call = (rel: string, content: string, owned: string[]) =>
    writeManagedFile({
      absPath: path.join(dir, rel),
      relPath: rel,
      content,
      previouslyManaged: new Set(owned),
    });

  it('writes a file that does not exist yet', () => {
    expect(call('a/b.md', 'new', [])).toBe('written');
    expect(fs.readFileSync(path.join(dir, 'a/b.md'), 'utf-8')).toBe('new');
  });

  it('replaces a file the previous install recorded', () => {
    fs.writeFileSync(path.join(dir, 'x.md'), 'old');
    expect(call('x.md', 'fresh', ['x.md'])).toBe('replaced');
    expect(fs.readFileSync(path.join(dir, 'x.md'), 'utf-8')).toBe('fresh');
  });

  it('preserves a file nothing recorded — it is the user\'s', () => {
    fs.writeFileSync(path.join(dir, 'x.md'), 'mine');
    expect(call('x.md', 'theirs', [])).toBe('preserved');
    expect(fs.readFileSync(path.join(dir, 'x.md'), 'utf-8')).toBe('mine');
  });

  it('compares paths in POSIX form regardless of separator', () => {
    fs.mkdirSync(path.join(dir, '.gemini/agents'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.gemini/agents/x.md'), 'old');
    expect(call(path.join('.gemini', 'agents', 'x.md'), 'fresh', ['.gemini/agents/x.md'])).toBe('replaced');
  });
});

describe('readPreviouslyManagedPaths', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir('prevman-'); });
  afterEach(() => { cleanupTempDir(dir); });

  it('returns an empty set when there is no manifest — a first install owns nothing', () => {
    expect(readPreviouslyManagedPaths(dir).size).toBe(0);
  });

  it('returns an empty set for an unparseable manifest, erring toward preserving', () => {
    fs.writeFileSync(path.join(dir, '.dev-suite-manifest.json'), '{ not json');
    expect(readPreviouslyManagedPaths(dir).size).toBe(0);
  });

  it('reads both the object and the legacy string entry shapes', () => {
    fs.writeFileSync(path.join(dir, '.dev-suite-manifest.json'), JSON.stringify({
      files: [{ path: '.claude/agents/a.md' }, 'AGENTS.md'],
    }));
    const paths = readPreviouslyManagedPaths(dir);
    expect(paths.has('.claude/agents/a.md')).toBe(true);
    expect(paths.has('AGENTS.md')).toBe(true);
  });
});

describe('install() does not clobber agent files the user wrote', () => {
  let svc: InstallationService;
  let devSuiteDir: string;
  let projectDir: string;

  const write = (rel: string, body: string) => {
    const full = path.join(projectDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  };
  const read = (rel: string) => fs.readFileSync(path.join(projectDir, rel), 'utf-8');

  beforeEach(() => {
    devSuiteDir = createTempDir('clobber-ds-');
    projectDir = createTempDir('clobber-proj-');
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

  const install = (targets: string[]) =>
    svc.install({
      projectPath: projectDir,
      agents: ['typescript-expert'],
      mcpServers: [],
      envVars: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: targets as any,
    });

  it('keeps a hand-written Gemini subagent prompt', async () => {
    const mine = '---\nname: typescript-expert\n---\nMy own carefully tuned prompt.\n';
    write('.gemini/agents/typescript-expert.md', mine);

    await install(['gemini']);

    expect(read('.gemini/agents/typescript-expert.md')).toBe(mine);
  });

  it('keeps a hand-written Kimi subagent prompt', async () => {
    const mine = '---\nname: typescript-expert\n---\nMine, not yours.\n';
    write('.kimi-code/agents/typescript-expert.md', mine);

    await install(['kimi-code']);

    expect(read('.kimi-code/agents/typescript-expert.md')).toBe(mine);
  });

  it('keeps a hand-written .claude/agents file', async () => {
    const mine = '---\nname: typescript-expert\n---\nHand-written.\n';
    write('.claude/agents/typescript-expert.md', mine);

    await install(['claude-code']);

    expect(read('.claude/agents/typescript-expert.md')).toBe(mine);
  });

  it('does not record a preserved file as its own, so uninstall leaves it too', async () => {
    const mine = '---\nname: typescript-expert\n---\nMine.\n';
    write('.gemini/agents/typescript-expert.md', mine);

    await install(['gemini']);

    const manifest = JSON.parse(read('.dev-suite-manifest.json'));
    const tracked = manifest.files.map((f: { path: string }) => f.path);
    expect(tracked).not.toContain('.gemini/agents/typescript-expert.md');

    await svc.uninstall(projectDir);
    expect(read('.gemini/agents/typescript-expert.md')).toBe(mine);
  });

  it('still replaces its own file on a second install', async () => {
    await install(['gemini']);
    const generated = read('.gemini/agents/typescript-expert.md');

    // Simulate dev-suite's own output drifting (a catalog update).
    write('.gemini/agents/typescript-expert.md', generated + '\nstale trailer\n');
    await install(['gemini']);

    expect(read('.gemini/agents/typescript-expert.md')).toBe(generated);
  });

  it('reports the preserved file as a skipped capability rather than staying silent', async () => {
    write('.gemini/agents/typescript-expert.md', 'mine');

    // The adapter surfaces it; assert through the adapter so the reason text is
    // covered even though install() currently only logs the skip list.
    const { GeminiAdapter } = await import('../../src/services/targets/adapters/gemini.adapter.js');
    const { targetPaths } = await import('../../src/services/targets/target-paths.js');

    const agent = {
      id: 'typescript-expert',
      name: 'typescript-expert',
      description: 'TypeScript expert',
      filePath: path.join(devSuiteDir, 'agents', 'core', 'typescript-expert.md'),
      category: 'core',
      skills: [],
      mcpServers: [],
    };

    const result = await new GeminiAdapter().write({
      plan: {
        projectPath: projectDir,
        devSuiteDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        rules: [],
        envVars: {},
        skillLoadingMode: 'eager',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        agentCatalog: [agent] as any,
        mcpCatalog: [],
        targets: ['gemini'],
        previouslyManaged: new Set<string>(),
        previousAgentFiles: new Map<string, readonly string[]>(),
      },
      paths: targetPaths(projectDir, 'gemini'),
      mcpServers: {},
      manifest: { version: '1', installedAt: '', projectPath: projectDir, agents: ['typescript-expert'], mcpServers: [], rules: [], files: [] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      extendedManifest: { version: '1', installedAt: '', projectPath: projectDir, agents: [], mcpServers: [], features: {}, files: [], upgradeHistory: [], targets: ['gemini'] } as any,
    });

    const agentSkip = result.skipped.find(s => s.capability === 'agents');
    expect(agentSkip).toBeDefined();
    expect(agentSkip!.reason).toContain('typescript-expert');
    expect(agentSkip!.reason).toContain('not written over');
  });
});
