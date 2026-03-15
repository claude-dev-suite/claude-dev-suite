// SPDX-License-Identifier: MIT
/**
 * Modal components for HooksConfig
 */

import type { HooksStatusResponse, HookType, ClaudeHooksStatusResponse } from '@/types';
import type { ClaudeHookFormData } from './hooks/useClaudeHooksForm';
import { Modal, ModalFooter, Input, Checkbox, Select, Card } from '../common';
import { getHookDescription } from './hooks-utils';

// ========== Git Hooks Modal ==========

interface GitHooksModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  gitHooksStatus: HooksStatusResponse | null;
  selectedGitHooks: Record<HookType, boolean>;
  gitHookActions: Record<HookType, string[]>;
  onToggleHook: (hookType: HookType, enabled: boolean) => void;
  onToggleAction: (hookType: HookType, action: string) => void;
}

export function GitHooksModal({
  isOpen,
  onClose,
  onSave,
  saving,
  gitHooksStatus,
  selectedGitHooks,
  gitHookActions,
  onToggleHook,
  onToggleAction,
}: GitHooksModalProps) {
  const availableHooks = gitHooksStatus?.availableHooks || ['pre-commit', 'commit-msg', 'pre-push'];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Configure Git Hooks"
      size="lg"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={onSave}
          confirmText="Save Hooks"
          loading={saving}
        />
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-surface-400 mb-4">
          Select which Git hooks to enable and configure their actions.
        </p>
        {availableHooks.map((hookType) => (
          <div key={hookType} className="border border-surface-700 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <Checkbox
                checked={selectedGitHooks[hookType as HookType]}
                onChange={(e) => onToggleHook(hookType as HookType, e.target.checked)}
                label={hookType}
              />
              <span className="text-xs text-surface-400">
                {getHookDescription(hookType)}
              </span>
            </div>
            {selectedGitHooks[hookType as HookType] && (
              <div className="ml-6 flex flex-wrap gap-2">
                {['lint', 'format', 'test', 'build'].map((action) => (
                  <label key={action} className="flex items-center gap-2 text-sm text-surface-300">
                    <input
                      type="checkbox"
                      checked={(gitHookActions[hookType as HookType] || []).includes(action)}
                      onChange={() => onToggleAction(hookType as HookType, action)}
                      className="rounded border-surface-600 bg-surface-700 text-primary-500"
                    />
                    {action}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ========== Claude Hook Form Modal ==========

interface ClaudeHookFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  title: string;
  confirmText: string;
  form: ClaudeHookFormData;
  onFormChange: (updates: Partial<ClaudeHookFormData>) => void;
}

export function ClaudeHookFormModal({
  isOpen,
  onClose,
  onSave,
  saving,
  title,
  confirmText,
  form,
  onFormChange,
}: ClaudeHookFormModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={onSave}
          confirmText={confirmText}
          loading={saving}
        />
      }
    >
      <div className="space-y-4">
        <Input
          label="Matcher (tool name or pattern)"
          value={form.matcher}
          onChange={(e) => onFormChange({ matcher: e.target.value })}
          placeholder="e.g., Bash, Edit, *"
          helperText="Use * for all tools, or specific tool names"
          fullWidth
        />
        <Select
          label="Event"
          value={form.event}
          onChange={(value) => onFormChange({ event: value as ClaudeHookFormData['event'] })}
          options={[
            { value: 'PreToolUse', label: 'PreToolUse - Before tool execution' },
            { value: 'PostToolUse', label: 'PostToolUse - After tool execution' },
            { value: 'SubagentStop', label: 'SubagentStop - When a subagent finishes' },
            { value: 'Notification', label: 'Notification - On notifications' },
            { value: 'Stop', label: 'Stop - When Claude stops' },
          ]}
          fullWidth
        />
        <Select
          label="Action Type"
          value={form.commandType}
          onChange={(value) => onFormChange({ commandType: value as ClaudeHookFormData['commandType'] })}
          options={[
            { value: 'command', label: 'Shell Command' },
            { value: 'mcp', label: 'MCP Tool' },
          ]}
          fullWidth
        />
        <Input
          label="Command"
          value={form.command}
          onChange={(e) => onFormChange({ command: e.target.value })}
          placeholder={form.commandType === 'command' ? 'e.g., npm run lint' : 'e.g., mcp__server__tool'}
          fullWidth
        />
      </div>
    </Modal>
  );
}

// ========== Templates Modal ==========

interface TemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  claudeHooksStatus: ClaudeHooksStatusResponse | null;
  onApplyTemplate: (templateId: string) => void;
}

export function TemplatesModal({
  isOpen,
  onClose,
  claudeHooksStatus,
  onApplyTemplate,
}: TemplatesModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Apply Hook Template"
      size="md"
    >
      <div className="space-y-3">
        <p className="text-sm text-surface-400 mb-4">
          Select a template to apply pre-configured hooks.
        </p>
        {claudeHooksStatus?.templates?.map((template) => (
          <Card
            key={template.id}
            selectable
            onClick={() => onApplyTemplate(template.id)}
            padding="sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-white">{template.name}</span>
                <p className="text-xs text-surface-400 mt-1">{template.description}</p>
              </div>
              <svg className="w-5 h-5 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Card>
        ))}
        {(!claudeHooksStatus?.templates || claudeHooksStatus.templates.length === 0) && (
          <div className="text-center py-8 text-surface-400">
            No templates available.
          </div>
        )}
      </div>
    </Modal>
  );
}
