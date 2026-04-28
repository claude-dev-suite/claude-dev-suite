// SPDX-License-Identifier: MIT
/**
 * Git Routes Tests
 *
 * Tests for git route handlers using supertest.
 * Services are fully mocked so no real git commands run.
 * A real temporary directory is used so resolveProjectPath doesn't throw.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { createTempDir, cleanupTempDir } from '../test-utils.js';

// Mock services BEFORE importing routes
vi.mock('../../src/services/git.service.js');
vi.mock('../../src/services/detection.service.js');

import { GitService } from '../../src/services/git.service.js';
import { DetectionService } from '../../src/services/detection.service.js';
import { gitRoutes } from '../../src/routes/git.routes.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let PROJECT_PATH: string;
const REPO_PATH_REL = 'my-repo'; // used as repo query param (relative to project)

const MOCK_REPO_STATUS = {
  path: '/repo',
  name: 'my-project',
  branch: 'main',
  ahead: 0,
  behind: 0,
  staged: 1,
  unstaged: 2,
  untracked: 3,
  hasConflicts: false,
};

const MOCK_CHANGES = [
  { file: 'src/index.ts', status: 'modified', staged: false },
];

const MOCK_COMMITS = [
  { hash: 'abc123', message: 'feat: add feature', author: 'dev', date: '2024-01-01' },
];

const MOCK_BRANCHES = {
  local: ['main', 'feature/foo'],
  remote: ['origin/main'],
  current: 'main',
};

const MOCK_REMOTES = [
  { name: 'origin', fetchUrl: 'https://github.com/user/repo.git', pushUrl: 'https://github.com/user/repo.git' },
];

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/git', gitRoutes);
  return app;
}

// ---------------------------------------------------------------------------

describe('Git Routes - HTTP Integration', () => {
  let app: Express;
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = createTempDir('git-routes-test-');
    PROJECT_PATH = tmpDir;
  });

  afterAll(() => {
    cleanupTempDir(tmpDir);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  // -------------------------------------------------------------------------
  // GET /api/git/repos
  // -------------------------------------------------------------------------
  describe('GET /repos', () => {
    it('should return repos with status (detection success)', async () => {
      // The route creates DetectionService at module load time.
      // All instances share the mocked prototype.
      vi.mocked(DetectionService.prototype.detectGitRepos).mockResolvedValue([
        { path: PROJECT_PATH, name: 'my-project' },
      ]);
      vi.mocked(GitService.getRepoStatus).mockReturnValue(MOCK_REPO_STATUS);

      const res = await request(app).get('/api/git/repos').query({ path: PROJECT_PATH });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 500 when detection throws', async () => {
      vi.mocked(DetectionService.prototype.detectGitRepos).mockRejectedValue(
        new Error('access denied')
      );

      const res = await request(app).get('/api/git/repos').query({ path: PROJECT_PATH });

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/git/status
  // -------------------------------------------------------------------------
  describe('GET /status', () => {
    it('should return repo status', async () => {
      vi.mocked(GitService.getRepoStatus).mockReturnValue(MOCK_REPO_STATUS);

      const res = await request(app)
        .get('/api/git/status')
        .query({ path: PROJECT_PATH, repo: REPO_PATH_REL });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.branch).toBe('main');
    });

    it('should return 400 when repo is missing', async () => {
      const res = await request(app)
        .get('/api/git/status')
        .query({ path: PROJECT_PATH });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(GitService.getRepoStatus).mockImplementation(() => {
        throw new Error('git binary missing');
      });

      const res = await request(app)
        .get('/api/git/status')
        .query({ path: PROJECT_PATH, repo: REPO_PATH_REL });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/git/changes
  // -------------------------------------------------------------------------
  describe('GET /changes', () => {
    it('should return file changes', async () => {
      vi.mocked(GitService.getChanges).mockReturnValue(MOCK_CHANGES);

      const res = await request(app)
        .get('/api/git/changes')
        .query({ path: PROJECT_PATH, repo: REPO_PATH_REL });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when repo is missing', async () => {
      const res = await request(app)
        .get('/api/git/changes')
        .query({ path: PROJECT_PATH });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/git/diff
  // -------------------------------------------------------------------------
  describe('GET /diff', () => {
    it('should return file diff', async () => {
      vi.mocked(GitService.getFileDiff).mockReturnValue('diff content');

      const res = await request(app)
        .get('/api/git/diff')
        .query({ path: PROJECT_PATH, repo: REPO_PATH_REL, file: 'src/index.ts' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when file is missing', async () => {
      const res = await request(app)
        .get('/api/git/diff')
        .query({ path: PROJECT_PATH, repo: REPO_PATH_REL });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/git/stage
  // -------------------------------------------------------------------------
  describe('POST /stage', () => {
    it('should stage files', async () => {
      vi.mocked(GitService.stageFiles).mockReturnValue(undefined);

      const res = await request(app)
        .post('/api/git/stage')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL, files: ['src/index.ts'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when repoPath or files are missing', async () => {
      const res = await request(app)
        .post('/api/git/stage')
        .query({ path: PROJECT_PATH })
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/git/stage-all
  // -------------------------------------------------------------------------
  describe('POST /stage-all', () => {
    it('should stage all files', async () => {
      vi.mocked(GitService.stageAll).mockReturnValue(undefined);

      const res = await request(app)
        .post('/api/git/stage-all')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when repoPath is missing', async () => {
      const res = await request(app)
        .post('/api/git/stage-all')
        .query({ path: PROJECT_PATH })
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/git/unstage
  // -------------------------------------------------------------------------
  describe('POST /unstage', () => {
    it('should unstage files', async () => {
      vi.mocked(GitService.unstageFiles).mockReturnValue(undefined);

      const res = await request(app)
        .post('/api/git/unstage')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL, files: ['src/index.ts'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when files are missing', async () => {
      const res = await request(app)
        .post('/api/git/unstage')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/git/unstage-all
  // -------------------------------------------------------------------------
  describe('POST /unstage-all', () => {
    it('should unstage all files', async () => {
      vi.mocked(GitService.unstageAll).mockReturnValue(undefined);

      const res = await request(app)
        .post('/api/git/unstage-all')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when repoPath is missing', async () => {
      const res = await request(app)
        .post('/api/git/unstage-all')
        .query({ path: PROJECT_PATH })
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/git/discard
  // -------------------------------------------------------------------------
  describe('POST /discard', () => {
    it('should discard changes', async () => {
      vi.mocked(GitService.discardChanges).mockReturnValue(undefined);

      const res = await request(app)
        .post('/api/git/discard')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL, files: ['src/index.ts'], staged: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when files are missing', async () => {
      const res = await request(app)
        .post('/api/git/discard')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/git/commit
  // -------------------------------------------------------------------------
  describe('POST /commit', () => {
    it('should create a commit', async () => {
      vi.mocked(GitService.commit).mockReturnValue('abc123');

      const res = await request(app)
        .post('/api/git/commit')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL, message: 'feat: add feature' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hash).toBe('abc123');
    });

    it('should return 400 when message is missing', async () => {
      const res = await request(app)
        .post('/api/git/commit')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL });

      expect(res.status).toBe(400);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(GitService.commit).mockImplementation(() => {
        throw new Error('nothing to commit');
      });

      const res = await request(app)
        .post('/api/git/commit')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL, message: 'feat: x' });

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/git/log
  // -------------------------------------------------------------------------
  describe('GET /log', () => {
    it('should return commit log', async () => {
      vi.mocked(GitService.getLog).mockReturnValue(MOCK_COMMITS);

      const res = await request(app)
        .get('/api/git/log')
        .query({ path: PROJECT_PATH, repo: REPO_PATH_REL });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return 400 when repo is missing', async () => {
      const res = await request(app)
        .get('/api/git/log')
        .query({ path: PROJECT_PATH });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/git/commit/:hash
  // -------------------------------------------------------------------------
  describe('GET /commit/:hash', () => {
    it('should return commit details', async () => {
      vi.mocked(GitService.getCommitDetails).mockReturnValue({ ...MOCK_COMMITS[0], files: [] });

      const res = await request(app)
        .get('/api/git/commit/abc123')
        .query({ path: PROJECT_PATH, repo: REPO_PATH_REL });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when repo is missing', async () => {
      const res = await request(app)
        .get('/api/git/commit/abc123')
        .query({ path: PROJECT_PATH });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/git/cherry-pick
  // -------------------------------------------------------------------------
  describe('POST /cherry-pick', () => {
    it('should cherry-pick commits', async () => {
      vi.mocked(GitService.cherryPick).mockReturnValue(undefined);

      const res = await request(app)
        .post('/api/git/cherry-pick')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL, commits: ['abc123'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when commits are missing', async () => {
      const res = await request(app)
        .post('/api/git/cherry-pick')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/git/revert
  // -------------------------------------------------------------------------
  describe('POST /revert', () => {
    it('should revert a commit', async () => {
      vi.mocked(GitService.revert).mockReturnValue(undefined);

      const res = await request(app)
        .post('/api/git/revert')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL, commit: 'abc123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when commit is missing', async () => {
      const res = await request(app)
        .post('/api/git/revert')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/git/branches
  // -------------------------------------------------------------------------
  describe('GET /branches', () => {
    it('should return all branches', async () => {
      vi.mocked(GitService.getBranches).mockReturnValue(MOCK_BRANCHES);

      const res = await request(app)
        .get('/api/git/branches')
        .query({ path: PROJECT_PATH, repo: REPO_PATH_REL });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.current).toBe('main');
    });

    it('should return 400 when repo is missing', async () => {
      const res = await request(app)
        .get('/api/git/branches')
        .query({ path: PROJECT_PATH });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/git/branch/create
  // -------------------------------------------------------------------------
  describe('POST /branch/create', () => {
    it('should create a branch', async () => {
      vi.mocked(GitService.createBranch).mockReturnValue(undefined);

      const res = await request(app)
        .post('/api/git/branch/create')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL, branchName: 'feature/new' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when branchName is missing', async () => {
      const res = await request(app)
        .post('/api/git/branch/create')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/git/branch/checkout
  // -------------------------------------------------------------------------
  describe('POST /branch/checkout', () => {
    it('should checkout a branch', async () => {
      vi.mocked(GitService.checkout).mockReturnValue(undefined);

      const res = await request(app)
        .post('/api/git/branch/checkout')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL, branchName: 'main' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when branchName is missing', async () => {
      const res = await request(app)
        .post('/api/git/branch/checkout')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/git/branch/delete
  // -------------------------------------------------------------------------
  describe('POST /branch/delete', () => {
    it('should delete a branch', async () => {
      vi.mocked(GitService.deleteBranch).mockReturnValue(undefined);

      const res = await request(app)
        .post('/api/git/branch/delete')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL, branchName: 'feature/old' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when branchName is missing', async () => {
      const res = await request(app)
        .post('/api/git/branch/delete')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/git/branch/merge
  // -------------------------------------------------------------------------
  describe('POST /branch/merge', () => {
    it('should merge a branch', async () => {
      vi.mocked(GitService.merge).mockReturnValue(undefined);

      const res = await request(app)
        .post('/api/git/branch/merge')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL, sourceBranch: 'feature/foo' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when sourceBranch is missing', async () => {
      const res = await request(app)
        .post('/api/git/branch/merge')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/git/branch/compare
  // -------------------------------------------------------------------------
  describe('GET /branch/compare', () => {
    it('should compare two branches', async () => {
      vi.mocked(GitService.compareBranches).mockReturnValue({ ahead: 2, behind: 1, commits: [] });

      const res = await request(app)
        .get('/api/git/branch/compare')
        .query({ path: PROJECT_PATH, repo: REPO_PATH_REL, base: 'main', compare: 'feature/foo' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when base or compare are missing', async () => {
      const res = await request(app)
        .get('/api/git/branch/compare')
        .query({ path: PROJECT_PATH, repo: REPO_PATH_REL });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/git/remotes
  // -------------------------------------------------------------------------
  describe('GET /remotes', () => {
    it('should return remotes', async () => {
      vi.mocked(GitService.getRemotes).mockReturnValue(MOCK_REMOTES);

      const res = await request(app)
        .get('/api/git/remotes')
        .query({ path: PROJECT_PATH, repo: REPO_PATH_REL });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data[0].name).toBe('origin');
    });

    it('should return 400 when repo is missing', async () => {
      const res = await request(app)
        .get('/api/git/remotes')
        .query({ path: PROJECT_PATH });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/git/fetch
  // -------------------------------------------------------------------------
  describe('POST /fetch', () => {
    it('should fetch from remote', async () => {
      vi.mocked(GitService.fetch).mockReturnValue(undefined);

      const res = await request(app)
        .post('/api/git/fetch')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL, remote: 'origin' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when repoPath is missing', async () => {
      const res = await request(app)
        .post('/api/git/fetch')
        .query({ path: PROJECT_PATH })
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/git/pull
  // -------------------------------------------------------------------------
  describe('POST /pull', () => {
    it('should pull from remote', async () => {
      vi.mocked(GitService.pull).mockReturnValue(undefined);

      const res = await request(app)
        .post('/api/git/pull')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when repoPath is missing', async () => {
      const res = await request(app)
        .post('/api/git/pull')
        .query({ path: PROJECT_PATH })
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/git/push
  // -------------------------------------------------------------------------
  describe('POST /push', () => {
    it('should push to remote', async () => {
      vi.mocked(GitService.push).mockReturnValue(undefined);

      const res = await request(app)
        .post('/api/git/push')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when repoPath is missing', async () => {
      const res = await request(app)
        .post('/api/git/push')
        .query({ path: PROJECT_PATH })
        .send({});

      // push route checks !repoPath → 400
      expect(res.status).toBe(400);
    });

    it('should return 500 on push error', async () => {
      vi.mocked(GitService.push).mockImplementation(() => {
        throw new Error('rejected: non-fast-forward');
      });

      const res = await request(app)
        .post('/api/git/push')
        .query({ path: PROJECT_PATH })
        .send({ repoPath: REPO_PATH_REL });

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/git/auth-status
  // -------------------------------------------------------------------------
  describe('GET /auth-status', () => {
    it('should return auth status', async () => {
      const res = await request(app).get('/api/git/auth-status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('status');
    });
  });
});
