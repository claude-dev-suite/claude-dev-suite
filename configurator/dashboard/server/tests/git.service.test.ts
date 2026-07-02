/**
 * Tests for git.service.ts
 *
 * We mock the git-helpers module (execGit / parseStatusV2) so no real git
 * process is spawned, and we mock git-security's getAbsolutePath so the
 * path validation does not require actual filesystem paths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';

// --- Mocks declared BEFORE importing the module under test ---

vi.mock('../src/services/git/git-helpers.js', () => ({
  execGit: vi.fn(),
  parseStatusV2: vi.fn(),
}));

vi.mock('../src/services/git/git-security.js', () => ({
  validateGitRef: vi.fn((ref: string) => ref),
  validateCommitHash: vi.fn((hash: string) => hash),
  sanitizeFilePath: vi.fn((fp: string) => fp),
  getAbsolutePath: vi.fn((_repoPath: string, projectPath: string) => projectPath),
}));

import { GitService } from '../src/services/git.service.js';
import * as helpers from '../src/services/git/git-helpers.js';
import * as security from '../src/services/git/git-security.js';

const execGitMock = vi.mocked(helpers.execGit);
const parseStatusV2Mock = vi.mocked(helpers.parseStatusV2);
const getAbsolutePathMock = vi.mocked(security.getAbsolutePath);

const PROJECT = '/tmp/test-project';
const REPO = '.';

beforeEach(() => {
  vi.resetAllMocks();
  // Default: getAbsolutePath returns the projectPath unchanged
  getAbsolutePathMock.mockImplementation((_r, p) => p);
});

// ----------------------------------------------------------------
// getRepoStatus
// ----------------------------------------------------------------
describe('GitService.getRepoStatus', () => {
  it('should return parsed repo status', () => {
    const statusOutput = '# branch.head main\n';
    execGitMock.mockReturnValueOnce(statusOutput); // status --porcelain=v2
    parseStatusV2Mock.mockReturnValueOnce({
      branch: 'main',
      tracking: 'origin/main',
      ahead: 1,
      behind: 2,
      files: [
        { path: 'a.ts', status: 'M', staged: true },
        { path: 'b.ts', status: 'M', staged: false },
        { path: 'c.ts', status: '?', staged: false },
      ],
    });
    execGitMock.mockReturnValueOnce('https://github.com/org/repo.git'); // remote get-url

    const status = GitService.getRepoStatus(REPO, PROJECT);

    expect(status.branch).toBe('main');
    expect(status.tracking).toBe('origin/main');
    expect(status.ahead).toBe(1);
    expect(status.behind).toBe(2);
    expect(status.staged).toBe(1);
    expect(status.unstaged).toBe(1);
    expect(status.untracked).toBe(1);
    expect(status.hasConflicts).toBe(false);
    expect(status.remoteUrl).toBe('https://github.com/org/repo.git');
    expect(status.name).toBe(path.basename(PROJECT));
  });

  it('should detect conflicts when a file has U status', () => {
    const statusOutput = '# branch.head main\n';
    execGitMock.mockReturnValueOnce(statusOutput);
    parseStatusV2Mock.mockReturnValueOnce({
      branch: 'main',
      tracking: undefined,
      ahead: 0,
      behind: 0,
      files: [{ path: 'conflict.ts', status: 'U', staged: false }],
    });
    execGitMock.mockImplementationOnce(() => { throw new Error('no remote'); });

    const status = GitService.getRepoStatus(REPO, PROJECT);

    expect(status.hasConflicts).toBe(true);
    expect(status.remoteUrl).toBeUndefined();
  });

  it('should handle missing remote gracefully', () => {
    execGitMock.mockReturnValueOnce('');
    parseStatusV2Mock.mockReturnValueOnce({
      branch: 'main',
      tracking: undefined,
      ahead: 0,
      behind: 0,
      files: [],
    });
    execGitMock.mockImplementationOnce(() => { throw new Error('no remote configured'); });

    const status = GitService.getRepoStatus(REPO, PROJECT);
    expect(status.remoteUrl).toBeUndefined();
  });
});

// ----------------------------------------------------------------
// getChanges
// ----------------------------------------------------------------
describe('GitService.getChanges', () => {
  it('should return file changes', () => {
    execGitMock.mockReturnValueOnce('');
    const expectedFiles = [
      { path: 'src/index.ts', status: 'M' as const, staged: true },
    ];
    parseStatusV2Mock.mockReturnValueOnce({
      branch: 'main',
      tracking: undefined,
      ahead: 0,
      behind: 0,
      files: expectedFiles,
    });

    const files = GitService.getChanges(REPO, PROJECT);
    expect(files).toEqual(expectedFiles);
  });
});

// ----------------------------------------------------------------
// getFileDiff
// ----------------------------------------------------------------
describe('GitService.getFileDiff', () => {
  it('should parse additions and deletions from diff output', () => {
    const diffOutput = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '+added line 1',
      '+added line 2',
      '-removed line',
    ].join('\n');
    execGitMock.mockReturnValueOnce(diffOutput);

    const diff = GitService.getFileDiff(REPO, PROJECT, 'src/foo.ts', false);
    expect(diff.path).toBe('src/foo.ts');
    expect(diff.additions).toBe(2);
    expect(diff.deletions).toBe(1);
    expect(diff.isBinary).toBe(false);
  });

  it('should detect binary files', () => {
    execGitMock.mockReturnValueOnce('Binary files a/image.png and b/image.png differ');

    const diff = GitService.getFileDiff(REPO, PROJECT, 'image.png');
    expect(diff.isBinary).toBe(true);
  });

  it('should return empty diff when execGit throws', () => {
    execGitMock.mockImplementationOnce(() => { throw new Error('not in repo'); });

    const diff = GitService.getFileDiff(REPO, PROJECT, 'missing.ts');
    expect(diff.diff).toBe('');
    expect(diff.additions).toBe(0);
    expect(diff.deletions).toBe(0);
  });

  it('should use --cached flag for staged diff', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.getFileDiff(REPO, PROJECT, 'src/staged.ts', true);

    expect(execGitMock).toHaveBeenCalledWith(
      ['diff', '--cached', '--', 'src/staged.ts'],
      PROJECT
    );
  });
});

// ----------------------------------------------------------------
// stageFiles / stageAll / unstageFiles / unstageAll
// ----------------------------------------------------------------
describe('GitService staging', () => {
  it('stageFiles should call execGit with add -- and files', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.stageFiles(REPO, PROJECT, ['src/a.ts', 'src/b.ts']);

    expect(execGitMock).toHaveBeenCalledWith(
      ['add', '--', 'src/a.ts', 'src/b.ts'],
      PROJECT
    );
  });

  it('stageAll should call execGit with add -A', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.stageAll(REPO, PROJECT);

    expect(execGitMock).toHaveBeenCalledWith(['add', '-A'], PROJECT);
  });

  it('unstageFiles should call execGit with restore --staged --', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.unstageFiles(REPO, PROJECT, ['src/a.ts']);

    expect(execGitMock).toHaveBeenCalledWith(
      ['restore', '--staged', '--', 'src/a.ts'],
      PROJECT
    );
  });

  it('unstageAll should call execGit with reset HEAD', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.unstageAll(REPO, PROJECT);

    expect(execGitMock).toHaveBeenCalledWith(['reset', 'HEAD'], PROJECT);
  });

  it('discardChanges with staged=true should unstage then restore', () => {
    execGitMock.mockReturnValue('');
    GitService.discardChanges(REPO, PROJECT, ['src/a.ts'], true);

    // First call: restore --staged -- (unstage)
    expect(execGitMock).toHaveBeenNthCalledWith(1, ['restore', '--staged', '--', 'src/a.ts'], PROJECT);
    // Second call: restore --
    expect(execGitMock).toHaveBeenNthCalledWith(2, ['restore', '--', 'src/a.ts'], PROJECT);
  });

  it('discardChanges with staged=false should only restore', () => {
    execGitMock.mockReturnValue('');
    GitService.discardChanges(REPO, PROJECT, ['src/a.ts'], false);

    expect(execGitMock).toHaveBeenCalledTimes(1);
    expect(execGitMock).toHaveBeenCalledWith(['restore', '--', 'src/a.ts'], PROJECT);
  });
});

// ----------------------------------------------------------------
// commit
// ----------------------------------------------------------------
describe('GitService.commit', () => {
  it('should commit and return HEAD hash', () => {
    execGitMock.mockReturnValueOnce(''); // commit
    execGitMock.mockReturnValueOnce('abc1234'); // rev-parse HEAD

    const hash = GitService.commit(REPO, PROJECT, 'feat: add tests');
    expect(hash).toBe('abc1234');
    expect(execGitMock).toHaveBeenNthCalledWith(
      1,
      ['commit', '-m', 'feat: add tests'],
      PROJECT
    );
  });

  it('should use --amend flag when amend=true', () => {
    execGitMock.mockReturnValue('def5678');
    GitService.commit(REPO, PROJECT, 'amend msg', true);

    expect(execGitMock).toHaveBeenNthCalledWith(
      1,
      ['commit', '--amend', '-m', 'amend msg'],
      PROJECT
    );
  });
});

// ----------------------------------------------------------------
// getLog
// ----------------------------------------------------------------
describe('GitService.getLog', () => {
  it('should parse commit entries correctly', () => {
    const hash = 'a'.repeat(40);
    const entry = [
      hash,          // full hash
      'aaaaaaa',     // short hash
      'feat: test',  // subject
      '',            // body (empty)
      'Author Name',
      'author@example.com',
      '2024-01-01T00:00:00Z',
      'parent1 parent2',
      '---COMMIT_END---',
    ].join('\n');

    execGitMock.mockReturnValueOnce(entry);

    const log = GitService.getLog(REPO, PROJECT, 10);
    expect(log).toHaveLength(1);
    expect(log[0].hash).toBe(hash);
    expect(log[0].shortHash).toBe('aaaaaaa');
    expect(log[0].subject).toBe('feat: test');
  });

  it('should return empty array for empty output', () => {
    execGitMock.mockReturnValueOnce('');
    const log = GitService.getLog(REPO, PROJECT);
    expect(log).toEqual([]);
  });
});

// ----------------------------------------------------------------
// getCommitDetails
// ----------------------------------------------------------------
describe('GitService.getCommitDetails', () => {
  it('should parse commit details and changed files', () => {
    const hash = 'abc1234def5678aaa';
    const commitOutput = [
      hash + '0000000000000000000000', // padded to simulate full hash line
      'abc1234',
      'feat: initial commit',
      '',
      'Author Name',
      'author@example.com',
      '2024-01-01T00:00:00Z',
      '',
    ].join('\n');

    execGitMock.mockReturnValueOnce(commitOutput.trim()); // show --format
    execGitMock.mockReturnValueOnce('M\tsrc/index.ts\nA\tsrc/new.ts'); // show --name-status

    const details = GitService.getCommitDetails(REPO, PROJECT, 'abc1234');
    expect(details.commit).toBeDefined();
    expect(details.files.length).toBeGreaterThan(0);
    expect(details.files[0].path).toBe('src/index.ts');
  });

  it('should handle renamed files', () => {
    const commitOutput = [
      'hash000000000000000000000000000000000000',
      'hash000',
      'refactor: rename',
      '',
      'Author',
      'author@example.com',
      '2024-01-01T00:00:00Z',
      '',
    ].join('\n');
    execGitMock.mockReturnValueOnce(commitOutput.trim());
    execGitMock.mockReturnValueOnce('R100\told.ts\tnew.ts');

    const details = GitService.getCommitDetails(REPO, PROJECT, 'hash0000');
    const renames = details.files.filter((f) => f.status === 'R');
    expect(renames).toHaveLength(1);
    expect(renames[0].oldPath).toBe('old.ts');
    expect(renames[0].path).toBe('new.ts');
  });
});

// ----------------------------------------------------------------
// cherryPick / revert
// ----------------------------------------------------------------
describe('GitService cherry-pick and revert', () => {
  it('cherryPick should pass validated hashes to execGit', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.cherryPick(REPO, PROJECT, ['abc1234', 'def5678']);

    expect(execGitMock).toHaveBeenCalledWith(
      ['cherry-pick', 'abc1234', 'def5678'],
      PROJECT
    );
  });

  it('cherryPick with noCommit=true should add -n flag', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.cherryPick(REPO, PROJECT, ['abc1234'], true);

    expect(execGitMock).toHaveBeenCalledWith(
      ['cherry-pick', '-n', 'abc1234'],
      PROJECT
    );
  });

  it('revert should call execGit with revert args', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.revert(REPO, PROJECT, 'abc1234');

    expect(execGitMock).toHaveBeenCalledWith(['revert', 'abc1234'], PROJECT);
  });

  it('revert with noCommit=true should add -n flag', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.revert(REPO, PROJECT, 'abc1234', true);

    expect(execGitMock).toHaveBeenCalledWith(['revert', '-n', 'abc1234'], PROJECT);
  });
});

// ----------------------------------------------------------------
// getBranches
// ----------------------------------------------------------------
describe('GitService.getBranches', () => {
  it('should parse local branches', () => {
    const localOutput = 'main|abc1234|*|origin/main|ahead 1 behind 2\nfeature|def5678| || |\n';
    execGitMock.mockReturnValueOnce(localOutput); // local branches
    execGitMock.mockReturnValueOnce(''); // remote branches (empty)

    const branches = GitService.getBranches(REPO, PROJECT);

    const main = branches.find((b) => b.name === 'main');
    expect(main).toBeDefined();
    expect(main?.isCurrent).toBe(true);
    expect(main?.ahead).toBe(1);
    expect(main?.behind).toBe(2);
    expect(main?.isRemote).toBe(false);
  });

  it('should include remote branches', () => {
    execGitMock.mockReturnValueOnce('main|abc1234|*||\n');
    execGitMock.mockReturnValueOnce('origin/main|abc1234\norigin/feature|def5678\n');

    const branches = GitService.getBranches(REPO, PROJECT);
    const remotes = branches.filter((b) => b.isRemote);
    expect(remotes).toHaveLength(2);
  });

  it('should skip remote HEAD entries', () => {
    execGitMock.mockReturnValueOnce('main|abc1234|*||\n');
    execGitMock.mockReturnValueOnce('origin/HEAD|abc1234\norigin/main|abc1234\n');

    const branches = GitService.getBranches(REPO, PROJECT);
    const remotes = branches.filter((b) => b.isRemote);
    expect(remotes.every((b) => !b.name.includes('HEAD'))).toBe(true);
  });

  it('should handle remote listing failure gracefully', () => {
    execGitMock.mockReturnValueOnce('main|abc1234|*||\n');
    execGitMock.mockImplementationOnce(() => { throw new Error('no remote'); });

    const branches = GitService.getBranches(REPO, PROJECT);
    expect(branches.filter((b) => !b.isRemote)).toHaveLength(1);
  });
});

// ----------------------------------------------------------------
// createBranch / checkout / deleteBranch / merge
// ----------------------------------------------------------------
describe('GitService branch operations', () => {
  it('createBranch with checkout=false uses "branch" command', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.createBranch(REPO, PROJECT, 'feature/new', undefined, false);

    expect(execGitMock).toHaveBeenCalledWith(['branch', 'feature/new'], PROJECT);
  });

  it('createBranch with checkout=true uses "checkout -b"', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.createBranch(REPO, PROJECT, 'feature/new', undefined, true);

    expect(execGitMock).toHaveBeenCalledWith(['checkout', '-b', 'feature/new'], PROJECT);
  });

  it('createBranch with startPoint adds it to args', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.createBranch(REPO, PROJECT, 'feature/new', 'main', false);

    expect(execGitMock).toHaveBeenCalledWith(['branch', 'feature/new', 'main'], PROJECT);
  });

  it('checkout with create=false uses "checkout"', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.checkout(REPO, PROJECT, 'main');

    expect(execGitMock).toHaveBeenCalledWith(['checkout', 'main'], PROJECT);
  });

  it('checkout with create=true uses "checkout -b"', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.checkout(REPO, PROJECT, 'new-branch', true);

    expect(execGitMock).toHaveBeenCalledWith(['checkout', '-b', 'new-branch'], PROJECT);
  });

  it('deleteBranch with force=false uses "-d"', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.deleteBranch(REPO, PROJECT, 'old-branch');

    expect(execGitMock).toHaveBeenCalledWith(['branch', '-d', 'old-branch'], PROJECT);
  });

  it('deleteBranch with force=true uses "-D"', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.deleteBranch(REPO, PROJECT, 'old-branch', true);

    expect(execGitMock).toHaveBeenCalledWith(['branch', '-D', 'old-branch'], PROJECT);
  });

  it('merge with noFastForward=true adds --no-ff', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.merge(REPO, PROJECT, 'feature', true);

    expect(execGitMock).toHaveBeenCalledWith(
      ['merge', '--no-ff', 'feature'],
      PROJECT
    );
  });

  it('merge with message adds -m', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.merge(REPO, PROJECT, 'feature', false, 'Merge feature');

    expect(execGitMock).toHaveBeenCalledWith(
      ['merge', '-m', 'Merge feature', 'feature'],
      PROJECT
    );
  });
});

// ----------------------------------------------------------------
// compareBranches
// ----------------------------------------------------------------
describe('GitService.compareBranches', () => {
  it('should parse ahead/behind counts and files', () => {
    execGitMock.mockReturnValueOnce('3\t2'); // rev-list count
    execGitMock.mockReturnValueOnce(''); // getLog's execGit call
    execGitMock.mockReturnValueOnce('M\tsrc/changed.ts'); // diff --name-status

    parseStatusV2Mock.mockReturnValueOnce({
      branch: 'main',
      tracking: undefined,
      ahead: 0,
      behind: 0,
      files: [],
    });

    const comparison = GitService.compareBranches(REPO, PROJECT, 'main', 'feature');
    expect(comparison.behind).toBe(3);
    expect(comparison.ahead).toBe(2);
    expect(comparison.files.length).toBeGreaterThan(0);
    expect(comparison.files[0].path).toBe('src/changed.ts');
  });
});

// ----------------------------------------------------------------
// getRemotes
// ----------------------------------------------------------------
describe('GitService.getRemotes', () => {
  it('should parse remote -v output', () => {
    const output = [
      'origin\thttps://github.com/org/repo.git (fetch)',
      'origin\thttps://github.com/org/repo.git (push)',
      'upstream\thttps://github.com/upstream/repo.git (fetch)',
      'upstream\thttps://github.com/upstream/repo.git (push)',
    ].join('\n');
    execGitMock.mockReturnValueOnce(output);

    const remotes = GitService.getRemotes(REPO, PROJECT);
    expect(remotes).toHaveLength(2);
    const origin = remotes.find((r) => r.name === 'origin');
    expect(origin?.fetchUrl).toBe('https://github.com/org/repo.git');
    expect(origin?.pushUrl).toBe('https://github.com/org/repo.git');
  });

  it('should return empty array for no remotes', () => {
    execGitMock.mockReturnValueOnce('');
    const remotes = GitService.getRemotes(REPO, PROJECT);
    expect(remotes).toEqual([]);
  });
});

// ----------------------------------------------------------------
// fetch / pull / push
// ----------------------------------------------------------------
describe('GitService remote operations', () => {
  it('fetch with defaults uses "fetch origin"', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.fetch(REPO, PROJECT);

    expect(execGitMock).toHaveBeenCalledWith(['fetch', 'origin'], PROJECT);
  });

  it('fetch with prune adds --prune', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.fetch(REPO, PROJECT, undefined, true);

    expect(execGitMock).toHaveBeenCalledWith(['fetch', '--prune', 'origin'], PROJECT);
  });

  it('fetch with all=true adds --all', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.fetch(REPO, PROJECT, undefined, false, true);

    expect(execGitMock).toHaveBeenCalledWith(['fetch', '--all'], PROJECT);
  });

  it('pull with rebase=true adds --rebase', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.pull(REPO, PROJECT, 'origin', 'main', true);

    expect(execGitMock).toHaveBeenCalledWith(['pull', '--rebase', 'origin', 'main'], PROJECT);
  });

  it('push with setUpstream=true adds -u', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.push(REPO, PROJECT, 'origin', 'feature', true);

    expect(execGitMock).toHaveBeenCalledWith(['push', '-u', 'origin', 'feature'], PROJECT);
  });

  it('push with force=true adds --force', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.push(REPO, PROJECT, 'origin', 'feature', false, true);

    expect(execGitMock).toHaveBeenCalledWith(['push', '--force', 'origin', 'feature'], PROJECT);
  });

  it('push with forceWithLease=true adds --force-with-lease (overrides force)', () => {
    execGitMock.mockReturnValueOnce('');
    GitService.push(REPO, PROJECT, 'origin', 'feature', false, true, true);

    expect(execGitMock).toHaveBeenCalledWith(
      ['push', '--force-with-lease', 'origin', 'feature'],
      PROJECT
    );
  });
});
