// SPDX-License-Identifier: MIT
import { useState, useEffect, useCallback } from 'react';
import { Button, Badge, Card, Select } from '../common';
import { FileTreePicker, type FileTreeNode } from './FileTreePicker';
import { API_BASE } from '@/utils/api';
import { getLogger } from '@/utils/logger';
import clsx from 'clsx';

const log = getLogger('CodeReviewPanel');

interface ReviewOption {
  label: string;
  agentId: string;
  description: string;
  taskPrompt: string;
}

interface Repository {
  name: string;
  path: string;
  isRoot: boolean;
  hasDevSuiteHooks: boolean;
  installedHooksCount: number;
  devSuiteHooksCount: number;
}

export interface CodeReviewPanelProps {
  projectPath: string;
  onStartReview?: (job: unknown) => void;
  onOpenMcpSettings?: () => void;
}

type Scope = 'uncommitted' | 'full-project';
type Depth = 'quick' | 'deep';

const agentIcons: Record<string, string> = {
  'security-expert': '🔒',
  'performance-expert': '⚡',
  'qa-expert': '📊',
  'code-reviewer': '📝',
  'architect': '🏗️',
};

export function CodeReviewPanel({ projectPath, onStartReview, onOpenMcpSettings }: CodeReviewPanelProps) {
  // State
  const [options, setOptions] = useState<Record<string, ReviewOption>>({});
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [scope, setScope] = useState<Scope>('uncommitted');
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const [totalFiles, setTotalFiles] = useState(0);
  const [depth, setDepth] = useState<Depth>('quick');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Multi-repo state
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>('');

  // Fetch repositories for multi-repo support
  const fetchRepositories = useCallback(async () => {
    try {
      log.info('Fetching repositories...', { projectPath });
      const res = await fetch(`${API_BASE}/api/hooks/repositories?path=${encodeURIComponent(projectPath)}`);

      if (res.ok) {
        const data = await res.json();
        const repos: Repository[] = data.repositories || [];
        log.debug('Repositories:', repos);
        setRepositories(repos);

        // Auto-select first repo if available
        if (repos.length > 0 && !selectedRepo) {
          const rootRepo = repos.find(r => r.isRoot);
          const firstRepo = repos[0];
          setSelectedRepo(rootRepo?.path || (firstRepo ? firstRepo.path : ''));
        }
      }
    } catch (err) {
      log.error('Failed to fetch repositories:', err);
      // Non-critical error, don't show to user
    }
  }, [projectPath, selectedRepo]);

  // Fetch review options
  const fetchOptions = useCallback(async () => {
    try {
      setLoading(true);
      log.info('Fetching code review options...');
      const res = await fetch(`${API_BASE}/api/code-review/options`);

      if (res.ok) {
        const response = await res.json();
        log.debug('Code review options:', response);
        // API returns { success: true, data: { security: {...}, performance: {...}, ... } }
        setOptions(response.data || response);
        setError(null);
      } else {
        const errorText = await res.text();
        log.error('Failed to fetch options:', errorText);
        setError('Failed to load review options');
      }
    } catch (err) {
      log.error('Failed to fetch options:', err);
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch file tree for full project scope
  const fetchFileTree = useCallback(async () => {
    try {
      // Build path - combine project path with repo if multi-repo
      const targetPath = selectedRepo && repositories.length > 1
        ? `${projectPath}/${selectedRepo}`
        : projectPath;

      log.info('Fetching file tree...', { targetPath, selectedRepo });
      const res = await fetch(`${API_BASE}/api/code-review/files?path=${encodeURIComponent(targetPath)}`);

      if (res.ok) {
        const response = await res.json();
        log.debug('File tree data:', response);
        // API returns { success: true, data: { tree, files, totalFiles } }
        const data = response.data || response;
        const tree = data.tree || [];
        setFileTree(tree);
        setTotalFiles(data.totalFiles || 0);

        // Collapse all directories by default
        const dirsToCollapse = tree
          .filter((node: { type: string }) => node.type === 'directory')
          .map((node: { path: string }) => node.path);
        setCollapsedDirs(new Set(dirsToCollapse));

        setError(null);
      } else {
        const errorText = await res.text();
        log.error('Failed to fetch file tree:', errorText);
        setError('Failed to load file tree');
      }
    } catch (err) {
      log.error('Failed to fetch file tree:', err);
      setError('Failed to load file tree');
    }
  }, [projectPath, selectedRepo, repositories.length]);

  // Initialize
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loader toggles loading state; intentional fetch-on-mount
    fetchOptions();
    fetchRepositories();
  }, [projectPath, fetchOptions, fetchRepositories]);

  // Fetch file tree when scope changes to full-project or repo changes
  useEffect(() => {
    if (scope === 'full-project') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- loader toggles loading state; intentional fetch when scope changes
      fetchFileTree();
    } else {
      setFileTree([]);
      setSelectedPaths([]);
    }
  }, [scope, projectPath, selectedRepo, fetchFileTree]);

  // Toggle agent selection
  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId]
    );
  };

  // Toggle path selection
  const togglePath = (path: string) => {
    setSelectedPaths((prev) => {
      const isSelected = prev.includes(path);

      if (isSelected) {
        // Deselect this path and all children
        return prev.filter((p) => !p.startsWith(path));
      } else {
        // Select this path
        const node = fileTree.find((n) => n.path === path);
        if (node?.type === 'directory') {
          // If directory, select all children
          const childrenPaths = fileTree
            .filter((n) => n.path.startsWith(path + '/'))
            .map((n) => n.path);
          return [...prev.filter((p) => !childrenPaths.includes(p)), path, ...childrenPaths];
        } else {
          return [...prev, path];
        }
      }
    });
  };

  // Toggle directory collapse
  const toggleCollapse = (path: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Start review
  const handleStartReview = async () => {
    if (selectedAgents.length === 0) {
      setError('Please select at least one agent');
      return;
    }

    if (scope === 'full-project' && selectedPaths.length === 0) {
      setError('Please select at least one file or directory');
      return;
    }

    setStarting(true);
    setError(null);

    try {
      log.info('Building review job...', {
        scope,
        selectedAgents,
        selectedPaths: scope === 'full-project' ? selectedPaths : undefined,
      });

      const res = await fetch(`${API_BASE}/api/code-review/build-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath,
          scope,
          paths: scope === 'full-project' ? selectedPaths : undefined,
          selectedAgents,
          repo: repositories.length > 1 ? selectedRepo : undefined,
          depth,
        }),
      });

      if (res.ok) {
        const response = await res.json();
        // API returns { success: true, data: { title, context, subTasks, projectPath } }
        // Extract data to pass to orchestrator
        const jobData = response.data || response;
        log.info('Review job created:', jobData);
        onStartReview?.(jobData);
      } else {
        const errorData = await res.json();
        log.error('Failed to build job:', errorData);
        setError(errorData.error || 'Failed to start review');
      }
    } catch (err) {
      log.error('Failed to start review:', err);
      setError('Failed to start review');
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const optionsList = Object.entries(options);

  return (
    <div className="space-y-6" data-tutorial="code-review-panel">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">AI Code Review</h3>
        <p className="text-sm text-surface-400">
          Run automated code reviews with specialized AI agents. Select scope, agents, and start the review.
        </p>
      </div>

      {/* Scope Selector */}
      <div data-tutorial="code-review-scope">
        <label className="block text-sm font-medium text-surface-300 mb-3">
          Review Scope
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setScope('uncommitted')}
            className={clsx(
              'p-4 rounded-lg border-2 transition-all text-left',
              scope === 'uncommitted'
                ? 'border-primary-500 bg-primary-500/10'
                : 'border-surface-700 bg-surface-800/50 hover:border-surface-600'
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className={clsx(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                  scope === 'uncommitted' ? 'border-primary-500' : 'border-surface-600'
                )}
              >
                {scope === 'uncommitted' && (
                  <div className="w-2.5 h-2.5 rounded-full bg-primary-500" />
                )}
              </div>
              <span className="font-medium text-white text-sm">Uncommitted Changes</span>
            </div>
            <p className="text-xs text-surface-400 ml-7">
              Review only uncommitted Git changes
            </p>
          </button>

          <button
            onClick={() => setScope('full-project')}
            className={clsx(
              'p-4 rounded-lg border-2 transition-all text-left',
              scope === 'full-project'
                ? 'border-primary-500 bg-primary-500/10'
                : 'border-surface-700 bg-surface-800/50 hover:border-surface-600'
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className={clsx(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                  scope === 'full-project' ? 'border-primary-500' : 'border-surface-600'
                )}
              >
                {scope === 'full-project' && (
                  <div className="w-2.5 h-2.5 rounded-full bg-primary-500" />
                )}
              </div>
              <span className="font-medium text-white text-sm">Full Project</span>
            </div>
            <p className="text-xs text-surface-400 ml-7">
              Select specific files or directories
            </p>
          </button>
        </div>
      </div>

      {/* Review Depth */}
      <div data-tutorial="code-review-depth">
        <label className="block text-sm font-medium text-surface-300 mb-3">
          Review Depth
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setDepth('quick')}
            className={clsx(
              'p-4 rounded-lg border-2 transition-all text-left',
              depth === 'quick'
                ? 'border-primary-500 bg-primary-500/10'
                : 'border-surface-700 bg-surface-800/50 hover:border-surface-600'
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className={clsx(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                  depth === 'quick' ? 'border-primary-500' : 'border-surface-600'
                )}
              >
                {depth === 'quick' && (
                  <div className="w-2.5 h-2.5 rounded-full bg-primary-500" />
                )}
              </div>
              <span className="font-medium text-white text-sm">Quick</span>
              <span className="text-xs text-surface-500 ml-auto">Fewer tokens</span>
            </div>
            <p className="text-xs text-surface-400 ml-7">
              Scan code with Grep/Read. Fast, focused on patterns.
            </p>
          </button>

          <button
            onClick={() => setDepth('deep')}
            className={clsx(
              'p-4 rounded-lg border-2 transition-all text-left',
              depth === 'deep'
                ? 'border-amber-500 bg-amber-500/10'
                : 'border-surface-700 bg-surface-800/50 hover:border-surface-600'
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className={clsx(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                  depth === 'deep' ? 'border-amber-500' : 'border-surface-600'
                )}
              >
                {depth === 'deep' && (
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                )}
              </div>
              <span className="font-medium text-white text-sm">Deep</span>
              <span className="text-xs text-amber-600 ml-auto">More tokens</span>
            </div>
            <p className="text-xs text-surface-400 ml-7">
              Loads knowledge base for detected stack before reviewing.
            </p>
          </button>
        </div>
      </div>

      {/* Repository Selector (only for multi-repo projects) */}
      {repositories.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-3">
            Repository
          </label>
          <Select
            options={repositories.map(repo => ({
              value: repo.path,
              label: repo.isRoot ? `${repo.name} (root)` : repo.name,
              description: repo.path,
            }))}
            value={selectedRepo}
            onChange={(v) => setSelectedRepo(v as string)}
            fullWidth
          />
          <p className="text-xs text-surface-400 mt-2">
            {repositories.length} repositories found in this project
          </p>
        </div>
      )}

      {/* File Tree Picker */}
      {scope === 'full-project' && (
        <div>
          <label className="block text-sm font-medium text-surface-300 mb-3">
            Select Files/Directories
          </label>
          <FileTreePicker
            tree={fileTree}
            selectedPaths={selectedPaths}
            collapsedDirs={collapsedDirs}
            onTogglePath={togglePath}
            onToggleCollapse={toggleCollapse}
            totalFiles={totalFiles}
          />
        </div>
      )}

      {/* Agent Selection */}
      <div>
        <label className="block text-sm font-medium text-surface-300 mb-3">
          Select Review Agents
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {optionsList.map(([agentId, option]) => {
            const isSelected = selectedAgents.includes(agentId);
            const icon = agentIcons[agentId] || '🤖';

            return (
              <Card
                key={agentId}
                padding="sm"
                selectable
                onClick={() => toggleAgent(agentId)}
                className={clsx(
                  'cursor-pointer transition-all',
                  isSelected
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-surface-700 hover:border-surface-600'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div
                      className={clsx(
                        'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0',
                        isSelected ? 'border-primary-500 bg-primary-500' : 'border-surface-600'
                      )}
                    >
                      {isSelected && (
                        <svg
                          className="w-3 h-3 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                    <span className="text-2xl flex-shrink-0">{icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-white text-sm truncate">
                        {option.label}
                      </div>
                      <div className="text-xs text-surface-400 mt-1 line-clamp-2">
                        {option.description}
                      </div>
                      <div className="text-xs text-surface-400 mt-1 truncate">
                        {agentId}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        {optionsList.length === 0 && (
          <div className="text-center py-8 text-surface-400 text-sm">
            No review agents available
          </div>
        )}
      </div>

      {/* Contextual Warnings */}
      {selectedAgents.includes('architect') && (
        <div className="p-4 bg-amber-500/10 border-l-4 border-amber-500 rounded-r-lg">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-400">API Explorer requires configuration</p>
              <p className="text-xs text-amber-300/80 mt-1">
                The architect agent uses the API Explorer MCP server, which needs{' '}
                <code className="font-mono bg-amber-500/20 px-1 rounded">API_EXPLORER_ENDPOINTS</code>{' '}
                configured in your project's <code className="font-mono bg-amber-500/20 px-1 rounded">.mcp.json</code>{' '}
                to access OpenAPI specs. Without it, API design analysis will be limited to code inspection only.
              </p>
              {onOpenMcpSettings && (
                <button
                  onClick={onOpenMcpSettings}
                  className="mt-2 text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors"
                >
                  Configure in MCP Settings
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedAgents.includes('performance') && (
        <div className="p-4 bg-blue-500/10 border-l-4 border-blue-500 rounded-r-lg">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-blue-400">Performance profiler requires a running app</p>
              <p className="text-xs text-blue-300/80 mt-1">
                Static code analysis will work normally. Advanced features (live profiling, load testing, endpoint
                benchmarking) require the application to be running. Use the Live Performance tab for runtime
                analysis.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-300 hover:text-white"
          >
            ×
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t border-surface-700">
        <Button
          variant="primary"
          onClick={handleStartReview}
          disabled={selectedAgents.length === 0 || starting}
          loading={starting}
        >
          Start Review
        </Button>
        {selectedAgents.length > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="info">
              {selectedAgents.length} agent{selectedAgents.length !== 1 ? 's' : ''} selected
            </Badge>
            {scope === 'full-project' && selectedPaths.length > 0 && (
              <Badge variant="default">
                {selectedPaths.length} path{selectedPaths.length !== 1 ? 's' : ''} selected
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
