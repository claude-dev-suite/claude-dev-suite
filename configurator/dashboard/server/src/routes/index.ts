// SPDX-License-Identifier: MIT
/**
 * API Routes Registration
 */

import type { Express } from 'express';
import { detectionRoutes } from './detection.routes.js';
import { agentsRoutes } from './agents.routes.js';
import { installationRoutes } from './installation.routes.js';
import { managementRoutes } from './management.routes.js';
import { hooksRoutes } from './hooks.routes.js';
import { codeReviewRoutes } from './code-review.routes.js';
import { analyticsRoutes } from './analytics.routes.js';
import { loggingRoutes } from './logging.routes.js';
import { orchestratorRoutes } from './orchestrator.routes.js';
import { gitRoutes } from './git.routes.js';
import { upgradeRoutes } from './upgrade.routes.js';
import { recipesRoutes } from './recipes.routes.js';
import { templatesRoutes } from './templates.routes.js';
import { customAgentsRoutes } from './custom-agents.routes.js';
import { codegenRoutes } from './codegen.routes.js';
import { usageRoutes } from './usage.routes.js';
import { livePerformanceRoutes } from './live-performance.routes.js';
import { filesRoutes } from './files.routes.js';

export function registerRoutes(app: Express): void {
  // Detection routes
  app.use('/api', detectionRoutes);

  // Agents routes
  app.use('/api', agentsRoutes);

  // Installation routes
  app.use('/api', installationRoutes);

  // Management routes
  app.use('/api', managementRoutes);

  // Hooks routes
  app.use('/api', hooksRoutes);

  // Code review routes
  app.use('/api', codeReviewRoutes);

  // Analytics routes
  app.use('/api', analyticsRoutes);

  // Logging routes
  app.use('/api', loggingRoutes);

  // Orchestrator routes
  app.use('/api', orchestratorRoutes);

  // Git routes
  app.use('/api/git', gitRoutes);

  // Upgrade routes
  app.use('/api', upgradeRoutes);

  // Recipes/Automation routes
  app.use('/api', recipesRoutes);

  // Templates routes
  app.use('/api', templatesRoutes);

  // Custom Agents routes
  app.use('/api', customAgentsRoutes);

  // Code Generator routes
  app.use('/api', codegenRoutes);

  // Usage Monitor routes
  app.use('/api', usageRoutes);

  // Live Performance routes
  app.use('/api', livePerformanceRoutes);

  // Files viewer routes (read-only)
  app.use('/api/files', filesRoutes);

  // 404 handler for API routes
  app.use('/api/{*path}', (_req, res) => {
    res.status(404).json({
      success: false,
      error: 'API endpoint not found',
    });
  });
}
