// SPDX-License-Identifier: MIT
/**
 * Release Check Routes
 *
 * API endpoint that compares the running dev-suite version against the latest
 * published GitHub release.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { ReleaseCheckService } from '../services/release-check.service.js';
import { validateQuery } from '../middleware/validateRequest.js';
import { getLogger } from '../utils/logger.js';
import type { ApiResponse } from '../types.js';

const logger = getLogger('ReleaseCheckRoutes');
const router = Router();
const releaseCheckService = new ReleaseCheckService();

const ReleaseCheckQuerySchema = z.object({
  // bypass the in-memory cache
  refresh: z.coerce.boolean().optional(),
});

/**
 * GET /api/release-check
 *
 * Returns the running version, the latest GitHub release version, and whether
 * an update is available. Never fails the request on network errors — the
 * payload carries an `error` field and `updateAvailable: false` instead.
 */
router.get(
  '/release-check',
  validateQuery(ReleaseCheckQuerySchema),
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    try {
      // The repo is fixed to the dev-suite repo (no user-controlled host/path
      // reaches the GitHub URL — avoids any request-forgery surface).
      const { refresh } = req.query as { refresh?: boolean };
      const result = await releaseCheckService.checkLatestRelease({ force: refresh });
      const response: ApiResponse<typeof result> = { success: true, data: result };

      logger.info('Release check complete', {
        context: {
          repo: result.repo,
          current: result.currentVersion,
          latest: result.latestVersion,
          updateAvailable: result.updateAvailable,
          cached: !refresh,
        },
        timing: { durationMs: Date.now() - startTime },
      });
      res.json(response);
    } catch (error) {
      logger.error('Failed to check releases', {
        error,
        timing: { durationMs: Date.now() - startTime },
      });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check releases',
      });
    }
  }
);

export { router as releaseCheckRoutes };
