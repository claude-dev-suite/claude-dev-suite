// SPDX-License-Identifier: MIT
/**
 * Tests for conflict-detector.service.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createTempDir, cleanupTempDir } from '../test-utils.js';
import { detectConflicts } from '../../src/services/upgrade/conflict-detector.service.js';
import { calculateFileHash } from '../../src/services/upgrade/upgrade-utils.js';
import type {
  Feature,
  ExtendedManifest,
  HookMergeConfig,
  AgentReplaceConfig,
} from '../../src/types/index.js';

function makeManifest(projectPath: string, overrides: Partial<ExtendedManifest> = {}): ExtendedManifest {
  return {
    version: '1.0.0',
    installedAt: new Date().toISOString(),
    projectPath,
    agents: [],
    mcpServers: [],
    features: {},
    files: [],
    upgradeHistory: [],
    ...overrides,
  };
}

function makeHookFeature(overrides: Partial<Feature> = {}): Feature {
  const apply: HookMergeConfig = {
    type: 'hook-merge',
    target: '.claude/settings.json',
    event: 'PostToolUse',
    config: { matcher: 'Write' },
  };
  return {
    id: 'hook-feature',
    version: '1.0.0',
    type: 'hook',
    name: 'Hook Feature',
    description: 'Adds a hook',
    addedInVersion: '1.0.0',
    apply,
    ...overrides,
  };
}

function makeAgentFeature(source: string, target: string, overrides: Partial<Feature> = {}): Feature {
  const apply: AgentReplaceConfig = {
    type: 'agent-replace',
    source,
    target,
  };
  return {
    id: 'agent-feature',
    version: '1.0.0',
    type: 'agent-update',
    name: 'Agent Feature',
    description: 'Updates an agent',
    addedInVersion: '1.0.0',
    apply,
    ...overrides,
  };
}

describe('detectConflicts', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir('conflict-detector-test-');
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
    delete process.env.DEV_SUITE_DIR;
  });

  // -------------------------------------------------------
  describe('hook-merge: no conflicts', () => {
    it('returns no conflicts when settings file does not exist', () => {
      const feature = makeHookFeature();
      const manifest = makeManifest(tempDir);
      const conflicts = detectConflicts(tempDir, feature, manifest);
      expect(conflicts).toHaveLength(0);
    });

    it('returns no conflicts when file exists but is not tracked', () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}');
      const feature = makeHookFeature();
      const manifest = makeManifest(tempDir);
      const conflicts = detectConflicts(tempDir, feature, manifest);
      expect(conflicts).toHaveLength(0);
    });

    it('returns no conflicts when file is tracked and unmodified', () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      const content = '{}';
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), content);

      const manifest = makeManifest(tempDir, {
        files: [
          {
            path: '.claude/settings.json',
            hash: calculateFileHash(content),
            type: 'config',
          },
        ],
      });
      const feature = makeHookFeature();
      const conflicts = detectConflicts(tempDir, feature, manifest);
      expect(conflicts).toHaveLength(0);
    });
  });

  // -------------------------------------------------------
  describe('hook-merge: file-modified conflict', () => {
    it('detects file-modified when tracked file was changed', () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{"modified":true}');

      const manifest = makeManifest(tempDir, {
        files: [
          {
            path: '.claude/settings.json',
            hash: calculateFileHash('{}'), // original hash
            type: 'config',
          },
        ],
      });
      const feature = makeHookFeature();
      const conflicts = detectConflicts(tempDir, feature, manifest);
      const fileModified = conflicts.find(c => c.type === 'file-modified');
      expect(fileModified).toBeDefined();
      expect(fileModified?.suggestedResolution).toBe('merge');
      expect(fileModified?.target).toBe('.claude/settings.json');
    });
  });

  // -------------------------------------------------------
  describe('hook-merge: hook-duplicate conflict', () => {
    it('detects hook-duplicate when same matcher already exists', () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      const settings = {
        hooks: {
          PostToolUse: [{ matcher: 'Write', hooks: ['echo test'] }],
        },
      };
      const content = JSON.stringify(settings);
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), content);

      const manifest = makeManifest(tempDir); // no tracked files → file-modified won't fire
      const feature = makeHookFeature(); // same matcher 'Write'
      const conflicts = detectConflicts(tempDir, feature, manifest);
      const dup = conflicts.find(c => c.type === 'hook-duplicate');
      expect(dup).toBeDefined();
      expect(dup?.suggestedResolution).toBe('skip');
    });

    it('does not detect duplicate when hook event does not exist', () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      const settings = { hooks: { PreToolUse: [{ matcher: 'Write' }] } };
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(settings));

      const manifest = makeManifest(tempDir);
      const feature = makeHookFeature(); // PostToolUse
      const conflicts = detectConflicts(tempDir, feature, manifest);
      expect(conflicts.filter(c => c.type === 'hook-duplicate')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------
  describe('agent-replace conflicts', () => {
    it('returns no conflicts when agent file does not exist at target', () => {
      const sourceDir = path.join(tempDir, 'dev-suite', 'agents', 'core');
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, 'agent.md'), '# Agent');
      process.env.DEV_SUITE_DIR = path.join(tempDir, 'dev-suite');

      const feature = makeAgentFeature('agents/core/agent.md', '.claude/agents/agent.md');
      const manifest = makeManifest(tempDir);
      const conflicts = detectConflicts(tempDir, feature, manifest);
      expect(conflicts).toHaveLength(0);
    });

    it('returns no conflicts when file exists but is not tracked', () => {
      const agentDir = path.join(tempDir, '.claude', 'agents');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, 'agent.md'), '# Agent');

      const feature = makeAgentFeature('agents/core/agent.md', '.claude/agents/agent.md');
      const manifest = makeManifest(tempDir);
      const conflicts = detectConflicts(tempDir, feature, manifest);
      expect(conflicts).toHaveLength(0);
    });

    it('detects file-modified conflict when agent was locally customized', () => {
      const agentDir = path.join(tempDir, '.claude', 'agents');
      fs.mkdirSync(agentDir, { recursive: true });
      const modifiedContent = '# Agent — locally modified';
      fs.writeFileSync(path.join(agentDir, 'agent.md'), modifiedContent);

      const sourceDir = path.join(tempDir, 'dev-suite', 'agents', 'core');
      fs.mkdirSync(sourceDir, { recursive: true });
      const newContent = '# Agent v2';
      fs.writeFileSync(path.join(sourceDir, 'agent.md'), newContent);
      process.env.DEV_SUITE_DIR = path.join(tempDir, 'dev-suite');

      const manifest = makeManifest(tempDir, {
        files: [
          {
            path: '.claude/agents/agent.md',
            hash: calculateFileHash('# Agent — original'),
            type: 'agent',
          },
        ],
      });
      const feature = makeAgentFeature('agents/core/agent.md', '.claude/agents/agent.md');
      const conflicts = detectConflicts(tempDir, feature, manifest);
      const fileModified = conflicts.find(c => c.type === 'file-modified');
      expect(fileModified).toBeDefined();
      expect(fileModified?.suggestedResolution).toBe('prompt-user');
      expect(fileModified?.originalContent).toBe(modifiedContent);
      expect(fileModified?.newContent).toBe(newContent);
    });
  });

  // -------------------------------------------------------
  describe('dependency-missing conflicts', () => {
    it('returns no dependency-missing when all agents are installed', () => {
      const feature = makeHookFeature({
        dependencies: { agents: ['react-expert'] },
      });
      const manifest = makeManifest(tempDir, { agents: ['react-expert'] });
      const conflicts = detectConflicts(tempDir, feature, manifest);
      expect(conflicts.filter(c => c.type === 'dependency-missing')).toHaveLength(0);
    });

    it('detects dependency-missing when required agents are absent', () => {
      const feature = makeHookFeature({
        dependencies: { agents: ['react-expert', 'typescript-expert'] },
      });
      const manifest = makeManifest(tempDir, { agents: ['react-expert'] });
      const conflicts = detectConflicts(tempDir, feature, manifest);
      const depMissing = conflicts.find(c => c.type === 'dependency-missing');
      expect(depMissing).toBeDefined();
      expect(depMissing?.target).toContain('typescript-expert');
      expect(depMissing?.suggestedResolution).toBe('skip');
    });

    it('lists all missing agents in one conflict entry', () => {
      const feature = makeHookFeature({
        dependencies: { agents: ['a-expert', 'b-expert', 'c-expert'] },
      });
      const manifest = makeManifest(tempDir, { agents: [] });
      const conflicts = detectConflicts(tempDir, feature, manifest);
      const depMissing = conflicts.filter(c => c.type === 'dependency-missing');
      expect(depMissing).toHaveLength(1);
      expect(depMissing[0]?.target).toContain('a-expert');
      expect(depMissing[0]?.target).toContain('b-expert');
      expect(depMissing[0]?.target).toContain('c-expert');
    });
  });

  // -------------------------------------------------------
  describe('path traversal guard', () => {
    it('throws when projectPath contains ..', () => {
      const feature = makeHookFeature();
      const manifest = makeManifest('/some/path');
      expect(() => detectConflicts('/a/../b', feature, manifest)).toThrow('Path traversal not allowed');
    });
  });
});
