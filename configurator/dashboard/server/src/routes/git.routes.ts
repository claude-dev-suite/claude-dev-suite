// SPDX-License-Identifier: MIT
/**
 * Git API Routes
 *
 * Endpoints for Git operations in the dashboard.
 */

import { Router, type Request, type Response } from 'express';
import { GitService } from '../services/git.service.js';
import { DetectionService } from '../services/detection.service.js';
import type { ApiResponse } from '../types.js';
import type {
  StageFilesRequest,
  DiscardChangesRequest,
  CreateCommitRequest,
  CreateBranchRequest,
  CheckoutBranchRequest,
  DeleteBranchRequest,
  MergeBranchRequest,
  CherryPickRequest,
  RevertRequest,
  PushRequest,
  PullRequest,
  FetchRequest,
} from '../types/git.js';

export const gitRoutes = Router();
const detectionService = new DetectionService();

// ============================================
// REPOSITORY STATUS
// ============================================

/**
 * GET /api/git/repos
 * Get all Git repositories in the project with their status
 */
gitRoutes.get('/repos', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;

    if (!projectPath) {
      return res.status(400).json({
        success: false,
        error: 'Project path is required',
      } as ApiResponse);
    }

    // Detect git repos
    const repos = await detectionService.detectGitRepos(projectPath);

    // Get status for each repo
    const reposWithStatus = repos.map((repo) => {
      try {
        return GitService.getRepoStatus(repo.path, projectPath);
      } catch (err) {
        return {
          path: repo.path,
          name: repo.name,
          branch: 'unknown',
          ahead: 0,
          behind: 0,
          staged: 0,
          unstaged: 0,
          untracked: 0,
          hasConflicts: false,
          error: err instanceof Error ? err.message : 'Failed to get status',
        };
      }
    });

    return res.json({
      success: true,
      data: reposWithStatus,
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get repositories',
    } as ApiResponse);
  }
});

/**
 * GET /api/git/status
 * Get status of a specific repository
 */
gitRoutes.get('/status', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const repoPath = req.query.repo as string;

    if (!projectPath || !repoPath) {
      return res.status(400).json({
        success: false,
        error: 'Project path and repo path are required',
      } as ApiResponse);
    }

    const status = GitService.getRepoStatus(repoPath, projectPath);

    return res.json({
      success: true,
      data: status,
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get status',
    } as ApiResponse);
  }
});

// ============================================
// FILE CHANGES
// ============================================

/**
 * GET /api/git/changes
 * Get file changes in a repository
 */
gitRoutes.get('/changes', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const repoPath = req.query.repo as string;

    if (!projectPath || !repoPath) {
      return res.status(400).json({
        success: false,
        error: 'Project path and repo path are required',
      } as ApiResponse);
    }

    const changes = GitService.getChanges(repoPath, projectPath);

    return res.json({
      success: true,
      data: changes,
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get changes',
    } as ApiResponse);
  }
});

/**
 * GET /api/git/diff
 * Get diff for a specific file
 */
gitRoutes.get('/diff', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const repoPath = req.query.repo as string;
    const filePath = req.query.file as string;
    const staged = req.query.staged === 'true';

    if (!projectPath || !repoPath || !filePath) {
      return res.status(400).json({
        success: false,
        error: 'Project path, repo path, and file path are required',
      } as ApiResponse);
    }

    const diff = GitService.getFileDiff(repoPath, projectPath, filePath, staged);

    return res.json({
      success: true,
      data: diff,
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get diff',
    } as ApiResponse);
  }
});

// ============================================
// STAGING
// ============================================

/**
 * POST /api/git/stage
 * Stage files
 */
gitRoutes.post('/stage', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const { repoPath, files } = req.body as StageFilesRequest;

    if (!projectPath || !repoPath || !files?.length) {
      return res.status(400).json({
        success: false,
        error: 'Project path, repo path, and files are required',
      } as ApiResponse);
    }

    GitService.stageFiles(repoPath, projectPath, files);

    return res.json({
      success: true,
      message: `Staged ${files.length} file(s)`,
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to stage files',
    } as ApiResponse);
  }
});

/**
 * POST /api/git/stage-all
 * Stage all files
 */
gitRoutes.post('/stage-all', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const { repoPath } = req.body as { repoPath: string };

    if (!projectPath || !repoPath) {
      return res.status(400).json({
        success: false,
        error: 'Project path and repo path are required',
      } as ApiResponse);
    }

    GitService.stageAll(repoPath, projectPath);

    return res.json({
      success: true,
      message: 'Staged all files',
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to stage all files',
    } as ApiResponse);
  }
});

/**
 * POST /api/git/unstage
 * Unstage files
 */
gitRoutes.post('/unstage', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const { repoPath, files } = req.body as StageFilesRequest;

    if (!projectPath || !repoPath || !files?.length) {
      return res.status(400).json({
        success: false,
        error: 'Project path, repo path, and files are required',
      } as ApiResponse);
    }

    GitService.unstageFiles(repoPath, projectPath, files);

    return res.json({
      success: true,
      message: `Unstaged ${files.length} file(s)`,
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to unstage files',
    } as ApiResponse);
  }
});

