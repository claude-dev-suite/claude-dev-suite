// SPDX-License-Identifier: MIT
/**
 * ToolWindowPanel - Resizable container for tool window content
 *
 * Features:
 * - Draggable left border for resizing
 * - Header with title and close button
 * - Content area that hosts the active tool component
 */

import { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import { useUIStore, type ToolWindowId } from '../../stores/ui.store';
import { useProjectStore } from '../../stores/project.store';
import { invalidateCache } from '@/hooks/useApi';

// Lazy load tool window content components
const GitPanel = lazy(() => import('../toolwindow/git/GitPanel').then(m => ({ default: m.GitPanel })));
const ManagePanel = lazy(() => import('../manage/ManagePanel').then(m => ({ default: m.ManagePanel })));
const AnalyticsPanel = lazy(() => import('../analytics/AnalyticsPanel').then(m => ({ default: m.AnalyticsPanel })));
const FilesPanel = lazy(() => import('../toolwindow/files/FilesPanel').then(m => ({ default: m.FilesPanel })));

interface ToolWindowConfig {
  id: ToolWindowId;
  title: string;
  icon: React.ReactNode;
}

const TOOL_CONFIGS: Record<ToolWindowId, ToolWindowConfig> = {
  git: {
    id: 'git',
    title: 'Git',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
  },
  manage: {
    id: 'manage',
    title: 'Manage',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  analytics: {
    id: 'analytics',
    title: 'Analytics',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  files: {
    id: 'files',
    title: 'Files',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      </svg>
    ),
  },
};

export function ToolWindowPanel() {
  const {
    activeToolWindow,
    toolWindows,
    closeToolWindow,
    setToolWindowWidth,
  } = useUIStore();

  const projectPath = useProjectStore((s) => s.projectPath);
  const setIsInstalled = useProjectStore((s) => s.setIsInstalled);
  const setPanel = useUIStore((s) => s.setPanel);
  const setStep = useUIStore((s) => s.setStep);

  // Handle uninstall - close manage panel, go to wizard
  const handleUninstall = useCallback(() => {
    // Update store state
    setIsInstalled(false);
    // Close the manage tool window
    closeToolWindow('manage');
    // Navigate to wizard
    setPanel('wizard');
    setStep(1);
    // Invalidate API cache to force re-fetch
    invalidateCache();
  }, [setIsInstalled, closeToolWindow, setPanel, setStep]);

  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Get current tool window config
  const activeConfig = activeToolWindow ? TOOL_CONFIGS[activeToolWindow] : null;
  const currentWidth = activeToolWindow ? toolWindows[activeToolWindow].width : 350;

  // Handle resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing || !activeToolWindow) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!panelRef.current) return;

      const containerRect = panelRef.current.parentElement?.getBoundingClientRect();
      if (!containerRect) return;

      // Calculate new width from right edge
      const newWidth = containerRect.right - e.clientX;
      setToolWindowWidth(activeToolWindow, newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, activeToolWindow, setToolWindowWidth]);

  // Don't render if no active tool window
  if (!activeToolWindow || !activeConfig) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      className="flex flex-col bg-surface-800 border-l border-surface-700 relative"
      style={{ width: currentWidth }}
    >
      {/* Resize handle */}
      <div
        className={`
          absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize
          hover:bg-accent-500 transition-colors z-10
          ${isResizing ? 'bg-accent-500' : 'bg-transparent'}
        `}
        onMouseDown={handleMouseDown}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface-900 border-b border-surface-700">
        <div className="flex items-center gap-2 text-surface-100">
          {activeConfig.icon}
          <span className="text-sm font-medium">{activeConfig.title}</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Minimize button */}
          <button
            onClick={() => closeToolWindow(activeToolWindow)}
            className="p-1 rounded hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors"
            title="Minimize"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>

          {/* Close button */}
          <button
            onClick={() => closeToolWindow(activeToolWindow)}
            className="p-1 rounded hover:bg-surface-700 text-surface-400 hover:text-surface-200 transition-colors"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full text-surface-400">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          }
        >
          {activeToolWindow === 'git' && <GitPanel />}
          {activeToolWindow === 'manage' && projectPath && (
            <div className="p-4 overflow-auto h-full">
              <ManagePanel projectPath={projectPath} onUninstall={handleUninstall} />
            </div>
          )}
          {activeToolWindow === 'analytics' && projectPath && (
            <div className="overflow-auto h-full">
              <AnalyticsPanel projectPath={projectPath} />
            </div>
          )}
          {activeToolWindow === 'files' && (
            <div className="h-full overflow-hidden">
              <FilesPanel />
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}

export type { ToolWindowConfig };
