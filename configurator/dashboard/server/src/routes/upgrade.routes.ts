// SPDX-License-Identifier: MIT
/**
 * Upgrade Routes
 *
 * API endpoints for the feature upgrade system.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { UpgradeService } from '../services/upgrade.service.js';
import { validateQuery, validateBody } from '../middleware/validateRequest.js';
import { resolveProjectPath } from '../utils/utilities.js';
import { getLogger } from '../utils/logger.js';
import type { ApiResponse } from '../types.js';

const logger = getLogger('UpgradeRoutes');
const router = Router();
const upgradeService = new UpgradeService();

// ============================================
// VALIDATION SCHEMAS
// ============================================

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

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/upgrade/check
 *
 * Check for available upgrades for a project.
 * Returns list of features that can be applied.
 */
router.get(
  '/upgrade/check',
  validateQuery(UpgradeCheckRequestSchema),
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const projectPath = resolveProjectPath(req.query.path);

      logger.info('Checking for upgrades', { context: { projectPath } });

      const result = await upgradeService.checkUpgrades(projectPath);

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
      };

      logger.info('Upgrade check complete', {
        context: { projectPath, upgradeCount: result.upgradeCount },
        timing: { durationMs: Date.now() - startTime },
      });

      res.json(response);
    } catch (error) {
      logger.error('Failed to check upgrades', {
        error,
        timing: { durationMs: Date.now() - startTime },
      });

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check upgrades',
      });
    }
  }
);

/**
 * POST /api/upgrade/preview
 *
 * Preview what would happen if upgrades were applied (dry run).
 */
router.post(
  '/upgrade/preview',
  validateBody(UpgradePreviewRequestSchema),
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const { path: projectPath, featureIds } = req.body as {
        path: string;
        featureIds?: string[];
      };

      logger.info('Previewing upgrade', { context: { projectPath, featureIds } });

      const result = await upgradeService.previewUpgrade(projectPath, featureIds);

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
      };

      logger.info('Upgrade preview complete', {
        context: {
          projectPath,
          wouldApply: result.wouldApply.length,
          wouldSkip: result.wouldSkip.length,
          conflicts: result.conflicts.length,
        },
        timing: { durationMs: Date.now() - startTime },
      });

      res.json(response);
    } catch (error) {
      logger.error('Failed to preview upgrade', {
        error,
        timing: { durationMs: Date.now() - startTime },
      });

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to preview upgrade',
      });
    }
  }
);

/**
 * POST /api/upgrade/execute
 *
 * Execute upgrades for selected features.
 */
router.post(
  '/upgrade/execute',
  validateBody(UpgradeExecuteRequestSchema),
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const request = req.body as {
        projectPath: string;
        featureIds: string[];
        resolutions?: Record<string, Record<string, 'skip' | 'replace' | 'backup-replace' | 'merge'>>;
        createBackup?: boolean;
        force?: boolean;
      };

      logger.info('Executing upgrade', {
        context: {
          projectPath: request.projectPath,
          featureIds: request.featureIds,
          createBackup: request.createBackup,
        },
      });

      const result = await upgradeService.executeUpgrade(request);

      const response: ApiResponse<typeof result> = {
        success: result.success,
        data: result,
        error: result.error,
      };

      logger.info('Upgrade execution complete', {
        context: {
          projectPath: request.projectPath,
          upgraded: result.upgraded.length,
          skipped: result.skipped.length,
          failed: result.failed.length,
        },
        timing: { durationMs: Date.now() - startTime },
      });

      res.json(response);
    } catch (error) {
      logger.error('Failed to execute upgrade', {
        error,
        timing: { durationMs: Date.now() - startTime },
      });

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute upgrade',
      });
    }
  }
);

/**
 * GET /api/upgrade/history
 *
 * Get upgrade history for a project.
 */
