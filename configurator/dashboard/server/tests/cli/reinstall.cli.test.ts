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
