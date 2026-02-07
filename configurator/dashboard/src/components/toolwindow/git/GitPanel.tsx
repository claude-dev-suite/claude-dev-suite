// SPDX-License-Identifier: MIT
/**
 * GitPanel - Main Git tool window content
 *
 * Features:
 * - Repository selector (for multi-repo projects)
 * - Accordion sections: Changes, Branches, History, Remote
 * - Quick actions footer
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useGitStore } from '../../../stores/git.store';
import { useProjectStore } from '../../../stores/project.store';
import { DiffPreview } from './DiffPreview';
import { AccordionSection } from './AccordionSection';
import { FileTree, buildFileTree } from './FileTree';
import { BranchItem } from './BranchItem';
import { CommitItem } from './CommitItem';

// Auto-refresh interval in milliseconds (30 seconds)
const AUTO_REFRESH_INTERVAL = 30000;

// ============================================
// GitAuthModal
// ============================================

function GitAuthModal({ code, onClose, onAuthenticated }: {
  code: string;
  onClose: () => void;
  onAuthenticated: () => void;
}) {
  const { checkAuthStatus } = useGitStore();
  const [status, setStatus] = useState<'pending' | 'authenticated' | 'none'>('pending');
  const [account, setAccount] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      const result = await checkAuthStatus();
      setStatus(result.status);
      if (result.account) setAccount(result.account);

      if (result.status === 'authenticated') {
        clearInterval(interval);
        setTimeout(() => {
          onAuthenticated();
          onClose();
        }, 1500);
      } else if (result.status === 'none') {
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [checkAuthStatus, onAuthenticated, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface-800 border border-surface-600 rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
        {status === 'authenticated' ? (
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-green-400 font-medium">Authenticated successfully</p>
            {account && <p className="text-xs text-surface-400 mt-1">Signed in as {account}</p>}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-surface-100">GitHub Authentication</h3>
              <button onClick={onClose} className="p-1 hover:bg-surface-700 rounded text-surface-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-xs text-surface-300 mb-4">
              A browser window should have opened. Enter this code to authenticate:
            </p>

            <div className="bg-surface-900 border border-surface-600 rounded-lg py-4 px-6 text-center mb-4">
              <span className="text-2xl font-mono font-bold text-accent-400 tracking-widest">{code}</span>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-surface-400">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Waiting for authentication...</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Accordion section type
type Section = 'changes' | 'branches' | 'history' | 'remote';

export function GitPanel() {
  const projectPath = useProjectStore((s) => s.projectPath);
  const {
    repositories,
    selectedRepo,
    changes,
    branches,
    commits,
    loading,
    error,
    errorType,
    currentDiff,
    commitDetails,
    fetchRepos,
    selectRepo,
    fetchChanges,
    fetchBranches,
    fetchCommits,
    fetchDiff,
    fetchCommitDetails,
    clearDiff,
    stageFiles,
    stageAll,
    unstageFiles,
    unstageAll,
    discardChanges,
    commit,
    checkoutBranch,
    fetch: gitFetch,
    pull,
    push,
    authLogin,
    clearError,
    refresh,
  } = useGitStore();

  // Expanded sections
  const [expandedSections, setExpandedSections] = useState<Set<Section>>(
    new Set(['changes'])
  );

  // Expanded folders in file trees (separate for each section)
  const [expandedStagedFolders, setExpandedStagedFolders] = useState<Set<string>>(new Set());
  const [expandedUnstagedFolders, setExpandedUnstagedFolders] = useState<Set<string>>(new Set());
  const [expandedUntrackedFolders, setExpandedUntrackedFolders] = useState<Set<string>>(new Set());

  // Commit message
  const [commitMessage, setCommitMessage] = useState('');

  // Expanded commits in history
  const [expandedCommits, setExpandedCommits] = useState<Set<string>>(new Set());
  const [loadingCommitDetails, setLoadingCommitDetails] = useState<Set<string>>(new Set());

  // Auth modal state
  const [authModalCode, setAuthModalCode] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Toggle folder expansion for each section
  const toggleStagedFolder = useCallback((path: string) => {
    setExpandedStagedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleUnstagedFolder = useCallback((path: string) => {
    setExpandedUnstagedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleUntrackedFolder = useCallback((path: string) => {
    setExpandedUntrackedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // Open diff preview for a file
  const handleViewDiff = useCallback(
    (filePath: string, staged: boolean) => {
      if (projectPath) {
        fetchDiff(projectPath, filePath, staged);
      }
    },
    [projectPath, fetchDiff]
  );

  // Toggle commit expansion and load details if needed
  const toggleCommitExpansion = useCallback(
    async (commitHash: string) => {
      if (expandedCommits.has(commitHash)) {
        setExpandedCommits((prev) => {
          const next = new Set(prev);
          next.delete(commitHash);
          return next;
        });
      } else {
        setExpandedCommits((prev) => new Set(prev).add(commitHash));

        if (!commitDetails.has(commitHash) && projectPath) {
          setLoadingCommitDetails((prev) => new Set(prev).add(commitHash));
          await fetchCommitDetails(projectPath, commitHash);
          setLoadingCommitDetails((prev) => {
            const next = new Set(prev);
            next.delete(commitHash);
            return next;
          });
        }
      }
    },
    [expandedCommits, commitDetails, projectPath, fetchCommitDetails]
  );

  // Initial load
  useEffect(() => {
    if (projectPath) {
      fetchRepos(projectPath);
    }
  }, [projectPath, fetchRepos]);

  // Load data when repo is selected
  useEffect(() => {
    if (projectPath && selectedRepo) {
      fetchChanges(projectPath);
      fetchBranches(projectPath);
      fetchCommits(projectPath, 20);
    }
  }, [projectPath, selectedRepo, fetchChanges, fetchBranches, fetchCommits]);

  // Track if auto-refresh is in progress
  const isRefreshing = useRef(false);

  // Auto-refresh when panel is visible
  useEffect(() => {
    if (!projectPath || !selectedRepo) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const doRefresh = async () => {
      if (isRefreshing.current || document.hidden) return;
      if (loading.repos || loading.changes || loading.branches || loading.commits || loading.operation) return;

      isRefreshing.current = true;
      try {
        await refresh(projectPath);
      } finally {
        isRefreshing.current = false;
      }
    };

    const startInterval = () => {
      if (!intervalId) {
        intervalId = setInterval(doRefresh, AUTO_REFRESH_INTERVAL);
      }
    };

    const stopInterval = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopInterval();
      } else {
        doRefresh();
        startInterval();
      }
    };

    startInterval();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopInterval();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [projectPath, selectedRepo, refresh, loading]);

  // Toggle section
  const toggleSection = useCallback((section: Section) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  // Get current repo status
  const currentRepo = repositories.find((r) => r.path === selectedRepo);

  // Group changes
  const stagedChanges = changes.filter((c) => c.staged);
  const unstagedChanges = changes.filter((c) => !c.staged && c.status !== '?');
  const untrackedChanges = changes.filter((c) => c.status === '?');

  // Build file trees
  const stagedTree = buildFileTree(stagedChanges);
  const unstagedTree = buildFileTree(unstagedChanges);
  const untrackedTree = buildFileTree(untrackedChanges);

  // Handle commit
  const handleCommit = async () => {
    if (!projectPath || !commitMessage.trim()) return;
    try {
      await commit(projectPath, commitMessage);
      setCommitMessage('');
    } catch {
      // Error is handled in store
    }
  };

  // Handle refresh
  const handleRefresh = async () => {
    if (projectPath) {
      await refresh(projectPath);
    }
  };

  // Handle GitHub auth login
  const handleAuthLogin = async () => {
    setAuthLoading(true);
    const result = await authLogin();
    setAuthLoading(false);
    if (result?.code) {
      setAuthModalCode(result.code);
    }
  };

  // Check if error is for SSH remote
  const isSshRemote = error?.toLowerCase().includes('permission denied (publickey)') ||
    error?.toLowerCase().includes('host key verification failed');

  if (!projectPath) {
    return (
      <div className="flex items-center justify-center h-full text-surface-400">
        <p className="text-sm">No project selected</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Error banner */}
      {error && errorType === 'auth' && (
        <div className="px-3 py-2 bg-amber-500/20 border-b border-amber-500/30 text-amber-300 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>
                {isSshRemote
                  ? 'SSH key authentication required — configure your SSH key'
                  : 'Authentication required to access this repository'}
              </span>
            </div>
            <button onClick={clearError} className="p-0.5 hover:bg-amber-500/30 rounded ml-2 flex-shrink-0">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {!isSshRemote && (
            <button
              onClick={handleAuthLogin}
              disabled={authLoading}
              className="mt-2 px-3 py-1 text-xs font-medium bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded transition-colors"
            >
              {authLoading ? 'Starting...' : 'Login to GitHub'}
            </button>
          )}
        </div>
      )}
      {error && errorType !== 'auth' && (
        <div className="px-3 py-2 bg-red-500/20 border-b border-red-500/30 text-red-400 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={clearError} className="p-0.5 hover:bg-red-500/30 rounded">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Repository selector */}
      <div className="px-3 py-2 border-b border-surface-700">
        <div className="flex items-center gap-2">
          <select
            value={selectedRepo || ''}
            onChange={(e) => selectRepo(e.target.value || null)}
            className="flex-1 px-2 py-1 text-xs bg-surface-900 border border-surface-600 rounded text-surface-100"
            disabled={loading.repos}
          >
            {repositories.length === 0 && <option value="">No repositories found</option>}
            {repositories.map((repo) => (
              <option key={repo.path} value={repo.path}>
                {repo.name} ({repo.branch})
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <span
              className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"
              title={`Auto-refresh every ${AUTO_REFRESH_INTERVAL / 1000}s`}
            />
            <button
              onClick={handleRefresh}
              disabled={loading.repos || loading.changes}
              className="p-1 rounded hover:bg-surface-700 text-surface-400 hover:text-surface-200 disabled:opacity-50"
              title={`Refresh (auto-refresh every ${AUTO_REFRESH_INTERVAL / 1000}s)`}
            >
              <svg
                className={`w-4 h-4 ${loading.repos || loading.changes ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Status summary */}
        {currentRepo && (
          <div className="flex items-center gap-2 mt-2 text-xs">
            <span className="text-surface-400">{currentRepo.branch}</span>
            {currentRepo.tracking && (
              <>
                <span className="text-surface-500">→</span>
                <span className="text-surface-400">{currentRepo.tracking}</span>
              </>
            )}
            {(currentRepo.ahead > 0 || currentRepo.behind > 0) && (
              <span className="text-surface-500">
                {currentRepo.ahead > 0 && <span className="text-green-400">↑{currentRepo.ahead}</span>}
                {currentRepo.behind > 0 && <span className="text-red-400 ml-1">↓{currentRepo.behind}</span>}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Changes Section */}
        <AccordionSection
          title="Changes"
          badge={changes.length > 0 ? String(changes.length) : undefined}
          expanded={expandedSections.has('changes')}
          onToggle={() => toggleSection('changes')}
          loading={loading.changes}
        >
          {changes.length === 0 ? (
            <div className="px-3 py-4 text-center text-surface-400 text-xs">No changes</div>
          ) : (
            <div className="space-y-3 p-2">
              {/* Staged changes */}
              {stagedChanges.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-1 mb-1">
                    <span className="text-xs font-medium text-green-400">Staged ({stagedChanges.length})</span>
                    <button
                      onClick={() => projectPath && unstageAll(projectPath)}
                      className="text-xs text-surface-400 hover:text-surface-200"
                    >
                      Unstage All
                    </button>
                  </div>
                  <FileTree
                    node={stagedTree}
                    staged={true}
                    onUnstage={(path) => projectPath && unstageFiles(projectPath, [path])}
                    onViewDiff={handleViewDiff}
                    expandedFolders={expandedStagedFolders}
                    onToggleFolder={toggleStagedFolder}
                  />
                </div>
              )}

              {/* Unstaged changes */}
              {unstagedChanges.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-1 mb-1">
                    <span className="text-xs font-medium text-yellow-400">Modified ({unstagedChanges.length})</span>
                    <button
                      onClick={() => projectPath && stageAll(projectPath)}
                      className="text-xs text-surface-400 hover:text-surface-200"
                    >
                      Stage All
                    </button>
                  </div>
                  <FileTree
                    node={unstagedTree}
                    staged={false}
                    onStage={(path) => projectPath && stageFiles(projectPath, [path])}
                    onDiscard={(path) => projectPath && discardChanges(projectPath, [path])}
                    onViewDiff={handleViewDiff}
                    expandedFolders={expandedUnstagedFolders}
                    onToggleFolder={toggleUnstagedFolder}
                  />
                </div>
              )}

              {/* Untracked files */}
              {untrackedChanges.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-1 mb-1">
                    <span className="text-xs font-medium text-surface-400">Untracked ({untrackedChanges.length})</span>
                  </div>
                  <FileTree
                    node={untrackedTree}
                    onStage={(path) => projectPath && stageFiles(projectPath, [path])}
                    expandedFolders={expandedUntrackedFolders}
                    onToggleFolder={toggleUntrackedFolder}
                  />
                </div>
              )}

              {/* Commit form */}
              {stagedChanges.length > 0 && (
                <div className="pt-2 border-t border-surface-700">
                  <textarea
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Commit message..."
                    className="w-full px-2 py-1.5 text-xs bg-surface-900 border border-surface-600 rounded text-surface-100 placeholder-surface-500 resize-none"
                    rows={3}
                  />
                  <button
                    onClick={handleCommit}
                    disabled={!commitMessage.trim() || loading.operation}
                    className="w-full mt-2 px-3 py-1.5 text-xs font-medium bg-accent-600 hover:bg-accent-500 disabled:bg-surface-700 disabled:text-surface-500 text-white rounded transition-colors"
                  >
                    {loading.operation ? 'Committing...' : `Commit (${stagedChanges.length} files)`}
                  </button>
                </div>
              )}
            </div>
          )}
        </AccordionSection>

        {/* Branches Section */}
        <AccordionSection
          title="Branches"
          badge={branches.filter((b) => !b.isRemote).length > 0 ? String(branches.filter((b) => !b.isRemote).length) : undefined}
          expanded={expandedSections.has('branches')}
          onToggle={() => toggleSection('branches')}
          loading={loading.branches}
        >
          {branches.length === 0 ? (
            <div className="px-3 py-4 text-center text-surface-400 text-xs">No branches</div>
          ) : (
            <div className="p-2 space-y-1">
              {/* Local branches */}
              {branches.filter((b) => !b.isRemote).map((branch) => (
                <BranchItem
                  key={branch.name}
                  branch={branch}
                  onCheckout={() => projectPath && checkoutBranch(projectPath, branch.name)}
                />
              ))}

              {/* Remote branches */}
              {branches.filter((b) => b.isRemote).length > 0 && (
                <div className="pt-2 mt-2 border-t border-surface-700">
                  <p className="px-1 mb-1 text-xs text-surface-400">Remote</p>
                  {branches.filter((b) => b.isRemote).map((branch) => (
                    <BranchItem
                      key={branch.name}
                      branch={branch}
                      onCheckout={() => {
                        const localName = branch.name.replace(/^origin\//, '');
                        projectPath && checkoutBranch(projectPath, localName);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </AccordionSection>

        {/* History Section */}
        <AccordionSection
          title="History"
          expanded={expandedSections.has('history')}
          onToggle={() => toggleSection('history')}
          loading={loading.commits}
        >
          {commits.length === 0 ? (
            <div className="px-3 py-4 text-center text-surface-400 text-xs">No commits</div>
          ) : (
            <div className="p-1">
              {commits.slice(0, 20).map((c, index) => (
                <CommitItem
                  key={c.hash}
                  commit={c}
                  index={index}
                  expanded={expandedCommits.has(c.hash)}
                  loading={loadingCommitDetails.has(c.hash)}
                  details={commitDetails.get(c.hash)}
                  onToggle={() => toggleCommitExpansion(c.hash)}
                />
              ))}
            </div>
          )}
        </AccordionSection>
      </div>

      {/* Fixed Footer with Fetch/Pull/Push */}
      <div className="px-3 py-2 border-t border-surface-700 bg-surface-800">
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => projectPath && gitFetch(projectPath)}
            disabled={loading.operation}
            className="px-2 py-1.5 text-xs bg-surface-700 hover:bg-surface-600 disabled:opacity-50 text-surface-200 rounded transition-colors flex items-center justify-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Fetch
          </button>
          <button
            onClick={() => projectPath && pull(projectPath)}
            disabled={loading.operation}
            className="px-2 py-1.5 text-xs bg-surface-700 hover:bg-surface-600 disabled:opacity-50 text-surface-200 rounded transition-colors flex items-center justify-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            Pull
          </button>
          <button
            onClick={() => projectPath && push(projectPath)}
            disabled={loading.operation}
            className="px-2 py-1.5 text-xs bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-white rounded transition-colors flex items-center justify-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
            Push
          </button>
        </div>
      </div>

      {/* Diff Preview Modal */}
      {currentDiff && <DiffPreview diff={currentDiff} onClose={clearDiff} />}

      {/* Auth Modal */}
      {authModalCode && (
        <GitAuthModal
          code={authModalCode}
          onClose={() => setAuthModalCode(null)}
          onAuthenticated={() => {
            clearError();
            if (projectPath) refresh(projectPath);
          }}
        />
      )}
    </div>
  );
}
