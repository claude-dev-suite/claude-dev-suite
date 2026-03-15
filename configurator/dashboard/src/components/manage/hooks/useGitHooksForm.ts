// SPDX-License-Identifier: MIT
/**
 * Hook for managing Git hooks form state and handlers
 */

import { useState, useCallback } from 'react';
import type { HooksStatusResponse, HookType, HookConfig } from '@/types';
import { API_BASE } from '@/utils/api';
import { getLogger } from '@/utils/logger';

const log = getLogger('useGitHooksForm');

const ALL_HOOK_TYPES: HookType[] = [
  'pre-commit',
  'prepare-commit-msg',
  'commit-msg',
  'post-commit',
  'pre-merge-commit',
  'pre-push',
  'post-merge',
  'post-checkout',
];

function createEmptySelection(): Record<HookType, boolean> {
  return ALL_HOOK_TYPES.reduce((acc, type) => {
    acc[type] = false;
    return acc;
  }, {} as Record<HookType, boolean>);
}

function createEmptyActions(): Record<HookType, string[]> {
  return ALL_HOOK_TYPES.reduce((acc, type) => {
    acc[type] = [];
    return acc;
  }, {} as Record<HookType, string[]>);
}

export interface GitHooksFormState {
  selectedGitHooks: Record<HookType, boolean>;
  gitHookActions: Record<HookType, string[]>;
  saving: boolean;
}

export interface GitHooksFormActions {
  setSelectedGitHooks: React.Dispatch<React.SetStateAction<Record<HookType, boolean>>>;
  toggleGitHookAction: (hookType: HookType, action: string) => void;
  handleSaveGitHooks: () => Promise<boolean>;
  initializeFromStatus: (status: HooksStatusResponse) => void;
}

export function useGitHooksForm(
  projectPath: string,
  selectedRepo: string,
  onError: (error: string | null) => void
): GitHooksFormState & GitHooksFormActions {
  const [selectedGitHooks, setSelectedGitHooks] = useState<Record<HookType, boolean>>(createEmptySelection);
  const [gitHookActions, setGitHookActions] = useState<Record<HookType, string[]>>(createEmptyActions);
  const [saving, setSaving] = useState(false);

  const getEffectivePath = useCallback(() => {
    if (selectedRepo === '.' || !selectedRepo) {
      return projectPath;
    }
    return `${projectPath}/${selectedRepo}`.replace(/\\/g, '/');
  }, [projectPath, selectedRepo]);

  const initializeFromStatus = useCallback((status: HooksStatusResponse) => {
    const freshSelection = createEmptySelection();
    status.installedHooks.forEach((h: HookConfig) => {
      if (h.enabled) freshSelection[h.type] = true;
    });
    setSelectedGitHooks(freshSelection);

    const freshActions = createEmptyActions();
    status.installedHooks.forEach((h: HookConfig) => {
      if (h.actions && h.actions.length > 0) {
        freshActions[h.type] = h.actions as string[];
      }
    });
    setGitHookActions(freshActions);
  }, []);

  const toggleGitHookAction = useCallback((hookType: HookType, action: string) => {
    setGitHookActions(prev => {
      const current = prev[hookType] || [];
      const updated = current.includes(action)
        ? current.filter(a => a !== action)
        : [...current, action];
      return { ...prev, [hookType]: updated };
    });
  }, []);

  const handleSaveGitHooks = useCallback(async (): Promise<boolean> => {
    const effectivePath = getEffectivePath();
    setSaving(true);
    onError(null);
    log.info('Saving git hooks...', { effectivePath, selectedGitHooks });

    try {
      const hookTypeToKey: Record<string, string> = {
        'pre-commit': 'preCommit',
        'commit-msg': 'commitMsg',
        'post-commit': 'postCommit',
        'pre-push': 'prePush',
        'post-merge': 'postMerge',
        'post-checkout': 'postCheckout',
        'pre-merge-commit': 'preMergeCommit',
        'prepare-commit-msg': 'prepareCommitMsg',
      };

      const hooksConfig: Record<string, { enabled: boolean; actions: string[] }> = {};
      for (const [hookType, enabled] of Object.entries(selectedGitHooks)) {
        const key = hookTypeToKey[hookType] || hookType;
        hooksConfig[key] = {
          enabled: enabled,
          actions: enabled ? (gitHookActions[hookType as HookType] || []) : [],
        };
      }

      log.debug('Sending hooks config:', hooksConfig);

      const res = await fetch(`${API_BASE}/api/hooks/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath: effectivePath,
          config: hooksConfig,
        }),
      });

      if (res.ok) {
        return true;
      } else {
        const data = await res.json();
        onError(data.error || 'Failed to save git hooks');
        return false;
      }
    } catch (err) {
      log.error('Failed to save git hooks:', err);
      onError('Failed to save git hooks');
      return false;
    } finally {
      setSaving(false);
    }
  }, [getEffectivePath, selectedGitHooks, gitHookActions, onError]);

  return {
    selectedGitHooks,
    gitHookActions,
    saving,
    setSelectedGitHooks,
    toggleGitHookAction,
    handleSaveGitHooks,
    initializeFromStatus,
  };
}
