// SPDX-License-Identifier: MIT
/**
 * ManageModal - Full-screen modal for Manage panel
 *
 * Opens ManagePanel in a full-screen overlay for better usability
 * when configuring hooks and other settings.
 */

import { useEffect, useCallback } from 'react';
import { useUIStore } from '../../stores/ui.store';
import { useProjectStore } from '../../stores/project.store';
import { invalidateCache } from '@/hooks/useApi';
import { ManagePanel } from './ManagePanel';

export const MANAGE_MODAL_ID = 'manage-fullscreen';

export function ManageModal() {
  const isOpen = useUIStore((s) => s.modals[MANAGE_MODAL_ID] ?? false);
  const closeModal = useUIStore((s) => s.closeModal);
  const setPanel = useUIStore((s) => s.setPanel);
  const setStep = useUIStore((s) => s.setStep);
  const projectPath = useProjectStore((s) => s.projectPath);
  const setIsInstalled = useProjectStore((s) => s.setIsInstalled);

  // After uninstall, leave the (now empty) manage view and return to the
  // install wizard — mirrors ToolWindowPanel's handler so the behaviour is
  // the same whether Manage was opened as a tool window or this full-screen
  // modal.
  const handleUninstall = useCallback(() => {
    setIsInstalled(false);
    closeModal(MANAGE_MODAL_ID);
    setPanel('wizard');
    setStep(1);
    invalidateCache();
  }, [setIsInstalled, closeModal, setPanel, setStep]);

  // Handle escape key to close
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen) {
      closeModal(MANAGE_MODAL_ID);
    }
  }, [isOpen, closeModal]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !projectPath) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-900">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-surface-800 border-b border-surface-700">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h1 className="text-lg font-semibold text-surface-100">Manage Project</h1>
          <span className="text-sm text-surface-400 ml-2">
            {projectPath.split(/[/\\]/).pop()}
          </span>
        </div>

        <button
          onClick={() => closeModal(MANAGE_MODAL_ID)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg
            bg-surface-700 hover:bg-surface-600
            text-surface-200 hover:text-white
            transition-colors duration-150"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span className="text-sm font-medium">Close</span>
          <kbd className="ml-2 px-1.5 py-0.5 text-xs bg-surface-600 rounded">Esc</kbd>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          <ManagePanel projectPath={projectPath} onUninstall={handleUninstall} />
        </div>
      </div>
    </div>
  );
}
