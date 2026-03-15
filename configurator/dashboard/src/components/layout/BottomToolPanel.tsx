// SPDX-License-Identifier: MIT
/**
 * BottomToolPanel - Panel that opens from the bottom (quarter height)
 *
 * Displays the content of the active bottom tool window.
 */

import { useUIStore } from '../../stores/ui.store';
import { LogViewer } from '../common/LogViewer';

export function BottomToolPanel() {
  const { activeBottomToolWindow, bottomToolWindows, toggleBottomToolWindow } = useUIStore();

  if (!activeBottomToolWindow) return null;

  const height = bottomToolWindows[activeBottomToolWindow]?.height || 200;

  const getTitle = () => {
    switch (activeBottomToolWindow) {
      case 'terminal':
        return 'Terminal';
      case 'logs':
        return 'Logs';
      default:
        return '';
    }
  };

  return (
    <div
      className="border-t border-surface-700 bg-surface-800 flex flex-col"
      style={{ height }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-surface-700 bg-surface-850">
        <span className="text-xs font-medium text-surface-300">{getTitle()}</span>
        <button
          onClick={() => toggleBottomToolWindow(activeBottomToolWindow)}
          className="p-0.5 rounded hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeBottomToolWindow === 'terminal' && (
          <div className="h-full bg-surface-900 p-4 font-mono text-xs text-surface-300">
            <p className="text-surface-400">Terminal coming soon...</p>
            <p className="text-green-400 mt-2">$ _</p>
          </div>
        )}
        {activeBottomToolWindow === 'logs' && (
          <LogViewer source="all" enableStreaming={true} maxLogs={1000} />
        )}
      </div>
    </div>
  );
}
