// SPDX-License-Identifier: MIT
/**
 * Tests for package-installer.service.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';
import { createTempDir, cleanupTempDir } from '../test-utils.js';
import { PackageInstallerService } from '../../src/services/upgrade/package-installer.service.js';
import type { ExtendedManifest, TrackedFile } from '../../src/types/index.js';

// Mock child_process.spawn to avoid real npm calls
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

function mockSpawnSuccess(packages: string[]): void {
  const mockProc = {
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, cb: (code: number) => void) => {
      if (event === 'close') {
        // Call close immediately with 0
        setTimeout(() => cb(0), 0);
      }
    }),
    kill: vi.fn(),
  };
  vi.mocked(childProcess.spawn).mockReturnValue(mockProc as never);
}

function mockSpawnFailure(code: number, stderr = 'npm ERR! not found'): void {
  const mockProc = {
    stderr: {
      on: vi.fn((event: string, cb: (data: Buffer) => void) => {
        if (event === 'data') {
          setTimeout(() => cb(Buffer.from(stderr)), 0);
        }
      }),
    },
    on: vi.fn((event: string, cb: (code: number) => void) => {
      if (event === 'close') {
        setTimeout(() => cb(code), 10);
      }
    }),
    kill: vi.fn(),
  };
  vi.mocked(childProcess.spawn).mockReturnValue(mockProc as never);
}

function mockSpawnError(errorMsg = 'spawn ENOENT'): void {
  const mockProc = {
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, cb: (errOrCode: Error | number) => void) => {
      if (event === 'error') {
        setTimeout(() => cb(new Error(errorMsg)), 0);
      }
    }),
    kill: vi.fn(),
  };
  vi.mocked(childProcess.spawn).mockReturnValue(mockProc as never);
}

function makeManifest(projectPath: string): ExtendedManifest {
  return {
    version: '1.0.0',
    installedAt: new Date().toISOString(),
    projectPath,
    agents: [],
    mcpServers: [],
    features: {},
    files: [],
    upgradeHistory: [],
  };
}

describe('PackageInstallerService', () => {
  let service: PackageInstallerService;
  let tempDir: string;
  let devSuiteDir: string;

  beforeEach(() => {
    service = new PackageInstallerService();
    tempDir = createTempDir('pkg-installer-test-');
    devSuiteDir = createTempDir('pkg-installer-devsuite-');
    process.env.DEV_SUITE_DIR = devSuiteDir;
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
    cleanupTempDir(devSuiteDir);
    delete process.env.DEV_SUITE_DIR;
    vi.clearAllMocks();
  });

  // -------------------------------------------------------
  describe('detectPackageManager', () => {
    it('returns npm when no lock file is found', () => {
      expect(service.detectPackageManager(tempDir)).toBe('npm');
    });

    it('detects yarn from yarn.lock', () => {
      fs.writeFileSync(path.join(tempDir, 'yarn.lock'), '');
      expect(service.detectPackageManager(tempDir)).toBe('yarn');
    });

    it('detects pnpm from pnpm-lock.yaml', () => {
      fs.writeFileSync(path.join(tempDir, 'pnpm-lock.yaml'), '');
      expect(service.detectPackageManager(tempDir)).toBe('pnpm');
    });

    it('detects bun from bun.lockb', () => {
      fs.writeFileSync(path.join(tempDir, 'bun.lockb'), '');
      expect(service.detectPackageManager(tempDir)).toBe('bun');
    });

    it('detects npm from package-lock.json', () => {
      fs.writeFileSync(path.join(tempDir, 'package-lock.json'), '');
      expect(service.detectPackageManager(tempDir)).toBe('npm');
    });

    it('detects lock file in frontend/ subdirectory', () => {
      const frontendDir = path.join(tempDir, 'frontend');
      fs.mkdirSync(frontendDir, { recursive: true });
      fs.writeFileSync(path.join(frontendDir, 'yarn.lock'), '');
      expect(service.detectPackageManager(tempDir)).toBe('yarn');
    });

    it('detects lock file in client/ subdirectory', () => {
      const clientDir = path.join(tempDir, 'client');
      fs.mkdirSync(clientDir, { recursive: true });
      fs.writeFileSync(path.join(clientDir, 'pnpm-lock.yaml'), '');
      expect(service.detectPackageManager(tempDir)).toBe('pnpm');
    });

    it('throws PathValidationError for path traversal', () => {
      expect(() => service.detectPackageManager('/bad/../path')).toThrow();
    });
  });

  // -------------------------------------------------------
  describe('findPackageJsonDir', () => {
    it('returns projectPath when package.json is at root', () => {
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
      expect(service.findPackageJsonDir(tempDir)).toBe(tempDir);
    });

    it('returns frontend/ when package.json is in frontend/', () => {
      const frontendDir = path.join(tempDir, 'frontend');
      fs.mkdirSync(frontendDir, { recursive: true });
      fs.writeFileSync(path.join(frontendDir, 'package.json'), '{}');
      expect(service.findPackageJsonDir(tempDir)).toBe(frontendDir);
    });

    it('returns projectPath as fallback when no package.json found', () => {
      expect(service.findPackageJsonDir(tempDir)).toBe(tempDir);
    });

    it('throws PathValidationError for path traversal', () => {
      expect(() => service.findPackageJsonDir('/bad/../path')).toThrow();
    });
  });

  // -------------------------------------------------------
  describe('installPackages', () => {
    it('rejects invalid package names (shell injection prevention)', async () => {
      const result = await service.installPackages(tempDir, ['lodash; rm -rf /']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid package name');
    });

    it('rejects multiple invalid package names at once', async () => {
      const result = await service.installPackages(tempDir, ['good-pkg', 'bad pkg!']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid package name');
    });

    it('accepts valid scoped package names', async () => {
      mockSpawnSuccess(['@types/node']);
      const result = await service.installPackages(tempDir, ['@types/node']);
      expect(result.success).toBe(true);
      expect(result.installed).toContain('@types/node');
    });

    it('accepts versioned package names', async () => {
      mockSpawnSuccess(['lodash@^4.0.0']);
      const result = await service.installPackages(tempDir, ['lodash@^4.0.0']);
      expect(result.success).toBe(true);
    });

    // On Windows, spawn is called with `<pm>.cmd` (shell:false requires the
    // full Windows shim name). On POSIX the name is unchanged.
    const isWin = process.platform === 'win32';
    const exe = (name: string) => isWin ? `${name}.cmd` : name;

    it('installs packages with npm by default (uses npm install --save-dev)', async () => {
      mockSpawnSuccess(['vitest']);
      await service.installPackages(tempDir, ['vitest'], true);
      expect(childProcess.spawn).toHaveBeenCalledWith(
        exe('npm'),
        expect.arrayContaining(['install', 'vitest', '--save-dev']),
        expect.objectContaining({ shell: false })
      );
    });

    it('uses yarn when yarn.lock exists', async () => {
      fs.writeFileSync(path.join(tempDir, 'yarn.lock'), '');
      mockSpawnSuccess(['vitest']);
      await service.installPackages(tempDir, ['vitest'], true);
      expect(childProcess.spawn).toHaveBeenCalledWith(
        exe('yarn'),
        expect.arrayContaining(['add', 'vitest', '-D']),
        expect.objectContaining({ shell: false })
      );
    });

    it('uses pnpm when pnpm-lock.yaml exists', async () => {
      fs.writeFileSync(path.join(tempDir, 'pnpm-lock.yaml'), '');
      mockSpawnSuccess(['vitest']);
      await service.installPackages(tempDir, ['vitest'], true);
      expect(childProcess.spawn).toHaveBeenCalledWith(
        exe('pnpm'),
        expect.arrayContaining(['add', 'vitest', '-D']),
        expect.objectContaining({ shell: false })
      );
    });

    it('uses bun when bun.lockb exists', async () => {
      fs.writeFileSync(path.join(tempDir, 'bun.lockb'), '');
      mockSpawnSuccess(['vitest']);
      await service.installPackages(tempDir, ['vitest'], true);
      expect(childProcess.spawn).toHaveBeenCalledWith(
        exe('bun'),
        expect.arrayContaining(['add', 'vitest', '-d']),
        expect.objectContaining({ shell: false })
      );
    });

    it('returns failure when spawn exits with non-zero code', async () => {
      mockSpawnFailure(1, 'ENOENT vitest');
      const result = await service.installPackages(tempDir, ['vitest']);
      expect(result.success).toBe(false);
      expect(result.installed).toHaveLength(0);
      expect(result.error).toBeDefined();
    });

    it('returns failure when spawn emits an error event', async () => {
      mockSpawnError('spawn ENOENT');
      const result = await service.installPackages(tempDir, ['vitest']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('spawn ENOENT');
    });

    it('does not add --save-dev flag when dev=false for npm', async () => {
      mockSpawnSuccess(['express']);
      await service.installPackages(tempDir, ['express'], false);
      const callArgs = vi.mocked(childProcess.spawn).mock.calls[0];
      expect(callArgs?.[1]).not.toContain('--save-dev');
    });

    it('throws PathValidationError for path traversal', async () => {
      await expect(service.installPackages('/bad/../path', ['vitest'])).rejects.toThrow();
    });
  });

  // -------------------------------------------------------
  describe('installAgent', () => {
    const noopLoadManifest = (_p: string): ExtendedManifest | null => null;
    const noopSaveManifest = (_p: string, _m: ExtendedManifest): boolean => true;
    const noopCreateTrackedFile = (
      _p: string, _rel: string, _type: TrackedFile['type'], _src?: string
    ): TrackedFile | null => null;

    it('returns error for invalid agentId with path traversal', async () => {
      const result = await service.installAgent(
        tempDir, '../malicious', noopLoadManifest, noopSaveManifest, noopCreateTrackedFile
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid agent ID');
    });

    it('returns error for agentId with forward slash', async () => {
      const result = await service.installAgent(
        tempDir, 'some/path', noopLoadManifest, noopSaveManifest, noopCreateTrackedFile
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid agent ID');
    });

    it('returns error when agent is not found in any category', async () => {
      const result = await service.installAgent(
        tempDir, 'nonexistent-expert', noopLoadManifest, noopSaveManifest, noopCreateTrackedFile
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found in dev-suite');
    });

    it('installs agent from dev-suite and updates manifest', async () => {
      // Create agent file in devSuiteDir
      const agentCategoryDir = path.join(devSuiteDir, 'agents', 'core');
      fs.mkdirSync(agentCategoryDir, { recursive: true });
      fs.writeFileSync(
        path.join(agentCategoryDir, 'react-expert.md'),
        '# React Expert'
      );

      const manifest = makeManifest(tempDir);
      const loadManifest = (_p: string): ExtendedManifest | null => manifest;
      const saveManifest = vi.fn((_p: string, _m: ExtendedManifest): boolean => true);
      const createTrackedFile = (
        _p: string, rel: string, type: TrackedFile['type'], src?: string
      ): TrackedFile | null => ({
        path: rel,
        hash: 'mockhash',
        type,
        source: src,
      });

      const result = await service.installAgent(
        tempDir, 'react-expert', loadManifest, saveManifest, createTrackedFile
      );

      expect(result.success).toBe(true);
      expect(result.agentPath).toContain('react-expert.md');
      expect(fs.existsSync(result.agentPath!)).toBe(true);
      expect(saveManifest).toHaveBeenCalled();
      // Manifest agents updated
      expect(manifest.agents).toContain('react-expert');
    });

    it('does not add duplicate agent to manifest', async () => {
      const agentCategoryDir = path.join(devSuiteDir, 'agents', 'frontend');
      fs.mkdirSync(agentCategoryDir, { recursive: true });
      fs.writeFileSync(path.join(agentCategoryDir, 'vue-expert.md'), '# Vue Expert');

      const manifest = makeManifest(tempDir);
      manifest.agents = ['vue-expert']; // already installed
      const loadManifest = (_p: string): ExtendedManifest | null => manifest;
      const saveManifest = vi.fn((_p: string, _m: ExtendedManifest): boolean => true);
      const createTrackedFile = (): TrackedFile | null => null;

      await service.installAgent(tempDir, 'vue-expert', loadManifest, saveManifest, createTrackedFile);
      expect(manifest.agents.filter(a => a === 'vue-expert')).toHaveLength(1);
    });

    it('skips manifest update when loadManifest returns null', async () => {
      const agentCategoryDir = path.join(devSuiteDir, 'agents', 'testing');
      fs.mkdirSync(agentCategoryDir, { recursive: true });
      fs.writeFileSync(path.join(agentCategoryDir, 'vitest-expert.md'), '# Vitest Expert');

      const saveManifest = vi.fn();
      const result = await service.installAgent(
        tempDir, 'vitest-expert',
        () => null,
        saveManifest,
        () => null
      );

      expect(result.success).toBe(true);
      // saveManifest not called since loadManifest returned null
      expect(saveManifest).not.toHaveBeenCalled();
    });

    it('throws PathValidationError for path traversal in projectPath', async () => {
      await expect(
        service.installAgent('/bad/../path', 'react-expert', noopLoadManifest, noopSaveManifest, noopCreateTrackedFile)
      ).rejects.toThrow();
    });
  });
});
