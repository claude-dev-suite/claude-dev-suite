// SPDX-License-Identifier: MIT
/**
 * Management API Routes
 * 
 * Endpoints for managing installed components.
 */

import { Router, type Request, type Response } from 'express';
import { ManagementService } from '../services/management.service.js';
import type { ApiResponse } from '../types.js';

export const managementRoutes = Router();
const managementService = new ManagementService();

// Get installed components
managementRoutes.get('/installed-components', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string || process.env.PROJECT_PATH;

    if (!projectPath) {
      return res.status(400).json({ error: 'Project path is required' });
    }

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
    const { projectPath, agentId } = req.body as { projectPath: string; agentId: string };

    if (!projectPath || !agentId) {
      const response: ApiResponse = {
        success: false,
        error: 'projectPath and agentId are required',
      };
      return res.status(400).json(response);
    }

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
    const { projectPath, agentId } = req.body as { projectPath: string; agentId: string };

    if (!projectPath || !agentId) {
      const response: ApiResponse = {
        success: false,
        error: 'projectPath and agentId are required',
      };
      return res.status(400).json(response);
    }

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
    const { projectPath, serverName, envVars } = req.body as {
      projectPath: string;
      serverName: string;
      envVars?: Record<string, string>;
    };

    if (!projectPath || !serverName) {
      const response: ApiResponse = {
        success: false,
        error: 'projectPath and serverName are required',
      };
      return res.status(400).json(response);
    }

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
    const { projectPath, serverName } = req.body as { projectPath: string; serverName: string };

    if (!projectPath || !serverName) {
      const response: ApiResponse = {
        success: false,
        error: 'projectPath and serverName are required',
      };
      return res.status(400).json(response);
    }

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
