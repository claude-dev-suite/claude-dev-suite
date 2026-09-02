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

// `promote` adopts the on-disk content: the file is kept AND its hash recorded
// as ratified, so it stops being reported as drift. `keep` is this-run-only.
const ReinstallResolutionSchema = z.record(z.string(), z.enum(['overwrite', 'keep', 'promote']));

const ReinstallExecuteRequestSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  resolutions: ReinstallResolutionSchema.optional(),
  createBackup: z.boolean().optional().default(true),
});

const ReinstallHistoryRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

const ReinstallDriftRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

const ReinstallDiffRequestSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
  file: z.string().min(1, 'File path is required'),
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
        resolutions?: Record<string, 'overwrite' | 'keep' | 'promote'>;
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

/**
 * GET /api/reinstall/drift
 *
 * Scan the project for managed files that changed since dev-suite wrote them.
 * Read-only and cheap enough to poll (hashes are cached by mtime+size), so the
 * Manage tab can show a drift banner without running a full reinstall preview.
 */
router.get(
  '/reinstall/drift',
  validateQuery(ReinstallDriftRequestSchema),
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      const projectPath = resolveProjectPath(req.query.path);
      const result = await reinstallService.getDrift(projectPath);
      const response: ApiResponse<typeof result> = { success: true, data: result };

      logger.info('Drift scan complete', {
        context: {
          projectPath,
          scanned: result.counts.scanned,
          drifted: result.counts.drifted,
          acknowledged: result.counts.acknowledged,
        },
        timing: { durationMs: Date.now() - startTime },
      });
      res.json(response);
    } catch (error) {
      logger.error('Failed to scan for drift', {
        error,
        timing: { durationMs: Date.now() - startTime },
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to scan for drift',
      });
    }
  }
);

/**
 * GET /api/reinstall/diff
 *
 * Read-only diff between a tracked file and the catalog version dev-suite would
 * write. The canonical side is regenerated from the manifest's `source` field —
 * file content is never stored in the manifest.
 */
router.get(
  '/reinstall/diff',
  validateQuery(ReinstallDiffRequestSchema),
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      const projectPath = resolveProjectPath(req.query.path);
      const result = await reinstallService.getDriftDiff(projectPath, String(req.query.file));
      const response: ApiResponse<typeof result> = { success: true, data: result };
      res.json(response);
    } catch (error) {
      logger.error('Failed to diff a tracked file', {
        error,
        timing: { durationMs: Date.now() - startTime },
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to diff a tracked file',
      });
    }
  }
);

export { router as reinstallRoutes };
