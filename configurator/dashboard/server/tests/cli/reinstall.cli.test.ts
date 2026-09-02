// SPDX-License-Identifier: MIT
/**
 * Reinstall CLI Tests
 *
 * Drives the headless `run()` entry in-process with a mocked ReinstallService.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReinstallService } from '../../src/services/reinstall.service.js';
import { run } from '../../src/cli/reinstall.js';

vi.mock('../../src/services/reinstall.service.js');

const PROJECT = '/home/user/proj';

function mockDrift(overrides: Record<string, unknown> = {}) {
  const report = {
    projectPath: PROJECT,
    scannedAt: '2026-09-01T00:00:00.000Z',
    hasManifest: true,
    files: [],
    drifted: [],
    acknowledged: [],
    deleted: [],
    hasActionableDrift: false,
    counts: {
      scanned: 3,
      drifted: 0,
      driftedOutsideSection: 0,
      acknowledged: 0,
      deleted: 0,
      unknownBaseline: 0,
      unmodified: 3,
    },
    ...overrides,
  };
  vi.mocked(ReinstallService.prototype.getDrift).mockResolvedValue(report as never);
  return report;
}

function mockService(overrides: {
  preview?: Record<string, unknown>;
  execute?: Record<string, unknown>;
} = {}) {
  const preview = {
    hasValidManifest: true,
    selection: { agents: ['a'], mcpServers: [], rules: [] },
    modifiedManagedFiles: [],
    orphansToRemove: [],
    filesToReplace: [],
    skillDirsToRebuild: 0,
    requiresIntervention: false,
    ...overrides.preview,
  };
  const execute = {
    success: true,
    agentsReinstalled: ['a'],
    mcpReinstalled: [],
    orphansRemoved: [],
    keptFiles: [],
    verifyWarnings: [],
    ...overrides.execute,
  };
  vi.mocked(ReinstallService.prototype.previewReinstall).mockResolvedValue(preview as never);
  vi.mocked(ReinstallService.prototype.executeReinstall).mockResolvedValue(execute as never);
  return { preview, execute };
}

describe('reinstall CLI run()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  it('returns 3 when --project is missing', async () => {
    expect(await run(['--dry-run'])).toBe(3);
  });

  it('returns 3 on an unknown flag', async () => {
    expect(await run(['--project', PROJECT, '--bogus'])).toBe(3);
  });

  it('returns 1 when the project has no manifest', async () => {
    mockService({ preview: { hasValidManifest: false, reason: 'no manifest' } });
    expect(await run(['--project', PROJECT, '--dry-run'])).toBe(1);
  });

  it('dry-run returns 0 and does not execute', async () => {
    mockService();
    const code = await run(['--project', PROJECT, '--dry-run']);
    expect(code).toBe(0);
    expect(ReinstallService.prototype.executeReinstall).not.toHaveBeenCalled();
  });

  it('returns 2 when there are unacknowledged modified files and no --yes', async () => {
    mockService({
      preview: {
        modifiedManagedFiles: [{ path: '.claude/agents/a.md', type: 'agent', manifestHash: 'x', currentHash: 'y' }],
        requiresIntervention: true,
      },
    });
    const code = await run(['--project', PROJECT]);
    expect(code).toBe(2);
    expect(ReinstallService.prototype.executeReinstall).not.toHaveBeenCalled();
  });

  it('executes with --yes and passes keep resolutions', async () => {
    mockService({
      preview: {
        modifiedManagedFiles: [{ path: '.claude/agents/a.md', type: 'agent', manifestHash: 'x', currentHash: 'y' }],
        requiresIntervention: true,
      },
    });
    const code = await run(['--project', PROJECT, '--yes', '--keep', '.claude/agents/a.md']);
    expect(code).toBe(0);
    expect(ReinstallService.prototype.executeReinstall).toHaveBeenCalledWith(
      expect.objectContaining({
        projectPath: PROJECT,
        resolutions: { '.claude/agents/a.md': 'keep' },
        createBackup: true,
      })
    );
  });

  it('returns 1 when execute fails', async () => {
    mockService({ execute: { success: false, rolledBack: true, error: 'boom' } });
    expect(await run(['--project', PROJECT, '--yes'])).toBe(1);
  });

  it('--no-backup disables backup', async () => {
    mockService();
    await run(['--project', PROJECT, '--yes', '--no-backup']);
    expect(ReinstallService.prototype.executeReinstall).toHaveBeenCalledWith(
      expect.objectContaining({ createBackup: false })
    );
  });
});

// ---------------------------------------------------------------------------
// --drift (gating) and --promote (adoption)
// ---------------------------------------------------------------------------

describe('reinstall CLI drift gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  it('exits 0 on a clean scan', async () => {
    mockDrift();
    expect(await run(['--project', PROJECT, '--drift'])).toBe(0);
  });

  it('exits 4 when unratified drift exists, so a pipeline can gate on it', async () => {
    mockDrift({
      hasActionableDrift: true,
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
      counts: {
        scanned: 3,
        drifted: 1,
        driftedOutsideSection: 0,
        acknowledged: 0,
        deleted: 0,
        unknownBaseline: 0,
        unmodified: 2,
      },
    });
    expect(await run(['--project', PROJECT, '--drift'])).toBe(4);
  });

  it('exits 1 when the project has no manifest to scan', async () => {
    mockDrift({ hasManifest: false });
    expect(await run(['--project', PROJECT, '--drift'])).toBe(1);
  });

  it('never reinstalls in --drift mode', async () => {
    mockService();
    mockDrift();
    await run(['--project', PROJECT, '--drift']);
    expect(ReinstallService.prototype.executeReinstall).not.toHaveBeenCalled();
  });
});

describe('reinstall CLI --promote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  const modified = [
    {
      path: '.claude/agents/a.md',
      type: 'agent',
      manifestHash: 'a',
      currentHash: 'b',
      scope: 'file',
      acknowledged: false,
    },
  ];

  it('resolves a promoted path without needing --yes', async () => {
    mockService({ preview: { modifiedManagedFiles: modified, requiresIntervention: true } });

    const code = await run(['--project', PROJECT, '--promote', '.claude/agents/a.md']);

    expect(code).toBe(0);
    expect(ReinstallService.prototype.executeReinstall).toHaveBeenCalledWith(
      expect.objectContaining({
        resolutions: { '.claude/agents/a.md': 'promote' },
      })
    );
  });

  it('lets --promote win over --keep for the same path', async () => {
    mockService({ preview: { modifiedManagedFiles: modified, requiresIntervention: true } });

    await run([
      '--project', PROJECT,
      '--keep', '.claude/agents/a.md',
      '--promote', '.claude/agents/a.md',
    ]);

    expect(ReinstallService.prototype.executeReinstall).toHaveBeenCalledWith(
      expect.objectContaining({ resolutions: { '.claude/agents/a.md': 'promote' } })
    );
  });

  it('does not block on a file a human already adopted', async () => {
    mockService({
      preview: {
        modifiedManagedFiles: [{ ...modified[0], acknowledged: true }],
        requiresIntervention: false,
      },
    });

    // No --yes, no --keep: an adopted file is a settled decision, not a prompt.
    expect(await run(['--project', PROJECT])).toBe(0);
  });
});
