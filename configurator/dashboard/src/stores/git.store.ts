// SPDX-License-Identifier: MIT
/**
 * Git Store - Manages Git panel state and operations
 *
 * This store handles:
 * - Repository list and selection
 * - File changes (staged, unstaged, untracked)
 * - Branches
 * - Commit history
 * - Remote operations status
 */

import { create, type StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  GitRepoStatus,
  FileChange,
  Branch,
  CommitInfo,
  FileDiff,
  Remote,
  BranchComparison,
  CommitDetails,
} from '../types/git';

// ============================================
// API FUNCTIONS
// ============================================

const API_BASE = 'http://localhost:3456/api/git';

async function fetchApi<T>(
  endpoint: string,
  projectPath: string,
  options?: RequestInit
): Promise<T> {
  const url = new URL(`${API_BASE}${endpoint}`);
  url.searchParams.set('path', projectPath);

  const response = await fetch(url.toString(), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'API request failed');
  }

  return data.data;
}

// ============================================
// STORE TYPES
// ============================================

interface GitState {
  // ============================================
  // STATE
  // ============================================

  /** Available repositories in the project */
  repositories: GitRepoStatus[];

  /** Currently selected repository path */
  selectedRepo: string | null;

  /** File changes in selected repo */
  changes: FileChange[];

  /** Branches in selected repo */
  branches: Branch[];

  /** Commit history in selected repo */
  commits: CommitInfo[];

  /** Remotes in selected repo */
  remotes: Remote[];

  /** Currently viewing diff */
  currentDiff: FileDiff | null;

  /** Branch comparison result */
  branchComparison: BranchComparison | null;

  /** Loaded commit details (keyed by hash) */
  commitDetails: Map<string, CommitDetails>;

  /** Loading states */
  loading: {
    repos: boolean;
    changes: boolean;
    branches: boolean;
    commits: boolean;
    diff: boolean;
    operation: boolean;
  };

  /** Error message */
  error: string | null;

  /** Error type for special handling (e.g. auth errors) */
  errorType: 'auth' | null;

  /** Last refresh timestamp */
  lastRefresh: number | null;

  // ============================================
  // ACTIONS
  // ============================================

  /** Fetch all repositories */
  fetchRepos: (projectPath: string) => Promise<void>;

  /** Select a repository */
  selectRepo: (repoPath: string | null) => void;

  /** Fetch changes for selected repo */
  fetchChanges: (projectPath: string) => Promise<void>;

  /** Fetch branches for selected repo */
  fetchBranches: (projectPath: string) => Promise<void>;

  /** Fetch commit history for selected repo */
  fetchCommits: (projectPath: string, limit?: number) => Promise<void>;

  /** Fetch diff for a file */
  fetchDiff: (projectPath: string, filePath: string, staged: boolean) => Promise<void>;

  /** Fetch commit details */
  fetchCommitDetails: (projectPath: string, commitHash: string) => Promise<CommitDetails | null>;

  /** Clear current diff */
  clearDiff: () => void;

  /** Stage files */
  stageFiles: (projectPath: string, files: string[]) => Promise<void>;

  /** Stage all files */
  stageAll: (projectPath: string) => Promise<void>;

  /** Unstage files */
  unstageFiles: (projectPath: string, files: string[]) => Promise<void>;

  /** Unstage all files */
  unstageAll: (projectPath: string) => Promise<void>;

  /** Discard changes */
  discardChanges: (projectPath: string, files: string[], staged?: boolean) => Promise<void>;

  /** Create a commit */
  commit: (projectPath: string, message: string) => Promise<string>;

  /** Checkout a branch */
  checkoutBranch: (projectPath: string, branchName: string) => Promise<void>;

  /** Create a new branch */
  createBranch: (projectPath: string, branchName: string, checkout?: boolean) => Promise<void>;

  /** Delete a branch */
  deleteBranch: (projectPath: string, branchName: string, force?: boolean) => Promise<void>;

  /** Merge a branch */
  mergeBranch: (projectPath: string, sourceBranch: string) => Promise<void>;

  /** Compare branches */
  compareBranches: (projectPath: string, base: string, compare: string) => Promise<void>;

  /** Fetch from remote */
  fetch: (projectPath: string) => Promise<void>;

  /** Pull from remote */
  pull: (projectPath: string, rebase?: boolean) => Promise<void>;

  /** Push to remote */
  push: (projectPath: string, setUpstream?: boolean) => Promise<void>;

  /** Refresh all data */
  refresh: (projectPath: string) => Promise<void>;

