// SPDX-License-Identifier: MIT

import type { TutorialGroup } from '@/types/tutorial';

interface TutorialProgressProps {
  current: number;
  total: number;
  groups: TutorialGroup[];
  currentGroup: TutorialGroup;
}

const GROUP_LABELS: Record<TutorialGroup, string> = {
  welcome: 'Welcome',
  layout: 'Layout',
  orchestrator: 'Orchestrator',
  'code-review': 'Code Review',
  git: 'Git',
  manage: 'Manage',
  completion: 'Done',
};

export function TutorialProgress({ current, total, groups, currentGroup }: TutorialProgressProps) {
  const uniqueGroups = [...new Set(groups)];

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-surface-400">
        {current + 1} / {total}
      </span>
      <div className="flex items-center gap-1">
        {uniqueGroups.map((group) => (
          <div
            key={group}
            className={`w-2 h-2 rounded-full transition-colors ${
              group === currentGroup
                ? 'bg-primary-400'
                : uniqueGroups.indexOf(group) < uniqueGroups.indexOf(currentGroup)
                  ? 'bg-primary-600'
                  : 'bg-surface-600'
            }`}
            title={GROUP_LABELS[group]}
          />
        ))}
      </div>
    </div>
  );
}