/**
 * POST /api/git/unstage-all
 * Unstage all files
 */
gitRoutes.post('/unstage-all', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const { repoPath } = req.body as { repoPath: string };

    if (!projectPath || !repoPath) {
      return res.status(400).json({
        success: false,
        error: 'Project path and repo path are required',
      } as ApiResponse);
    }

    GitService.unstageAll(repoPath, projectPath);

    return res.json({
      success: true,
      message: 'Unstaged all files',
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to unstage all files',
    } as ApiResponse);
  }
});

/**
 * POST /api/git/discard
 * Discard changes in files
 */
gitRoutes.post('/discard', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const { repoPath, files, staged } = req.body as DiscardChangesRequest;

    if (!projectPath || !repoPath || !files?.length) {
      return res.status(400).json({
        success: false,
        error: 'Project path, repo path, and files are required',
      } as ApiResponse);
    }

    GitService.discardChanges(repoPath, projectPath, files, staged);

    return res.json({
      success: true,
      message: `Discarded changes in ${files.length} file(s)`,
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to discard changes',
    } as ApiResponse);
  }
});

// ============================================
// COMMITS
// ============================================

/**
 * POST /api/git/commit
 * Create a commit
 */
gitRoutes.post('/commit', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const { repoPath, message, amend } = req.body as CreateCommitRequest;

    if (!projectPath || !repoPath || !message) {
      return res.status(400).json({
        success: false,
        error: 'Project path, repo path, and message are required',
      } as ApiResponse);
    }

    const hash = GitService.commit(repoPath, projectPath, message, amend);

    return res.json({
      success: true,
      data: { hash },
      message: 'Commit created successfully',
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create commit',
    } as ApiResponse);
  }
});

/**
 * GET /api/git/log
 * Get commit log
 */
gitRoutes.get('/log', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const repoPath = req.query.repo as string;
    const limit = parseInt(req.query.limit as string) || 50;
    const from = req.query.from as string;
    const to = req.query.to as string;

    if (!projectPath || !repoPath) {
      return res.status(400).json({
        success: false,
        error: 'Project path and repo path are required',
      } as ApiResponse);
    }

    const commits = GitService.getLog(repoPath, projectPath, limit, from, to);

    return res.json({
      success: true,
      data: commits,
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get log',
    } as ApiResponse);
  }
});

/**
 * GET /api/git/commit/:hash
 * Get details of a specific commit including files changed
 */
gitRoutes.get('/commit/:hash', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const repoPath = req.query.repo as string;
    const commitHash = req.params.hash;

    if (!projectPath || !repoPath || !commitHash) {
      return res.status(400).json({
        success: false,
        error: 'Project path, repo path, and commit hash are required',
      } as ApiResponse);
    }

    const details = GitService.getCommitDetails(repoPath, projectPath, String(commitHash));

    return res.json({
      success: true,
      data: details,
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get commit details',
    } as ApiResponse);
  }
});

/**
 * POST /api/git/cherry-pick
 * Cherry-pick commits
 */
gitRoutes.post('/cherry-pick', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const { repoPath, commits, noCommit } = req.body as CherryPickRequest;

    if (!projectPath || !repoPath || !commits?.length) {
      return res.status(400).json({
        success: false,
        error: 'Project path, repo path, and commits are required',
      } as ApiResponse);
    }

    GitService.cherryPick(repoPath, projectPath, commits, noCommit);

    return res.json({
      success: true,
      message: `Cherry-picked ${commits.length} commit(s)`,
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to cherry-pick',
    } as ApiResponse);
  }
});

/**
 * POST /api/git/revert
 * Revert a commit
 */
gitRoutes.post('/revert', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const { repoPath, commit, noCommit } = req.body as RevertRequest;

    if (!projectPath || !repoPath || !commit) {
      return res.status(400).json({
        success: false,
        error: 'Project path, repo path, and commit are required',
      } as ApiResponse);
    }

    GitService.revert(repoPath, projectPath, commit, noCommit);

    return res.json({
      success: true,
      message: `Reverted commit ${commit}`,
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to revert',
    } as ApiResponse);
  }
});

// ============================================
// BRANCHES
// ============================================

/**
 * GET /api/git/branches
 * Get all branches
 */
gitRoutes.get('/branches', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const repoPath = req.query.repo as string;

    if (!projectPath || !repoPath) {
      return res.status(400).json({
        success: false,
        error: 'Project path and repo path are required',
      } as ApiResponse);
    }

    const branches = GitService.getBranches(repoPath, projectPath);

    return res.json({
      success: true,
      data: branches,
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get branches',
    } as ApiResponse);
  }
});

/**
 * POST /api/git/branch/create
 * Create a new branch
 */
