// SPDX-License-Identifier: MIT
/**
 * Headless install CLI (`dev-suite init`).
 *
 * Runs against the real catalog of this checkout and real temp projects: the
 * point of the command is that it reaches the same result as the wizard, which
 * a mocked InstallationService could not show. MCP servers are left out of the
 * install tests (`--mcp none`) so they never trigger a build of mcp-servers/.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createTempDir, cleanupTempDir, createMockProject } from '../test-utils.js';
import { parseInitArgs, runInit, type InitIO } from '../../src/cli/init.js';
import { prepareEnvironment } from '../../src/cli/dev-suite.js';

function captureIO(overrides: Partial<InitIO> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const io: InitIO = {
    stdout: s => out.push(s),
    stderr: s => err.push(s),
    isTTY: false,
    confirm: async () => false,
    ...overrides,
  };
  return { io, out: () => out.join(''), err: () => err.join('') };
}

const reactSpringMonorepo = (dir: string) =>
  createMockProject(dir, {
    packageJson: { name: 'root', private: true, workspaces: ['apps/*'] },
    files: {
      'apps/web/package.json': JSON.stringify({
        name: 'web',
        dependencies: { react: '^19.0.0' },
        devDependencies: { vitest: '^3.0.0' },
      }),
      'apps/api/pom.xml':
        '<project><dependencies><dependency><groupId>org.springframework.boot</groupId>' +
        '<artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>',
    },
  });

describe('parseInitArgs', () => {
  it('reads the path, the switches and the comma lists', () => {
    const a = parseInitArgs(['./proj', '-y', '--targets', 'claude-code,cursor', '--mcp', 'none', '--json']);
    expect(a).toMatchObject({ project: './proj', yes: true, json: true, targets: ['claude-code', 'cursor'], mcp: [] });
    expect(a.error).toBeUndefined();
  });

  it('reports an unknown flag, a missing value and a second path', () => {
    expect(parseInitArgs(['--bogus']).error).toBe('Unknown flag: --bogus');
    expect(parseInitArgs(['--agents']).error).toBe('--agents needs a value');
    expect(parseInitArgs(['--agents', '--yes']).error).toBe('--agents needs a value');
    expect(parseInitArgs(['a', 'b']).error).toBe('Unexpected argument: b');
  });
});

describe('runInit', () => {
  let project: string;

  beforeEach(() => {
    project = createTempDir('cli-init-');
  });

  afterEach(() => {
    cleanupTempDir(project);
  });

  it('refuses to install without a terminal unless --yes or --dry-run is given', async () => {
    reactSpringMonorepo(project);
    const { io, err } = captureIO();
    expect(await runInit([project], io)).toBe(3);
    expect(err()).toMatch(/--yes/);
    expect(fs.existsSync(path.join(project, 'AGENTS.md'))).toBe(false);
  });

  it('plans what the wizard would pre-select, and writes nothing on --dry-run', async () => {
    reactSpringMonorepo(project);
    const { io, out } = captureIO();

    expect(await runInit([project, '--dry-run', '--json'], io)).toBe(0);

    const { plan } = JSON.parse(out()) as { plan: { agents: string[]; mcpServers: string[]; targets: string[]; rules: string[] } };
    expect(plan.agents).toEqual(expect.arrayContaining(['architect', 'code-reviewer', 'react-expert', 'spring-boot-expert']));
    expect(plan.mcpServers).toContain('documentation');
    expect(plan.targets).toEqual(['claude-code']);
    expect(plan.rules.length).toBeGreaterThan(0);
    expect(fs.readdirSync(project).sort()).toEqual(['apps', 'package.json']);
  });

  it('rejects an id that is not in the catalog instead of installing less', async () => {
    reactSpringMonorepo(project);
    const { io, err } = captureIO();
    expect(await runInit([project, '--dry-run', '--agents', 'react-expert,no-such-expert'], io)).toBe(3);
    expect(err()).toMatch(/Unknown agent: no-such-expert/);
    expect(await runInit([project, '--dry-run', '--targets', 'notepad'], captureIO().io)).toBe(3);
  });

  it('asks before installing on a terminal, and a "no" writes nothing', async () => {
    reactSpringMonorepo(project);
    let asked = '';
    const { io } = captureIO({ isTTY: true, confirm: async q => { asked = q; return false; } });
    expect(await runInit([project, '--mcp', 'none'], io)).toBe(0);
    expect(asked).toMatch(/Install\?/);
    expect(fs.existsSync(path.join(project, '.dev-suite-manifest.json'))).toBe(false);
  });

  it('installs for the requested assistants with --yes', async () => {
    reactSpringMonorepo(project);
    const { io, out } = captureIO();

    const code = await runInit(
      [project, '--yes', '--json', '--mcp', 'none', '--rules', 'none', '--targets', 'claude-code,cursor'],
      io
    );

    expect(code).toBe(0);
    const result = JSON.parse(out()) as { installed: boolean; manifest: { agents: string[] } };
    expect(result.installed).toBe(true);
    expect(result.manifest.agents).toContain('react-expert');

    expect(fs.existsSync(path.join(project, 'AGENTS.md'))).toBe(true);
    expect(fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf-8')).toContain('@AGENTS.md');
    expect(fs.existsSync(path.join(project, '.claude', 'agents', 'react-expert.md'))).toBe(true);
    expect(fs.existsSync(path.join(project, '.cursor', 'rules'))).toBe(true);
    const devSuite = JSON.parse(fs.readFileSync(path.join(project, '.dev-suite.json'), 'utf-8'));
    expect(devSuite.agents.enabled).toEqual(expect.arrayContaining(['react-expert']));
  }, 120_000);
});

describe('prepareEnvironment', () => {
  it('turns headless on and finds a catalog shipped beside dist/', () => {
    const pkg = createTempDir('cli-pkg-');
    try {
      fs.mkdirSync(path.join(pkg, 'dist'));
      fs.mkdirSync(path.join(pkg, 'catalog', 'agents'), { recursive: true });
      const env: NodeJS.ProcessEnv = {};

      prepareEnvironment(path.join(pkg, 'dist', 'cli.js'), env);

      expect(env.DEV_SUITE_HEADLESS).toBe('1');
      expect(env.DEV_SUITE_DIR).toBe(path.join(pkg, 'catalog'));
    } finally {
      cleanupTempDir(pkg);
    }
  });

  it('leaves an explicit DEV_SUITE_DIR and DEV_SUITE_HEADLESS alone', () => {
    const env: NodeJS.ProcessEnv = { DEV_SUITE_DIR: '/somewhere', DEV_SUITE_HEADLESS: '0' };
    prepareEnvironment('/nowhere/dist/cli.js', env);
    expect(env).toEqual({ DEV_SUITE_DIR: '/somewhere', DEV_SUITE_HEADLESS: '0' });
  });
});
