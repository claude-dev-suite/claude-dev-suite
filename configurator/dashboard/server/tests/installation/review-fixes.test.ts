/**
 * The second batch of review findings, each with the defect it closes.
 *
 * Grouped by the behaviour rather than the file, because most of these were one
 * wrong assumption reached from several places.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { InstallationService } from '../../src/services/installation.service.js';
import { AgentsService } from '../../src/services/agents.service.js';
import { renameSkillFrontmatter } from '../../src/services/installation/skill-frontmatter.js';
import { updateGitignore, removeGitignoreBlock } from '../../src/services/installation/gitignore.js';
import { recoverEnvVars, recoverSkillLoadingMode } from '../../src/services/installation/install-recovery.js';
import { readPreviouslyManagedMcpServers } from '../../src/services/installation/managed-file.js';
import { validatePathWithinBase } from '../../src/services/installation/security-helpers.js';
import { removePathScopedRules } from '../../src/services/installation/claude-md.service.js';
import { writeCursorMcpConfig, McpConfigParseError } from '../../src/services/targets/writers/mcp-config.writer.js';
import {
  createTempDir,
  cleanupTempDir,
  createMockDevSuiteDir,
  createMockProject,
} from '../test-utils.js';

describe('installed skills satisfy the Agent Skills spec', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir('skillfm-'); });
  afterEach(() => { cleanupTempDir(dir); });

  it('rewrites name: to match the flattened directory', () => {
    // Flattening renames `frontend-frameworks/react` to a single directory, but
    // the file was copied byte-for-byte — so `name: react` sat inside
    // `frontend-frameworks-react/`, which the spec makes a MUST-match.
    const skillDir = path.join(dir, 'frontend-frameworks-react');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: react\ndescription: |\n  Multi-line\n\n  description.\n---\n\n# Body\n'
    );

    expect(renameSkillFrontmatter(skillDir, 'frontend-frameworks-react')).toBe(true);

    const after = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
    expect(after).toContain('name: frontend-frameworks-react');
    // Everything else survives, including the multi-line description and body.
    expect(after).toContain('  Multi-line');
    expect(after).toContain('# Body');
  });

  it('leaves a file with no frontmatter alone rather than inventing one', () => {
    const skillDir = path.join(dir, 'x');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# no frontmatter\n');
    expect(renameSkillFrontmatter(skillDir, 'x')).toBe(false);
  });
});

describe('.gitignore keeps credentials and backups out of git', () => {
  let dir: string;
  const read = () => fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8');

  beforeEach(() => { dir = createTempDir('gitig-'); });
  afterEach(() => { cleanupTempDir(dir); });

  it('ignores the MCP configs that carry wizard env values', () => {
    updateGitignore(dir, ['claude-code', 'cursor', 'copilot'], true);

    const content = read();
    expect(content).toContain('.mcp.json');
    expect(content).toContain('.cursor/mcp.json');
    // Both Copilot surfaces, including the one not in its layout descriptor.
    expect(content).toContain('.vscode/mcp.json');
    expect(content).toContain('.github/mcp.json');
    expect(content).toContain('.dev-suite-backup-*/');
  });

  it('ignores only the backups when no env values were entered', () => {
    updateGitignore(dir, ['claude-code'], false);
    const content = read();
    expect(content).toContain('.dev-suite-backup-*/');
    expect(content).not.toContain('.mcp.json');
  });

  it('preserves the user\'s existing rules and is idempotent', () => {
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\ndist/\n');

    updateGitignore(dir, ['claude-code'], true);
    updateGitignore(dir, ['claude-code'], true);

    const content = read();
    expect(content).toContain('node_modules/');
    expect(content).toContain('dist/');
    expect(content.match(/dev-suite \(managed\)/g)).toHaveLength(1);
  });

  it('strips only its own block on uninstall, never the file', () => {
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n');
    updateGitignore(dir, ['claude-code'], true);

    expect(removeGitignoreBlock(dir)).toBe(true);

    // Trailing whitespace is not worth normalising away; the user's rules are.
    expect(read().trim()).toBe('node_modules/');
  });
});

