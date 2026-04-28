// SPDX-License-Identifier: MIT
/**
 * Tests for upgrade.service.ts (facade)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createTempDir, cleanupTempDir } from './test-utils.js';
import { MANIFEST_FILENAME } from '../src/services/upgrade/upgrade-utils.js';
import type {
  ExtendedManifest,
  Feature,
  FeatureRegistry,
  HookMergeConfig,
  AgentReplaceConfig,
} from '../src/types/index.js';

// Mock the module-level cached loadFeatureRegistry to avoid cross-test cache pollution
vi.mock('../src/services/upgrade/upgrade-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/upgrade/upgrade-utils.js')>();
  return {
    ...actual,
    loadFeatureRegistry: vi.fn(),
  };
});

// Mock HooksService so it can be constructed
vi.mock('../src/services/hooks.service.js', () => {
  const HooksService = vi.fn();
  HooksService.prototype.configureIntegrationValidatorHook = vi.fn().mockReturnValue({
    success: true,
    configured: true,
  });
  return { HooksService };
});

// Import AFTER mocks are set up
const { UpgradeService } = await import('../src/services/upgrade.service.js');
const upgradeUtils = await import('../src/services/upgrade/upgrade-utils.js');
const mockLoadFeatureRegistry = vi.mocked(upgradeUtils.loadFeatureRegistry);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function writeManifest(dir: string, manifest: ExtendedManifest): void {
  fs.writeFileSync(path.join(dir, MANIFEST_FILENAME), JSON.stringify(manifest, null, 2));
}

function makeHookFeature(id = 'hook-feature', version = '1.0.0'): Feature {
  const apply: HookMergeConfig = {
    type: 'hook-merge',
    target: '.claude/settings.json',
    event: 'PostToolUse',
    config: { matcher: 'Write', hooks: ['echo "hooked"'] },
  };
  return {
    id,
    version,
    type: 'hook',
    name: 'Hook Feature',
    description: 'Adds a hook',
    addedInVersion: '1.0.0',
    apply,
  };
}

function makeAgentFeature(
  id = 'agent-feature',
  source = 'agents/core/sample.md',
  target = '.claude/agents/sample.md'
): Feature {
  const apply: AgentReplaceConfig = {
    type: 'agent-replace',
    source,
    target,
  };
  return {
    id,
    version: '1.0.0',
    type: 'agent-update',
    name: 'Agent Feature',
    description: 'Updates agent',
    addedInVersion: '1.0.0',
    apply,
  };
}

function makeRegistry(features: Feature[] = []): FeatureRegistry {
  return {
    schemaVersion: '1.0',
    features,
    promptTemplates: {},
  };
}

// ---------------------------------------------------------------------------

describe('UpgradeService', () => {
  let service: InstanceType<typeof UpgradeService>;
  let tempDir: string;
  let devSuiteDir: string;

  beforeEach(() => {
    service = new UpgradeService();
    tempDir = createTempDir('upgrade-svc-test-');
    devSuiteDir = createTempDir('upgrade-svc-devsuite-');
    process.env.DEV_SUITE_DIR = devSuiteDir;
    // Default: registry returns null (no upgrades)
    mockLoadFeatureRegistry.mockReturnValue(null);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
    cleanupTempDir(devSuiteDir);
    delete process.env.DEV_SUITE_DIR;
    vi.clearAllMocks();
  });

  // =========================================================================
  describe('checkUpgrades', () => {
    it('returns no upgrades and hasValidManifest=false when manifest missing', async () => {
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry());
      const result = await service.checkUpgrades(tempDir);
      expect(result.hasValidManifest).toBe(false);
      expect(result.availableUpgrades).toHaveLength(0);
      expect(result.upgradeCount).toBe(0);
    });

    it('returns hasValidManifest=true without registry (graceful)', async () => {
      // registry is null (default mock)
      writeManifest(tempDir, makeManifest(tempDir));
      const result = await service.checkUpgrades(tempDir);
      expect(result.hasValidManifest).toBe(true);
      expect(result.availableUpgrades).toHaveLength(0);
    });

    it('returns available upgrades for compatible features', async () => {
      const feature = makeHookFeature();
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([feature]));
      writeManifest(tempDir, makeManifest(tempDir));

      const result = await service.checkUpgrades(tempDir);
      expect(result.hasValidManifest).toBe(true);
      expect(result.availableUpgrades).toHaveLength(1);
      expect(result.availableUpgrades[0]?.feature.id).toBe('hook-feature');
      expect(result.availableUpgrades[0]?.isApplied).toBe(false);
    });

    it('marks feature as applied when already in manifest.features', async () => {
      const feature = makeHookFeature();
      const manifest = makeManifest(tempDir, {
        features: { 'hook-feature': { version: '1.0.0', appliedAt: new Date().toISOString() } },
      });
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([feature]));
      writeManifest(tempDir, manifest);

      const result = await service.checkUpgrades(tempDir);
      const upgrade = result.availableUpgrades[0];
      expect(upgrade?.isApplied).toBe(true);
      expect(upgrade?.hasUpdate).toBe(false);
    });

    it('marks hasUpdate=true when feature version differs from applied version', async () => {
      const feature = makeHookFeature('hook-feature', '2.0.0'); // newer version
      const manifest = makeManifest(tempDir, {
        features: { 'hook-feature': { version: '1.0.0', appliedAt: new Date().toISOString() } },
      });
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([feature]));
      writeManifest(tempDir, manifest);

      const result = await service.checkUpgrades(tempDir);
      const upgrade = result.availableUpgrades[0];
      expect(upgrade?.hasUpdate).toBe(true);
    });

    it('includes upgradeCount of actionable upgrades', async () => {
      const f1 = makeHookFeature('f1');
      const f2 = makeHookFeature('f2');
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([f1, f2]));
      writeManifest(tempDir, makeManifest(tempDir));

      const result = await service.checkUpgrades(tempDir);
      expect(result.upgradeCount).toBe(2);
    });

    it('returns lastUpgrade from upgradeHistory', async () => {
      const ts = '2026-01-01T00:00:00.000Z';
      const manifest = makeManifest(tempDir, {
        upgradeHistory: [{
          timestamp: ts,
          fromVersion: '1.0.0',
          toVersion: '1.1.0',
          featuresApplied: [],
          featuresSkipped: [],
        }],
      });
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry());
      writeManifest(tempDir, manifest);

      const result = await service.checkUpgrades(tempDir);
      expect(result.lastUpgrade).toBe(ts);
    });

    it('detects missing agent dependencies in missingDependencies', async () => {
      const feature = makeHookFeature();
      (feature as Feature).dependencies = { agents: ['missing-expert'] };
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([feature]));
      writeManifest(tempDir, makeManifest(tempDir, { agents: [] }));

      const result = await service.checkUpgrades(tempDir);
      const upgrade = result.availableUpgrades[0];
      expect(upgrade?.missingDependencies).toContain('missing-expert');
    });

    it('excludes incompatible features from upgradeCount', async () => {
      const feature = makeHookFeature();
      feature.stackRequirements = { requiresAny: { frontend: ['svelte'] } };
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([feature]));
      writeManifest(
        tempDir,
        makeManifest(tempDir, {
          detectedStack: { frontend: { framework: 'react' } } as never,
        })
      );

      const result = await service.checkUpgrades(tempDir);
      expect(result.upgradeCount).toBe(0);
    });

    it('reports current and installed versions', async () => {
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry());
      const manifest = makeManifest(tempDir, { version: '0.9.0' });
      writeManifest(tempDir, manifest);

      const result = await service.checkUpgrades(tempDir);
      expect(result.installedVersion).toBe('0.9.0');
      expect(typeof result.currentDevSuiteVersion).toBe('string');
    });

    it('throws on path traversal', async () => {
      await expect(service.checkUpgrades('/bad/../path')).rejects.toThrow();
    });
  });

  // =========================================================================
  describe('previewUpgrade', () => {
    it('returns empty result when manifest missing', async () => {
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([makeHookFeature()]));
      const result = await service.previewUpgrade(tempDir);
      expect(result.wouldApply).toHaveLength(0);
      expect(result.wouldSkip).toHaveLength(0);
      expect(result.requiresIntervention).toBe(false);
    });

    it('previews features that would be applied', async () => {
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([makeHookFeature()]));
      writeManifest(tempDir, makeManifest(tempDir));

      const result = await service.previewUpgrade(tempDir);
      expect(result.wouldApply).toContain('hook-feature');
    });

    it('skips already-applied features with no update', async () => {
      const feature = makeHookFeature();
      const manifest = makeManifest(tempDir, {
        features: { 'hook-feature': { version: '1.0.0', appliedAt: new Date().toISOString() } },
      });
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([feature]));
      writeManifest(tempDir, manifest);

      const result = await service.previewUpgrade(tempDir);
      expect(result.wouldSkip).toContain('hook-feature');
      expect(result.wouldApply).not.toContain('hook-feature');
    });

    it('skips features with missing dependencies', async () => {
      const feature = makeHookFeature();
      feature.dependencies = { agents: ['missing-expert'] };
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([feature]));
      writeManifest(tempDir, makeManifest(tempDir, { agents: [] }));

      const result = await service.previewUpgrade(tempDir);
      expect(result.wouldSkip).toContain('hook-feature');
    });

    it('filters by featureIds when provided', async () => {
      const f1 = makeHookFeature('f1');
      const f2 = makeHookFeature('f2');
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([f1, f2]));
      writeManifest(tempDir, makeManifest(tempDir));

      const result = await service.previewUpgrade(tempDir, ['f1']);
      expect(result.wouldApply).toContain('f1');
      expect(result.wouldApply).not.toContain('f2');
    });

    it('tracks filesToCreate for hook-merge when settings file does not exist', async () => {
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([makeHookFeature()]));
      writeManifest(tempDir, makeManifest(tempDir));

      const result = await service.previewUpgrade(tempDir);
      expect(result.filesToCreate).toContain('.claude/settings.json');
    });

    it('tracks filesToModify for hook-merge when settings file exists', async () => {
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}');

      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([makeHookFeature()]));
      writeManifest(tempDir, makeManifest(tempDir));

      const result = await service.previewUpgrade(tempDir);
      expect(result.filesToModify).toContain('.claude/settings.json');
    });

    it('tracks filesToCreate for agent-replace when target does not exist', async () => {
      const agentFeature = makeAgentFeature();
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([agentFeature]));
      writeManifest(tempDir, makeManifest(tempDir));

      const result = await service.previewUpgrade(tempDir);
      expect(result.filesToCreate).toContain('.claude/agents/sample.md');
    });

    it('tracks filesToModify for agent-replace when target exists', async () => {
      const agentDir = path.join(tempDir, '.claude', 'agents');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, 'sample.md'), '# Sample');

      const agentFeature = makeAgentFeature();
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([agentFeature]));
      writeManifest(tempDir, makeManifest(tempDir));

      const result = await service.previewUpgrade(tempDir);
      expect(result.filesToModify).toContain('.claude/agents/sample.md');
    });

    it('does not set requiresIntervention without prompt-user conflicts', async () => {
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([makeHookFeature()]));
      writeManifest(tempDir, makeManifest(tempDir));

      const result = await service.previewUpgrade(tempDir);
      expect(result.requiresIntervention).toBe(false);
    });

    it('throws on path traversal', async () => {
      await expect(service.previewUpgrade('/bad/../path')).rejects.toThrow();
    });
  });

  // =========================================================================
  describe('executeUpgrade', () => {
    it('returns error when registry is missing', async () => {
      // mockLoadFeatureRegistry already returns null by default
      const result = await service.executeUpgrade({
        projectPath: tempDir,
        featureIds: ['hook-feature'],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Feature registry not found');
    });

    it('returns error when manifest is missing', async () => {
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([makeHookFeature()]));
      const result = await service.executeUpgrade({
        projectPath: tempDir,
        featureIds: ['hook-feature'],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('manifest not found');
    });

    it('returns error when featureIds are not in registry', async () => {
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([makeHookFeature()]));
      writeManifest(tempDir, makeManifest(tempDir));

      const result = await service.executeUpgrade({
        projectPath: tempDir,
        featureIds: ['nonexistent-feature'],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('No valid features');
    });

    it('skips already-applied feature with same version', async () => {
      const feature = makeHookFeature();
      const manifest = makeManifest(tempDir, {
        features: { 'hook-feature': { version: '1.0.0', appliedAt: new Date().toISOString() } },
      });
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([feature]));
      writeManifest(tempDir, manifest);

      const result = await service.executeUpgrade({
        projectPath: tempDir,
        featureIds: ['hook-feature'],
      });
      expect(result.skipped).toContain('hook-feature');
    });

    it('applies a hook-merge feature successfully', async () => {
      const feature = makeHookFeature();
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([feature]));
      writeManifest(tempDir, makeManifest(tempDir));

      const result = await service.executeUpgrade({
        projectPath: tempDir,
        featureIds: ['hook-feature'],
        createBackup: false,
      });

      expect(result.upgraded).toContain('hook-feature');
      expect(result.success).toBe(true);
      // Manifest on disk updated
      const updatedManifest = JSON.parse(
        fs.readFileSync(path.join(tempDir, MANIFEST_FILENAME), 'utf-8')
      ) as ExtendedManifest;
      expect(updatedManifest.features['hook-feature']).toBeDefined();
      expect(updatedManifest.upgradeHistory).toHaveLength(1);
    });

    it('applies an agent-replace feature successfully', async () => {
      const sourceRel = 'agents/core/sample.md';
      const agentDir = path.join(devSuiteDir, 'agents', 'core');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(devSuiteDir, sourceRel), '# Sample Agent');

      const feature = makeAgentFeature();
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([feature]));
      writeManifest(tempDir, makeManifest(tempDir));

      const result = await service.executeUpgrade({
        projectPath: tempDir,
        featureIds: ['agent-feature'],
        createBackup: false,
      });

      expect(result.upgraded).toContain('agent-feature');
      expect(result.success).toBe(true);
    });

    it('records upgrade history with correct versions', async () => {
      const feature = makeHookFeature();
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([feature]));
      writeManifest(tempDir, makeManifest(tempDir));

      const result = await service.executeUpgrade({
        projectPath: tempDir,
        featureIds: ['hook-feature'],
        createBackup: false,
      });

      expect(result.newManifest?.upgradeHistory).toHaveLength(1);
      const entry = result.newManifest?.upgradeHistory[0];
      expect(entry?.featuresApplied).toContain('hook-feature');
    });

    it('skips incompatible feature and reports it', async () => {
      const feature = makeHookFeature();
      feature.stackRequirements = { requiresAny: { frontend: ['svelte'] } };
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([feature]));
      writeManifest(
        tempDir,
        makeManifest(tempDir, {
          detectedStack: { frontend: { framework: 'react' } } as never,
        })
      );

      const result = await service.executeUpgrade({
        projectPath: tempDir,
        featureIds: ['hook-feature'],
        createBackup: false,
      });

      expect(result.skipped).toContain('hook-feature');
    });

    it('creates backup when createBackup=true and there are files to backup', async () => {
      const feature = makeHookFeature();
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([feature]));
      writeManifest(tempDir, makeManifest(tempDir));

      // Settings file must exist for filesToModify to be non-empty
      const claudeDir = path.join(tempDir, '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(path.join(claudeDir, 'settings.json'), '{}');

      const result = await service.executeUpgrade({
        projectPath: tempDir,
        featureIds: ['hook-feature'],
        createBackup: true,
      });

      // No crash; upgrade should succeed
      expect(result).toBeDefined();
      expect(result.upgraded).toContain('hook-feature');
    });

    it('handles multiple features in one call', async () => {
      // Use different target files so they don't collide and won't trigger
      // duplicate-hook conflicts with each other
      const f1: Feature = {
        ...makeHookFeature('f1'),
        apply: {
          type: 'hook-merge',
          target: '.claude/settings.json',
          event: 'PostToolUse',
          config: { matcher: 'Write', hooks: ['echo f1'] },
        } as HookMergeConfig,
      };
      const f2: Feature = {
        ...makeHookFeature('f2'),
        apply: {
          type: 'hook-merge',
          target: '.claude/settings2.json',
          event: 'Stop',
          config: { matcher: 'StopMatcher', hooks: ['echo f2'] },
        } as HookMergeConfig,
      };
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([f1, f2]));
      writeManifest(tempDir, makeManifest(tempDir));

      const result = await service.executeUpgrade({
        projectPath: tempDir,
        featureIds: ['f1', 'f2'],
        createBackup: false,
      });

      expect(result.upgraded).toContain('f1');
      expect(result.upgraded).toContain('f2');
    });

    it('initializes missing manifest fields (features, files, upgradeHistory)', async () => {
      const feature = makeHookFeature();
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([feature]));

      // Write minimal manifest without features/files/upgradeHistory
      const minimalManifest = {
        version: '1.0.0',
        installedAt: new Date().toISOString(),
        projectPath: tempDir,
        agents: [],
        mcpServers: [],
      };
      fs.writeFileSync(
        path.join(tempDir, MANIFEST_FILENAME),
        JSON.stringify(minimalManifest)
      );

      const result = await service.executeUpgrade({
        projectPath: tempDir,
        featureIds: ['hook-feature'],
        createBackup: false,
      });

      // Should not crash even though manifest was minimal
      expect(result).toBeDefined();
    });

    it('includes failed feature when apply fails', async () => {
      // agent-replace with missing source = failure
      const agentFeature = makeAgentFeature('af', 'agents/core/missing.md', '.claude/agents/missing.md');
      mockLoadFeatureRegistry.mockReturnValue(makeRegistry([agentFeature]));
      writeManifest(tempDir, makeManifest(tempDir));

      const result = await service.executeUpgrade({
        projectPath: tempDir,
        featureIds: ['af'],
        createBackup: false,
      });

      expect(result.failed).toContain('af');
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  describe('getUpgradeHistory', () => {
    it('returns empty array when no manifest exists', async () => {
      const history = await service.getUpgradeHistory(tempDir);
      expect(history).toEqual([]);
    });

    it('returns empty array when manifest has no upgradeHistory', async () => {
      writeManifest(tempDir, makeManifest(tempDir));
      const history = await service.getUpgradeHistory(tempDir);
      expect(history).toEqual([]);
    });

    it('returns upgrade history entries', async () => {
      const manifest = makeManifest(tempDir, {
        upgradeHistory: [
          {
            timestamp: '2026-01-01T00:00:00.000Z',
            fromVersion: '1.0.0',
            toVersion: '1.1.0',
            featuresApplied: ['hook-feature'],
            featuresSkipped: [],
          },
        ],
      });
      writeManifest(tempDir, manifest);
      const history = await service.getUpgradeHistory(tempDir);
      expect(history).toHaveLength(1);
      expect(history[0]?.featuresApplied).toContain('hook-feature');
    });

    it('throws on path traversal', async () => {
      await expect(service.getUpgradeHistory('/bad/../path')).rejects.toThrow();
    });
  });

  // =========================================================================
  describe('static utilities', () => {
    it('UpgradeService.createTrackedFile is a function', () => {
      expect(typeof UpgradeService.createTrackedFile).toBe('function');
    });

    it('UpgradeService.initializeExtendedManifest is a function', () => {
      expect(typeof UpgradeService.initializeExtendedManifest).toBe('function');
    });

    it('createTrackedFile returns null for non-existent file', () => {
      const result = UpgradeService.createTrackedFile(tempDir, 'nonexistent.md', 'agent');
      expect(result).toBeNull();
    });

    it('initializeExtendedManifest creates valid manifest', () => {
      const manifest = UpgradeService.initializeExtendedManifest(tempDir, ['react-expert'], []);
      expect(manifest.agents).toContain('react-expert');
      expect(manifest.features).toEqual({});
    });
  });

  // =========================================================================
  describe('installPackages (delegation)', () => {
    it('rejects invalid package names', async () => {
      const result = await service.installPackages(tempDir, ['bad pkg!']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid package name');
    });

    it('throws on path traversal', async () => {
      await expect(service.installPackages('/bad/../path', ['vitest'])).rejects.toThrow();
    });
  });

  // =========================================================================
  describe('installAgent (delegation)', () => {
    it('returns error for invalid agent ID', async () => {
      const result = await service.installAgent(tempDir, '../malicious');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid agent ID');
    });

    it('returns error when agent not found in dev-suite', async () => {
      const result = await service.installAgent(tempDir, 'nonexistent-expert');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('throws on path traversal in projectPath', async () => {
      await expect(service.installAgent('/bad/../path', 'react-expert')).rejects.toThrow();
    });
  });
});
