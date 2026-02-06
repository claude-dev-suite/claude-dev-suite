// SPDX-License-Identifier: MIT
/**
 * Toast notification hook
 *
 * Provides helper functions to show toast notifications.
 * Integrates with UIStore for state management.
 *
 * @example
 * ```tsx
 * const toast = useToast();
 *
 * toast.success('Installation completed!');
 * toast.error('Failed to connect to server');
 * toast.warning('MCP server not found');
 * toast.info('Loading agents...');
 * ```
 */

import { useCallback } from 'react';
import { useUIStore } from '@/stores/ui.store';
import type { ToastType } from '@/stores/ui.store';
import { config } from '@/config';

export interface ToastOptions {
  /** Optional title */
  title?: string;
  /** Duration in ms (0 = persistent, default: 5000) */
  duration?: number;
}

export interface UseToastResult {
  /** Show a success toast */
  success: (message: string, options?: ToastOptions) => string;
  /** Show an error toast */
  error: (message: string, options?: ToastOptions) => string;
  /** Show a warning toast */
  warning: (message: string, options?: ToastOptions) => string;
  /** Show an info toast */
  info: (message: string, options?: ToastOptions) => string;
  /** Show a custom toast */
  custom: (type: ToastType, message: string, options?: ToastOptions) => string;
  /** Remove a toast by ID */
  remove: (id: string) => void;
  /** Clear all toasts */
  clear: () => void;
}

/**
 * Toast notification hook
 */
export function useToast(): UseToastResult {
  const addToast = useUIStore((state) => state.addToast);
  const removeToast = useUIStore((state) => state.removeToast);
  const clearToasts = useUIStore((state) => state.clearToasts);

  const success = useCallback(
    (message: string, options?: ToastOptions): string => {
      return addToast({
        type: 'success',
        message,
        title: options?.title,
        duration: options?.duration,
      });
    },
    [addToast]
  );

  const error = useCallback(
    (message: string, options?: ToastOptions): string => {
      return addToast({
        type: 'error',
        message,
        title: options?.title,
        duration: options?.duration ?? config.ui.toastErrorDuration, // Errors persist by default
      });
    },
    [addToast]
  );

  const warning = useCallback(
    (message: string, options?: ToastOptions): string => {
      return addToast({
        type: 'warning',
        message,
        title: options?.title,
        duration: options?.duration ?? config.ui.toastWarningDuration, // Warnings stay longer
      });
    },
    [addToast]
  );

  const info = useCallback(
    (message: string, options?: ToastOptions): string => {
      return addToast({
        type: 'info',
        message,
        title: options?.title,
        duration: options?.duration,
      });
    },
    [addToast]
  );

  const custom = useCallback(
    (type: ToastType, message: string, options?: ToastOptions): string => {
      return addToast({
        type,
        message,
        title: options?.title,
        duration: options?.duration,
      });
    },
    [addToast]
  );

  const remove = useCallback(
    (id: string) => {
      removeToast(id);
    },
    [removeToast]
  );

  const clear = useCallback(() => {
    clearToasts();
  }, [clearToasts]);

  return {
    success,
    error,
    warning,
    info,
    custom,
    remove,
    clear,
  };
}