  /** Start GitHub auth login flow */
  authLogin: () => Promise<{ code: string } | null>;

  /** Check auth status */
  checkAuthStatus: () => Promise<{ status: 'pending' | 'authenticated' | 'none'; account?: string }>;

  /** Clear error */
  clearError: () => void;

  /** Reset store */
  reset: () => void;
}

// ============================================
// INITIAL STATE
// ============================================

const initialState = {
  repositories: [] as GitRepoStatus[],
  selectedRepo: null as string | null,
  changes: [] as FileChange[],
  branches: [] as Branch[],
  commits: [] as CommitInfo[],
  remotes: [] as Remote[],
  currentDiff: null as FileDiff | null,
  branchComparison: null as BranchComparison | null,
  commitDetails: new Map<string, CommitDetails>(),
  loading: {
    repos: false,
    changes: false,
    branches: false,
    commits: false,
    diff: false,
    operation: false,
  },
  error: null as string | null,
  errorType: null as 'auth' | null,
  lastRefresh: null as number | null,
};

// ============================================
// HELPERS
// ============================================

const AUTH_ERROR_PATTERNS = [
  'repository not found',
  'authentication failed',
  'could not read username',
  'permission denied',
  'invalid credentials',
  'terminal prompts disabled',
  '401',
  '403',
];

function isAuthError(message: string): boolean {
  const lower = message.toLowerCase();
  return AUTH_ERROR_PATTERNS.some((p) => lower.includes(p));
}

// ============================================
// STORE
// ============================================

