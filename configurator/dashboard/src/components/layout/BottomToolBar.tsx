// SPDX-License-Identifier: MIT
/**
 * BottomToolBar - Horizontal bar with bottom tool window tabs
 *
 * Displays small tabs at the bottom left that toggle tool windows opening upward.
 */

import { useUIStore, type BottomToolWindowId } from '../../stores/ui.store';

interface BottomToolTab {
  id: BottomToolWindowId;
  label: string;
  icon: React.ReactNode;
}

const BOTTOM_TOOL_TABS: BottomToolTab[] = [
  {
    id: 'terminal',
    label: 'Terminal',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'logs',
    label: 'Logs',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
];

export function BottomToolBar() {
  const { bottomToolWindows, activeBottomToolWindow, toggleBottomToolWindow } = useUIStore();

  return (
    <div className="flex items-center h-7 bg-surface-800 border-t border-surface-700 px-1 gap-0.5">
      {BOTTOM_TOOL_TABS.map((tab) => {
        const isOpen = bottomToolWindows[tab.id]?.isOpen;
        const isActive = activeBottomToolWindow === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => toggleBottomToolWindow(tab.id)}
            className={`
              flex items-center gap-1 px-2 py-1 rounded text-xs font-medium
              transition-colors duration-150
              ${isActive
                ? 'bg-accent-600 text-white'
                : isOpen
                  ? 'bg-surface-600 text-surface-100'
                  : 'text-surface-400 hover:bg-surface-700 hover:text-surface-200'
              }
            `}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export type { BottomToolTab };
