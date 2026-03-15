// SPDX-License-Identifier: MIT
import { useEffect, useState, useCallback } from 'react';
import clsx from 'clsx';
import { useUIStore } from '@/stores/ui.store';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

// Legacy interface for backward compatibility
export interface ToastData {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

export interface ToastProps extends ToastData {
  onClose: (id: string) => void;
}

const variantStyles: Record<ToastVariant, { bg: string; icon: string; iconPath: string }> = {
  success: {
    bg: 'bg-green-500/10 border-green-500/30',
    icon: 'text-green-400',
    iconPath: 'M5 13l4 4L19 7',
  },
  error: {
    bg: 'bg-red-500/10 border-red-500/30',
    icon: 'text-red-400',
    iconPath: 'M6 18L18 6M6 6l12 12',
  },
  warning: {
    bg: 'bg-yellow-500/10 border-yellow-500/30',
    icon: 'text-yellow-400',
    iconPath: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  },
  info: {
    bg: 'bg-blue-500/10 border-blue-500/30',
    icon: 'text-blue-400',
    iconPath: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
};

export function Toast({ id, message, variant, duration = 5000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isLeaving, setIsLeaving] = useState(false);

  const handleClose = useCallback(() => {
    setIsLeaving(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose(id);
    }, 200);
  }, [id, onClose]);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(handleClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, handleClose]);

  if (!isVisible) return null;

  const styles = variantStyles[variant];

  return (
    <div
      className={clsx(
        'flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg',
        'transition-all duration-200',
        styles.bg,
        isLeaving ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
      )}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <svg
        className={clsx('w-5 h-5 flex-shrink-0', styles.icon)}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d={styles.iconPath}
        />
      </svg>
      <p className="text-sm text-white flex-1">{message}</p>
      <button
        onClick={handleClose}
        className="text-surface-400 hover:text-white transition-colors"
        aria-label="Close notification"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// Toast container for managing multiple toasts - reads from global Zustand store
export function ToastContainer() {
  const toasts = useUIStore((state) => state.toasts);
  const removeToast = useUIStore((state) => state.removeToast);

  // Map UI store toast type to component variant
  const mapTypeToVariant = (type: string): ToastVariant => {
    return type as ToastVariant;
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          message={toast.message}
          variant={mapTypeToVariant(toast.type)}
          duration={toast.duration}
          onClose={removeToast}
        />
      ))}
    </div>
  );
}
