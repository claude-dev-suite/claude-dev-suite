// SPDX-License-Identifier: MIT
/**
 * Git Hooks Section component for HooksConfig
 */

import type { HooksStatusResponse } from '@/types';
import { Button, Card, Badge } from '../common';
import { PanelSection } from '../layout';
import { getHookDescription } from './hooks-utils';
import clsx from 'clsx';

interface GitHooksSectionProps {
  gitHooksStatus: HooksStatusResponse | null;
  hasGit: boolean;
  onConfigure: () => void;
}

export function GitHooksSection({ gitHooksStatus, hasGit, onConfigure }: GitHooksSectionProps) {
  return (
    <PanelSection
      title="Git Hooks"
      description="Configure pre-commit, pre-push, and other Git hooks"
    >
      {gitHooksStatus?.huskyDetected && (
        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-yellow-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>Husky detected in this project</span>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {gitHooksStatus?.availableHooks?.map((hookType) => {
          const isInstalled = gitHooksStatus.installedHooks?.some(
            (h) => h.type === hookType && h.enabled
          );
          return (
            <Card key={hookType} padding="sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={clsx(
                      'w-8 h-8 rounded-lg flex items-center justify-center',
                      isInstalled ? 'bg-green-500/10' : 'bg-surface-700'
                    )}
                  >
                    <svg
                      className={clsx(
                        'w-4 h-4',
                        isInstalled ? 'text-green-400' : 'text-surface-400'
                      )}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      {isInstalled ? (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      ) : (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                        />
                      )}
                    </svg>
                  </div>
                  <div>
                    <span className="font-medium text-white text-sm">{hookType}</span>
                    <p className="text-xs text-surface-400">
                      {getHookDescription(hookType)}
                    </p>
                  </div>
                </div>
                <Badge variant={isInstalled ? 'success' : 'default'}>
                  {isInstalled ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={onConfigure}
          disabled={!hasGit}
          title={!hasGit ? 'Initialize a Git repository first' : undefined}
        >
          Configure Git Hooks
        </Button>
      </div>
    </PanelSection>
  );
}
