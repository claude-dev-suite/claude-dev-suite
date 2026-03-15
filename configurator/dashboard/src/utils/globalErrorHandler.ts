// SPDX-License-Identifier: MIT
/**
 * Global Error Handler
 *
 * Catches all uncaught errors and unhandled promise rejections.
 * Logs them with full context for debugging.
 */

import { logger } from './logger';

interface ErrorContext {
  url: string;
  userAgent: string;
  timestamp: string;
  viewport: {
    width: number;
    height: number;
  };
}

// Get error context
function getErrorContext(): ErrorContext {
  return {
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
  };
}

// Handle uncaught errors
function handleError(
  event: Event | string,
  source?: string,
  lineno?: number,
  colno?: number,
  error?: Error
): void {
  const context = getErrorContext();

  if (error instanceof Error) {
    // Modern browsers provide Error object
    logger.error('Uncaught error', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      source,
      line: lineno,
      column: colno,
      context,
    });
  } else if (typeof event === 'string') {
    // Legacy error format
    logger.error('Uncaught error', {
      message: event,
      source,
      line: lineno,
      column: colno,
      context,
    });
  } else if (event instanceof ErrorEvent) {
    // ErrorEvent object
    logger.error('Uncaught error', {
      message: event.message,
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
      error: event.error,
      context,
    });
  }
}

// Handle unhandled promise rejections
function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  const context = getErrorContext();

  logger.error('Unhandled promise rejection', {
    reason: event.reason,
    promise: String(event.promise),
    context,
  });
}

/**
 * Initialize global error handlers
 * Call this once at app startup (in main.tsx)
 */
export function initGlobalErrorHandler(): void {
  // Catch uncaught errors
  window.onerror = handleError;

  // Catch unhandled promise rejections
  window.onunhandledrejection = handleUnhandledRejection;

  logger.info('Global error handlers initialized');
}

/**
 * Cleanup global error handlers (for testing)
 */
export function cleanupGlobalErrorHandler(): void {
  window.onerror = null;
  window.onunhandledrejection = null;
}
