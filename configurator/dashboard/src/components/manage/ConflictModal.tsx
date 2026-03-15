// SPDX-License-Identifier: MIT
/**
 * Conflict Modal Component
 *
 * Modal for resolving conflicts when applying feature updates.
 */

import { Button, Modal } from '../common';
import { DiffViewer } from './DiffViewer';
import type { AvailableUpgrade, ConflictInfo, ConflictResolution } from '@/types';
import clsx from 'clsx';

export interface ConflictModalProps {
  isOpen: boolean;
  upgrade: AvailableUpgrade;
  resolutions: Record<string, ConflictResolution>;
  onResolve: (target: string, resolution: ConflictResolution) => void;
  onClose: () => void;
  onApply: () => void;
}

const conflictTypeLabels: Record<ConflictInfo['type'], string> = {
  'file-modified': 'File Modified',
  'file-deleted': 'File Deleted',
  'hook-duplicate': 'Duplicate Hook',
  'dependency-missing': 'Missing Dependency',
  'stack-incompatible': 'Stack Incompatible',
};

const conflictTypeIcons: Record<ConflictInfo['type'], string> = {
  'file-modified': 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  'file-deleted': 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  'hook-duplicate': 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z',
  'dependency-missing': 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  'stack-incompatible': 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
};

const resolutionOptions: { value: ConflictResolution; label: string; description: string }[] = [
  { value: 'skip', label: 'Skip', description: 'Do not apply this update' },
  { value: 'replace', label: 'Replace', description: 'Overwrite with new version' },
  { value: 'backup-replace', label: 'Backup & Replace', description: 'Create backup, then replace' },
];

export function ConflictModal({
  isOpen,
  upgrade,
  resolutions,
  onResolve,
  onClose,
  onApply,
}: ConflictModalProps) {
  const { feature, conflicts } = upgrade;

  const allResolved = conflicts.every(c => resolutions[c.target]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Resolve Conflicts: ${feature.name}`}
      size="lg"
    >
      <div className="space-y-6">
        {/* Feature info */}
        <div className="p-4 bg-surface-800 rounded-lg">
          <p className="text-sm text-surface-400">{feature.description}</p>
          <p className="text-xs text-surface-500 mt-2">
            Version {feature.version} - {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} detected
          </p>
        </div>

        {/* Conflicts list */}
        <div className="space-y-4">
          {conflicts.map((conflict, index) => (
            <ConflictItem
              key={`${conflict.target}-${index}`}
              conflict={conflict}
              resolution={resolutions[conflict.target]}
              onResolve={(resolution) => onResolve(conflict.target, resolution)}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-surface-700">
          <div className="text-sm text-surface-400">
            {allResolved ? (
              <span className="text-green-400">All conflicts resolved</span>
            ) : (
              <span>Resolve all conflicts to continue</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={onApply}
              disabled={!allResolved}
            >
              Apply Update
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

interface ConflictItemProps {
  conflict: ConflictInfo;
  resolution?: ConflictResolution;
  onResolve: (resolution: ConflictResolution) => void;
}

function ConflictItem({ conflict, resolution, onResolve }: ConflictItemProps) {
  const iconPath = conflictTypeIcons[conflict.type];
  const typeLabel = conflictTypeLabels[conflict.type];
  const hasDiff = conflict.originalContent && conflict.newContent;

  return (
    <div className={clsx(
      'p-4 rounded-lg border',
      resolution
        ? 'border-green-500/30 bg-green-500/5'
        : 'border-yellow-500/30 bg-yellow-500/5'
    )}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className={clsx(
          'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
          resolution ? 'bg-green-500/10' : 'bg-yellow-500/10'
        )}>
          <svg
            className={clsx('w-4 h-4', resolution ? 'text-green-400' : 'text-yellow-400')}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={iconPath} />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-surface-400">{typeLabel}</span>
            {resolution && (
              <span className="text-xs text-green-400">
                Resolved: {resolution}
              </span>
            )}
          </div>
          <p className="text-sm font-mono text-white mt-1 truncate">{conflict.target}</p>
          <p className="text-sm text-surface-400 mt-1">{conflict.description}</p>
        </div>
      </div>

      {/* Diff viewer for file conflicts */}
      {hasDiff && (
        <div className="mb-4">
          <DiffViewer
            original={conflict.originalContent || ''}
            modified={conflict.newContent || ''}
            title={conflict.target}
          />
        </div>
      )}

      {/* Resolution options */}
      <div className="flex flex-wrap gap-2">
        {resolutionOptions
          .filter(opt => {
            // Don't show merge for non-mergeable conflicts
            if (opt.value === 'merge' && conflict.type !== 'file-modified') return false;
            // Don't show replace for missing dependencies
            if (opt.value === 'replace' && conflict.type === 'dependency-missing') return false;
            return true;
          })
          .map((option) => (
            <button
              key={option.value}
              onClick={() => onResolve(option.value)}
              className={clsx(
                'px-3 py-1.5 text-sm rounded-md border transition-colors',
                resolution === option.value
                  ? 'border-primary-500 bg-primary-500/10 text-primary-400'
                  : 'border-surface-600 text-surface-300 hover:border-surface-500 hover:bg-surface-700/50'
              )}
              title={option.description}
            >
              {option.label}
            </button>
          ))}
      </div>
    </div>
  );
}
