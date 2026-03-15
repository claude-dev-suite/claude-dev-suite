// SPDX-License-Identifier: MIT
/**
 * Agents API Routes
 *
 * Endpoints for listing agents and MCP servers.
 */

import { Router, type Request, type Response } from 'express';
import { AgentsService } from '../services/agents.service.js';
import { logger } from '../utils/logger.js';

export const agentsRoutes = Router();
const agentsService = new AgentsService();

// Get all agents
agentsRoutes.get('/agents', async (_req: Request, res: Response) => {
  try {
    const agents = await agentsService.getAgents();

    // Return format expected by frontend
    return res.json({ agents });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load agents' });
  }
});

// Get all MCP servers
agentsRoutes.get('/mcp-servers', async (_req: Request, res: Response) => {
  try {
    const servers = await agentsService.getMcpServers();

    // Return format expected by frontend
    return res.json({ servers });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load MCP servers' });
  }
});

// Get required environment variables for selected MCP servers
agentsRoutes.post('/env-vars', async (req: Request, res: Response) => {
  try {
    // Accept both 'servers' and 'serverNames' for compatibility
    const { servers, serverNames, projectPath, selectedEnv } = req.body as {
      servers?: string[];
      serverNames?: string[];
      projectPath?: string;
      selectedEnv?: string;
    };
    const serverList = serverNames || servers;

    if (!serverList || !Array.isArray(serverList)) {
      return res.status(400).json({ error: 'servers or serverNames array is required' });
    }

    const envVars = await agentsService.getRequiredEnvVars(serverList, projectPath);

    // If projectPath provided, try to detect environment values (non-blocking)
    if (projectPath) {
      try {
        const { DetectionService } = await import('../services/detection.service.js');
        const detectionService = new DetectionService();
        const environments = await detectionService.detectEnvironments(projectPath);

        // Find the selected environment or use first one
        const envToUse = selectedEnv
          ? environments.find(e => e.name === selectedEnv)
          : environments[0];

        if (envToUse?.databaseUrl) {
          // Add detected value to DATABASE_URL
          for (const envVar of envVars) {
            if (envVar.name === 'DATABASE_URL') {
              envVar.detectedValue = envToUse.databaseUrl;
              envVar.source = envToUse.source;
            }
          }
        }
      } catch (detectionErr) {
        logger.warn('Environment detection failed, env vars returned without auto-detection', {
          error: detectionErr,
        });
      }
    }

    // Return format expected by frontend (EnvVarsResponse type)
    return res.json({ envVars });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get env vars' });
  }
});
