// SPDX-License-Identifier: MIT
/**
 * Update Card Component
 *
 * Displays a single feature update with its status and actions.
 */

import { useState } from 'react';
import { Badge, Button } from '../common';
import type { FeatureCardInfo, AvailableUpgrade, ConflictResolution } from '@/types';
import clsx from 'clsx';

export interface UpdateCardProps {
  card: FeatureCardInfo;
  upgrade?: AvailableUpgrade;
  isSelected: boolean;
  onToggle: () => void;
  onViewConflicts?: () => void;
  resolutions?: Record<string, ConflictResolution>;
  onInstallPackage?: (packageName: string) => Promise<boolean>;
  onInstallAgent?: (agentId: string) => Promise<boolean>;
}

const typeIcons: Record<string, string> = {
  hook: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
  'agent-update': 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  'skill-update': 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  config: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
  'mcp-server': 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2',
};

const statusColors: Record<FeatureCardInfo['statusColor'], { bg: string; text: string; border: string }> = {
  green: {
    bg: 'bg-green-500/10',
    text: 'text-green-400',
    border: 'border-green-500/30',
  },
  blue: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
  },
  yellow: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    border: 'border-yellow-500/30',
  },
  gray: {
    bg: 'bg-surface-700/50',
    text: 'text-surface-400',
    border: 'border-surface-600',
  },
};

export function UpdateCard({
  card,
  upgrade,
  isSelected,
  onToggle,
  onViewConflicts,
  resolutions,
  onInstallPackage,
  onInstallAgent,
}: UpdateCardProps) {
  const { feature, statusLabel, statusColor, canApply, hasConflicts, conflictCount } = card;
  const colors = statusColors[statusColor];
  const iconPath = typeIcons[feature.type] || typeIcons.config;

  const [installingItems, setInstallingItems] = useState<Set<string>>(new Set());

  const allConflictsResolved = resolutions
    ? upgrade?.conflicts.every(c => resolutions[c.target])
    : false;

  // Parse missing dependencies into packages and agents
  const missingPackages = upgrade?.missingDependencies.filter(dep => !dep.endsWith('-expert')) || [];
  const missingAgents = upgrade?.missingDependencies.filter(dep => dep.endsWith('-expert')) || [];

  const handleInstallPackage = async (packageName: string) => {
    if (!onInstallPackage) return;
    setInstallingItems(prev => new Set(prev).add(packageName));
    try {
      await onInstallPackage(packageName);
    } finally {
      setInstallingItems(prev => {
        const next = new Set(prev);
        next.delete(packageName);
        return next;
      });
    }
  };

  const handleInstallAgent = async (agentId: string) => {
    if (!onInstallAgent) return;
    setInstallingItems(prev => new Set(prev).add(agentId));
    try {
      await onInstallAgent(agentId);
    } finally {
      setInstallingItems(prev => {
        const next = new Set(prev);
        next.delete(agentId);
        return next;
      });
    }
  };

  return (
    <div
      className={clsx(
        'p-4 rounded-lg border transition-all',
        isSelected
          ? 'border-primary-500 bg-primary-500/5'
          : 'border-surface-700 bg-surface-800/50 hover:border-surface-600'
      )}
    >
      <div className="flex items-start gap-4">
        {/* Checkbox (only for applicable features) */}
        {canApply && (
          <div className="flex-shrink-0 pt-1">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggle}
              className="w-4 h-4 rounded border-surface-600 bg-surface-700 text-primary-500 focus:ring-primary-500 focus:ring-offset-0 focus:ring-offset-surface-800"
            />
          </div>
        )}

        {/* Icon */}
        <div className={clsx('flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center', colors.bg)}>
          <svg
            className={clsx('w-5 h-5', colors.text)}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={iconPath} />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-white truncate">{feature.name}</h4>
            <Badge
              variant={statusColor === 'green' ? 'success' : statusColor === 'yellow' ? 'warning' : 'default'}
              className="flex-shrink-0"
            >
              v{feature.version}
            </Badge>
          </div>

          <p className="text-sm text-surface-400 mb-2 line-clamp-2">
            {feature.description}
          </p>

          {/* Status and Actions Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={clsx('text-xs', colors.text)}>{statusLabel}</span>

              {/* Conflicts indicator */}
              {hasConflicts && (
                <Badge variant="warning" className="text-xs">
                  {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}
                  {allConflictsResolved && ' (resolved)'}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {hasConflicts && onViewConflicts && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewConflicts();
                  }}
                >
                  {allConflictsResolved ? 'Edit Resolutions' : 'Resolve Conflicts'}
                </Button>
              )}
            </div>
          </div>

          {/* Missing prerequisites section */}
          {(missingPackages.length > 0 || missingAgents.length > 0) && (
            <div className="mt-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
              <p className="text-xs text-orange-400 font-medium mb-2">
                Missing prerequisites:
              </p>
              <div className="flex flex-wrap gap-2">
                {missingPackages.map(pkg => (
                  <button
                    key={pkg}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleInstallPackage(pkg);
                    }}
                    disabled={installingItems.has(pkg) || !onInstallPackage}
                    className={clsx(
                      'inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
                      installingItems.has(pkg)
                        ? 'bg-surface-700 text-surface-400 cursor-wait'
                        : 'bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 cursor-pointer'
                    )}
                  >
                    {installingItems.has(pkg) ? (
                      <>
                        <span className="w-3 h-3 border border-orange-400 border-t-transparent rounded-full animate-spin" />
                        Installing...
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        {pkg}
                      </>
                    )}
                  </button>
                ))}
                {missingAgents.map(agent => (
                  <button
                    key={agent}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleInstallAgent(agent);
                    }}
                    disabled={installingItems.has(agent) || !onInstallAgent}
                    className={clsx(
                      'inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
                      installingItems.has(agent)
                        ? 'bg-surface-700 text-surface-400 cursor-wait'
                        : 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 cursor-pointer'
                    )}
                  >
                    {installingItems.has(agent) ? (
                      <>
                        <span className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                        Installing...
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        {agent}
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Feature metadata */}
      <div className="mt-3 pt-3 border-t border-surface-700/50 flex items-center gap-4 text-xs text-surface-500">
        <span>Type: {feature.type}</span>
        <span>Added in: v{feature.addedInVersion}</span>
        {feature.dependencies?.agents && feature.dependencies.agents.length > 0 && (
          <span>Requires: {feature.dependencies.agents.join(', ')}</span>
        )}
      </div>
    </div>
  );
}
