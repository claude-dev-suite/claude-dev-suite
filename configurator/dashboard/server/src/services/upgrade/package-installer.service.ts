// SPDX-License-Identifier: MIT
/**
 * Package Installer Service
 *
 * Handles installation of npm packages and agents as prerequisites for upgrades.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { getLogger } from '../../utils/logger.js';
import type { TrackedFile, ExtendedManifest } from '../../types/index.js';

const logger = getLogger('PackageInstaller');

// Get dev-suite root directory
function getDevSuiteDir(): string {
  if (process.env.DEV_SUITE_DIR) {
    return process.env.DEV_SUITE_DIR;
  }
  // Navigate from server/src/services/upgrade to dev-suite root
  return path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
}

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

export interface InstallPackagesResult {
  success: boolean;
  installed: string[];
  error?: string;
}

export interface InstallAgentResult {
  success: boolean;
  agentPath?: string;
  error?: string;
}

export class PackageInstallerService {
  /**
   * Detect which package manager is used in the project
   */
  detectPackageManager(projectPath: string): PackageManager {
    // Check for lock files in root and common subdirs
    const dirsToCheck = [
      projectPath,
      path.join(projectPath, 'frontend'),
      path.join(projectPath, 'client'),
    ];

    for (const dir of dirsToCheck) {
      if (fs.existsSync(path.join(dir, 'bun.lockb'))) return 'bun';
      if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
      if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
      if (fs.existsSync(path.join(dir, 'package-lock.json'))) return 'npm';
    }

    return 'npm'; // Default to npm
  }

  /**
   * Find the directory containing package.json (for monorepos)
   */
  findPackageJsonDir(projectPath: string): string {
    const dirsToCheck = [
      projectPath,
      path.join(projectPath, 'frontend'),
      path.join(projectPath, 'client'),
      path.join(projectPath, 'app'),
      path.join(projectPath, 'web'),
    ];

    for (const dir of dirsToCheck) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        return dir;
      }
    }

    return projectPath;
  }

  /**
   * Install npm packages as prerequisites
   */
  async installPackages(
    projectPath: string,
    packages: string[],
    dev: boolean = true
  ): Promise<InstallPackagesResult> {
    const packageManager = this.detectPackageManager(projectPath);
    const workDir = this.findPackageJsonDir(projectPath);

    logger.info('Installing packages', {
      context: { projectPath, workDir, packageManager, packages, dev },
    });

    // Build install command based on package manager
    let args: string[];
    switch (packageManager) {
      case 'yarn':
        args = ['add', ...packages];
        if (dev) args.push('-D');
        break;
      case 'pnpm':
        args = ['add', ...packages];
        if (dev) args.push('-D');
        break;
      case 'bun':
        args = ['add', ...packages];
        if (dev) args.push('-d');
        break;
      default: // npm
        args = ['install', ...packages];
        if (dev) args.push('--save-dev');
    }

    return new Promise((resolve) => {
      const proc = spawn(packageManager, args, {
        cwd: workDir,
        shell: true,
        stdio: 'pipe',
      });

      let stderr = '';

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          logger.info('Packages installed successfully', { context: { packages } });
          resolve({ success: true, installed: packages });
        } else {
          logger.error('Package installation failed', { context: { code, stderr } });
          resolve({
            success: false,
            installed: [],
            error: stderr || `Installation failed with code ${code}`,
          });
        }
      });

      proc.on('error', (error) => {
        logger.error('Package installation error', { error });
        resolve({
          success: false,
          installed: [],
          error: error.message,
        });
      });

      // Timeout after 2 minutes
      setTimeout(() => {
        proc.kill();
        resolve({
          success: false,
          installed: [],
          error: 'Installation timed out after 2 minutes',
        });
      }, 120000);
    });
  }

  /**
   * Install a missing agent
   */
  async installAgent(
    projectPath: string,
    agentId: string,
    loadManifest: (projectPath: string) => ExtendedManifest | null,
    saveManifest: (projectPath: string, manifest: ExtendedManifest) => boolean,
    createTrackedFile: (projectPath: string, relativePath: string, type: TrackedFile['type'], source?: string) => TrackedFile | null
  ): Promise<InstallAgentResult> {
    const devSuiteDir = getDevSuiteDir();

    // Find the agent file in dev-suite
    const agentCategories = [
      'core',
      'frontend',
      'backend',
      'database',
      'testing',
      'infrastructure',
      'messaging',
      'security',
      'quality',
    ];
    let sourceAgentPath: string | null = null;

    for (const category of agentCategories) {
      const candidatePath = path.join(devSuiteDir, 'agents', category, `${agentId}.md`);
      if (fs.existsSync(candidatePath)) {
        sourceAgentPath = candidatePath;
        break;
      }
    }

    if (!sourceAgentPath) {
      return {
        success: false,
        error: `Agent '${agentId}' not found in dev-suite`,
      };
    }

    // Ensure target directory exists
    const targetDir = path.join(projectPath, '.claude', 'agents');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Copy agent file
    const targetPath = path.join(targetDir, `${agentId}.md`);
    try {
      fs.copyFileSync(sourceAgentPath, targetPath);
      logger.info('Agent installed', { context: { agentId, targetPath } });

      // Update manifest to include the new agent
      const manifest = loadManifest(projectPath);
      if (manifest) {
        if (!manifest.agents) {
          manifest.agents = [];
        }
        if (!manifest.agents.includes(agentId)) {
          manifest.agents.push(agentId);
        }

        // Track the new file
        if (!manifest.files) {
          manifest.files = [];
        }
        const trackedFile = createTrackedFile(
          projectPath,
          `.claude/agents/${agentId}.md`,
          'agent',
          sourceAgentPath
        );
        if (trackedFile) {
          manifest.files.push(trackedFile);
        }

        saveManifest(projectPath, manifest);
      }

      return {
        success: true,
        agentPath: targetPath,
      };
    } catch (error) {
      logger.error('Failed to install agent', { error, context: { agentId } });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to copy agent file',
      };
    }
  }
}
