// SPDX-License-Identifier: MIT
/**
 * Hooks API Routes
 *
 * Endpoints for managing Git hooks and Claude hooks.
 */

import { Router, type Request, type Response } from 'express';
import { HooksService } from '../services/hooks.service.js';
import { DetectionService } from '../services/detection.service.js';
import type { ApiResponse, HooksInstallConfig, ClaudeHookConfig, ClaudeHooksExport } from '../types.js';
import { validateBody, validateQuery } from '../middleware/validateRequest.js';
import { resolveProjectPath } from '../utils/utilities.js';
import {
  HooksRepositoriesRequestSchema,
  HooksStatusRequestSchema,
  InstallHooksRequestSchema,
} from '../validation/schemas.js';

export const hooksRoutes = Router();
const hooksService = new HooksService();
const detectionService = new DetectionService();

// ========== GIT HOOKS ==========

// Get available Git repositories with hooks info (for multi-repo support)
hooksRoutes.get('/hooks/repositories', validateQuery(HooksRepositoriesRequestSchema), async (req: Request, res: Response) => {
  try {
    const { path: projectPath } = req.query as { path: string };

    // First detect all git repos in the project
    const repos = await detectionService.detectGitRepos(projectPath);

    // Then enrich with hooks information
    const repositories = hooksService.getAvailableRepositories(projectPath, repos);

    return res.json({ repositories });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get repositories' });
  }
});

// Get Git hooks status
hooksRoutes.get('/hooks/status', validateQuery(HooksStatusRequestSchema), async (req: Request, res: Response) => {
  try {
    const { path: projectPath } = req.query as { path: string };

    const status = hooksService.getGitHooksStatus(projectPath);

    // Return format expected by frontend (HooksStatusResponse type)
    return res.json(status);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get hooks status' });
  }
});

// Get hooks status for a specific repository
hooksRoutes.get('/hooks/status/:repoPath', async (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);
    const repoPath = req.params.repoPath;

    const status = hooksService.getHooksStatusForRepo(projectPath, String(repoPath));

    const response: ApiResponse = {
      success: true,
      data: status,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get hooks status',
    };
    return res.status(500).json(response);
  }
});

// Install Git hooks
hooksRoutes.post('/hooks/install', validateBody(InstallHooksRequestSchema), async (req: Request, res: Response) => {
  try {
    const { projectPath, config } = req.body as {
      projectPath: string;
      config: HooksInstallConfig;
    };

    const result = hooksService.installHooks(projectPath, config || {});

    const response: ApiResponse = {
      success: result.success,
      data: result,
      error: result.error,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to install hooks',
    };
    return res.status(500).json(response);
  }
});

// Install hooks for a specific repository
hooksRoutes.post('/hooks/install/:repoPath', async (req: Request, res: Response) => {
  try {
    const { projectPath: rawPath, config } = req.body as {
      projectPath: string;
      config: HooksInstallConfig;
    };
    const repoPath = req.params.repoPath;

    const projectPath = resolveProjectPath(rawPath);

    const result = hooksService.installHooksForRepo(projectPath, String(repoPath ?? ''), config || {});

    const response: ApiResponse = {
      success: result.success,
      data: result,
      error: result.error,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to install hooks',
    };
    return res.status(500).json(response);
  }
});

// Uninstall Git hooks
hooksRoutes.post('/hooks/uninstall', async (req: Request, res: Response) => {
  try {
    const { projectPath: rawPath, useHusky } = req.body as { projectPath: string; useHusky?: boolean };

    const projectPath = resolveProjectPath(rawPath);

    const result = hooksService.uninstallHooks(projectPath, useHusky);

    const response: ApiResponse = {
      success: result.success,
      data: result,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to uninstall hooks',
    };
    return res.status(500).json(response);
  }
});

// Uninstall hooks for a specific repository
hooksRoutes.post('/hooks/uninstall/:repoPath', async (req: Request, res: Response) => {
  try {
    const { projectPath, useHusky } = req.body as { projectPath: string; useHusky?: boolean };
    const repoPath = req.params.repoPath;

    if (!projectPath) {
      const response: ApiResponse = {
        success: false,
        error: 'projectPath is required',
      };
      return res.status(400).json(response);
    }

    const result = hooksService.uninstallHooksForRepo(projectPath, String(repoPath ?? ''), useHusky);

    const response: ApiResponse = {
      success: result.success,
      data: result,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to uninstall hooks',
    };
    return res.status(500).json(response);
  }
});

// ========== CLAUDE HOOKS ==========

