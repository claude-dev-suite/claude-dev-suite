/**
 * End-to-end multi-target install tests (slice 2.3b).
 *
 * Drives a real install through the Copilot and Cursor adapters and asserts the
 * per-target files land in the right place, with the right MCP shapes, and that
 * the shared `.claude/` substrate is written regardless of whether Claude Code
 * itself is a selected target.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InstallationService } from '../../src/services/installation.service.js';
import {
  createTempDir,
  cleanupTempDir,
  createMockDevSuiteDir,
  createMockProject,
} from '../test-utils.js';
import * as fs from 'fs';
import * as path from 'path';

describe('multi-target install', () => {
  let svc: InstallationService;
  let devSuiteDir: string;
  let projectDir: string;

  beforeEach(() => {
    devSuiteDir = createTempDir('mt-devsuite-');
    projectDir = createTempDir('mt-project-');
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

  const exists = (p: string) => fs.existsSync(path.join(projectDir, p));
  const readJson = (p: string) => JSON.parse(fs.readFileSync(path.join(projectDir, p), 'utf-8'));

  const install = (targets: string[]) =>
    svc.install({
      projectPath: projectDir,
      agents: ['typescript-expert'],
      mcpServers: ['documentation'],
      envVars: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: targets as any,
    });

  it('writes each assistant into its own layout for a combined install', async () => {
    await install(['claude-code', 'copilot', 'cursor']);

    // Shared substrate + instructions
    expect(exists('.claude/agents/typescript-expert.md')).toBe(true);
    expect(exists('AGENTS.md')).toBe(true);
    expect(exists('CLAUDE.md')).toBe(true);

    // Claude Code
    expect(exists('.mcp.json')).toBe(true);
    expect(exists('.claude/settings.json')).toBe(true);

    // Copilot: two MCP surfaces with divergent shapes
    const vscode = readJson('.vscode/mcp.json');
    expect(Object.keys(vscode)).toEqual(['servers']);
    expect(vscode.servers['documentation'].type).toBe('stdio');

    const githubMcp = readJson('.github/mcp.json');
    expect(Object.keys(githubMcp)).toEqual(['mcpServers']);
    expect(githubMcp.mcpServers['documentation'].type).toBe('local');
    expect(githubMcp.mcpServers['documentation'].tools).toEqual(['*']);

    // Cursor
    const cursor = readJson('.cursor/mcp.json');
    expect(cursor.mcpServers['documentation'].type).toBe('stdio');

    // Every file is tagged with the target that owns it.
    const manifest = readJson('.dev-suite-manifest.json');
    expect(manifest.targets).toEqual(['claude-code', 'copilot', 'cursor']);
    const targetsSeen = new Set(manifest.files.map((f: { target?: string }) => f.target));
    expect(targetsSeen).toContain('copilot');
    expect(targetsSeen).toContain('cursor');
  });

  it('writes the .claude substrate for a Copilot-only install, but no Claude config', async () => {
    await install(['copilot']);

    // Substrate is shared infrastructure — Copilot reads it directly.
    expect(exists('.claude/agents/typescript-expert.md')).toBe(true);
    expect(exists('AGENTS.md')).toBe(true);

    // Copilot's own files.
    expect(exists('.vscode/mcp.json')).toBe(true);
    expect(exists('.github/mcp.json')).toBe(true);

    // No Claude-Code-specific artifacts when it wasn't targeted.
    expect(exists('CLAUDE.md')).toBe(false);
    expect(exists('.mcp.json')).toBe(false);
    expect(exists('.claude/settings.json')).toBe(false);

    expect(readJson('.dev-suite-manifest.json').targets).toEqual(['copilot']);
  });

  it('merges into a Cursor MCP file the user already has, keeping their servers', async () => {
    fs.mkdirSync(path.join(projectDir, '.cursor'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { 'user-own': { command: 'python', args: ['s.py'] } } })
    );

    await install(['cursor']);

    const cursor = readJson('.cursor/mcp.json');
    expect(cursor.mcpServers['user-own']).toEqual({ command: 'python', args: ['s.py'] });
    expect(cursor.mcpServers['documentation']).toBeDefined();
  });

  it('installs Gemini: mirrors skills to .agents/skills and writes AGENTS.md-aware settings', async () => {
    await install(['gemini']);

    // Skills are mirrored to the cross-tool location Gemini reads.
    expect(exists('.agents/skills')).toBe(true);
    const claudeSkills = fs.readdirSync(path.join(projectDir, '.claude', 'skills')).filter(n => n !== '_README.md').sort();
    const agentsSkills = fs.readdirSync(path.join(projectDir, '.agents', 'skills')).filter(n => n !== '_README.md').sort();
    expect(agentsSkills).toEqual(claudeSkills);
    expect(agentsSkills.length).toBeGreaterThan(0);

    // AGENTS.md is written (Gemini reads it via context.fileName), but CLAUDE.md is not.
    expect(exists('AGENTS.md')).toBe(true);
    expect(exists('CLAUDE.md')).toBe(false);

    const settings = readJson('.gemini/settings.json');
    expect(settings.context.fileName).toContain('AGENTS.md');
    expect(settings.mcpServers['documentation']).toBeDefined();
    expect(settings.mcpServers['documentation']).not.toHaveProperty('type');
  });

  it('installs Codex: merges MCP into config.toml, keeping the user\'s content', async () => {
    fs.mkdirSync(path.join(projectDir, '.codex'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.codex', 'config.toml'),
      '# mine\nmodel = "gpt-5-codex"\n\n[mcp_servers.user-own]\ncommand = "python"\nargs = ["s.py"]\n'
    );

    await install(['codex']);

    // Skills reach Codex via the .agents/skills mirror; AGENTS.md is read natively.
    expect(exists('.agents/skills')).toBe(true);
    expect(exists('AGENTS.md')).toBe(true);
    expect(exists('CLAUDE.md')).toBe(false);

    const toml = fs.readFileSync(path.join(projectDir, '.codex', 'config.toml'), 'utf-8');
    // User content preserved verbatim...
    expect(toml).toContain('# mine');
    expect(toml).toContain('model = "gpt-5-codex"');
    expect(toml).toContain('[mcp_servers.user-own]');
    // ...and dev-suite's server appended as a TOML table.
    expect(toml).toContain('[mcp_servers.documentation]');
    expect(toml.match(/\[mcp_servers\.documentation\]/g)).toHaveLength(1);
  });

  it('does not mirror .agents/skills for a Claude-only install', async () => {
    await install(['claude-code']);
    expect(exists('.claude/skills')).toBe(true);
    expect(exists('.agents/skills')).toBe(false);
  });

  it('leaves an unparseable existing MCP file untouched and reports it', async () => {
    fs.mkdirSync(path.join(projectDir, '.cursor'), { recursive: true });
    const garbage = '{ not json at all';
    fs.writeFileSync(path.join(projectDir, '.cursor', 'mcp.json'), garbage);

    // Install must not throw, and must not destroy the user's (broken) file.
    await expect(install(['cursor'])).resolves.toBeDefined();
    expect(fs.readFileSync(path.join(projectDir, '.cursor', 'mcp.json'), 'utf-8')).toBe(garbage);
  });
});
