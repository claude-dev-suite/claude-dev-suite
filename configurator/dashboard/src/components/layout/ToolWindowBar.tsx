// SPDX-License-Identifier: MIT
/**
 * ToolWindowBar - Vertical sidebar with tool window tabs (IntelliJ-style)
 *
 * Displays vertical tabs on the right side of the screen that toggle tool windows.
 */

import { useUIStore, type ToolWindowId } from '../../stores/ui.store';
import { MANAGE_MODAL_ID } from '../manage/ManageModal';

interface ToolWindowTab {
  id: ToolWindowId | 'manage-modal';
  label: string;
  icon: React.ReactNode;
  isModal?: boolean;
}

const TOOL_TABS: ToolWindowTab[] = [
  {
    id: 'git',
    label: 'Git',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
  },
  {
    id: 'manage-modal',
    label: 'Manage',
    isModal: true,
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: 'files',
    label: 'Files',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      </svg>
    ),
  },
];

export function ToolWindowBar() {
  const { toolWindows, activeToolWindow, toggleToolWindow, modals, openModal } = useUIStore();

  const handleTabClick = (tab: ToolWindowTab) => {
    if (tab.isModal) {
      openModal(MANAGE_MODAL_ID);
    } else {
      toggleToolWindow(tab.id as ToolWindowId);
    }
  };

  return (
    <div className="flex flex-col w-10 bg-surface-800 border-l border-surface-700" data-tutorial="tool-window-bar">
      {/* Tool tabs - displayed vertically */}
      <div className="flex flex-col items-center py-2 gap-1">
        {TOOL_TABS.map((tab) => {
          const isModal = tab.isModal;
          const isModalOpen = isModal && modals[MANAGE_MODAL_ID];
          const isOpen = isModal ? isModalOpen : toolWindows[tab.id as ToolWindowId]?.isOpen;
          const isActive = isModal ? isModalOpen : activeToolWindow === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab)}
              className={`
                group relative flex items-center justify-center w-8 h-8 rounded
                transition-colors duration-150
                ${isActive
                  ? 'bg-accent-600 text-white'
                  : isOpen
                    ? 'bg-surface-600 text-surface-100'
                    : 'text-surface-400 hover:bg-surface-700 hover:text-surface-200'
                }
              `}
              title={tab.label}
              data-tutorial={
                tab.id === 'git' ? 'git-tool-btn'
                  : tab.id === 'manage-modal' ? 'manage-btn'
                  : tab.id === 'analytics' ? 'analytics-tool-btn'
                  : undefined
              }
            >
              {tab.icon}

              {/* Tooltip */}
              <span className="
                absolute right-full mr-2 px-2 py-1 text-xs font-medium
                bg-surface-900 text-surface-100 rounded shadow-lg
                opacity-0 group-hover:opacity-100 transition-opacity
                pointer-events-none whitespace-nowrap z-50
              ">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Optional: Settings or other bottom actions */}
      <div className="flex flex-col items-center py-2 border-t border-surface-700">
        <button
          className="flex items-center justify-center w-8 h-8 rounded
            text-surface-400 hover:bg-surface-700 hover:text-surface-200
            transition-colors duration-150"
          title="Tool Window Settings"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export type { ToolWindowTab };
