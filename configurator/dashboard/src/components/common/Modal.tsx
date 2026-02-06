// SPDX-License-Identifier: MIT
import { useEffect, useCallback, useRef } from 'react';
import clsx from 'clsx';
import { Button } from './Button';
import { useFocusTrap } from '@/hooks';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: ModalSize;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
}

const sizeStyles: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl',
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap to keep focus within modal
  useFocusTrap(modalRef, isOpen);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        onClose();
      }
    },
    [onClose, closeOnEscape]
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current && closeOnOverlayClick) {
        onClose();
      }
    },
    [onClose, closeOnOverlayClick]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      aria-describedby={description ? 'modal-description' : undefined}
    >
      <div
        ref={modalRef}
        className={clsx(
          'relative w-full rounded-xl border border-surface-700 bg-surface-800 shadow-xl',
          sizeStyles[size]
        )}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between border-b border-surface-700 px-6 py-4">
            <div>
              {title && (
                <h2
                  id="modal-title"
                  className="text-lg font-semibold text-white"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p id="modal-description" className="mt-1 text-sm text-surface-400">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="text-surface-400 hover:text-white transition-colors"
                aria-label="Close modal"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="px-6 py-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-surface-700 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// Convenience component for common modal footers
export interface ModalFooterProps {
  onCancel: () => void;
  onConfirm: () => void;
  cancelText?: string;
  confirmText?: string;
  confirmVariant?: 'primary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}

export function ModalFooter({
  onCancel,
  onConfirm,
  cancelText = 'Cancel',
  confirmText = 'Confirm',
  confirmVariant = 'primary',
  loading = false,
  disabled = false,
}: ModalFooterProps) {
  return (
    <>
      <Button variant="secondary" onClick={onCancel} disabled={loading}>
        {cancelText}
      </Button>
      <Button
        variant={confirmVariant}
        onClick={onConfirm}
        loading={loading}
        disabled={disabled}
      >
        {confirmText}
      </Button>
    </>
  );
}
