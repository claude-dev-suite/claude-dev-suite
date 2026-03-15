// SPDX-License-Identifier: MIT
import type { KBUsageStats } from '@/types';
import { Card } from '../common';
import clsx from 'clsx';

export interface StatsCardsProps {
  stats: KBUsageStats;
}

export function StatsCards({ stats }: StatsCardsProps) {
  // Get top technologies
  const topTechnologies = Object.entries(stats.byTechnology)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Get top tools
  const topTools = Object.entries(stats.byTool)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {/* Total Requests */}
      <Card padding="md">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-surface-400">Total Requests</p>
            <p className="text-3xl font-bold text-white mt-1">{stats.totalRequests}</p>
          </div>
          <div className="p-2 bg-primary-500/10 rounded-lg">
            <svg
              className="w-6 h-6 text-primary-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
        </div>
      </Card>

      {/* Success Rate */}
      <Card padding="md">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-surface-400">Success Rate</p>
            <p className="text-3xl font-bold text-white mt-1">
              {(stats.successRate * 100).toFixed(1)}%
            </p>
          </div>
          <div
            className={clsx(
              'p-2 rounded-lg',
              stats.successRate >= 0.9
                ? 'bg-green-500/10'
                : stats.successRate >= 0.7
                ? 'bg-yellow-500/10'
                : 'bg-red-500/10'
            )}
          >
            <svg
              className={clsx(
                'w-6 h-6',
                stats.successRate >= 0.9
                  ? 'text-green-400'
                  : stats.successRate >= 0.7
                  ? 'text-yellow-400'
                  : 'text-red-400'
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        </div>
        <div className="mt-3">
          <div className="h-2 bg-surface-700 rounded-full overflow-hidden">
            <div
              className={clsx(
                'h-full',
                stats.successRate >= 0.9
                  ? 'bg-green-500'
                  : stats.successRate >= 0.7
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              )}
              style={{ width: `${stats.successRate * 100}%` }}
            />
          </div>
        </div>
      </Card>

      {/* Top Technologies */}
      <Card padding="md">
        <p className="text-sm text-surface-400 mb-3">Top Technologies</p>
        <div className="space-y-2">
          {topTechnologies.map(([tech, count], index) => (
            <div key={tech} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-surface-400">{index + 1}.</span>
                <span className="text-sm text-white capitalize">{tech}</span>
              </div>
              <span className="text-xs text-surface-400">{count}</span>
            </div>
          ))}
          {topTechnologies.length === 0 && (
            <p className="text-sm text-surface-400 italic">No data</p>
          )}
        </div>
      </Card>

      {/* Top Tools */}
      <Card padding="md">
        <p className="text-sm text-surface-400 mb-3">Top Tools</p>
        <div className="space-y-2">
          {topTools.map(([toolName, count], index) => (
            <div key={toolName} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-surface-400">{index + 1}.</span>
                <span className="text-sm text-white font-mono text-xs">{toolName}</span>
              </div>
              <span className="text-xs text-surface-400">{count}</span>
            </div>
          ))}
          {topTools.length === 0 && (
            <p className="text-sm text-surface-400 italic">No data</p>
          )}
        </div>
      </Card>
    </div>
  );
}
