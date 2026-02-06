// SPDX-License-Identifier: MIT
/**
 * Installation API Routes
 *
 * Endpoints for installing dev-suite into projects.
 */

import { Router, type Request, type Response } from 'express';
import path from 'path';
import { promises as fs } from 'fs';
import { InstallationService } from '../services/installation.service.js';
import type { InstallConfig } from '../types.js';
import { validateBody, validateQuery } from '../middleware/validateRequest.js';
import {
  PrepareServersRequestSchema,
  InstallRequestSchema,
  UninstallRequestSchema,
  InstallStatusRequestSchema,
  AvailableCommandsRequestSchema,
} from '../validation/schemas.js';

export const installationRoutes = Router();
const installationService = new InstallationService();

// Prepare MCP servers (build them)
installationRoutes.post('/prepare-servers', validateBody(PrepareServersRequestSchema), async (req: Request, res: Response) => {
  try {
    // Accept both 'servers' and 'serverNames' for compatibility
    const { servers, serverNames } = req.body as { servers?: string[]; serverNames?: string[] };
    const serverList = serverNames || servers || [];

    await installationService.prepareServers(serverList);

    // Return format expected by frontend
    return res.json({
      success: true,
      prepared: serverList,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Server preparation failed',
    });
  }
});

// Install dev-suite into project
installationRoutes.post('/install', validateBody(InstallRequestSchema), async (req: Request, res: Response) => {
  try {
    const config = req.body as InstallConfig;

    const manifest = await installationService.install(config);

    // Return format expected by frontend (InstallationResponse type)
    return res.json({
      success: true,
      manifest,
      summary: `Installed ${manifest.agents?.length || 0} agents and ${manifest.mcpServers?.length || 0} MCP servers`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Installation failed',
    });
  }
});

// Uninstall dev-suite from project
installationRoutes.post('/uninstall', validateBody(UninstallRequestSchema), async (req: Request, res: Response) => {
  try {
    const { projectPath } = req.body as { projectPath: string };

    await installationService.uninstall(projectPath);

    // Return format expected by frontend
    return res.json({
      success: true,
      uninstalled: true,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Uninstall failed',
    });
  }
});

// Get installation status
installationRoutes.get('/install-status', validateQuery(InstallStatusRequestSchema), async (req: Request, res: Response) => {
  try {
    const { path: projectPath } = req.query as { path: string };

    const status = await installationService.getStatus(projectPath);

    // Return format expected by frontend
    return res.json({
      success: true,
      ...status,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Status check failed',
    });
  }
});

// GET /api/available-commands - List available slash commands
installationRoutes.get('/available-commands', validateQuery(AvailableCommandsRequestSchema), async (req: Request, res: Response) => {
  try {
    const { path: projectPath } = req.query as { path: string };

    const commandsDir = path.join(projectPath, '.claude', 'commands');
    const commands: { name: string; description: string; file: string }[] = [];

    try {
      const files = await fs.readdir(commandsDir);
      const mdFiles = files.filter(f => f.endsWith('.md') && f !== 'README.md');

      for (const file of mdFiles) {
        const name = file.replace('.md', '');
        const filePath = path.join(commandsDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          // Extract description from first non-empty, non-heading line
          const lines = content.split('\n');
          let description = '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
              description = trimmed.substring(0, 100);
              break;
            }
          }
          commands.push({ name: `/${name}`, description, file });
        } catch {
          commands.push({ name: `/${name}`, description: '', file });
        }
      }
    } catch {
      // Directory doesn't exist, return empty commands
    }

    return res.json({ commands, path: commandsDir });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get commands',
    });
  }
});
