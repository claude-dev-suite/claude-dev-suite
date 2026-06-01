// SPDX-License-Identifier: MIT
/**
 * Reinstall Routes
 *
 * API endpoints for the erase-and-replace reinstall/sync system.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { ReinstallService } from '../services/reinstall.service.js';
import { validateQuery, validateBody } from '../middleware/validateRequest.js';
import { resolveProjectPath } from '../utils/utilities.js';
import { getLogger } from '../utils/logger.js';
import type { ApiResponse } from '../types.js';

const logger = getLogger('ReinstallRoutes');
const router = Router();
const reinstallService = new ReinstallService();

// ============================================
// VALIDATION SCHEMAS
// ============================================

const ReinstallPreviewRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

const ReinstallResolutionSchema = z.record(z.string(), z.enum(['overwrite', 'keep']));

const ReinstallExecuteRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  resolutions: ReinstallResolutionSchema.optional(),
  createBackup: z.boolean().optional().default(true),
});

const ReinstallHistoryRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/reinstall/preview
 *
 * Preview an erase-and-replace reinstall (read-only). Reports the selection,
 * locally modified managed files (opt-out candidates), and orphans to remove.
 */
router.get(
  '/reinstall/preview',
  validateQuery(ReinstallPreviewRequestSchema),
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      const projectPath = resolveProjectPath(req.query.path);
      logger.info('Previewing reinstall', { context: { projectPath } });

      const result = await reinstallService.previewReinstall(projectPath);
      const response: ApiResponse<typeof result> = { success: true, data: result };

      logger.info('Reinstall preview complete', {
        context: {
          projectPath,
          modified: result.modifiedManagedFiles.length,
          orphans: result.orphansToRemove.length,
        },
        timing: { durationMs: Date.now() - startTime },
      });
      res.json(response);
    } catch (error) {
      logger.error('Failed to preview reinstall', {
        error,
        timing: { durationMs: Date.now() - startTime },
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to preview reinstall',
      });
    }
  }
);

/**
 * POST /api/reinstall/execute
 *
 * Execute an erase-and-replace reinstall (transactional: backup + rollback).
 */
router.post(
  '/reinstall/execute',
  validateBody(ReinstallExecuteRequestSchema),
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      const { projectPath, resolutions, createBackup } = req.body as {
        projectPath: string;
        resolutions?: Record<string, 'overwrite' | 'keep'>;
        createBackup?: boolean;
      };
      logger.info('Executing reinstall', { context: { projectPath } });

      const result = await reinstallService.executeReinstall({ projectPath, resolutions, createBackup });
      const response: ApiResponse<typeof result> = { success: true, data: result };

      logger.info('Reinstall execute complete', {
        context: {
          projectPath,
          success: result.success,
          rolledBack: result.rolledBack,
          orphansRemoved: result.orphansRemoved.length,
        },
        timing: { durationMs: Date.now() - startTime },
      });
      res.json(response);
    } catch (error) {
      logger.error('Failed to execute reinstall', {
        error,
        timing: { durationMs: Date.now() - startTime },
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute reinstall',
      });
    }
  }
);

/**
 * GET /api/reinstall/history
 *
 * Return the reinstall history recorded in the manifest.
 */
router.get(
  '/reinstall/history',
  validateQuery(ReinstallHistoryRequestSchema),
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      const projectPath = resolveProjectPath(req.query.path);
      const result = await reinstallService.getReinstallHistory(projectPath);
      const response: ApiResponse<typeof result> = { success: true, data: result };
      res.json(response);
    } catch (error) {
      logger.error('Failed to get reinstall history', {
        error,
        timing: { durationMs: Date.now() - startTime },
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get reinstall history',
      });
    }
  }
);

export { router as reinstallRoutes };
