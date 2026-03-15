// SPDX-License-Identifier: MIT
/**
 * Usage Monitor API Routes
 *
 * Provides endpoints to retrieve Anthropic API token usage and cost data,
 * manage alert threshold configuration, and fetch Anthropic Console deep links.
 *
 * All path-bearing endpoints apply `resolveProjectPath()` for path security.
 */

import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { UsageService } from '../services/usage.service.js';
import { getLogger } from '../utils/logger.js';
import { resolveProjectPath, PathValidationError } from '../utils/utilities.js';
import { validateBody } from '../middleware/validateRequest.js';
import { SaveUsageConfigRequestSchema } from '../validation/schemas.js';

const logger = getLogger('usage-routes');
export const usageRoutes = Router();
const usageService = new UsageService();

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/usage/summary?path=<projectPath>
 *
 * Fetch the full usage + cost summary for the project's configured Admin API key.
 * Returns usage report, cost report, fired alerts, deep links, and last-fetched timestamp.
 */
usageRoutes.get('/usage/summary', async (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);

    if (!path.isAbsolute(projectPath)) {
      throw new PathValidationError('Path must be rooted');
    }

    const summary = await usageService.getSummary(projectPath);
    return res.json({ success: true, data: summary });
  } catch (err) {
    logger.error('Failed to get usage summary', {
      error: err instanceof Error ? err.message : String(err),
    });

    if (err instanceof PathValidationError) {
      return res.status(400).json({ success: false, error: err.message });
    }

    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get usage summary',
    });
  }
});

/**
 * GET /api/usage/config?path=<projectPath>
 *
 * Retrieve the usage monitor configuration (thresholds, polling interval).
 * The `adminApiKey` field is included so the UI can detect whether a key is set;
 * callers should treat it as write-only / masked on display.
 */
usageRoutes.get('/usage/config', (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);

    if (!path.isAbsolute(projectPath)) {
      throw new PathValidationError('Path must be rooted');
    }

    const config = usageService.getConfig(projectPath);
    return res.json({ success: true, data: config });
  } catch (err) {
    logger.error('Failed to get usage config', {
      error: err instanceof Error ? err.message : String(err),
    });

    if (err instanceof PathValidationError) {
      return res.status(400).json({ success: false, error: err.message });
    }

    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get usage config',
    });
  }
});

/**
 * POST /api/usage/config
 *
 * Persist updated usage monitor configuration for a project.
 *
 * Body: { projectPath: string, config: UsageConfig }
 */
usageRoutes.post(
  '/usage/config',
  validateBody(SaveUsageConfigRequestSchema),
  (req: Request, res: Response) => {
    try {
      const { projectPath, config } = req.body as {
        projectPath: string;
        config: Parameters<UsageService['saveConfig']>[1];
      };

      const resolvedPath = resolveProjectPath(projectPath);

      if (!path.isAbsolute(resolvedPath)) {
        throw new PathValidationError('Path must be rooted');
      }

      usageService.saveConfig(resolvedPath, config);

      return res.json({ success: true, data: { message: 'Usage config saved successfully' } });
    } catch (err) {
      logger.error('Failed to save usage config', {
        error: err instanceof Error ? err.message : String(err),
      });

      if (err instanceof PathValidationError) {
        return res.status(400).json({ success: false, error: err.message });
      }

      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to save usage config',
      });
    }
  },
);

/**
 * GET /api/usage/deep-links
 *
 * Returns the static list of Anthropic Console deep links
 * (billing, usage dashboard, plans, etc.).
 */
usageRoutes.get('/usage/deep-links', (_req: Request, res: Response) => {
  try {
    const deepLinks = usageService.getDeepLinks();
    return res.json({ success: true, data: deepLinks });
  } catch (err) {
    logger.error('Failed to get deep links', {
      error: err instanceof Error ? err.message : String(err),
    });
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get deep links',
    });
  }
});
