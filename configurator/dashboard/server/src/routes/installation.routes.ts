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
import { resolveProjectPath, PathValidationError } from '../utils/utilities.js';
import { targetPaths } from '../services/targets/target-paths.js';
import { materializeLocal } from '../services/installation/materialize-local.js';
import {
  PrepareServersRequestSchema,
  InstallRequestSchema,
  UninstallRequestSchema,
  InstallStatusRequestSchema,
  MaterializeLocalRequestSchema,
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

    const result = await installationService.prepareServers(serverList);

    if (result.failed.length > 0) {
      return res.status(500).json({
        success: false,
        error: `Failed to build MCP server(s): ${result.failed.join(', ')}`,
        prepared: result.prepared,
        failed: result.failed,
      });
    }

    return res.json({
      success: true,
      prepared: result.prepared,
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

    const result = await installationService.uninstall(projectPath);

    // `uninstall()` returns what it removed and what it could not. Answering a
    // flat `success: true` and dropping `errors` meant a partial uninstall — a
    // refused path, a config it could not un-merge — was indistinguishable from
    // a clean one, both for the user and for the CLI.
    return res.json({
      success: result.errors.length === 0,
      uninstalled: true,
      removed: result.removed,
      errors: result.errors,
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
    const projectPath = resolveProjectPath(req.query.path);

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

/**
 * POST /api/materialize-local — rebuild this checkout's MCP configs.
 *
 * A git worktree contains only *tracked* files, so a project whose MCP config
 * is gitignored (because it carries a credential) simply has none there: agents
 * running in that worktree see a project with no dev-suite at all, silently.
 * This rebuilds the configs from the committed manifest plus the machine-local
 * secret store — no secret ever needs to be committed for a worktree to work.
 */
installationRoutes.post('/materialize-local', validateBody(MaterializeLocalRequestSchema), async (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath((req.body as { projectPath: string }).projectPath);
    const result = await materializeLocal(projectPath);
    // Never echo the values back — only what was written and whether secrets
    // were available to write.
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Materialize failed',
    });
  }
});

// GET /api/available-commands - List available slash commands
installationRoutes.get('/available-commands', validateQuery(AvailableCommandsRequestSchema), async (req: Request, res: Response) => {
  try {
    const rawPath = req.query.path;
    if (typeof rawPath !== 'string') {
      return res.status(400).json({ success: false, error: 'Invalid path parameter' });
    }
    if (rawPath.includes('..')) throw new Error('Path traversal not allowed');
    const projectPath = resolveProjectPath(rawPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const commandsDir = targetPaths(projectPath).commandsDir;
    const commands: { name: string; description: string; file: string }[] = [];

    try {
      const files = await fs.readdir(commandsDir);
      const mdFiles = files.filter(f => f.endsWith('.md') && f !== 'README.md');

      for (const file of mdFiles) {
        if (file.includes('..')) continue;
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
