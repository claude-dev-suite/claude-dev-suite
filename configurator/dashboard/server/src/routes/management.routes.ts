import path from 'node:path';
// SPDX-License-Identifier: MIT
/**
 * Management API Routes
 * 
 * Endpoints for managing installed components.
 */

import { Router, type Request, type Response } from 'express';
import { ManagementService } from '../services/management.service.js';
import type { ApiResponse } from '../types.js';
import { resolveProjectPath, PathValidationError } from '../utils/utilities.js';

export const managementRoutes = Router();
const managementService = new ManagementService();

// Get installed components
managementRoutes.get('/installed-components', async (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path || process.env.PROJECT_PATH);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const components = await managementService.getInstalledComponents(projectPath);

    // Return format expected by frontend
    // installed = true if there are any agents or mcpServers
    const installed = components.agents.length > 0 || components.mcpServers.length > 0;

    return res.json({
      installed,
      agents: components.agents,
      mcpServers: components.mcpServers,
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get components' });
  }
});

// Add agent to project
managementRoutes.post('/add-agent', async (req: Request, res: Response) => {
  try {
    const { projectPath: rawPath, agentId } = req.body as { projectPath: string; agentId: string };

    if (!agentId) {
      const response: ApiResponse = {
        success: false,
        error: 'projectPath and agentId are required',
      };
      return res.status(400).json(response);
    }

    const projectPath = resolveProjectPath(rawPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    await managementService.addAgent(projectPath, agentId);

    const response: ApiResponse<{ added: string }> = {
      success: true,
      data: { added: agentId },
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to add agent',
    };
    return res.status(500).json(response);
  }
});

// Remove agent from project
managementRoutes.post('/remove-agent', async (req: Request, res: Response) => {
  try {
    const { projectPath: rawPath, agentId } = req.body as { projectPath: string; agentId: string };

    if (!agentId) {
      const response: ApiResponse = {
        success: false,
        error: 'projectPath and agentId are required',
      };
      return res.status(400).json(response);
    }

    const projectPath = resolveProjectPath(rawPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    await managementService.removeAgent(projectPath, agentId);

    const response: ApiResponse<{ removed: string }> = {
      success: true,
      data: { removed: agentId },
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to remove agent',
    };
    return res.status(500).json(response);
  }
});

// Add MCP server to project
managementRoutes.post('/add-mcp-server', async (req: Request, res: Response) => {
  try {
    const { projectPath: rawPath, serverName, envVars } = req.body as {
      projectPath: string;
      serverName: string;
      envVars?: Record<string, string>;
    };

    if (!serverName) {
      const response: ApiResponse = {
        success: false,
        error: 'projectPath and serverName are required',
      };
      return res.status(400).json(response);
    }

    const projectPath = resolveProjectPath(rawPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    await managementService.addMcpServer(projectPath, serverName, envVars);

    const response: ApiResponse<{ added: string }> = {
      success: true,
      data: { added: serverName },
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to add MCP server',
    };
    return res.status(500).json(response);
  }
});

// Remove MCP server from project
managementRoutes.post('/remove-mcp-server', async (req: Request, res: Response) => {
  try {
    const { projectPath: rawPath, serverName } = req.body as { projectPath: string; serverName: string };

    if (!serverName) {
      const response: ApiResponse = {
        success: false,
        error: 'projectPath and serverName are required',
      };
      return res.status(400).json(response);
    }

    const projectPath = resolveProjectPath(rawPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    await managementService.removeMcpServer(projectPath, serverName);

    const response: ApiResponse<{ removed: string }> = {
      success: true,
      data: { removed: serverName },
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to remove MCP server',
    };
    return res.status(500).json(response);
  }
});

// Get new components available since install
managementRoutes.get('/new-components', async (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path || process.env.PROJECT_PATH);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const result = await managementService.getNewComponents(projectPath);

    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to check new components',
    });
  }
});

// Check for updates
managementRoutes.get('/check-updates', async (_req: Request, res: Response) => {
  try {
    const updates = await managementService.checkForUpdates();

    const response: ApiResponse<{ hasUpdates: boolean; changes?: string[] }> = {
      success: true,
      data: updates,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Update check failed',
    };
    return res.status(500).json(response);
  }
});

// Pull updates
managementRoutes.post('/pull-updates', async (_req: Request, res: Response) => {
  try {
    const result = await managementService.pullUpdates();

    const response: ApiResponse<{ updated: boolean; changes?: string[] }> = {
      success: true,
      data: result,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Update failed',
    };
    return res.status(500).json(response);
  }
});
