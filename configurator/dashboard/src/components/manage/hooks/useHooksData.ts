// SPDX-License-Identifier: MIT
/**
 * Hook for fetching hooks-related data (repositories, git hooks, claude hooks)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { HooksStatusResponse, ClaudeHooksStatusResponse, HookType, HookConfig } from '@/types';
import { API_BASE } from '@/utils/api';
import { getLogger } from '@/utils/logger';

const log = getLogger('useHooksData');

export interface GitRepoInfo {
  path: string;
  name: string;
  branch?: string;
  remote?: string;
  remoteUrl?: string;
}

export interface HooksDataState {
  repositories: GitRepoInfo[];
  selectedRepo: string;
  hasGit: boolean;
  gitHooksStatus: HooksStatusResponse | null;
  claudeHooksStatus: ClaudeHooksStatusResponse | null;
  loading: boolean;
  error: string | null;
}

export interface HooksDataActions {
  setSelectedRepo: (repo: string) => void;
  setError: (error: string | null) => void;
  refreshStatus: () => Promise<void>;
}

export function useHooksData(projectPath: string): HooksDataState & HooksDataActions {
  const [repositories, setRepositories] = useState<GitRepoInfo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>('.');
  const [hasGit, setHasGit] = useState<boolean>(true);
  const [gitHooksStatus, setGitHooksStatus] = useState<HooksStatusResponse | null>(null);
  const [claudeHooksStatus, setClaudeHooksStatus] = useState<ClaudeHooksStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentRequestRef = useRef<string>('');

  const getEffectivePath = useCallback(() => {
    if (selectedRepo === '.' || !selectedRepo) {
      return projectPath;
    }
    return `${projectPath}/${selectedRepo}`.replace(/\\/g, '/');
  }, [projectPath, selectedRepo]);

  const fetchRepositories = useCallback(async () => {
    try {
      log.info('Fetching git repositories...', { projectPath });
      const res = await fetch(`${API_BASE}/api/git-repos?path=${encodeURIComponent(projectPath)}`);

      if (res.ok) {
        const repos = await res.json();
        log.debug('Found repositories:', repos);
        setRepositories(repos);

        setSelectedRepo(prev => {
          const firstRepo = repos[0];
          if (repos.length > 0 && !repos.find((r: GitRepoInfo) => r.path === prev)) {
            return (firstRepo && firstRepo.path) ? firstRepo.path : '.';
          }
          return prev;
        });
      } else {
        log.warn('Failed to fetch repositories');
        setRepositories([]);
      }
    } catch (err) {
      log.error('Failed to fetch repositories:', err);
      setRepositories([]);
    }
  }, [projectPath]);

  const fetchStatus = useCallback(async () => {
    const effectivePath = getEffectivePath();
    const requestId = `${selectedRepo}-${Date.now()}`;
    currentRequestRef.current = requestId;

    try {
      setLoading(true);
      log.info('Fetching hooks status...', { effectivePath, selectedRepo, requestId });

      const [gitRes, claudeRes] = await Promise.all([
        fetch(`${API_BASE}/api/hooks/status?path=${encodeURIComponent(effectivePath)}`),
        fetch(`${API_BASE}/api/claude-hooks/status?path=${encodeURIComponent(projectPath)}`),
      ]);

      if (currentRequestRef.current !== requestId) {
        log.debug('Ignoring stale response', { requestId, current: currentRequestRef.current });
        return;
      }

      if (gitRes.ok) {
        const data = await gitRes.json();
        log.debug('Git hooks API response:', data);

        setHasGit(data.hasGit ?? false);

        const keyToHookType: Record<string, HookType> = {
          preCommit: 'pre-commit',
          commitMsg: 'commit-msg',
          postCommit: 'post-commit',
          prePush: 'pre-push',
          postMerge: 'post-merge',
          postCheckout: 'post-checkout',
          preMergeCommit: 'pre-merge-commit',
          prepareCommitMsg: 'prepare-commit-msg',
        };

        const transformed: HooksStatusResponse = {
          huskyDetected: data.husky?.installed ?? false,
          availableHooks: data.hookTypes
            ? (Object.values(data.hookTypes) as Array<{ name: string }>)
                .filter((h) => h.name)
                .map((h) => h.name as HookType)
                .slice(0, 6)
            : ['pre-commit', 'commit-msg', 'post-commit', 'pre-push', 'post-merge', 'post-checkout'],
          installedHooks: data.installedHooks && typeof data.installedHooks === 'object'
            ? Object.entries(data.installedHooks).map(([type, config]) => ({
                type: (keyToHookType[type] || type) as HookType,
                actions: ((config as { actions?: string[] })?.actions || []) as HookConfig['actions'],
                enabled: true,
              }))
            : [],
        };

        log.debug('Transformed git hooks:', transformed);
        setGitHooksStatus(transformed);
      } else {
        const errorText = await gitRes.text();
        log.error('Git hooks API error:', { status: gitRes.status, body: errorText });
      }

      if (claudeRes.ok) {
        const data = await claudeRes.json();
        log.debug('Claude hooks API response:', data);

        const transformed: ClaudeHooksStatusResponse = {
          configured: (data.hooks?.length ?? 0) > 0 || data.hookCount > 0,
          hooks: data.hooks || [],
          templates: data.templates && typeof data.templates === 'object'
            ? Object.values(data.templates).map((t: unknown) => {
                const template = t as { id: string; name: string; description: string };
                return {
                  id: template.id,
                  name: template.name,
                  description: template.description,
                  hooks: [],
                };
              })
            : [],
        };

        log.debug('Transformed claude hooks:', transformed);
        setClaudeHooksStatus(transformed);
      } else {
        const errorText = await claudeRes.text();
        log.error('Claude hooks API error:', { status: claudeRes.status, body: errorText });
      }

      setError(null);
    } catch (err) {
      log.error('Failed to fetch hooks status:', err);
      setError('Failed to load hooks status');
    } finally {
      setLoading(false);
    }
  }, [getEffectivePath, selectedRepo, projectPath]);

  useEffect(() => {
    fetchRepositories();
  }, [fetchRepositories]);

  useEffect(() => {
    fetchStatus();
  }, [projectPath, selectedRepo, fetchStatus]);

  return {
    repositories,
    selectedRepo,
    hasGit,
    gitHooksStatus,
    claudeHooksStatus,
    loading,
    error,
    setSelectedRepo,
    setError,
    refreshStatus: fetchStatus,
  };
}