describe('install parameters are recovered from every assistant, not just Claude', () => {
  let dir: string;
  const write = (rel: string, body: string) => {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  };

  beforeEach(() => { dir = createTempDir('recover-'); });
  afterEach(() => { cleanupTempDir(dir); });

  it('finds env vars in a Cursor-only project, which has no .mcp.json', () => {
    // The old single-file read returned `{}` here, so every API key the user
    // entered was wiped on the next reinstall.
    write('.cursor/mcp.json', JSON.stringify({
      mcpServers: { db: { command: 'node', env: { DATABASE_URL: 'postgres://x' } } },
    }));

    expect(recoverEnvVars(dir, ['cursor'])).toEqual({ DATABASE_URL: 'postgres://x' });
  });

  it('reads Copilot\'s VS Code surface, whose key is `servers`', () => {
    write('.vscode/mcp.json', JSON.stringify({
      servers: { db: { type: 'stdio', command: 'node', env: { API_TOKEN: 'tok' } } },
    }));

    expect(recoverEnvVars(dir, ['copilot'])).toEqual({ API_TOKEN: 'tok' });
  });

  it('reads Codex env values out of TOML', () => {
    write('.codex/config.toml', [
      '[mcp_servers.db]',
      'command = "node"',
      '',
      '[mcp_servers.db.env]',
      'DATABASE_URL = "postgres://y"',
      '',
    ].join('\n'));

    expect(recoverEnvVars(dir, ['codex'])).toEqual({ DATABASE_URL: 'postgres://y' });
  });

  it('detects lazy mode from a non-Claude config', () => {
    write('.gemini/settings.json', JSON.stringify({ mcpServers: { 'skill-loader': {} } }));
    expect(recoverSkillLoadingMode(dir, ['gemini'])).toBe('lazy');
    expect(recoverSkillLoadingMode(dir, ['cursor'])).toBe('eager');
  });
});

describe('previouslyManaged comes from the prior install, not the catalog', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir('prevmcp-'); });
  afterEach(() => { cleanupTempDir(dir); });

  it('is empty on a first install, so a same-named user server survives', () => {
    // Passing the full catalog deleted the user's own `documentation` server on
    // a *first* install, before dev-suite had written anything.
    expect(readPreviouslyManagedMcpServers(dir)).toEqual([]);

    const merged = writeCursorMcpConfig(
      { 'code-quality': { command: 'node', args: ['cq.js'], env: {} } },
      {
        existing: JSON.stringify({ mcpServers: { documentation: { command: 'node', args: ['mine.js'] } } }),
        previouslyManaged: readPreviouslyManagedMcpServers(dir),
      }
    );

    const servers = JSON.parse(merged).mcpServers;
    expect(Object.keys(servers).sort()).toEqual(['code-quality', 'documentation']);
    expect(servers.documentation.args).toEqual(['mine.js']);
  });

  it('reads the previous install\'s list when a manifest exists', () => {
    fs.writeFileSync(
      path.join(dir, '.dev-suite-manifest.json'),
      JSON.stringify({ mcpServers: ['documentation', 'skill-loader'] })
    );
    expect(readPreviouslyManagedMcpServers(dir).sort()).toEqual(['documentation', 'skill-loader']);
  });
});

describe('MCP JSON merge rejects rather than discards', () => {
  it('throws on valid JSON whose root is not an object', () => {
    for (const existing of ['[{"servers":{}}]', 'null', '"hello"', '42']) {
      expect(() => writeCursorMcpConfig({}, { existing, file: 'x.json' })).toThrow(McpConfigParseError);
    }
  });

  it('throws when the server key holds something that is not an object', () => {
    expect(() =>
      writeCursorMcpConfig({}, { existing: '{"mcpServers":[1,2]}', file: 'x.json' })
    ).toThrow(McpConfigParseError);
  });

  it('parses a file that carries a UTF-8 BOM, the Windows default', () => {
    const withBom = '﻿' + JSON.stringify({ mcpServers: { mine: { command: 'node' } } });
    const out = writeCursorMcpConfig(
      { ds: { command: 'node', args: [], env: {} } },
      { existing: withBom }
    );
    expect(Object.keys(JSON.parse(out).mcpServers).sort()).toEqual(['ds', 'mine']);
    // Not re-emitted — dev-suite writes plain UTF-8.
    expect(out.charCodeAt(0)).not.toBe(0xfeff);
  });
});

