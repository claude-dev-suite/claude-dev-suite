// SPDX-License-Identifier: MIT
/**
 * Claude Hooks Section component for HooksConfig
 */

import type { ClaudeHooksStatusResponse, ClaudeHookUI } from '@/types';
import { Button, Card, Badge } from '../common';
import { PanelSection } from '../layout';
import { formatHookCommands, hasPromptHook } from './hooks-utils';

interface ClaudeHooksSectionProps {
  claudeHooksStatus: ClaudeHooksStatusResponse | null;
  saving: boolean;
  onAddHook: () => void;
  onEditHook: (index: number, hook: ClaudeHookUI) => void;
  onRemoveHook: (hookId: string) => void;
  onApplyTemplate: () => void;
}

export function ClaudeHooksSection({
  claudeHooksStatus,
  saving,
  onAddHook,
  onEditHook,
  onRemoveHook,
  onApplyTemplate,
}: ClaudeHooksSectionProps) {
  return (
    <PanelSection
      title="Claude Code Hooks"
      description="Configure hooks for Claude Code events (PreToolUse, PostToolUse, etc.)"
    >
      {claudeHooksStatus?.configured ? (
        <div className="space-y-3">
          {claudeHooksStatus.hooks?.map((hook, index) => (
            <Card key={hook.id || index} padding="sm">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="info" size="sm">
                      {hook.event}
                    </Badge>
                    {hook.matcher && (
                      <span className="font-mono text-sm text-surface-300">
                        matcher: {hook.matcher}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-surface-400 truncate">
                    {formatHookCommands(hook.commands || [])}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  {!hasPromptHook(hook.commands || []) && (
                    <Button variant="ghost" size="sm" onClick={() => onEditHook(index, hook)}>
                      Edit
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemoveHook(hook.id || `${hook.event}-${index}`)}
                    loading={saving}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-surface-400">
          <svg
            className="w-12 h-12 mx-auto mb-3 text-surface-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          <p className="mb-4">No Claude Code hooks configured</p>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Button variant="secondary" size="sm" onClick={onAddHook}>
          Add Hook
        </Button>
        {claudeHooksStatus?.templates && claudeHooksStatus.templates.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onApplyTemplate}>
            Apply Template
          </Button>
        )}
      </div>
    </PanelSection>
  );
}
