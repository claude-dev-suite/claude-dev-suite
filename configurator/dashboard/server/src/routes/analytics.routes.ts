import path from 'node:path';
// SPDX-License-Identifier: MIT
/**
 * Analytics API Routes
 *
 * Endpoints for KB usage analytics and token usage tracking.
 *
 * Token-usage endpoints are guarded by the TOKEN_ANALYTICS_ENABLED env var
 * (must be exactly "true").  When the guard is off the endpoints return 403
 * so clients can detect the opt-in state.
 */

import { Router, type Request, type Response } from 'express';
import { AnalyticsService } from '../services/analytics.service.js';
import type { TokenGroupBy } from '../services/analytics.service.js';
import type { ApiResponse, Job } from '../types.js';
import { resolveProjectPath, PathValidationError } from '../utils/utilities.js';

/**
 * Returns true when the operator has explicitly opted in to token tracking.
 */
function isTokenAnalyticsEnabled(): boolean {
  return process.env['TOKEN_ANALYTICS_ENABLED'] === 'true';
}

export const analyticsRoutes = Router();
const analyticsService = new AnalyticsService();

// Check if analytics exist
analyticsRoutes.get('/analytics/status', (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const summary = analyticsService.getAnalyticsSummary(projectPath);

    const response: ApiResponse = {
      success: true,
      data: summary,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get analytics status',
    };
    return res.status(500).json(response);
  }
});

// Get KB usage entries with filters and pagination
analyticsRoutes.get('/analytics/kb-usage', (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const options = {
      technology: req.query.technology as string | undefined,
      tool: req.query.tool as string | undefined,
      source: req.query.source as string | undefined,
      success: req.query.success !== undefined ? req.query.success === 'true' : undefined,
      since: req.query.since as string | undefined,
      until: req.query.until as string | undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };

    const result = analyticsService.getKBUsageEntries(projectPath, options);

    const response: ApiResponse = {
      success: true,
      data: result,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get KB usage entries',
    };
    return res.status(500).json(response);
  }
});

// Get aggregated KB usage statistics
analyticsRoutes.get('/analytics/kb-stats', (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const options = {
      since: req.query.since as string | undefined,
    };

    const stats = analyticsService.getKBUsageStats(projectPath, options);

    const response: ApiResponse = {
      success: true,
      data: stats,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get KB usage stats',
    };
    return res.status(500).json(response);
  }
});

// Correlate KB usage with jobs
analyticsRoutes.post('/analytics/kb-jobs', (req: Request, res: Response) => {
  try {
    const { projectPath: rawPath, jobs, windowMs } = req.body as {
      projectPath: string;
      jobs: Job[];
      windowMs?: number;
    };

    if (!jobs) {
      const response: ApiResponse = {
        success: false,
        error: 'projectPath and jobs are required',
      };
      return res.status(400).json(response);
    }

    const projectPath = resolveProjectPath(rawPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const correlatedJobs = analyticsService.correlateWithJobs(projectPath, jobs, windowMs);

    const response: ApiResponse = {
      success: true,
      data: correlatedJobs,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to correlate jobs',
    };
    return res.status(500).json(response);
  }
});

// Get unique technologies used
analyticsRoutes.get('/analytics/technologies', (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const technologies = analyticsService.getUsedTechnologies(projectPath);

    const response: ApiResponse = {
      success: true,
      data: technologies,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get technologies',
    };
    return res.status(500).json(response);
  }
});

// Get unique tools used
analyticsRoutes.get('/analytics/tools', (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const tools = analyticsService.getUsedTools(projectPath);

    const response: ApiResponse = {
      success: true,
      data: tools,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get tools',
    };
    return res.status(500).json(response);
  }
});

// Get unique sources used
analyticsRoutes.get('/analytics/sources', (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const sources = analyticsService.getUsedSources(projectPath);

    const response: ApiResponse = {
      success: true,
      data: sources,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get sources',
    };
    return res.status(500).json(response);
  }
});

