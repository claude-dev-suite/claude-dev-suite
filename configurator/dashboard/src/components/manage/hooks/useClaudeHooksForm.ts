// SPDX-License-Identifier: MIT
/**
 * Hook for managing Claude hooks form state and handlers
 */

import { useState, useCallback } from 'react';
import type { ClaudeHookUI, ClaudeHookCommand } from '@/types';
import { API_BASE } from '@/utils/api';
import { getLogger } from '@/utils/logger';

const log = getLogger('useClaudeHooksForm');

export interface ClaudeHookFormData {
  matcher: string;
  event: 'PreToolUse' | 'PostToolUse' | 'SubagentStop' | 'Notification' | 'Stop';
  command: string;
  commandType: 'command' | 'mcp';
}

const INITIAL_FORM: ClaudeHookFormData = {
  matcher: '',
  event: 'PreToolUse',
  command: '',
  commandType: 'command',
};

export interface ClaudeHooksFormState {
  claudeHookForm: ClaudeHookFormData;
  editingHook: { index: number; hook: ClaudeHookUI } | null;
  saving: boolean;
}

export interface ClaudeHooksFormActions {
  setClaudeHookForm: React.Dispatch<React.SetStateAction<ClaudeHookFormData>>;
  resetForm: () => void;
  openEditModal: (index: number, hook: ClaudeHookUI) => boolean;
  handleAddClaudeHook: () => Promise<boolean>;
  handleEditClaudeHook: () => Promise<boolean>;
  handleRemoveClaudeHook: (hookId: string) => Promise<boolean>;
  handleApplyTemplate: (templateId: string) => Promise<boolean>;
  clearEditing: () => void;
}

function getFirstCommandAsString(commands: ClaudeHookCommand[]): string {
  if (!commands || commands.length === 0) return '';
  const first = commands[0];
  if (typeof first === 'string') return first;
  return '';
}

function hasPromptHook(commands: ClaudeHookCommand[]): boolean {
  return commands.some(cmd => typeof cmd === 'object' && cmd.type === 'prompt');
}

export function useClaudeHooksForm(
  projectPath: string,
  onError: (error: string | null) => void
): ClaudeHooksFormState & ClaudeHooksFormActions {
  const [claudeHookForm, setClaudeHookForm] = useState<ClaudeHookFormData>(INITIAL_FORM);
  const [editingHook, setEditingHook] = useState<{ index: number; hook: ClaudeHookUI } | null>(null);
  const [saving, setSaving] = useState(false);

  const resetForm = useCallback(() => {
    setClaudeHookForm(INITIAL_FORM);
    setEditingHook(null);
  }, []);

  const clearEditing = useCallback(() => {
    setEditingHook(null);
  }, []);

  const openEditModal = useCallback((index: number, hook: ClaudeHookUI): boolean => {
    if (hasPromptHook(hook.commands || [])) {
      onError('Prompt hooks cannot be edited through the UI. Edit .claude/settings.json directly.');
      return false;
    }

    setEditingHook({ index, hook });
    setClaudeHookForm({
      matcher: hook.matcher || '',
      event: (hook.event || 'PreToolUse') as ClaudeHookFormData['event'],
      command: getFirstCommandAsString(hook.commands || []),
      commandType: 'command',
    });
    return true;
  }, [onError]);

  const handleAddClaudeHook = useCallback(async (): Promise<boolean> => {
    if (!claudeHookForm.command) {
      onError('Command is required');
      return false;
    }

    setSaving(true);
    onError(null);
    try {
      const hook = {
        event: claudeHookForm.event,
        matcher: claudeHookForm.matcher || undefined,
        commands: [claudeHookForm.command],
      };

      const res = await fetch(`${API_BASE}/api/claude-hooks/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, hook }),
      });

      if (res.ok) {
        resetForm();
        return true;
      } else {
        const data = await res.json();
        onError(data.error || 'Failed to add Claude hook');
        return false;
      }
    } catch (err) {
      log.error('Failed to add Claude hook:', err);
      onError('Failed to add Claude hook');
      return false;
    } finally {
      setSaving(false);
    }
  }, [claudeHookForm, projectPath, onError, resetForm]);

  const handleEditClaudeHook = useCallback(async (): Promise<boolean> => {
    if (!editingHook || !claudeHookForm.command) {
      onError('Command is required');
      return false;
    }

    setSaving(true);
    onError(null);
    try {
      const config = {
        event: claudeHookForm.event,
        matcher: claudeHookForm.matcher || undefined,
        commands: [claudeHookForm.command],
      };

      const res = await fetch(`${API_BASE}/api/claude-hooks/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, hookId: editingHook.hook.id, config }),
      });

      if (res.ok) {
        resetForm();
        return true;
      } else {
        const data = await res.json();
        onError(data.error || 'Failed to update Claude hook');
        return false;
      }
    } catch (err) {
      log.error('Failed to update Claude hook:', err);
      onError('Failed to update Claude hook');
      return false;
    } finally {
      setSaving(false);
    }
  }, [editingHook, claudeHookForm, projectPath, onError, resetForm]);

  const handleRemoveClaudeHook = useCallback(async (hookId: string): Promise<boolean> => {
    if (!confirm('Remove this Claude hook?')) return false;

    setSaving(true);
    onError(null);
    try {
      const res = await fetch(`${API_BASE}/api/claude-hooks/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, hookId }),
      });

      if (res.ok) {
        return true;
      } else {
        const data = await res.json();
        onError(data.error || 'Failed to remove Claude hook');
        return false;
      }
    } catch (err) {
      log.error('Failed to remove Claude hook:', err);
      onError('Failed to remove Claude hook');
      return false;
    } finally {
      setSaving(false);
    }
  }, [projectPath, onError]);

  const handleApplyTemplate = useCallback(async (templateId: string): Promise<boolean> => {
    setSaving(true);
    onError(null);
    try {
      const res = await fetch(`${API_BASE}/api/claude-hooks/apply-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, templateId }),
      });

      if (res.ok) {
        return true;
      } else {
        const data = await res.json();
        onError(data.error || 'Failed to apply template');
        return false;
      }
    } catch (err) {
      log.error('Failed to apply template:', err);
      onError('Failed to apply template');
      return false;
    } finally {
      setSaving(false);
    }
  }, [projectPath, onError]);

  return {
    claudeHookForm,
    editingHook,
    saving,
    setClaudeHookForm,
    resetForm,
    openEditModal,
    handleAddClaudeHook,
    handleEditClaudeHook,
    handleRemoveClaudeHook,
    handleApplyTemplate,
    clearEditing,
  };
}