const storeCreator: StateCreator<GitState, [['zustand/devtools', never]], []> = (set, get) => ({
  ...initialState,

  // ============================================
  // FETCH ACTIONS
  // ============================================

      fetchRepos: async (projectPath: string) => {
        set((state) => ({ loading: { ...state.loading, repos: true } }), false, 'fetchRepos/start');

        try {
          const repos = await fetchApi<GitRepoStatus[]>('/repos', projectPath);
          set({ repositories: repos, error: null }, false, 'fetchRepos/success');

          // Auto-select first repo if none selected
          const firstRepo = repos[0];
          if (!get().selectedRepo && firstRepo) {
            set({ selectedRepo: firstRepo.path }, false, 'fetchRepos/autoSelect');
          }
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to fetch repos' }, false, 'fetchRepos/error');
        } finally {
          set((state) => ({ loading: { ...state.loading, repos: false } }), false, 'fetchRepos/end');
        }
      },

      selectRepo: (repoPath) => {
        set({ selectedRepo: repoPath, changes: [], branches: [], commits: [], currentDiff: null }, false, 'selectRepo');
      },

      fetchChanges: async (projectPath) => {
        const { selectedRepo } = get();
        if (!selectedRepo) return;

        set((state) => ({ loading: { ...state.loading, changes: true } }), false, 'fetchChanges/start');

        try {
          const url = new URL(`${API_BASE}/changes`);
          url.searchParams.set('path', projectPath);
          url.searchParams.set('repo', selectedRepo);

          const response = await fetch(url.toString());
          const data = await response.json();

          if (!data.success) throw new Error(data.error);

          set({ changes: data.data, error: null }, false, 'fetchChanges/success');
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to fetch changes' }, false, 'fetchChanges/error');
        } finally {
          set((state) => ({ loading: { ...state.loading, changes: false } }), false, 'fetchChanges/end');
        }
      },

      fetchBranches: async (projectPath) => {
        const { selectedRepo } = get();
        if (!selectedRepo) return;

        set((state) => ({ loading: { ...state.loading, branches: true } }), false, 'fetchBranches/start');

        try {
          const url = new URL(`${API_BASE}/branches`);
          url.searchParams.set('path', projectPath);
          url.searchParams.set('repo', selectedRepo);

          const response = await fetch(url.toString());
          const data = await response.json();

          if (!data.success) throw new Error(data.error);

          set({ branches: data.data, error: null }, false, 'fetchBranches/success');
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to fetch branches' }, false, 'fetchBranches/error');
        } finally {
          set((state) => ({ loading: { ...state.loading, branches: false } }), false, 'fetchBranches/end');
        }
      },

      fetchCommits: async (projectPath, limit = 50) => {
        const { selectedRepo } = get();
        if (!selectedRepo) return;

        set((state) => ({ loading: { ...state.loading, commits: true } }), false, 'fetchCommits/start');

        try {
          const url = new URL(`${API_BASE}/log`);
          url.searchParams.set('path', projectPath);
          url.searchParams.set('repo', selectedRepo);
          url.searchParams.set('limit', String(limit));

          const response = await fetch(url.toString());
          const data = await response.json();

          if (!data.success) throw new Error(data.error);

          set({ commits: data.data, error: null }, false, 'fetchCommits/success');
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to fetch commits' }, false, 'fetchCommits/error');
        } finally {
          set((state) => ({ loading: { ...state.loading, commits: false } }), false, 'fetchCommits/end');
        }
      },

      fetchDiff: async (projectPath, filePath, staged) => {
        const { selectedRepo } = get();
        if (!selectedRepo) return;

        set((state) => ({ loading: { ...state.loading, diff: true } }), false, 'fetchDiff/start');

        try {
          const url = new URL(`${API_BASE}/diff`);
          url.searchParams.set('path', projectPath);
          url.searchParams.set('repo', selectedRepo);
          url.searchParams.set('file', filePath);
          url.searchParams.set('staged', String(staged));

          const response = await fetch(url.toString());
          const data = await response.json();

          if (!data.success) throw new Error(data.error);

          set({ currentDiff: data.data, error: null }, false, 'fetchDiff/success');
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to fetch diff' }, false, 'fetchDiff/error');
        } finally {
          set((state) => ({ loading: { ...state.loading, diff: false } }), false, 'fetchDiff/end');
        }
      },

      clearDiff: () => {
        set({ currentDiff: null }, false, 'clearDiff');
      },

      fetchCommitDetails: async (projectPath, commitHash) => {
        const { selectedRepo, commitDetails } = get();
        if (!selectedRepo) return null;

        // Check cache first
        if (commitDetails.has(commitHash)) {
          return commitDetails.get(commitHash)!;
        }

        try {
          const url = new URL(`${API_BASE}/commit/${commitHash}`);
          url.searchParams.set('path', projectPath);
          url.searchParams.set('repo', selectedRepo);

          const response = await fetch(url.toString());
          const data = await response.json();

          if (!data.success) throw new Error(data.error);

          // Cache the result
          const details = data.data as CommitDetails;
          set((state) => {
            const newMap = new Map(state.commitDetails);
            newMap.set(commitHash, details);
            return { commitDetails: newMap };
          }, false, 'fetchCommitDetails/success');

          return details;
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to fetch commit details' }, false, 'fetchCommitDetails/error');
          return null;
        }
      },

      // ============================================
      // STAGING ACTIONS
      // ============================================

      stageFiles: async (projectPath, files) => {
        const { selectedRepo } = get();
        if (!selectedRepo) return;

        set((state) => ({ loading: { ...state.loading, operation: true } }), false, 'stageFiles/start');

        try {
          await fetch(`${API_BASE}/stage?path=${encodeURIComponent(projectPath)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoPath: selectedRepo, files }),
          });

          await get().fetchChanges(projectPath);
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to stage files' }, false, 'stageFiles/error');
        } finally {
          set((state) => ({ loading: { ...state.loading, operation: false } }), false, 'stageFiles/end');
        }
      },

      stageAll: async (projectPath) => {
        const { selectedRepo } = get();
        if (!selectedRepo) return;

        set((state) => ({ loading: { ...state.loading, operation: true } }), false, 'stageAll/start');

        try {
          await fetch(`${API_BASE}/stage-all?path=${encodeURIComponent(projectPath)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoPath: selectedRepo }),
          });

          await get().fetchChanges(projectPath);
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to stage all files' }, false, 'stageAll/error');
        } finally {
          set((state) => ({ loading: { ...state.loading, operation: false } }), false, 'stageAll/end');
        }
      },

      unstageFiles: async (projectPath, files) => {
        const { selectedRepo } = get();
        if (!selectedRepo) return;

        set((state) => ({ loading: { ...state.loading, operation: true } }), false, 'unstageFiles/start');

        try {
          await fetch(`${API_BASE}/unstage?path=${encodeURIComponent(projectPath)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoPath: selectedRepo, files }),
          });

          await get().fetchChanges(projectPath);
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to unstage files' }, false, 'unstageFiles/error');
        } finally {
          set((state) => ({ loading: { ...state.loading, operation: false } }), false, 'unstageFiles/end');
        }
      },

      unstageAll: async (projectPath) => {
        const { selectedRepo } = get();
        if (!selectedRepo) return;

        set((state) => ({ loading: { ...state.loading, operation: true } }), false, 'unstageAll/start');

        try {
          await fetch(`${API_BASE}/unstage-all?path=${encodeURIComponent(projectPath)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoPath: selectedRepo }),
          });

          await get().fetchChanges(projectPath);
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to unstage all files' }, false, 'unstageAll/error');
        } finally {
          set((state) => ({ loading: { ...state.loading, operation: false } }), false, 'unstageAll/end');
        }
      },

      discardChanges: async (projectPath, files, staged = false) => {
        const { selectedRepo } = get();
        if (!selectedRepo) return;

        set((state) => ({ loading: { ...state.loading, operation: true } }), false, 'discardChanges/start');

        try {
          await fetch(`${API_BASE}/discard?path=${encodeURIComponent(projectPath)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoPath: selectedRepo, files, staged }),
          });

          await get().fetchChanges(projectPath);
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to discard changes' }, false, 'discardChanges/error');
        } finally {
          set((state) => ({ loading: { ...state.loading, operation: false } }), false, 'discardChanges/end');
        }
      },

      // ============================================
      // COMMIT ACTIONS
      // ============================================

      commit: async (projectPath, message) => {
        const { selectedRepo } = get();
        if (!selectedRepo) throw new Error('No repository selected');

        set((state) => ({ loading: { ...state.loading, operation: true } }), false, 'commit/start');

        try {
          const response = await fetch(`${API_BASE}/commit?path=${encodeURIComponent(projectPath)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoPath: selectedRepo, message }),
          });

          const data = await response.json();
          if (!data.success) throw new Error(data.error);

          await get().refresh(projectPath);
          return data.data.hash;
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to create commit' }, false, 'commit/error');
          throw err;
        } finally {
          set((state) => ({ loading: { ...state.loading, operation: false } }), false, 'commit/end');
        }
      },

      // ============================================
      // BRANCH ACTIONS
      // ============================================

      checkoutBranch: async (projectPath, branchName) => {
        const { selectedRepo } = get();
        if (!selectedRepo) return;

        set((state) => ({ loading: { ...state.loading, operation: true } }), false, 'checkoutBranch/start');

        try {
          await fetch(`${API_BASE}/branch/checkout?path=${encodeURIComponent(projectPath)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoPath: selectedRepo, branchName }),
          });

          await get().refresh(projectPath);
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to checkout branch' }, false, 'checkoutBranch/error');
        } finally {
          set((state) => ({ loading: { ...state.loading, operation: false } }), false, 'checkoutBranch/end');
        }
      },

      createBranch: async (projectPath, branchName, checkout = false) => {
        const { selectedRepo } = get();
        if (!selectedRepo) return;

        set((state) => ({ loading: { ...state.loading, operation: true } }), false, 'createBranch/start');

        try {
          await fetch(`${API_BASE}/branch/create?path=${encodeURIComponent(projectPath)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoPath: selectedRepo, branchName, checkout }),
          });

          await get().fetchBranches(projectPath);
          if (checkout) {
            await get().refresh(projectPath);
          }
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to create branch' }, false, 'createBranch/error');
        } finally {
          set((state) => ({ loading: { ...state.loading, operation: false } }), false, 'createBranch/end');
        }
      },

      deleteBranch: async (projectPath, branchName, force = false) => {
        const { selectedRepo } = get();
        if (!selectedRepo) return;

        set((state) => ({ loading: { ...state.loading, operation: true } }), false, 'deleteBranch/start');

        try {
          await fetch(`${API_BASE}/branch/delete?path=${encodeURIComponent(projectPath)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoPath: selectedRepo, branchName, force }),
          });

          await get().fetchBranches(projectPath);
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to delete branch' }, false, 'deleteBranch/error');
        } finally {
          set((state) => ({ loading: { ...state.loading, operation: false } }), false, 'deleteBranch/end');
        }
      },

      mergeBranch: async (projectPath, sourceBranch) => {
        const { selectedRepo } = get();
        if (!selectedRepo) return;

        set((state) => ({ loading: { ...state.loading, operation: true } }), false, 'mergeBranch/start');

        try {
          await fetch(`${API_BASE}/branch/merge?path=${encodeURIComponent(projectPath)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoPath: selectedRepo, sourceBranch }),
          });

          await get().refresh(projectPath);
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to merge branch' }, false, 'mergeBranch/error');
        } finally {
          set((state) => ({ loading: { ...state.loading, operation: false } }), false, 'mergeBranch/end');
        }
      },

      compareBranches: async (projectPath, base, compare) => {
        const { selectedRepo } = get();
        if (!selectedRepo) return;

        set((state) => ({ loading: { ...state.loading, operation: true } }), false, 'compareBranches/start');

        try {
          const url = new URL(`${API_BASE}/branch/compare`);
          url.searchParams.set('path', projectPath);
          url.searchParams.set('repo', selectedRepo);
          url.searchParams.set('base', base);
          url.searchParams.set('compare', compare);

          const response = await fetch(url.toString());
          const data = await response.json();

          if (!data.success) throw new Error(data.error);

          set({ branchComparison: data.data, error: null }, false, 'compareBranches/success');
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to compare branches' }, false, 'compareBranches/error');
        } finally {
          set((state) => ({ loading: { ...state.loading, operation: false } }), false, 'compareBranches/end');
        }
      },

      // ============================================
      // REMOTE ACTIONS
      // ============================================

      fetch: async (projectPath) => {
        const { selectedRepo } = get();
        if (!selectedRepo) return;

        set((state) => ({ loading: { ...state.loading, operation: true } }), false, 'fetch/start');

        try {
          const response = await fetch(`${API_BASE}/fetch?path=${encodeURIComponent(projectPath)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoPath: selectedRepo }),
          });

          const data = await response.json();
          if (!data.success) throw new Error(data.error || 'Failed to fetch');

          set({ error: null, errorType: null }, false, 'fetch/success');
          await get().refresh(projectPath);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to fetch';
          set({
            error: message,
            errorType: isAuthError(message) ? 'auth' : null,
          }, false, 'fetch/error');
        } finally {
          set((state) => ({ loading: { ...state.loading, operation: false } }), false, 'fetch/end');
        }
      },

      pull: async (projectPath, rebase = false) => {
        const { selectedRepo } = get();
        if (!selectedRepo) return;

        set((state) => ({ loading: { ...state.loading, operation: true } }), false, 'pull/start');

        try {
          const response = await fetch(`${API_BASE}/pull?path=${encodeURIComponent(projectPath)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoPath: selectedRepo, rebase }),
          });

          const data = await response.json();
          if (!data.success) throw new Error(data.error || 'Failed to pull');

          set({ error: null, errorType: null }, false, 'pull/success');
          await get().refresh(projectPath);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to pull';
          set({
            error: message,
            errorType: isAuthError(message) ? 'auth' : null,
          }, false, 'pull/error');
        } finally {
          set((state) => ({ loading: { ...state.loading, operation: false } }), false, 'pull/end');
        }
      },

      push: async (projectPath, setUpstream = false) => {
        const { selectedRepo } = get();
        if (!selectedRepo) return;

        set((state) => ({ loading: { ...state.loading, operation: true } }), false, 'push/start');

        try {
          const response = await fetch(`${API_BASE}/push?path=${encodeURIComponent(projectPath)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoPath: selectedRepo, setUpstream }),
          });

          const data = await response.json();
          if (!data.success) throw new Error(data.error || 'Failed to push');

          set({ error: null, errorType: null }, false, 'push/success');
          await get().refresh(projectPath);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to push';
          set({
            error: message,
            errorType: isAuthError(message) ? 'auth' : null,
          }, false, 'push/error');
        } finally {
          set((state) => ({ loading: { ...state.loading, operation: false } }), false, 'push/end');
        }
      },

      // ============================================
      // UTILITY ACTIONS
      // ============================================

      refresh: async (projectPath) => {
        const { fetchRepos, fetchChanges, fetchBranches, fetchCommits } = get();

        await fetchRepos(projectPath);
        await Promise.all([
          fetchChanges(projectPath),
          fetchBranches(projectPath),
          fetchCommits(projectPath),
        ]);

        set({ lastRefresh: Date.now() }, false, 'refresh');
      },

      authLogin: async () => {
        try {
          const response = await fetch(`${API_BASE}/auth-login`, { method: 'POST' });
          const data = await response.json();
          if (!data.success) throw new Error(data.error);
          return data.data as { code: string };
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to start auth' }, false, 'authLogin/error');
          return null;
        }
      },

      checkAuthStatus: async () => {
        try {
          const response = await fetch(`${API_BASE}/auth-status`);
          const data = await response.json();
          return data.data as { status: 'pending' | 'authenticated' | 'none'; account?: string };
        } catch {
          return { status: 'none' as const };
        }
      },

      clearError: () => {
        set({ error: null, errorType: null }, false, 'clearError');
      },

      reset: () => {
        set(initialState, false, 'reset');
      },
});

export const useGitStore = create<GitState>()(
  devtools(storeCreator, { name: 'GitStore' })
);
