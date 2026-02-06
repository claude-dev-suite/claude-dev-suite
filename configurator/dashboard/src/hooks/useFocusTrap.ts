// SPDX-License-Identifier: MIT
/**
 * Focus trap hook - Traps keyboard focus within a container
 *
 * This hook manages focus within a modal or dialog:
 * - Saves the previously focused element
 * - Focuses the first focusable element when activated
 * - Traps Tab/Shift+Tab to cycle through focusable elements
 * - Restores focus to the previous element when deactivated
 *
 * @example
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * useFocusTrap(containerRef, isOpen);
 * ```
 */

import { useEffect, useRef } from 'react';

/**
 * Get all focusable elements within a container
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  const elements = container.querySelectorAll<HTMLElement>(selector);
  return Array.from(elements).filter((el) => {
    // Check if element is visible
    return (
      el.offsetParent !== null &&
      !el.hasAttribute('hidden') &&
      window.getComputedStyle(el).display !== 'none' &&
      window.getComputedStyle(el).visibility !== 'hidden'
    );
  });
}

/**
 * Focus trap hook
 *
 * @param containerRef - Ref to the container element
 * @param isActive - Whether the focus trap is active
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement>,
  isActive: boolean
): void {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;

    // Save currently focused element
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Focus first focusable element
    const focusableElements = getFocusableElements(container);
    if (focusableElements.length > 0 && focusableElements[0]) {
      focusableElements[0].focus();
    }

    // Handle Tab key to trap focus
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = getFocusableElements(container);
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      // Safety check
      if (!firstElement || !lastElement) return;

      if (e.shiftKey) {
        // Shift+Tab: move backwards
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: move forwards
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    if (container) {
      container.addEventListener('keydown', handleKeyDown);
    }

    // Cleanup: restore focus to previous element
    return () => {
      if (container) {
        container.removeEventListener('keydown', handleKeyDown);
      }
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isActive, containerRef]);
}