router.get(
  '/upgrade/history',
  validateQuery(UpgradeHistoryRequestSchema),
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const projectPath = resolveProjectPath(req.query.path);

      logger.info('Getting upgrade history', { context: { projectPath } });

      const history = await upgradeService.getUpgradeHistory(projectPath);

      const response: ApiResponse<typeof history> = {
        success: true,
        data: history,
      };

      logger.info('Upgrade history retrieved', {
        context: { projectPath, entries: history.length },
        timing: { durationMs: Date.now() - startTime },
      });

      res.json(response);
    } catch (error) {
      logger.error('Failed to get upgrade history', {
        error,
        timing: { durationMs: Date.now() - startTime },
      });

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get upgrade history',
      });
    }
  }
);

/**
 * GET /api/upgrade/features
 *
 * Get list of all available features from the registry.
 */
router.get('/upgrade/features', async (_req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    // Use the upgrade service to get features via check with empty manifest handling
    // This endpoint just returns the raw feature list
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const devSuiteDir = process.env.DEV_SUITE_DIR || path.resolve(__dirname, '..', '..', '..', '..', '..');
    const registryPath = path.join(devSuiteDir, 'registry', 'features.json');

    if (!fs.existsSync(registryPath)) {
      res.json({
        success: true,
        data: { features: [], schemaVersion: '1.0.0' },
      });
      return;
    }

    const content = fs.readFileSync(registryPath, 'utf-8');
    const registry = JSON.parse(content);

    const response: ApiResponse<typeof registry> = {
      success: true,
      data: registry,
    };

    logger.info('Features retrieved', {
      context: { count: registry.features?.length || 0 },
      timing: { durationMs: Date.now() - startTime },
    });

    res.json(response);
  } catch (error) {
    logger.error('Failed to get features', {
      error,
      timing: { durationMs: Date.now() - startTime },
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get features',
    });
  }
});

// ============================================
// PREREQUISITE INSTALLATION ROUTES
// ============================================

// SECURITY: validate npm package names to prevent shell injection via spawn(shell:true)
const NPM_PACKAGE_NAME_REGEX = /^(@[a-z0-9_.-]+\/)?[a-z0-9_.-]+(@[a-zA-Z0-9_.*^~<>=||-]+)?$/;

const InstallPackageRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  packages: z
    .array(
      z.string().regex(NPM_PACKAGE_NAME_REGEX, 'Invalid npm package name')
    )
    .min(1, 'At least one package is required'),
  dev: z.boolean().optional().default(true),
});

const InstallAgentRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  agentId: z.string().min(1, 'Agent ID is required'),
});

/**
 * POST /api/upgrade/install-package
 *
 * Install npm packages as prerequisites for features.
 */
router.post(
  '/upgrade/install-package',
  validateBody(InstallPackageRequestSchema),
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const { projectPath, packages, dev } = req.body as {
        projectPath: string;
        packages: string[];
        dev: boolean;
      };

      logger.info('Installing packages', { context: { projectPath, packages, dev } });

      const result = await upgradeService.installPackages(projectPath, packages, dev);

      const response: ApiResponse<typeof result> = {
        success: result.success,
        data: result,
        error: result.error,
      };

      logger.info('Package installation complete', {
        context: { projectPath, packages, success: result.success },
        timing: { durationMs: Date.now() - startTime },
      });

      res.json(response);
    } catch (error) {
      logger.error('Failed to install packages', {
        error,
        timing: { durationMs: Date.now() - startTime },
      });

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to install packages',
      });
    }
  }
);

/**
 * POST /api/upgrade/install-agent
 *
 * Install a missing agent as prerequisite for features.
 */
router.post(
  '/upgrade/install-agent',
  validateBody(InstallAgentRequestSchema),
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const { projectPath, agentId } = req.body as {
        projectPath: string;
        agentId: string;
      };

      logger.info('Installing agent', { context: { projectPath, agentId } });

      const result = await upgradeService.installAgent(projectPath, agentId);

      const response: ApiResponse<typeof result> = {
        success: result.success,
        data: result,
        error: result.error,
      };

      logger.info('Agent installation complete', {
        context: { projectPath, agentId, success: result.success },
        timing: { durationMs: Date.now() - startTime },
      });

      res.json(response);
    } catch (error) {
      logger.error('Failed to install agent', {
        error,
        timing: { durationMs: Date.now() - startTime },
      });

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to install agent',
      });
    }
  }
);

export { router as upgradeRoutes };