// Clear KB analytics data
analyticsRoutes.post('/analytics/clear', (req: Request, res: Response) => {
  try {
    const { projectPath: rawPath } = req.body as { projectPath: string };

    const projectPath = resolveProjectPath(rawPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const result = analyticsService.clearKBUsage(projectPath);

    const response: ApiResponse = {
      success: result.success,
      data: result,
      error: result.error,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to clear analytics',
    };
    return res.status(500).json(response);
  }
});

// ============================================================
// TOKEN USAGE ENDPOINTS (opt-in via TOKEN_ANALYTICS_ENABLED)
// ============================================================

/**
 * POST /api/analytics/token-usage
 * Record a token-usage event.
 *
 * Body: Omit<TokenUsageEntry, 'id' | 'timestamp'> & { projectPath: string }
 *
 * Returns 403 when TOKEN_ANALYTICS_ENABLED is not "true".
 */
analyticsRoutes.post('/analytics/token-usage', (req: Request, res: Response) => {
  if (!isTokenAnalyticsEnabled()) {
    const response: ApiResponse = {
      success: false,
      error: 'Token analytics is disabled. Set TOKEN_ANALYTICS_ENABLED=true to enable.',
    };
    return res.status(403).json(response);
  }

  try {
    const {
      projectPath: rawPath,
      agentId,
      skillPath,
      mcpTool,
      sessionId,
      tokensInput,
      tokensOutput,
      model,
      success: callSuccess,
      durationMs,
    } = req.body as {
      projectPath: string;
      agentId?: string;
      skillPath?: string;
      mcpTool?: string;
      sessionId?: string;
      tokensInput: number;
      tokensOutput: number;
      model?: string;
      success: boolean;
      durationMs?: number;
    };

    if (typeof tokensInput !== 'number' || typeof tokensOutput !== 'number') {
      const response: ApiResponse = { success: false, error: 'tokensInput and tokensOutput must be numbers' };
      return res.status(400).json(response);
    }

    const projectPath = resolveProjectPath(rawPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const result = analyticsService.recordTokenUsage(projectPath, {
      agentId,
      skillPath,
      mcpTool,
      sessionId,
      tokensInput,
      tokensOutput,
      model,
      success: callSuccess ?? true,
      durationMs,
    });

    const response: ApiResponse = { success: result.success, error: result.error };
    return res.status(result.success ? 201 : 500).json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to record token usage',
    };
    return res.status(500).json(response);
  }
});

/**
 * GET /api/analytics/token-usage
 * Filtered list of raw token-usage entries.
 *
 * Query params: path (required), since, agentId, skillPath, mcpTool, model, limit
 *
 * Returns 403 when TOKEN_ANALYTICS_ENABLED is not "true".
 */
analyticsRoutes.get('/analytics/token-usage', (req: Request, res: Response) => {
  if (!isTokenAnalyticsEnabled()) {
    const response: ApiResponse = {
      success: false,
      error: 'Token analytics is disabled. Set TOKEN_ANALYTICS_ENABLED=true to enable.',
    };
    return res.status(403).json(response);
  }

  try {
    const projectPath = resolveProjectPath(req.query.path);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const entries = analyticsService.getTokenUsage(projectPath, {
      since: req.query.since as string | undefined,
      agentId: req.query.agentId as string | undefined,
      skillPath: req.query.skillPath as string | undefined,
      mcpTool: req.query.mcpTool as string | undefined,
      model: req.query.model as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    });

    const response: ApiResponse = { success: true, data: entries };
    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get token usage',
    };
    return res.status(500).json(response);
  }
});

/**
 * GET /api/analytics/token-usage/aggregate
 * Aggregated token-usage stats grouped by a dimension.
 *
 * Query params: path (required), groupBy (agent|skill|mcpTool|model), since
 *
 * Returns 403 when TOKEN_ANALYTICS_ENABLED is not "true".
 */
analyticsRoutes.get('/analytics/token-usage/aggregate', (req: Request, res: Response) => {
  if (!isTokenAnalyticsEnabled()) {
    const response: ApiResponse = {
      success: false,
      error: 'Token analytics is disabled. Set TOKEN_ANALYTICS_ENABLED=true to enable.',
    };
    return res.status(403).json(response);
  }

  try {
    const projectPath = resolveProjectPath(req.query.path);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const validGroupBy: TokenGroupBy[] = ['agent', 'skill', 'mcpTool', 'model'];
    const groupByParam = req.query.groupBy as string | undefined;
    const groupBy: TokenGroupBy = validGroupBy.includes(groupByParam as TokenGroupBy)
      ? (groupByParam as TokenGroupBy)
      : 'agent';

    const rows = analyticsService.getAggregatedTokenUsage(projectPath, {
      groupBy,
      since: req.query.since as string | undefined,
    });

    const response: ApiResponse = { success: true, data: rows };
    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to aggregate token usage',
    };
    return res.status(500).json(response);
  }
});
