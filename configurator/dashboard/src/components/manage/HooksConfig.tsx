// SPDX-License-Identifier: MIT
/**
 * HooksConfig - Main component for configuring Git and Claude Code hooks
 */

import { useState, useEffect } from 'react';
import type { ClaudeHookUI } from '@/types';
import { Select } from '../common';
import { useHooksData, useGitHooksForm, useClaudeHooksForm } from './hooks';
import { GitHooksSection } from './GitHooksSection';
import { ClaudeHooksSection } from './ClaudeHooksSection';
import { GitHooksModal, ClaudeHookFormModal, TemplatesModal } from './HookModals';

export interface HooksConfigProps {
  projectPath: string;
}

type ModalType = 'git-hooks' | 'add-claude' | 'edit-claude' | 'templates' | null;

export function HooksConfig({ projectPath }: HooksConfigProps) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  // Data fetching
  const hooksData = useHooksData(projectPath);

  // Git hooks form
  const gitHooksForm = useGitHooksForm(
    projectPath,
    hooksData.selectedRepo,
    hooksData.setError
  );

  // Claude hooks form
  const claudeHooksForm = useClaudeHooksForm(projectPath, hooksData.setError);

  // Initialize git hooks form when status changes
  useEffect(() => {
    if (hooksData.gitHooksStatus) {
      gitHooksForm.initializeFromStatus(hooksData.gitHooksStatus);
    }
  }, [hooksData.gitHooksStatus, gitHooksForm]);

  // Handlers
  const handleSaveGitHooks = async () => {
    const success = await gitHooksForm.handleSaveGitHooks();
    if (success) {
      setActiveModal(null);
      await hooksData.refreshStatus();
    }
  };

  const handleAddClaudeHook = async () => {
    const success = await claudeHooksForm.handleAddClaudeHook();
    if (success) {
      setActiveModal(null);
      await hooksData.refreshStatus();
    }
  };

  const handleEditClaudeHook = async () => {
    const success = await claudeHooksForm.handleEditClaudeHook();
    if (success) {
      setActiveModal(null);
      await hooksData.refreshStatus();
    }
  };

  const handleRemoveClaudeHook = async (hookId: string) => {
    const success = await claudeHooksForm.handleRemoveClaudeHook(hookId);
    if (success) {
      await hooksData.refreshStatus();
    }
  };

  const handleApplyTemplate = async (templateId: string) => {
    const success = await claudeHooksForm.handleApplyTemplate(templateId);
    if (success) {
      setActiveModal(null);
      await hooksData.refreshStatus();
    }
  };

  const openEditClaudeModal = (index: number, hook: ClaudeHookUI) => {
    const canEdit = claudeHooksForm.openEditModal(index, hook);
    if (canEdit) {
      setActiveModal('edit-claude');
    }
  };

  const openAddClaudeModal = () => {
    claudeHooksForm.resetForm();
    setActiveModal('add-claude');
  };

  if (hooksData.loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Repository Selector */}
      {hooksData.repositories.length > 1 && (
        <div className="flex items-center gap-4 p-4 bg-surface-800 rounded-lg border border-surface-700">
          <label className="text-sm text-surface-300 whitespace-nowrap">
            Repository:
          </label>
          <Select
            value={hooksData.selectedRepo}
            onChange={(value) => hooksData.setSelectedRepo(Array.isArray(value) ? (value[0] ?? '.') : value)}
            options={hooksData.repositories.map((repo) => ({
              value: repo.path,
              label: repo.name + (repo.branch ? ` (${repo.branch})` : ''),
            }))}
            fullWidth
          />
        </div>
      )}

      {/* No Git Repository Warning */}
      {!hooksData.hasGit && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div>
              <h4 className="text-yellow-400 font-medium">No Git Repository Found</h4>
              <p className="text-sm text-yellow-300/70 mt-1">
                {hooksData.repositories.length > 0
                  ? 'The selected path is not a Git repository. Please select a different repository or initialize Git.'
                  : 'This project is not a Git repository. Initialize Git first to configure Git hooks.'}
              </p>
            </div>
          </div>
          <div className="mt-3 ml-9">
            <code className="text-xs text-yellow-300/80 bg-yellow-500/10 px-2 py-1 rounded">
              git init
            </code>
          </div>
        </div>
      )}

      {/* Git Hooks Section */}
      <GitHooksSection
        gitHooksStatus={hooksData.gitHooksStatus}
        hasGit={hooksData.hasGit}
        onConfigure={() => setActiveModal('git-hooks')}
      />

      {/* Claude Hooks Section */}
      <ClaudeHooksSection
        claudeHooksStatus={hooksData.claudeHooksStatus}
        saving={claudeHooksForm.saving}
        onAddHook={openAddClaudeModal}
        onEditHook={openEditClaudeModal}
        onRemoveHook={handleRemoveClaudeHook}
        onApplyTemplate={() => setActiveModal('templates')}
      />

      {/* Error Display */}
      {hooksData.error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {hooksData.error}
          <button
            onClick={() => hooksData.setError(null)}
            className="ml-2 text-red-300 hover:text-white"
          >
            ×
          </button>
        </div>
      )}

      {/* Modals */}
      <GitHooksModal
        isOpen={activeModal === 'git-hooks'}
        onClose={() => setActiveModal(null)}
        onSave={handleSaveGitHooks}
        saving={gitHooksForm.saving}
        gitHooksStatus={hooksData.gitHooksStatus}
        selectedGitHooks={gitHooksForm.selectedGitHooks}
        gitHookActions={gitHooksForm.gitHookActions}
        onToggleHook={(hookType, enabled) =>
          gitHooksForm.setSelectedGitHooks(prev => ({ ...prev, [hookType]: enabled }))
        }
        onToggleAction={gitHooksForm.toggleGitHookAction}
      />

      <ClaudeHookFormModal
        isOpen={activeModal === 'add-claude'}
        onClose={() => setActiveModal(null)}
        onSave={handleAddClaudeHook}
        saving={claudeHooksForm.saving}
        title="Add Claude Hook"
        confirmText="Add Hook"
        form={claudeHooksForm.claudeHookForm}
        onFormChange={(updates) =>
          claudeHooksForm.setClaudeHookForm(prev => ({ ...prev, ...updates }))
        }
      />

      <ClaudeHookFormModal
        isOpen={activeModal === 'edit-claude'}
        onClose={() => {
          setActiveModal(null);
          claudeHooksForm.clearEditing();
        }}
        onSave={handleEditClaudeHook}
        saving={claudeHooksForm.saving}
        title="Edit Claude Hook"
        confirmText="Save Changes"
        form={claudeHooksForm.claudeHookForm}
        onFormChange={(updates) =>
          claudeHooksForm.setClaudeHookForm(prev => ({ ...prev, ...updates }))
        }
      />

      <TemplatesModal
        isOpen={activeModal === 'templates'}
        onClose={() => setActiveModal(null)}
        claudeHooksStatus={hooksData.claudeHooksStatus}
        onApplyTemplate={handleApplyTemplate}
      />
    </div>
  );
}