describe('path guards', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir('guard-'); });
  afterEach(() => { cleanupTempDir(dir); });

  it('refuses a rule path that resolves outside the project', () => {
    // A bare `startsWith` on the raw string let `.claude/rules/../../../x.md`
    // through, and the only remaining barrier was a marker every dev-suite rule
    // file carries — so it deleted rule files in the user's other projects.
    const victim = path.join(path.dirname(dir), 'victim-rule.md');
    fs.writeFileSync(victim, '<!-- dev-suite-managed -->\nrule\n');

    const result = removePathScopedRules(dir, ['.claude/rules/../../victim-rule.md']);

    expect(fs.existsSync(victim)).toBe(true);
    expect(result.removed).toEqual([]);
    expect(result.errors.some(e => e.includes('unexpected path'))).toBe(true);

    fs.unlinkSync(victim);
  });

  it('rejects a path whose *intermediate* directory is a symlink out of the base', () => {
    const outside = createTempDir('escape-');
    const link = path.join(dir, 'linked');
    try {
      fs.symlinkSync(outside, link, 'junction');
    } catch {
      return; // symlink creation not permitted in this environment
    }

    // The old guard only canonicalized the leaf, so a symlinked parent
    // redirected every write underneath it with no error.
    expect(() => validatePathWithinBase(path.join(link, 'agents', 'x.md'), dir, false)).toThrow(/SECURITY/);

    cleanupTempDir(outside);
  });
});

describe('agent parsing and categories', () => {
  it('reads the model field, which drives real cost', async () => {
    // The parser covered name/description/skills/tools but never `model:`, so
    // nothing downstream could display or validate it.
    process.env.DEV_SUITE_DIR = path.resolve(process.cwd(), '../../..');
    const agents = await new AgentsService().getAgents();
    const withModel = agents.filter(a => a.model !== undefined);

    expect(withModel.length).toBeGreaterThan(0);
    for (const agent of withModel) {
      expect(['sonnet', 'opus', 'haiku']).toContain(agent.model);
    }
    delete process.env.DEV_SUITE_DIR;
  });

  it('maps every agent directory to a real category, not the always-on core fallback', async () => {
    process.env.DEV_SUITE_DIR = path.resolve(process.cwd(), '../../..');
    const agents = await new AgentsService().getAgents();
    const categories = new Set(agents.map(a => a.category));

    // Six directories used to fall through to `core`, which is always-on — so
    // 17 agents never got a path-scoped rule file.
    for (const expected of ['mobile', 'cloud', 'data', 'gamedev', 'industrial', 'bitcoin']) {
      expect(categories.has(expected as never)).toBe(true);
    }
    delete process.env.DEV_SUITE_DIR;
  });
});

describe('rule files are tracked and reconciled', () => {
  let svc: InstallationService;
  let devSuiteDir: string;
  let projectDir: string;

  beforeEach(() => {
    devSuiteDir = createTempDir('rules-ds-');
    projectDir = createTempDir('rules-proj-');
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

  it('records each rule file in manifest.files so drift detection can see it', async () => {
    const manifest = await svc.install({
      projectPath: projectDir,
      agents: ['vitest-expert'],
      mcpServers: [],
      envVars: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: ['claude-code'] as any,
    });

    const onDisk = JSON.parse(
      fs.readFileSync(path.join(projectDir, '.dev-suite-manifest.json'), 'utf-8')
    );
    const ruleFiles: string[] = onDisk.installedRuleFiles ?? [];
    // vitest-expert is in `testing`, a path-scoped category.
    expect(ruleFiles.length).toBeGreaterThan(0);
    for (const rel of ruleFiles) {
      expect(onDisk.files.some((f: { path: string }) => f.path === rel)).toBe(true);
    }
    expect(manifest).toBeDefined();
  });
});
