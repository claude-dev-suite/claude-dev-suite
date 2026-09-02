// SPDX-License-Identifier: MIT
/**
 * Tests for feature-applier.service.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createTempDir, cleanupTempDir } from '../test-utils.js';
import {
  applyHookMerge,
  applyAgentReplace,
  applyFeature,
} from '../../src/services/upgrade/feature-applier.service.js';
import { calculateFileHash } from '../../src/services/upgrade/upgrade-utils.js';
import { HooksService } from '../../src/services/hooks.service.js';
import type {
  Feature,
  FeatureRegistry,
  ExtendedManifest,
  HookMergeConfig,
  AgentReplaceConfig,
} from '../../src/types/index.js';

vi.mock('../../src/services/hooks.service.js', () => {
  const HooksService = vi.fn();
  HooksService.prototype.configureIntegrationValidatorHook = vi.fn().mockReturnValue({
    success: true,
    configured: true,
  });
  return { HooksService };
});

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

function makeRegistry(overrides: Partial<FeatureRegistry> = {}): FeatureRegistry {
  return {
    schemaVersion: '1.0',
    features: [],
    promptTemplates: {
      'test-template': 'Do something useful',
    },
    ...overrides,
  };
}

function makeHookFeature(applyOverrides: Partial<HookMergeConfig> = {}, overrides: Partial<Feature> = {}): Feature {
  const apply: HookMergeConfig = {
    type: 'hook-merge',
    target: '.claude/settings.json',
    event: 'PostToolUse',
    config: { matcher: 'Write' },
    ...applyOverrides,
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

describe('applyHookMerge', () => {
  let tempDir: string;
  let hooksService: HooksService;
  let registry: FeatureRegistry;

  beforeEach(() => {
    tempDir = createTempDir('feature-applier-hook-test-');
    hooksService = new HooksService();
    registry = makeRegistry();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
    vi.clearAllMocks();
  });

  it('creates settings file and adds hook entry', () => {
    const feature = makeHookFeature({ config: { matcher: 'Write', hooks: ['echo test'] } });
    const manifest = makeManifest(tempDir);

    const result = applyHookMerge(tempDir, feature, manifest, registry, hooksService);
    expect(result.success).toBe(true);
    expect(result.featureId).toBe('hook-feature');

    const settingsPath = path.join(tempDir, '.claude', 'settings.json');
    expect(fs.existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      hooks: Record<string, unknown[]>;
    };
    expect(settings.hooks.PostToolUse).toHaveLength(1);
  });

  it('merges into existing settings file', () => {
    const claudeDir = path.join(tempDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    const existing = { hooks: { PreToolUse: [{ matcher: 'Read' }] } };
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(existing));

    const feature = makeHookFeature({ config: { matcher: 'Write', hooks: ['echo hi'] } });
    const manifest = makeManifest(tempDir);
    const result = applyHookMerge(tempDir, feature, manifest, registry, hooksService);
    expect(result.success).toBe(true);

    const settings = JSON.parse(
      fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8')
    ) as { hooks: Record<string, unknown[]> };
    // both events present
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.PostToolUse).toHaveLength(1);
  });

  it('uses promptTemplate from registry when hooks not set', () => {
    const feature = makeHookFeature({
      config: { matcher: 'Write', promptTemplate: 'test-template' },
    });
    const manifest = makeManifest(tempDir);
    const result = applyHookMerge(tempDir, feature, manifest, registry, hooksService);
    expect(result.success).toBe(true);

    const settingsPath = path.join(tempDir, '.claude', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
      hooks: { PostToolUse: Array<{ hooks: Array<{ prompt: string }> }> };
    };
    const hookEntry = settings.hooks.PostToolUse[0];
    expect(hookEntry?.hooks[0]?.prompt).toBe('Do something useful');
  });

  it('updates file tracking in manifest', () => {
    const feature = makeHookFeature({ config: { hooks: ['echo'] } });
    const manifest = makeManifest(tempDir);
    applyHookMerge(tempDir, feature, manifest, registry, hooksService);
    const tracked = manifest.files.find(f => f.path === '.claude/settings.json');
    expect(tracked).toBeDefined();
    expect(tracked?.type).toBe('config');
  });

  it('updates hash when file already tracked', () => {
    const claudeDir = path.join(tempDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    const oldContent = '{"hooks":{}}';
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), oldContent);

    const manifest = makeManifest(tempDir, {
      files: [
        {
          path: '.claude/settings.json',
          hash: calculateFileHash(oldContent),
          type: 'config',
        },
      ],
    });

    const feature = makeHookFeature({ config: { hooks: ['echo updated'] } });
    applyHookMerge(tempDir, feature, manifest, registry, hooksService);
    // Should update hash, not add a duplicate entry
    const tracked = manifest.files.filter(f => f.path === '.claude/settings.json');
    expect(tracked).toHaveLength(1);
    // Hash should differ from old content
    expect(tracked[0]?.hash).not.toBe(calculateFileHash(oldContent));
  });

  describe('matcher-less events (Stop)', () => {
    // `Stop` takes no matcher, so every entry on it has `matcher: undefined`.
    // Replacing "the entry with the same matcher" therefore matched the FIRST
    // Stop hook present — the integration validator, another feature, or the
    // user's own — and overwrote it in place, with no error and no report,
    // while the manifest still claimed the overwritten feature was installed.
    const settingsPath = () => path.join(tempDir, '.claude', 'settings.json');
    const readStop = () =>
      (JSON.parse(fs.readFileSync(settingsPath(), 'utf-8')) as {
        hooks?: { Stop?: Array<{ hooks?: Array<{ command?: string; prompt?: string }> }> };
      }).hooks?.Stop ?? [];

    const seedStopHook = (command: string) => {
      fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
      fs.writeFileSync(
        settingsPath(),
        JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command }] }] } })
      );
    };

    it('appends beside an existing matcher-less Stop hook instead of replacing it', () => {
      seedStopHook('node .claude/hooks/integration-validate.mjs warn');
      const feature = makeHookFeature({
        event: 'Stop',
        config: { hooks: ['echo smoke-test'] },
      });

      const result = applyHookMerge(tempDir, feature, makeManifest(tempDir), registry, hooksService);

      expect(result.success).toBe(true);
      const stop = readStop();
      expect(stop).toHaveLength(2);
      expect(stop[0]?.hooks?.[0]?.command).toBe('node .claude/hooks/integration-validate.mjs warn');
      expect(stop[1]?.hooks?.[0]?.command).toBe('echo smoke-test');
    });

    it('does not stack a second copy when the same feature is applied twice', () => {
      // The reason the replace-in-place behaviour exists: re-running an upgrade
      // must not fire the same hook twice per event.
      const feature = makeHookFeature({
        event: 'Stop',
        config: { hooks: ['echo smoke-test'] },
      });
      fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
      fs.writeFileSync(settingsPath(), '{}');

      applyHookMerge(tempDir, feature, makeManifest(tempDir), registry, hooksService);
      applyHookMerge(tempDir, feature, makeManifest(tempDir), registry, hooksService);

      expect(readStop()).toHaveLength(1);
    });

    it('keeps two different Stop features side by side', () => {
      fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
      fs.writeFileSync(settingsPath(), '{}');
      const smoke = makeHookFeature({ event: 'Stop', config: { hooks: ['echo smoke'] } }, { id: 'smoke-test-hook' });
      const pytest = makeHookFeature({ event: 'Stop', config: { hooks: ['echo pytest'] } }, { id: 'pytest-smoke-hook' });

      applyHookMerge(tempDir, smoke, makeManifest(tempDir), registry, hooksService);
      applyHookMerge(tempDir, pytest, makeManifest(tempDir), registry, hooksService);

      expect(readStop()).toHaveLength(2);
    });
  });

  it('handles integration-validator-hook via HooksService (success, configured)', () => {
    const feature = makeHookFeature(
      { target: '.claude/settings.json', event: 'PostToolUse', config: {} },
      { id: 'integration-validator-hook' }
    );
    const manifest = makeManifest(tempDir, {
      detectedStack: { frontend: { framework: 'react' } } as never,
    });

    // Ensure file exists so hash can be computed
    const claudeDir = path.join(tempDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}');

    const result = applyHookMerge(tempDir, feature, manifest, registry, hooksService);
    expect(result.success).toBe(true);
  });

  it('handles integration-validator-hook failure from HooksService', () => {
    vi.mocked(hooksService.configureIntegrationValidatorHook).mockReturnValueOnce({
      success: false,
      configured: false,
      error: 'Hook config failed',
    });

    const feature = makeHookFeature({}, { id: 'integration-validator-hook' });
    const manifest = makeManifest(tempDir, {
      detectedStack: { frontend: { framework: 'react' } } as never,
    });
    const result = applyHookMerge(tempDir, feature, manifest, registry, hooksService);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Hook config failed');
  });

  it('handles integration-validator-hook not configured (skipped)', () => {
    vi.mocked(hooksService.configureIntegrationValidatorHook).mockReturnValueOnce({
      success: true,
      configured: false,
      error: 'No matching stack',
    });

    const feature = makeHookFeature({}, { id: 'integration-validator-hook' });
    const manifest = makeManifest(tempDir, {
      detectedStack: { frontend: { framework: 'react' } } as never,
    });
    const result = applyHookMerge(tempDir, feature, manifest, registry, hooksService);
    expect(result.success).toBe(true);
    expect(result.error).toBe('No matching stack');
  });

  it('throws PathValidationError for path traversal in projectPath', () => {
    const feature = makeHookFeature();
    const manifest = makeManifest('/bad/../path');
    expect(() => applyHookMerge('/bad/../path', feature, manifest, registry, hooksService)).toThrow();
  });
});

describe('applyAgentReplace', () => {
  let tempDir: string;
  let devSuiteDir: string;

  beforeEach(() => {
    tempDir = createTempDir('feature-applier-agent-test-');
    devSuiteDir = createTempDir('feature-applier-devsuite-');
    process.env.DEV_SUITE_DIR = devSuiteDir;
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
    cleanupTempDir(devSuiteDir);
    delete process.env.DEV_SUITE_DIR;
  });

  it('copies agent file from source to target', () => {
    const sourceRel = 'agents/core/react-expert.md';
    const targetRel = '.claude/agents/react-expert.md';
    const sourceDir = path.join(devSuiteDir, 'agents', 'core');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(devSuiteDir, sourceRel), '# React Expert');

    const feature = makeAgentFeature(sourceRel, targetRel);
    const manifest = makeManifest(tempDir);
    const result = applyAgentReplace(tempDir, feature, manifest);

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(tempDir, targetRel))).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, targetRel), 'utf-8')).toBe('# React Expert');
  });

  it('creates target directory when missing', () => {
    const sourceRel = 'agents/core/vue-expert.md';
    const targetRel = '.claude/agents/nested/vue-expert.md';
    const sourceDir = path.join(devSuiteDir, 'agents', 'core');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(devSuiteDir, sourceRel), '# Vue Expert');

    const feature = makeAgentFeature(sourceRel, targetRel);
    const manifest = makeManifest(tempDir);
    const result = applyAgentReplace(tempDir, feature, manifest);

    expect(result.success).toBe(true);
  });

  it('returns error when source file does not exist', () => {
    const feature = makeAgentFeature('agents/core/nonexistent.md', '.claude/agents/nonexistent.md');
    const manifest = makeManifest(tempDir);
    const result = applyAgentReplace(tempDir, feature, manifest);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Source file not found');
  });

  it('tracks the new agent file in manifest', () => {
    const sourceRel = 'agents/core/ts-expert.md';
    const targetRel = '.claude/agents/ts-expert.md';
    const sourceDir = path.join(devSuiteDir, 'agents', 'core');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(devSuiteDir, sourceRel), '# TS Expert');

    const feature = makeAgentFeature(sourceRel, targetRel);
    const manifest = makeManifest(tempDir);
    applyAgentReplace(tempDir, feature, manifest);

    const tracked = manifest.files.find(f => f.path === targetRel);
    expect(tracked).toBeDefined();
    expect(tracked?.type).toBe('agent');
    expect(tracked?.source).toBe(sourceRel);
  });

  it('updates tracking when file already exists in manifest', () => {
    const sourceRel = 'agents/core/update-expert.md';
    const targetRel = '.claude/agents/update-expert.md';
    const sourceDir = path.join(devSuiteDir, 'agents', 'core');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(devSuiteDir, sourceRel), '# Updated Agent');

    const manifest = makeManifest(tempDir, {
      files: [
        { path: targetRel, hash: 'oldhash', type: 'agent', source: sourceRel },
      ],
    });
    const feature = makeAgentFeature(sourceRel, targetRel);
    applyAgentReplace(tempDir, feature, manifest);

    const tracked = manifest.files.filter(f => f.path === targetRel);
    expect(tracked).toHaveLength(1);
    expect(tracked[0]?.hash).not.toBe('oldhash');
  });

  it('throws PathValidationError for path traversal in projectPath', () => {
    const feature = makeAgentFeature('agents/core/x.md', '.claude/agents/x.md');
    expect(() => applyAgentReplace('/bad/../path', feature, makeManifest('/bad/../path'))).toThrow();
  });
});

describe('applyFeature', () => {
  let tempDir: string;
  let devSuiteDir: string;
  let hooksService: HooksService;
  let registry: FeatureRegistry;

  beforeEach(() => {
    tempDir = createTempDir('feature-applier-apply-test-');
    devSuiteDir = createTempDir('feature-applier-apply-devsuite-');
    process.env.DEV_SUITE_DIR = devSuiteDir;
    hooksService = new HooksService();
    registry = makeRegistry();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
    cleanupTempDir(devSuiteDir);
    delete process.env.DEV_SUITE_DIR;
    vi.clearAllMocks();
  });

  it('applies a hook-merge feature successfully', () => {
    const feature = makeHookFeature({ config: { hooks: ['echo'] } });
    const manifest = makeManifest(tempDir);
    const result = applyFeature(tempDir, feature, manifest, registry, hooksService);
    expect(result.success).toBe(true);
    // Manifest features updated
    expect(manifest.features['hook-feature']).toBeDefined();
    expect(manifest.features['hook-feature']?.version).toBe('1.0.0');
  });

  it('applies an agent-replace feature successfully', () => {
    const sourceRel = 'agents/core/sample.md';
    const targetRel = '.claude/agents/sample.md';
    const sourceDir = path.join(devSuiteDir, 'agents', 'core');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(devSuiteDir, sourceRel), '# Sample');

    const feature = makeAgentFeature(sourceRel, targetRel);
    const manifest = makeManifest(tempDir);
    const result = applyFeature(tempDir, feature, manifest, registry, hooksService);
    expect(result.success).toBe(true);
    expect(manifest.features['agent-feature']).toBeDefined();
  });

  it('returns error for unsupported apply type', () => {
    const feature: Feature = {
      id: 'unsupported-feature',
      version: '1.0.0',
      type: 'config',
      name: 'Unsupported',
      description: 'Uses unsupported type',
      addedInVersion: '1.0.0',
      apply: { type: 'config-merge', target: 'config.json', merge: {} },
    };
    const manifest = makeManifest(tempDir);
    const result = applyFeature(tempDir, feature, manifest, registry, hooksService);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported apply type');
  });

  it('returns blocking conflicts when feature has dependency-missing conflict', () => {
    const feature = makeHookFeature({}, {
      dependencies: { agents: ['missing-expert'] },
    });
    const manifest = makeManifest(tempDir, { agents: [] });
    const result = applyFeature(tempDir, feature, manifest, registry, hooksService);
    expect(result.success).toBe(false);
    expect(result.conflicts).toBeDefined();
    expect(result.conflictsResolved).toBe(false);
  });

  it('applies feature when conflict resolution is provided for prompt-user conflicts', () => {
    // Create a locally modified agent file
    const agentDir = path.join(tempDir, '.claude', 'agents');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, 'agent.md'), '# Agent — locally modified');

    const sourceDir = path.join(devSuiteDir, 'agents', 'core');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(devSuiteDir, 'agents/core/agent.md'), '# Agent v2');

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

    // Provide resolution for the conflict
    const resolutions = {
      'agent-feature': { '.claude/agents/agent.md': 'replace' as const },
    };
    const result = applyFeature(tempDir, feature, manifest, registry, hooksService, resolutions);
    // With resolutions provided, blocking check is bypassed → apply should succeed
    expect(result.success).toBe(true);
  });

  it('does not update manifest features when apply fails', () => {
    // Source file missing → applyAgentReplace fails
    const feature = makeAgentFeature('agents/core/missing.md', '.claude/agents/missing.md');
    const manifest = makeManifest(tempDir);
    const result = applyFeature(tempDir, feature, manifest, registry, hooksService);
    expect(result.success).toBe(false);
    expect(manifest.features['agent-feature']).toBeUndefined();
  });

  it('throws PathValidationError for path traversal in projectPath', () => {
    const feature = makeHookFeature();
    expect(() =>
      applyFeature('/bad/../path', feature, makeManifest('/bad/../path'), registry, hooksService)
    ).toThrow();
  });
});
