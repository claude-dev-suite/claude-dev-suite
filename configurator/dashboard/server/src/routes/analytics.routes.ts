// SPDX-License-Identifier: MIT
/**
 * Analytics API Routes
 *
 * Endpoints for KB usage analytics.
 */

import { Router, type Request, type Response } from 'express';
import { AnalyticsService } from '../services/analytics.service.js';
import type { ApiResponse, Job } from '../types.js';
import { resolveProjectPath } from '../utils/utilities.js';

export const analyticsRoutes = Router();
const analyticsService = new AnalyticsService();

// Check if analytics exist
analyticsRoutes.get('/analytics/status', (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);


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
