// SPDX-License-Identifier: MIT
/**
 * Detection API Routes
 *
 * Endpoints for project stack detection and recommendations.
 */

import { Router, type Request, type Response } from 'express';
import { DetectionService } from '../services/detection.service.js';
import { AssistantDetectionService } from '../services/detection/assistant-detection.service.js';
import type { DetectionResult } from '../types.js';
import { validateQuery } from '../middleware/validateRequest.js';
import { resolveProjectPath } from '../utils/utilities.js';
import {
  DetectRequestSchema,
  EnvironmentRequestSchema,
  GitReposRequestSchema,
  RecommendationsRequestSchema,
} from '../validation/schemas.js';

export const detectionRoutes = Router();
const detectionService = new DetectionService();
const assistantDetectionService = new AssistantDetectionService();

// Convert camelCase to snake_case for frontend compatibility
function toSnakeCase(result: DetectionResult) {
  return {
    project_type: result.projectType,
    frontend: result.frontend ? {
      framework: result.frontend.framework || '',
      meta_framework: result.frontend.metaFramework || '',
      runtime: result.frontend.runtime || '',
    } : { framework: '', meta_framework: '', runtime: '' },
    backend: result.backend ? {
      framework: result.backend.framework || '',
      meta_framework: result.backend.metaFramework || '',
      runtime: result.backend.runtime || '',
    } : { framework: '', meta_framework: '', runtime: '' },
    database: result.database ? {
      db_type: result.database.dbType || '',
      orm: result.database.orm || '',
    } : { db_type: '', orm: '' },
    testing: result.testing ? {
      unit: result.testing.unit || '',
      e2e: result.testing.e2e || '',
    } : { unit: '', e2e: '' },
    is_monorepo: result.isMonorepo,
    confidence: result.confidence,
  };
}

// Detect project stack
detectionRoutes.get('/detect', validateQuery(DetectRequestSchema), async (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);

    const result = await detectionService.detectProject(projectPath);
    return res.json(toSnakeCase(result));
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Detection failed' });
  }
});

// Get environment files
detectionRoutes.get('/environments', validateQuery(EnvironmentRequestSchema), async (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);

    const result = await detectionService.detectEnvironments(projectPath);
    // Convert to object keyed by name for frontend compatibility
    const envObject: Record<string, unknown> = {};
    for (const env of result) {
      envObject[env.name] = {
        name: env.name,
        label: env.label,
        database_url: env.databaseUrl,
        source: env.source,
      };
    }
    return res.json({ environments: envObject });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Environment detection failed' });
  }
});

// Get git repositories
detectionRoutes.get('/git-repos', validateQuery(GitReposRequestSchema), async (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);

    const result = await detectionService.detectGitRepos(projectPath);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Git detection failed' });
  }
});

// Get recommendations based on detection
detectionRoutes.get('/recommendations', validateQuery(RecommendationsRequestSchema), async (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);

    const detection = await detectionService.detectProject(projectPath);
    const recommendations = detectionService.getRecommendations(detection);

    // Format for frontend: array of objects with agentId/serverName
    return res.json({
      agents: recommendations.agents.map(id => ({ agentId: id })),
      mcpServers: recommendations.mcpServers.map(name => ({ serverName: name })),
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Recommendations failed' });
  }
});

// Detect which AI coding assistants the project already uses (for the wizard's
// target pre-selection). Returns a bare array, matching the other detection
// endpoints' response style.
detectionRoutes.get('/detect-assistants', validateQuery(DetectRequestSchema), async (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);
    const assistants = await assistantDetectionService.detectAssistants(projectPath);
    return res.json({ assistants });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Assistant detection failed' });
  }
});
