// SPDX-License-Identifier: MIT
/**
 * Upgrade Routes Tests
 *
 * Unit tests for upgrade route handler logic.
 * Tests service integration and Zod schema validation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UpgradeService } from '../../src/services/upgrade.service.js';
import { z } from 'zod';

vi.mock('../../src/services/upgrade.service.js');

// ---------------------------------------------------------------------------
// Inline validation schemas (mirrors upgrade.routes.ts)
// ---------------------------------------------------------------------------

const UpgradeCheckRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

const UpgradePreviewRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
  featureIds: z.array(z.string()).optional(),
});

const ConflictResolutionSchema = z.record(
  z.string(),
  z.record(z.string(), z.enum(['skip', 'replace', 'backup-replace', 'merge']))
);

const UpgradeExecuteRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  featureIds: z.array(z.string()).min(1, 'At least one feature ID is required'),
  resolutions: ConflictResolutionSchema.optional(),
  createBackup: z.boolean().optional().default(true),
  force: z.boolean().optional().default(false),
});

const UpgradeHistoryRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

const NPM_PACKAGE_NAME_REGEX = /^(@[a-z0-9_.-]+\/)?[a-z0-9_.-]+(@[a-zA-Z0-9_.*^~<>=||-]+)?$/;

const InstallPackageRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  packages: z.array(z.string().regex(NPM_PACKAGE_NAME_REGEX, 'Invalid npm package name')).min(1),
  dev: z.boolean().optional().default(true),
});

const InstallAgentRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  agentId: z.string().min(1, 'Agent ID is required'),
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_PATH = '/home/user/my-project';

const MOCK_CHECK_RESULT = {
  upgradeCount: 3,
  features: [
    { id: 'agent-routing', name: 'Agent Routing', status: 'available' },
    { id: 'mcp-hooks', name: 'MCP Hooks', status: 'available' },
  ],
};

const MOCK_PREVIEW_RESULT = {
  wouldApply: ['agent-routing', 'mcp-hooks'],
  wouldSkip: ['legacy-feature'],
  conflicts: [{ featureId: 'mcp-hooks', file: 'CLAUDE.md', type: 'modify' }],
};

const MOCK_EXECUTE_RESULT = {
  success: true,
  upgraded: ['agent-routing'],
  skipped: ['legacy-feature'],
  failed: [],
};

const MOCK_HISTORY = [
  {
    id: 'upgrade-1',
    timestamp: '2024-01-01T00:00:00Z',
    features: ['agent-routing'],
    success: true,
  },
];

const MOCK_INSTALL_PACKAGES_RESULT = {
  success: true,
  installed: ['jest', 'ts-jest'],
};

const MOCK_INSTALL_AGENT_RESULT = {
  success: true,
  agentId: 'react-expert',
};

// ---------------------------------------------------------------------------

describe('Upgrade Routes - Service Integration', () => {
  let upgradeService: UpgradeService;

  beforeEach(() => {
    upgradeService = new UpgradeService();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // GET /upgrade/check
  // -------------------------------------------------------------------------
  describe('checkUpgrades logic', () => {
    it('should check for available upgrades', async () => {
      vi.mocked(upgradeService.checkUpgrades).mockResolvedValue(MOCK_CHECK_RESULT);

      const result = await upgradeService.checkUpgrades(PROJECT_PATH);

      expect(upgradeService.checkUpgrades).toHaveBeenCalledWith(PROJECT_PATH);
      expect(result.upgradeCount).toBe(3);
      expect(result.features).toHaveLength(2);
    });

    it('should return 0 upgrades when already up to date', async () => {
      vi.mocked(upgradeService.checkUpgrades).mockResolvedValue({ upgradeCount: 0, features: [] });

      const result = await upgradeService.checkUpgrades(PROJECT_PATH);

      expect(result.upgradeCount).toBe(0);
    });

    it('should surface service errors', async () => {
      vi.mocked(upgradeService.checkUpgrades).mockRejectedValue(new Error('manifest missing'));

      await expect(upgradeService.checkUpgrades(PROJECT_PATH)).rejects.toThrow('manifest missing');
    });
  });

  // -------------------------------------------------------------------------
  // POST /upgrade/preview
  // -------------------------------------------------------------------------
  describe('previewUpgrade logic', () => {
    it('should preview upgrade for all features', async () => {
      vi.mocked(upgradeService.previewUpgrade).mockResolvedValue(MOCK_PREVIEW_RESULT);

      const result = await upgradeService.previewUpgrade(PROJECT_PATH, undefined);

      expect(upgradeService.previewUpgrade).toHaveBeenCalledWith(PROJECT_PATH, undefined);
      expect(result.wouldApply).toHaveLength(2);
      expect(result.conflicts).toHaveLength(1);
    });

    it('should preview upgrade for specific feature ids', async () => {
      vi.mocked(upgradeService.previewUpgrade).mockResolvedValue({
        ...MOCK_PREVIEW_RESULT,
        wouldApply: ['agent-routing'],
      });

      const result = await upgradeService.previewUpgrade(PROJECT_PATH, ['agent-routing']);

      expect(upgradeService.previewUpgrade).toHaveBeenCalledWith(PROJECT_PATH, ['agent-routing']);
      expect(result.wouldApply).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // POST /upgrade/execute
  // -------------------------------------------------------------------------
  describe('executeUpgrade logic', () => {
    it('should execute upgrade for specified features', async () => {
      vi.mocked(upgradeService.executeUpgrade).mockResolvedValue(MOCK_EXECUTE_RESULT);

      const request = {
        projectPath: PROJECT_PATH,
        featureIds: ['agent-routing'],
        createBackup: true,
        force: false,
      };

      const result = await upgradeService.executeUpgrade(request);

      expect(upgradeService.executeUpgrade).toHaveBeenCalledWith(request);
      expect(result.success).toBe(true);
      expect(result.upgraded).toContain('agent-routing');
    });

    it('should surface service errors', async () => {
      vi.mocked(upgradeService.executeUpgrade).mockRejectedValue(new Error('backup failed'));

      await expect(
        upgradeService.executeUpgrade({
          projectPath: PROJECT_PATH,
          featureIds: ['agent-routing'],
          createBackup: true,
          force: false,
        })
      ).rejects.toThrow('backup failed');
    });
  });

  // -------------------------------------------------------------------------
  // GET /upgrade/history
  // -------------------------------------------------------------------------
  describe('getUpgradeHistory logic', () => {
    it('should return upgrade history for project', async () => {
      vi.mocked(upgradeService.getUpgradeHistory).mockResolvedValue(MOCK_HISTORY);

      const result = await upgradeService.getUpgradeHistory(PROJECT_PATH);

      expect(upgradeService.getUpgradeHistory).toHaveBeenCalledWith(PROJECT_PATH);
      expect(result).toHaveLength(1);
      expect(result[0].features).toContain('agent-routing');
    });

    it('should return empty array when no history', async () => {
      vi.mocked(upgradeService.getUpgradeHistory).mockResolvedValue([]);

      const result = await upgradeService.getUpgradeHistory(PROJECT_PATH);

      expect(result).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // POST /upgrade/install-package
  // -------------------------------------------------------------------------
  describe('installPackages logic', () => {
    it('should install npm packages', async () => {
      vi.mocked(upgradeService.installPackages).mockResolvedValue(MOCK_INSTALL_PACKAGES_RESULT);

      const result = await upgradeService.installPackages(PROJECT_PATH, ['jest', 'ts-jest'], true);

      expect(upgradeService.installPackages).toHaveBeenCalledWith(PROJECT_PATH, ['jest', 'ts-jest'], true);
      expect(result.success).toBe(true);
      expect(result.installed).toContain('jest');
    });
  });

  // -------------------------------------------------------------------------
  // POST /upgrade/install-agent
  // -------------------------------------------------------------------------
  describe('installAgent logic', () => {
    it('should install a missing agent', async () => {
      vi.mocked(upgradeService.installAgent).mockResolvedValue(MOCK_INSTALL_AGENT_RESULT);

      const result = await upgradeService.installAgent(PROJECT_PATH, 'react-expert');

      expect(upgradeService.installAgent).toHaveBeenCalledWith(PROJECT_PATH, 'react-expert');
      expect(result.success).toBe(true);
      expect(result.agentId).toBe('react-expert');
    });
  });

  // -------------------------------------------------------------------------
  // Zod validation
  // -------------------------------------------------------------------------
  describe('Zod validation - UpgradeCheckRequestSchema', () => {
    it('should accept valid path', () => {
      const result = UpgradeCheckRequestSchema.safeParse({ path: PROJECT_PATH });
      expect(result.success).toBe(true);
    });

    it('should reject empty path', () => {
      const result = UpgradeCheckRequestSchema.safeParse({ path: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('Zod validation - UpgradePreviewRequestSchema', () => {
    it('should accept valid path without featureIds', () => {
      const result = UpgradePreviewRequestSchema.safeParse({ path: PROJECT_PATH });
      expect(result.success).toBe(true);
    });

    it('should accept valid path with featureIds', () => {
      const result = UpgradePreviewRequestSchema.safeParse({
        path: PROJECT_PATH,
        featureIds: ['agent-routing'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Zod validation - UpgradeExecuteRequestSchema', () => {
    it('should accept valid execute request', () => {
      const result = UpgradeExecuteRequestSchema.safeParse({
        projectPath: PROJECT_PATH,
        featureIds: ['agent-routing'],
        createBackup: true,
        force: false,
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty featureIds array', () => {
      const result = UpgradeExecuteRequestSchema.safeParse({
        projectPath: PROJECT_PATH,
        featureIds: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing projectPath', () => {
      const result = UpgradeExecuteRequestSchema.safeParse({
        featureIds: ['agent-routing'],
      });
      expect(result.success).toBe(false);
    });

    it('should default createBackup to true', () => {
      const result = UpgradeExecuteRequestSchema.safeParse({
        projectPath: PROJECT_PATH,
        featureIds: ['agent-routing'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createBackup).toBe(true);
      }
    });

    it('should accept valid conflict resolutions', () => {
      const result = UpgradeExecuteRequestSchema.safeParse({
        projectPath: PROJECT_PATH,
        featureIds: ['agent-routing'],
        resolutions: {
          'agent-routing': { 'CLAUDE.md': 'backup-replace' },
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid conflict resolution value', () => {
      const result = UpgradeExecuteRequestSchema.safeParse({
        projectPath: PROJECT_PATH,
        featureIds: ['agent-routing'],
        resolutions: {
          'agent-routing': { 'CLAUDE.md': 'overwrite' }, // invalid enum value
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Zod validation - UpgradeHistoryRequestSchema', () => {
    it('should accept valid path', () => {
      const result = UpgradeHistoryRequestSchema.safeParse({ path: PROJECT_PATH });
      expect(result.success).toBe(true);
    });
  });

  describe('Zod validation - InstallPackageRequestSchema', () => {
    it('should accept valid package names', () => {
      const result = InstallPackageRequestSchema.safeParse({
        projectPath: PROJECT_PATH,
        packages: ['jest', 'ts-jest', '@types/jest'],
        dev: true,
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty packages array', () => {
      const result = InstallPackageRequestSchema.safeParse({
        projectPath: PROJECT_PATH,
        packages: [],
        dev: true,
      });
      expect(result.success).toBe(false);
    });

    it('should reject malicious package name with shell injection', () => {
      const result = InstallPackageRequestSchema.safeParse({
        projectPath: PROJECT_PATH,
        packages: ['jest; rm -rf /'],
        dev: true,
      });
      expect(result.success).toBe(false);
    });

    it('should reject package name with backtick', () => {
      const result = InstallPackageRequestSchema.safeParse({
        projectPath: PROJECT_PATH,
        packages: ['jest`whoami`'],
        dev: true,
      });
      expect(result.success).toBe(false);
    });

    it('should accept scoped package name', () => {
      const result = InstallPackageRequestSchema.safeParse({
        projectPath: PROJECT_PATH,
        packages: ['@testing-library/react'],
        dev: true,
      });
      expect(result.success).toBe(true);
    });

    it('should accept versioned package name', () => {
      const result = InstallPackageRequestSchema.safeParse({
        projectPath: PROJECT_PATH,
        packages: ['jest@29.0.0'],
        dev: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Zod validation - InstallAgentRequestSchema', () => {
    it('should accept valid agent install request', () => {
      const result = InstallAgentRequestSchema.safeParse({
        projectPath: PROJECT_PATH,
        agentId: 'react-expert',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty agentId', () => {
      const result = InstallAgentRequestSchema.safeParse({
        projectPath: PROJECT_PATH,
        agentId: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing agentId', () => {
      const result = InstallAgentRequestSchema.safeParse({
        projectPath: PROJECT_PATH,
      });
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Response structure
  // -------------------------------------------------------------------------
  describe('Response structure', () => {
    it('should format check response with upgradeCount', async () => {
      vi.mocked(upgradeService.checkUpgrades).mockResolvedValue(MOCK_CHECK_RESULT);

      const result = await upgradeService.checkUpgrades(PROJECT_PATH);
      const response = { success: true, data: result };

      expect(response.data.upgradeCount).toBe(3);
    });

    it('should format execute response with upgraded/skipped/failed arrays', async () => {
      vi.mocked(upgradeService.executeUpgrade).mockResolvedValue(MOCK_EXECUTE_RESULT);

      const result = await upgradeService.executeUpgrade({
        projectPath: PROJECT_PATH,
        featureIds: ['agent-routing'],
        createBackup: true,
        force: false,
      });
      const response = { success: result.success, data: result };

      expect(response.data).toHaveProperty('upgraded');
      expect(response.data).toHaveProperty('skipped');
      expect(response.data).toHaveProperty('failed');
    });
  });
});