gitRoutes.post('/branch/create', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const { repoPath, branchName, startPoint, checkout } =
      req.body as CreateBranchRequest;

    if (!projectPath || !repoPath || !branchName) {
      return res.status(400).json({
        success: false,
        error: 'Project path, repo path, and branch name are required',
      } as ApiResponse);
    }

    GitService.createBranch(repoPath, projectPath, branchName, startPoint, checkout);

    return res.json({
      success: true,
      message: `Branch '${branchName}' created`,
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create branch',
    } as ApiResponse);
  }
});

/**
 * POST /api/git/branch/checkout
 * Checkout a branch
 */
gitRoutes.post('/branch/checkout', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const { repoPath, branchName, create } = req.body as CheckoutBranchRequest;

    if (!projectPath || !repoPath || !branchName) {
      return res.status(400).json({
        success: false,
        error: 'Project path, repo path, and branch name are required',
      } as ApiResponse);
    }

    GitService.checkout(repoPath, projectPath, branchName, create);

    return res.json({
      success: true,
      message: `Checked out '${branchName}'`,
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to checkout branch',
    } as ApiResponse);
  }
});

/**
 * POST /api/git/branch/delete
 * Delete a branch
 */
gitRoutes.post('/branch/delete', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const { repoPath, branchName, force } = req.body as DeleteBranchRequest;

    if (!projectPath || !repoPath || !branchName) {
      return res.status(400).json({
        success: false,
        error: 'Project path, repo path, and branch name are required',
      } as ApiResponse);
    }

    GitService.deleteBranch(repoPath, projectPath, branchName, force);

    return res.json({
      success: true,
      message: `Branch '${branchName}' deleted`,
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to delete branch',
    } as ApiResponse);
  }
});

/**
 * POST /api/git/branch/merge
 * Merge a branch
 */
gitRoutes.post('/branch/merge', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const { repoPath, sourceBranch, noFastForward, message } =
      req.body as MergeBranchRequest;

    if (!projectPath || !repoPath || !sourceBranch) {
      return res.status(400).json({
        success: false,
        error: 'Project path, repo path, and source branch are required',
      } as ApiResponse);
    }

    GitService.merge(repoPath, projectPath, sourceBranch, noFastForward, message);

    return res.json({
      success: true,
      message: `Merged '${sourceBranch}'`,
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to merge branch',
    } as ApiResponse);
  }
});

/**
 * GET /api/git/branch/compare
 * Compare two branches
 */
gitRoutes.get('/branch/compare', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const repoPath = req.query.repo as string;
    const baseBranch = req.query.base as string;
    const compareBranch = req.query.compare as string;

    if (!projectPath || !repoPath || !baseBranch || !compareBranch) {
      return res.status(400).json({
        success: false,
        error: 'Project path, repo path, base branch, and compare branch are required',
      } as ApiResponse);
    }

    const comparison = GitService.compareBranches(
      repoPath,
      projectPath,
      baseBranch,
      compareBranch
    );

    return res.json({
      success: true,
      data: comparison,
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to compare branches',
    } as ApiResponse);
  }
});

// ============================================
// REMOTES
// ============================================

/**
 * GET /api/git/remotes
 * Get remotes
 */
gitRoutes.get('/remotes', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const repoPath = req.query.repo as string;

    if (!projectPath || !repoPath) {
      return res.status(400).json({
        success: false,
        error: 'Project path and repo path are required',
      } as ApiResponse);
    }

    const remotes = GitService.getRemotes(repoPath, projectPath);

    return res.json({
      success: true,
      data: remotes,
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to get remotes',
    } as ApiResponse);
  }
});

/**
 * POST /api/git/fetch
 * Fetch from remote
 */
gitRoutes.post('/fetch', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const { repoPath, remote, prune, all } = req.body as FetchRequest;

    if (!projectPath || !repoPath) {
      return res.status(400).json({
        success: false,
        error: 'Project path and repo path are required',
      } as ApiResponse);
    }

    GitService.fetch(repoPath, projectPath, remote, prune, all);

    return res.json({
      success: true,
      message: 'Fetch completed',
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch',
    } as ApiResponse);
  }
});

/**
 * POST /api/git/pull
 * Pull from remote
 */
gitRoutes.post('/pull', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const { repoPath, remote, branch, rebase } = req.body as PullRequest;

    if (!projectPath || !repoPath) {
      return res.status(400).json({
        success: false,
        error: 'Project path and repo path are required',
      } as ApiResponse);
    }

    GitService.pull(repoPath, projectPath, remote, branch, rebase);

    return res.json({
      success: true,
      message: 'Pull completed',
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to pull',
    } as ApiResponse);
  }
});

/**
 * POST /api/git/push
 * Push to remote
 */
gitRoutes.post('/push', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    const { repoPath, remote, branch, setUpstream, force, forceWithLease } =
      req.body as PushRequest;

    if (!projectPath || !repoPath) {
      return res.status(400).json({
        success: false,
        error: 'Project path and repo path are required',
      } as ApiResponse);
    }

    GitService.push(
      repoPath,
      projectPath,
      remote,
      branch,
      setUpstream,
      force,
      forceWithLease
    );

    return res.json({
      success: true,
      message: 'Push completed',
    } as ApiResponse);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : 'Failed to push',
    } as ApiResponse);
  }
});
