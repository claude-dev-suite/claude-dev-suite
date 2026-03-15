// SPDX-License-Identifier: MIT
/**
 * Code Review API Routes
 *
 * Endpoints for code review functionality.
 */

import path from 'path';
import * as fs from 'fs';
import { Router, type Request, type Response } from 'express';
import { CodeReviewService } from '../services/code-review.service.js';
import type { ApiResponse } from '../types.js';
import { getLogger } from '../utils/logger.js';
import { resolveProjectPath, PathValidationError } from '../utils/utilities.js';

const logger = getLogger('CodeReview');

export const codeReviewRoutes = Router();
const codeReviewService = new CodeReviewService();

// Get review options (available review types)
codeReviewRoutes.get('/code-review/options', (_req: Request, res: Response) => {
  try {
    const options = codeReviewService.getReviewOptions();

    const response: ApiResponse = {
      success: true,
      data: options,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get review options',
    };
    return res.status(500).json(response);
  }
});

// List source files for review
codeReviewRoutes.get('/code-review/files', (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const result = codeReviewService.listSourceFiles(projectPath);

    const response: ApiResponse = {
      success: true,
      data: result,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to list source files',
    };
    return res.status(500).json(response);
  }
});

// Get diff for review
codeReviewRoutes.get('/code-review/diff', (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const scope = (req.query.scope as 'uncommitted' | 'full-project') || 'uncommitted';
    const repoPath = req.query.repo as string | undefined;

    const result = codeReviewService.getDiffForReview(projectPath, scope, repoPath);

    const response: ApiResponse = {
      success: true,
      data: result,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get diff',
    };
    return res.status(500).json(response);
  }
});

// Get full project code (for full-project review)
codeReviewRoutes.get('/code-review/full-code', (req: Request, res: Response) => {
  try {
    const projectPath = resolveProjectPath(req.query.path);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const maxFiles = req.query.maxFiles ? parseInt(req.query.maxFiles as string, 10) : undefined;
    const maxSize = req.query.maxSize ? parseInt(req.query.maxSize as string, 10) : undefined;

    const result = codeReviewService.getFullProjectCode(projectPath, {
      maxFiles,
      maxSize,
    });

    const response: ApiResponse = {
      success: true,
      data: result,
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get project code',
    };
    return res.status(500).json(response);
  }
});

// Build review job
codeReviewRoutes.post('/code-review/build-job', (req: Request, res: Response) => {
  try {
    const { projectPath: rawPath, scope, selectedAgents, paths, repo, depth } = req.body as {
      projectPath: string;
      scope: 'uncommitted' | 'full-project';
      selectedAgents: string[];
      paths?: string[];
      repo?: string;
      depth?: 'quick' | 'deep';
    };

    // Validate required fields
    if (!scope || !selectedAgents || selectedAgents.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: 'scope and selectedAgents are required',
      };
      return res.status(400).json(response);
    }

    // Validate scope
    if (scope !== 'uncommitted' && scope !== 'full-project') {
      const response: ApiResponse = {
        success: false,
        error: 'scope must be "uncommitted" or "full-project"',
      };
      return res.status(400).json(response);
    }

    const projectPath = resolveProjectPath(rawPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    // Calculate working directory (like legacy)
    let workingDir = repo ? path.join(projectPath, repo) : projectPath;
    workingDir = resolveProjectPath(workingDir);
    if (!path.isAbsolute(workingDir)) throw new PathValidationError('Path must be rooted');

    logger.debug('Building code review job', {
      projectPath,
      repo,
      workingDir,
      pathsCount: paths?.length || 0
    });

    // Verify selected paths exist before building job
    let verifiedPaths = paths;
    if (paths && paths.length > 0 && scope === 'full-project') {
      const missingFiles: string[] = [];
      const existingFiles: string[] = [];

      for (const relPath of paths) {
        // SECURITY: Skip paths with traversal sequences
        if (relPath.includes('..')) continue;
        // Normalize path separators for Windows
        const normalizedPath = relPath.replace(/\//g, path.sep);
        const absPath = path.join(workingDir, normalizedPath);
        // Verify the resolved path stays within the working directory
        const realAbsPath = path.resolve(absPath);
        if (!realAbsPath.startsWith(workingDir + path.sep) && realAbsPath !== workingDir) continue;

        try {
          const stats = fs.statSync(absPath);
          if (stats.isDirectory()) {
            // Directories are valid as prefix filters — just verify they exist
            existingFiles.push(relPath);
          } else {
            // For files, verify they are readable
            fs.accessSync(absPath, fs.constants.R_OK);
            existingFiles.push(relPath);
          }
        } catch (e) {
          missingFiles.push(relPath);
          logger.debug('Path not accessible', { path: absPath, error: (e as Error).message });
        }
      }

      logger.debug('Path verification complete', {
        accessible: existingFiles.length,
        notAccessible: missingFiles.length
      });

      // Only use existing paths
      if (existingFiles.length === 0) {
        const response: ApiResponse = {
          success: false,
          error: 'None of the selected files/directories are accessible.',
        };
        return res.status(400).json(response);
      }

      verifiedPaths = existingFiles;
      if (missingFiles.length > 0) {
        logger.info('Filtered out inaccessible paths', { count: missingFiles.length });
      }
    }

    logger.debug('Building job with verified paths', { count: verifiedPaths?.length || 0 });

    const job = codeReviewService.buildReviewJob({
      scope,
      selectedAgents,
      paths: verifiedPaths,
      repo,
      depth: depth === 'deep' ? 'deep' : 'quick',
    });

    // Include projectPath in response (like legacy)
    const response: ApiResponse = {
      success: true,
      data: {
        ...job,
        projectPath: workingDir,
      },
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to build review job',
    };
    return res.status(500).json(response);
  }
});

// Parse agent results
codeReviewRoutes.post('/code-review/parse-results', (req: Request, res: Response) => {
  try {
    const { agentId, output } = req.body as {
      agentId: string;
      output: string;
    };

    if (!agentId || !output) {
      const response: ApiResponse = {
        success: false,
        error: 'agentId and output are required',
      };
      return res.status(400).json(response);
    }

    const issues = codeReviewService.parseAgentResults(agentId, output);
    const summary = codeReviewService.getSummary(issues);

    const response: ApiResponse = {
      success: true,
      data: { issues, summary },
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to parse results',
    };
    return res.status(500).json(response);
  }
});

// Check if review should block (based on issues)
codeReviewRoutes.post('/code-review/should-block', (req: Request, res: Response) => {
  try {
    const { issues, threshold } = req.body as {
      issues: Array<{ severity: string }>;
      threshold?: 'critical' | 'high' | 'medium' | 'low';
    };

    if (!issues) {
      const response: ApiResponse = {
        success: false,
        error: 'issues array is required',
      };
      return res.status(400).json(response);
    }

    const summary = codeReviewService.getSummary(issues as never);
    const shouldBlock = codeReviewService.shouldBlock(summary, threshold);

    const response: ApiResponse = {
      success: true,
      data: { shouldBlock, summary },
    };

    return res.json(response);
  } catch (err) {
    const response: ApiResponse = {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to check blocking status',
    };
    return res.status(500).json(response);
  }
});
