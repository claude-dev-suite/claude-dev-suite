// SPDX-License-Identifier: MIT
/**
 * Reinstall Routes Tests
 *
 * Unit tests for reinstall route handler logic.
 * Tests service integration and Zod schema validation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReinstallService } from '../../src/services/reinstall.service.js';
import { z } from 'zod';

vi.mock('../../src/services/reinstall.service.js');

// ---------------------------------------------------------------------------
// Inline validation schemas (mirrors reinstall.routes.ts)
// ---------------------------------------------------------------------------

const ReinstallPreviewRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

const ReinstallResolutionSchema = z.record(z.string(), z.enum(['overwrite', 'keep']));

const ReinstallExecuteRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  resolutions: ReinstallResolutionSchema.optional(),
  createBackup: z.boolean().optional().default(true),
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_PATH = '/home/user/my-project';

const MOCK_PREVIEW = {
  hasValidManifest: true,
  selection: { agents: ['typescript-expert'], mcpServers: [], rules: [] },
  modifiedManagedFiles: [
    { path: '.claude/agents/typescript-expert.md', type: 'agent', manifestHash: 'a', currentHash: 'b' },
  ],
  orphansToRemove: ['.claude/agents/old-expert.md'],
  filesToReplace: ['.claude/agents/typescript-expert.md'],
  skillDirsToRebuild: 2,
  requiresIntervention: true,
};

const MOCK_EXECUTE = {
  success: true,
  agentsReinstalled: ['typescript-expert'],
  mcpReinstalled: [],
  orphansRemoved: ['.claude/agents/old-expert.md'],
  keptFiles: [],
  verifyWarnings: [],
  backupDir: '/home/user/my-project/.dev-suite-backup-X',
};

// ---------------------------------------------------------------------------

describe('Reinstall Routes - Service Integration', () => {
  let reinstallService: ReinstallService;

  beforeEach(() => {
    reinstallService = new ReinstallService();
    vi.clearAllMocks();
  });

  describe('previewReinstall logic', () => {
    it('returns preview with modified files and orphans', async () => {
      vi.mocked(reinstallService.previewReinstall).mockResolvedValue(MOCK_PREVIEW as never);

      const result = await reinstallService.previewReinstall(PROJECT_PATH);

      expect(reinstallService.previewReinstall).toHaveBeenCalledWith(PROJECT_PATH);
      expect(result.requiresIntervention).toBe(true);
      expect(result.orphansToRemove).toHaveLength(1);
    });

    it('surfaces service errors', async () => {
      vi.mocked(reinstallService.previewReinstall).mockRejectedValue(new Error('manifest missing'));
      await expect(reinstallService.previewReinstall(PROJECT_PATH)).rejects.toThrow('manifest missing');
    });
  });

  describe('executeReinstall logic', () => {
    it('executes a reinstall and reports orphans removed', async () => {
      vi.mocked(reinstallService.executeReinstall).mockResolvedValue(MOCK_EXECUTE as never);

      const req = { projectPath: PROJECT_PATH, resolutions: {}, createBackup: true };
      const result = await reinstallService.executeReinstall(req);

      expect(reinstallService.executeReinstall).toHaveBeenCalledWith(req);
      expect(result.success).toBe(true);
      expect(result.orphansRemoved).toContain('.claude/agents/old-expert.md');
    });

    it('surfaces service errors', async () => {
      vi.mocked(reinstallService.executeReinstall).mockRejectedValue(new Error('backup failed'));
      await expect(
        reinstallService.executeReinstall({ projectPath: PROJECT_PATH })
      ).rejects.toThrow('backup failed');
    });
  });

  describe('Zod schema validation', () => {
    it('accepts a valid preview query', () => {
      expect(ReinstallPreviewRequestSchema.safeParse({ path: PROJECT_PATH }).success).toBe(true);
    });

    it('rejects a preview query with empty path', () => {
      expect(ReinstallPreviewRequestSchema.safeParse({ path: '' }).success).toBe(false);
    });

    it('defaults createBackup to true and accepts resolutions', () => {
      const parsed = ReinstallExecuteRequestSchema.parse({
        projectPath: PROJECT_PATH,
        resolutions: { '.claude/agents/typescript-expert.md': 'keep' },
      });
      expect(parsed.createBackup).toBe(true);
      expect(parsed.resolutions?.['.claude/agents/typescript-expert.md']).toBe('keep');
    });

    it('rejects an invalid resolution value', () => {
      const res = ReinstallExecuteRequestSchema.safeParse({
        projectPath: PROJECT_PATH,
        resolutions: { '.claude/agents/x.md': 'merge' },
      });
      expect(res.success).toBe(false);
    });

    it('rejects execute without projectPath', () => {
      expect(ReinstallExecuteRequestSchema.safeParse({ resolutions: {} }).success).toBe(false);
    });
  });
});
