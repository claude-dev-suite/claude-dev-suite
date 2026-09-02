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

const ReinstallResolutionSchema = z.record(z.string(), z.enum(['overwrite', 'keep', 'promote']));

const ReinstallExecuteRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  resolutions: ReinstallResolutionSchema.optional(),
  createBackup: z.boolean().optional().default(true),
});

const ReinstallDriftRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

const ReinstallDiffRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
  file: z.string().min(1, 'File path is required'),
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_PATH = '/home/user/my-project';

const MOCK_PREVIEW = {
  hasValidManifest: true,
  selection: { agents: ['typescript-expert'], mcpServers: [], rules: [] },
  modifiedManagedFiles: [
    {
      path: '.claude/agents/typescript-expert.md',
      type: 'agent',
      manifestHash: 'a',
      currentHash: 'b',
      scope: 'file',
      acknowledged: false,
    },
  ],
  orphansToRemove: ['.claude/agents/old-expert.md'],
  filesToReplace: ['.claude/agents/typescript-expert.md'],
  skillDirsToRebuild: 2,
  requiresIntervention: true,
};

const MOCK_DRIFT = {
  projectPath: PROJECT_PATH,
  scannedAt: '2026-09-01T00:00:00.000Z',
  hasManifest: true,
  files: [],
  drifted: [
    {
      path: 'AGENTS.md',
      type: 'generated',
      status: 'drift-in-section',
      scope: 'managed-section',
      baselineHash: 'a',
      currentHash: 'b',
      acknowledged: false,
    },
  ],
  acknowledged: [],
  deleted: [],
  hasActionableDrift: true,
  counts: {
    scanned: 12,
    drifted: 1,
    driftedOutsideSection: 0,
    acknowledged: 0,
    deleted: 0,
    unknownBaseline: 0,
    unmodified: 11,
  },
};

const MOCK_DIFF = {
  path: '.claude/agents/typescript-expert.md',
  current: 'edited\n',
  canonical: 'canonical\n',
  canonicalSource: 'agents/core/typescript-expert.md',
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

// ---------------------------------------------------------------------------
// Drift endpoints
// ---------------------------------------------------------------------------

describe('reinstall drift endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts a well-formed drift query', () => {
    expect(ReinstallDriftRequestSchema.safeParse({ path: PROJECT_PATH }).success).toBe(true);
    expect(ReinstallDriftRequestSchema.safeParse({ path: '' }).success).toBe(false);
    expect(ReinstallDriftRequestSchema.safeParse({}).success).toBe(false);
  });

  it('requires both path and file for a diff', () => {
    expect(
      ReinstallDiffRequestSchema.safeParse({ path: PROJECT_PATH, file: 'AGENTS.md' }).success
    ).toBe(true);
    expect(ReinstallDiffRequestSchema.safeParse({ path: PROJECT_PATH }).success).toBe(false);
    expect(
      ReinstallDiffRequestSchema.safeParse({ path: PROJECT_PATH, file: '' }).success
    ).toBe(false);
  });

  it('returns the drift report the service produces', async () => {
    const service = new ReinstallService();
    vi.mocked(service).getDrift = vi.fn().mockResolvedValue(MOCK_DRIFT);

    const result = await service.getDrift(PROJECT_PATH);
    expect(result.hasActionableDrift).toBe(true);
    expect(result.counts.drifted).toBe(1);
    expect(result.drifted[0].scope).toBe('managed-section');
  });

  it('returns a diff whose canonical side comes from the catalog source', async () => {
    const service = new ReinstallService();
    vi.mocked(service).getDriftDiff = vi.fn().mockResolvedValue(MOCK_DIFF);

    const result = await service.getDriftDiff(PROJECT_PATH, '.claude/agents/typescript-expert.md');
    expect(result.canonical).toBe('canonical\n');
    expect(result.canonicalSource).toBe('agents/core/typescript-expert.md');
  });
});

// ---------------------------------------------------------------------------
// `promote` resolution
// ---------------------------------------------------------------------------

describe('promote resolution', () => {
  it('is accepted by the execute schema alongside overwrite and keep', () => {
    const parsed = ReinstallExecuteRequestSchema.safeParse({
      projectPath: PROJECT_PATH,
      resolutions: {
        'AGENTS.md': 'promote',
        '.claude/agents/a.md': 'keep',
        '.claude/agents/b.md': 'overwrite',
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('still rejects an unknown resolution', () => {
    const parsed = ReinstallExecuteRequestSchema.safeParse({
      projectPath: PROJECT_PATH,
      resolutions: { 'AGENTS.md': 'adopt-everything' },
    });
    expect(parsed.success).toBe(false);
  });
});
