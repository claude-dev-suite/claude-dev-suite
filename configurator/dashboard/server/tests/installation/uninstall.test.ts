/**
 * Uninstall safety.
 *
 * Two critical data-loss defects motivated this file, both reproduced end to
 * end before the fix:
 *
 *  1. `uninstall()` blanket-unlinked every entry in `manifest.files`, and
 *     multi-assistant support newly put the files dev-suite *merges into* on
 *     that list — so uninstalling deleted the user's hand-written `AGENTS.md`,
 *     their `.codex/config.toml` (model, comments, `[tui]`), their
 *     `.gemini/settings.json` (theme and their own MCP servers), all with
 *     `errors: []` and no backup.
 *  2. `.claude/agents` and `.claude/skills` were removed with
 *     `rmSync({recursive:true})`, taking the reserved `custom/` area and any
 *     skill the user or another tool had authored.
 *
 * The end-to-end test at the bottom is the one that would have caught both.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { InstallationService } from '../../src/services/installation.service.js';
import {
  classifyPath,
  instructionsFilesFor,
  manifestTargets,
  pruneEmptyDirs,
  resolveInsideProject,
  sharedConfigCoverage,
  sharedConfigsFor,
  unmergeSharedConfig,
  removeOwnedSkillTree,
  removeOwnedTree,
} from '../../src/services/installation/uninstall.js';
import { markSkillDirOwned } from '../../src/services/installation/skill-ownership.js';
import { listImplementedTargets } from '../../src/services/targets/target-layout.js';
import {
  createTempDir,
  cleanupTempDir,
  createMockDevSuiteDir,
  createMockProject,
} from '../test-utils.js';

describe('uninstall path safety', () => {
  let projectDir: string;
  const write = (rel: string, body: string) => {
    const full = path.join(projectDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
    return full;
  };
  const read = (rel: string) => fs.readFileSync(path.join(projectDir, rel), 'utf-8');
  const exists = (rel: string) => fs.existsSync(path.join(projectDir, rel));

  beforeEach(() => { projectDir = createTempDir('uninst-'); });
  afterEach(() => { cleanupTempDir(projectDir); });

  describe('resolveInsideProject', () => {
    it('refuses a manifest path that escapes the project', () => {
      expect(resolveInsideProject(projectDir, '../../.ssh/authorized_keys')).toBeNull();
      expect(resolveInsideProject(projectDir, 'a/../../outside.txt')).toBeNull();
    });

    it('refuses an absolute path', () => {
      expect(resolveInsideProject(projectDir, path.resolve('/etc/passwd'))).toBeNull();
    });

    it('accepts an ordinary relative path and a lookalike sibling is still rejected', () => {
      expect(resolveInsideProject(projectDir, '.claude/agents/x.md')).not.toBeNull();
      // `<project>-evil` shares a string prefix with `<project>` but is outside it.
      expect(resolveInsideProject(projectDir, `../${path.basename(projectDir)}-evil/x`)).toBeNull();
    });
  });

  describe('classifyPath', () => {
    it('treats merged config and instructions files as shared, not owned', () => {
      expect(classifyPath('AGENTS.md', ['claude-code'])).toBe('shared');
      expect(classifyPath('CLAUDE.md', ['claude-code'])).toBe('shared');
      expect(classifyPath('.codex/config.toml', ['codex'])).toBe('shared');
      expect(classifyPath('.gemini/settings.json', ['gemini'])).toBe('shared');
      expect(classifyPath('.cursor/mcp.json', ['cursor'])).toBe('shared');
    });

    it('treats a custom/ path as untouchable whichever target is installed', () => {
      expect(classifyPath('.claude/agents/custom/mine.md', ['claude-code'])).toBe('custom');
      expect(classifyPath('.claude/skills/custom/mine/SKILL.md', ['copilot'])).toBe('custom');
    });

    it('treats generated files as owned', () => {
      expect(classifyPath('.claude/agents/react-expert.md', ['claude-code'])).toBe('owned');
    });
  });

  describe('SHARED_CONFIGS coverage', () => {
    it('has an un-merge spec for every implemented target that writes project config', () => {
      const targets = listImplementedTargets().map(l => l.id);
      expect(sharedConfigCoverage(targets)).toEqual([]);
    });

    it('lists AGENTS.md for every target, since all of them read it', () => {
      for (const layout of listImplementedTargets()) {
        expect(instructionsFilesFor([layout.id])).toContain('AGENTS.md');
      }
    });
  });

  describe('unmergeSharedConfig', () => {
    it('removes only dev-suite servers from a JSON config and keeps the user their own', () => {
      write('.cursor/mcp.json', JSON.stringify({
        mcpServers: {
          documentation: { command: 'node', args: ['ds.js'] },
          'my-own': { command: 'node', args: ['mine.js'] },
        },
      }, null, 2));

      const [spec] = sharedConfigsFor(['cursor']);
      expect(unmergeSharedConfig(projectDir, spec!, ['documentation'])).toBe('rewritten');

      const after = JSON.parse(read('.cursor/mcp.json'));
      expect(Object.keys(after.mcpServers)).toEqual(['my-own']);
    });

    it('deletes the file when nothing but dev-suite content was in it', () => {
      write('.cursor/mcp.json', JSON.stringify({
        mcpServers: { documentation: { command: 'node', args: ['ds.js'] } },
      }));
      const [spec] = sharedConfigsFor(['cursor']);
      expect(unmergeSharedConfig(projectDir, spec!, ['documentation'])).toBe('deleted');
      expect(exists('.cursor/mcp.json')).toBe(false);
    });

    it('uses the VS Code `servers` key, not `mcpServers`', () => {
      write('.vscode/mcp.json', JSON.stringify({
        servers: {
          documentation: { type: 'stdio', command: 'node', args: ['ds.js'] },
          mine: { type: 'stdio', command: 'node', args: ['m.js'] },
        },
      }));
      const spec = sharedConfigsFor(['copilot']).find(s => s.rel === '.vscode/mcp.json');
      expect(unmergeSharedConfig(projectDir, spec!, ['documentation'])).toBe('rewritten');
      expect(Object.keys(JSON.parse(read('.vscode/mcp.json')).servers)).toEqual(['mine']);
    });

    it('keeps the Codex model, comments and foreign tables while dropping dev-suite tables', () => {
      write('.codex/config.toml', [
        'model = "o3"',
        '# hand-tuned, do not lose me',
        '',
        '[tui]',
        'theme = "dark"',
        '',
        '[mcp_servers.documentation]',
        'command = "node"',
        '',
      ].join('\n'));

      const [spec] = sharedConfigsFor(['codex']);
      expect(unmergeSharedConfig(projectDir, spec!, ['documentation'])).toBe('rewritten');

      const after = read('.codex/config.toml');
      expect(after).toContain('model = "o3"');
      expect(after).toContain('# hand-tuned, do not lose me');
      expect(after).toContain('[tui]');
      expect(after).not.toContain('mcp_servers.documentation');
    });

    it('drops only dev-suite context files from Gemini settings, keeping user settings', () => {
      write('.gemini/settings.json', JSON.stringify({
        theme: 'GitHub',
        mcpServers: { documentation: { command: 'node' }, mine: { command: 'node' } },
        context: { fileName: ['GEMINI.md', 'AGENTS.md'] },
      }));
      const [spec] = sharedConfigsFor(['gemini']);
      expect(unmergeSharedConfig(projectDir, spec!, ['documentation'])).toBe('rewritten');

      const after = JSON.parse(read('.gemini/settings.json'));
      expect(after.theme).toBe('GitHub');
      expect(Object.keys(after.mcpServers)).toEqual(['mine']);
      expect(after.context.fileName).toEqual(['GEMINI.md']);
    });

    it('strips only dev-suite keys from .claude/settings.json, keeping permissions', () => {
      write('.claude/settings.json', JSON.stringify({
        skillListingBudgetFraction: 0.05,
        permissions: { allow: ['Bash(npm test)'] },
      }));
      const spec = sharedConfigsFor(['claude-code']).find(s => s.rel === '.claude/settings.json');
      expect(unmergeSharedConfig(projectDir, spec!, [])).toBe('rewritten');

      const after = JSON.parse(read('.claude/settings.json'));
      expect(after.skillListingBudgetFraction).toBeUndefined();
      expect(after.permissions.allow).toEqual(['Bash(npm test)']);
    });

    it('leaves an unparseable file completely alone rather than guessing', () => {
      const raw = '{ this is not json';
      write('.cursor/mcp.json', raw);
      const [spec] = sharedConfigsFor(['cursor']);
      expect(unmergeSharedConfig(projectDir, spec!, ['documentation'])).toBe('left-alone');
      expect(read('.cursor/mcp.json')).toBe(raw);
    });
  });

  describe('removeOwnedTree', () => {
    it('keeps a preserved subtree and the parents that hold it', () => {
      write('.claude/agents/react-expert.md', 'generated');
      write('.claude/agents/custom/mine.md', 'mine');

      const result = removeOwnedTree(projectDir, '.claude/agents', {
        isPreserved: rel => classifyPath(rel, ['claude-code']) === 'custom',
      });

      expect(result.removed).toContain('.claude/agents/react-expert.md');
      expect(result.preserved).toContain('.claude/agents/custom');
      expect(exists('.claude/agents/custom/mine.md')).toBe(true);
      expect(exists('.claude/agents')).toBe(true);
    });

    it('removes the root directory when everything in it was dev-suite\'s', () => {
      write('.kb-cache/a.json', '{}');
      const result = removeOwnedTree(projectDir, '.kb-cache');
      expect(result.removed).toContain('.kb-cache');
      expect(exists('.kb-cache')).toBe(false);
    });

    it('only removes top-level children the ownership predicate accepts', () => {
      write('.claude/agents/react-expert.md', 'generated');
      write('.claude/agents/hand-written.md', 'mine');

      const owned = new Set(['.claude/agents/react-expert.md']);
      const result = removeOwnedTree(projectDir, '.claude/agents', {
        isOwnedChild: rel => owned.has(rel),
      });

      expect(result.removed).toEqual(['.claude/agents/react-expert.md']);
      expect(exists('.claude/agents/hand-written.md')).toBe(true);
    });
  });

  describe('removeOwnedSkillTree', () => {
    it('removes sentinel-marked folders and keeps everything else', () => {
      const ours = path.join(projectDir, '.claude/skills/languages-typescript');
      fs.mkdirSync(ours, { recursive: true });
      fs.writeFileSync(path.join(ours, 'SKILL.md'), 'ours');
      markSkillDirOwned(ours);

      write('.claude/skills/my-house-style/SKILL.md', 'mine');

      const result = removeOwnedSkillTree(projectDir, '.claude/skills', { files: [] });

      expect(result.removed).toContain('.claude/skills/languages-typescript');
      expect(result.preserved).toContain('.claude/skills/my-house-style');
      expect(exists('.claude/skills/my-house-style/SKILL.md')).toBe(true);
    });

    it('recognises folders from a manifest written before sentinels existed', () => {
      write('.claude/skills/legacy-skill/SKILL.md', 'installed by an older dev-suite');
      const manifest = { files: [{ path: '.claude/skills/legacy-skill', type: 'skill' }] };

      const result = removeOwnedSkillTree(projectDir, '.claude/skills', manifest);

      expect(result.removed).toContain('.claude/skills/legacy-skill');
    });

    it('never touches the reserved custom/ area', () => {
      write('.claude/skills/custom/mine/SKILL.md', 'mine');
      const result = removeOwnedSkillTree(projectDir, '.claude/skills', { files: [] });
      expect(result.preserved).toContain('.claude/skills/custom');
      expect(exists('.claude/skills/custom/mine/SKILL.md')).toBe(true);
    });
  });

  describe('pruneEmptyDirs', () => {
    it('removes only directories that are actually empty', () => {
      fs.mkdirSync(path.join(projectDir, '.claude/rules'), { recursive: true });
      write('.claude/commands/mine.md', 'mine');

      const removed = pruneEmptyDirs(projectDir, ['.claude/rules', '.claude/commands']);

      expect(removed).toEqual(['.claude/rules']);
      expect(exists('.claude/commands/mine.md')).toBe(true);
    });
  });

  describe('manifestTargets', () => {
    it('falls back to claude-code for a manifest with no targets', () => {
      expect(manifestTargets(null)).toEqual(['claude-code']);
      expect(manifestTargets({})).toEqual(['claude-code']);
      expect(manifestTargets({ targets: [] })).toEqual(['claude-code']);
    });

    it('ignores a non-array targets value rather than throwing', () => {
      expect(manifestTargets({ targets: 5 })).toEqual(['claude-code']);
      expect(manifestTargets({ targets: 'cursor' })).toEqual(['claude-code']);
    });
  });
});

describe('uninstall survives everything the user authored (end to end)', () => {
  let svc: InstallationService;
  let devSuiteDir: string;
  let projectDir: string;

  const write = (rel: string, body: string) => {
    const full = path.join(projectDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  };
  const read = (rel: string) => fs.readFileSync(path.join(projectDir, rel), 'utf-8');
  const exists = (rel: string) => fs.existsSync(path.join(projectDir, rel));

  beforeEach(() => {
    devSuiteDir = createTempDir('uninst-devsuite-');
    projectDir = createTempDir('uninst-project-');
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

  it('preserves user prose, user MCP servers, user settings, custom agents and foreign skills', async () => {
    const userAgents = '# House rules\n\nNever use `any`.\n';
    const userCodex = 'model = "o3"\n# hand-tuned\n\n[tui]\ntheme = "dark"\n';

    write('AGENTS.md', userAgents);
    write('.codex/config.toml', userCodex);
    write('.gemini/settings.json', JSON.stringify({ theme: 'GitHub' }));
    write('.cursor/mcp.json', JSON.stringify({ mcpServers: { mine: { command: 'node' } } }));
    write('.claude/settings.json', JSON.stringify({ permissions: { allow: ['Bash(npm test)'] } }));
    write('.claude/agents/custom/my-agent.md', '---\nname: my-agent\n---\nMine.\n');
    write('.claude/skills/my-house-style/SKILL.md', '---\nname: my-house-style\n---\nMine.\n');
    write('.agents/skills/team-standards/SKILL.md', '---\nname: team-standards\n---\nAnother tool.\n');
    write('.claude/commands/my-command.md', '---\nname: my-command\n---\nMine.\n');

    await svc.install({
      projectPath: projectDir,
      agents: ['typescript-expert'],
      mcpServers: ['documentation'],
      envVars: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: ['claude-code', 'codex', 'gemini', 'cursor'] as any,
    });

    // Sanity: the install really did merge into those files.
    expect(read('.codex/config.toml')).toContain('mcp_servers.documentation');
    expect(read('AGENTS.md')).toContain('House rules');

    const result = await svc.uninstall(projectDir);
    expect(result.errors).toEqual([]);

    // 1. Instructions prose is restored, not deleted.
    expect(exists('AGENTS.md')).toBe(true);
    expect(read('AGENTS.md').trim()).toBe(userAgents.trim());

    // 2. Merged configs keep everything of the user's and lose dev-suite's.
    expect(exists('.codex/config.toml')).toBe(true);
    expect(read('.codex/config.toml')).toContain('model = "o3"');
    expect(read('.codex/config.toml')).toContain('# hand-tuned');
    expect(read('.codex/config.toml')).toContain('[tui]');
    expect(read('.codex/config.toml')).not.toContain('mcp_servers');

    expect(JSON.parse(read('.gemini/settings.json')).theme).toBe('GitHub');
    expect(Object.keys(JSON.parse(read('.cursor/mcp.json')).mcpServers)).toEqual(['mine']);
    expect(JSON.parse(read('.claude/settings.json')).permissions.allow).toEqual(['Bash(npm test)']);

    // 3. Custom areas and foreign skills survive.
    expect(exists('.claude/agents/custom/my-agent.md')).toBe(true);
    expect(exists('.claude/skills/my-house-style/SKILL.md')).toBe(true);
    expect(exists('.agents/skills/team-standards/SKILL.md')).toBe(true);
    expect(exists('.claude/commands/my-command.md')).toBe(true);

    // 4. Dev-suite's own footprint is gone.
    expect(exists('.dev-suite.json')).toBe(false);
    expect(exists('.dev-suite-manifest.json')).toBe(false);
    expect(exists('.mcp-servers')).toBe(false);
    expect(exists('.claude/agents/typescript-expert.md')).toBe(false);
  });

  it('refuses a manifest entry that points outside the project', async () => {
    await svc.install({
      projectPath: projectDir,
      agents: ['typescript-expert'],
      mcpServers: [],
      envVars: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: ['claude-code'] as any,
    });

    // A manifest is data read off disk: a hostile or corrupt one must not turn
    // an uninstall into arbitrary file deletion.
    const outside = path.join(path.dirname(projectDir), 'outside-victim.txt');
    fs.writeFileSync(outside, 'do not delete me');

    const manifestPath = path.join(projectDir, '.dev-suite-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    manifest.files.push({ path: '../outside-victim.txt', type: 'config', source: 'hostile' });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = await svc.uninstall(projectDir);

    expect(fs.existsSync(outside)).toBe(true);
    expect(result.removed).not.toContain('../outside-victim.txt');
    expect(result.errors.some(e => e.includes('escapes the project'))).toBe(true);

    fs.unlinkSync(outside);
  });

  it('deletes an AGENTS.md it created itself, since nothing of the user is in it', async () => {
    await svc.install({
      projectPath: projectDir,
      agents: ['typescript-expert'],
      mcpServers: [],
      envVars: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: ['claude-code'] as any,
    });
    expect(exists('AGENTS.md')).toBe(true);

    await svc.uninstall(projectDir);

    expect(exists('AGENTS.md')).toBe(false);
    expect(exists('CLAUDE.md')).toBe(false);
  });
});
