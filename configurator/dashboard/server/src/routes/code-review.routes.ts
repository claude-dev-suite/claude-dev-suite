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
import { resolveProjectPath } from '../utils/utilities.js';

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
    const { projectPath: rawPath, scope, selectedAgents, paths, repo } = req.body as {
      projectPath: string;
      scope: 'uncommitted' | 'full-project';
      selectedAgents: string[];
      paths?: string[];
      repo?: string;
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

    // Calculate working directory (like legacy)
    const workingDir = repo ? path.join(projectPath, repo) : projectPath;

    logger.debug('Building code review job', {
      projectPath,
      repo,
      workingDir,
      pathsCount: paths?.length || 0
    });

    // LIKE LEGACY: Verify selected paths exist AND are readable before building job
    let verifiedPaths = paths;
    if (paths && paths.length > 0 && scope === 'full-project') {
      const missingFiles: string[] = [];
      const existingFiles: string[] = [];

      for (const relPath of paths) {
        // Normalize path separators for Windows (like legacy)
        const normalizedPath = relPath.replace(/\//g, path.sep);
        const absPath = path.join(workingDir, normalizedPath);

        // Actually try to read the file, not just check existence (like legacy)
        try {
          fs.accessSync(absPath, fs.constants.R_OK);
          // Try reading first 100 bytes to verify it's actually readable
          const fd = fs.openSync(absPath, 'r');
          const buffer = Buffer.alloc(100);
          fs.readSync(fd, buffer, 0, 100, 0);
          fs.closeSync(fd);
          existingFiles.push(relPath);
        } catch (e) {
          missingFiles.push(relPath);
          logger.debug('File not readable', { path: absPath, error: (e as Error).message });
        }
      }

      logger.debug('File verification complete', {
        readable: existingFiles.length,
        notReadable: missingFiles.length
      });

      // Only use existing files
      if (existingFiles.length === 0) {
        const response: ApiResponse = {
          success: false,
          error: 'None of the selected files are readable. They may have been deleted, moved, or are OneDrive placeholders not synced locally.',
        };
        return res.status(400).json(response);
      }

      // Use only verified files
      verifiedPaths = existingFiles;
      if (missingFiles.length > 0) {
        logger.info('Filtered out unreadable files', { count: missingFiles.length });
      }
    }

    logger.debug('Building job with verified paths', { count: verifiedPaths?.length || 0 });

    const job = codeReviewService.buildReviewJob({
      scope,
      selectedAgents,
      paths: verifiedPaths,  // Use verified paths
      repo,
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