// Get Claude hooks status
hooksRoutes.get('/claude-hooks/status', async (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);

    const status = hooksService.getClaudeHooksStatus(projectPath);

    // Return format expected by frontend (ClaudeHooksStatusResponse type)
    return res.json(status);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get Claude hooks status' });
  }
});

// Add Claude hook
hooksRoutes.post('/claude-hooks/add', async (req: Request, res: Response) => {
  try {
    const { projectPath: rawPath, hook } = req.body as { projectPath: string; hook: ClaudeHookConfig };

    if (!hook) {
      const response: ApiResponse = {
        success: false,
        error: 'hook configuration is required',
      };
      return res.status(400).json(response);
    }

    const projectPath = resolveProjectPath(rawPath);

    const result = hooksService.addClaudeHook(projectPath, hook);

    const response: ApiResponse = {
      success: result.success,
      data: { added: result.success },
      error: result.error,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to add Claude hook',
    };
    return res.status(500).json(response);
  }
});

// Update Claude hook
hooksRoutes.post('/claude-hooks/update', async (req: Request, res: Response) => {
  try {
    const { projectPath: rawPath, hookId, config } = req.body as {
      projectPath: string;
      hookId: string;
      config: Partial<ClaudeHookConfig>;
    };

    if (!hookId) {
      const response: ApiResponse = {
        success: false,
        error: 'projectPath and hookId are required',
      };
      return res.status(400).json(response);
    }

    const projectPath = resolveProjectPath(rawPath);

    const result = hooksService.updateClaudeHook(projectPath, hookId, config);

    const response: ApiResponse = {
      success: result.success,
      data: { updated: result.success },
      error: result.error,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update Claude hook',
    };
    return res.status(500).json(response);
  }
});

// Remove Claude hook
hooksRoutes.post('/claude-hooks/remove', async (req: Request, res: Response) => {
  try {
    const { projectPath: rawPath, hookId } = req.body as { projectPath: string; hookId: string };

    if (!hookId) {
      const response: ApiResponse = {
        success: false,
        error: 'projectPath and hookId are required',
      };
      return res.status(400).json(response);
    }

    const projectPath = resolveProjectPath(rawPath);

    const result = hooksService.removeClaudeHook(projectPath, hookId);

    const response: ApiResponse = {
      success: result.success,
      data: { removed: result.success },
      error: result.error,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to remove Claude hook',
    };
    return res.status(500).json(response);
  }
});

// Apply Claude hook template
hooksRoutes.post('/claude-hooks/apply-template', async (req: Request, res: Response) => {
  try {
    const { projectPath: rawPath, templateId } = req.body as { projectPath: string; templateId: string };

    if (!templateId) {
      const response: ApiResponse = {
        success: false,
        error: 'projectPath and templateId are required',
      };
      return res.status(400).json(response);
    }

    const projectPath = resolveProjectPath(rawPath);

    const result = hooksService.applyClaudeTemplate(projectPath, templateId);

    const response: ApiResponse = {
      success: result.success,
      data: { applied: result.success },
      error: result.error,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to apply template',
    };
    return res.status(500).json(response);
  }
});

// Clear all Claude hooks
hooksRoutes.post('/claude-hooks/clear', async (req: Request, res: Response) => {
  try {
    const { projectPath: rawPath } = req.body as { projectPath: string };

    const projectPath = resolveProjectPath(rawPath);

    const result = hooksService.clearAllClaudeHooks(projectPath);

    const response: ApiResponse = {
      success: result.success,
      data: { cleared: result.success },
      error: result.error,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to clear hooks',
    };
    return res.status(500).json(response);
  }
});

// Export Claude hooks
hooksRoutes.get('/claude-hooks/export', async (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);

    const exported = hooksService.exportClaudeHooks(projectPath);

    const response: ApiResponse = {
      success: true,
      data: exported,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to export hooks',
    };
    return res.status(500).json(response);
  }
});

// Import Claude hooks
hooksRoutes.post('/claude-hooks/import', async (req: Request, res: Response) => {
  try {
    const { projectPath: rawPath, exported, merge } = req.body as {
      projectPath: string;
      exported: ClaudeHooksExport;
      merge?: boolean;
    };

    if (!exported) {
      const response: ApiResponse = {
        success: false,
        error: 'projectPath and exported data are required',
      };
      return res.status(400).json(response);
    }

    const projectPath = resolveProjectPath(rawPath);

    const result = hooksService.importClaudeHooks(projectPath, exported, merge !== false);

    const response: ApiResponse = {
      success: result.success,
      data: { imported: result.success },
      error: result.error,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to import hooks',
    };
    return res.status(500).json(response);
  }
});
