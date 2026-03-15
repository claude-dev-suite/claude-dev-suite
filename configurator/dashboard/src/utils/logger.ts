// SPDX-License-Identifier: MIT
/**
 * Frontend Logger Utility
 *
 * Logs to console AND sends to backend for persistent file logging.
 * In Electron, logs are written to: %APPDATA%/@dev-suite/dashboard/logs/frontend.log
 */

import { API_BASE } from './api';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogEntry {
  level: LogLevel;
  component: string;
  message: string;
  data?: unknown;
  timestamp: string;
  correlationId: string;
  context?: Record<string, unknown>;
}

interface Logger {
  error: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  debug: (message: string, data?: unknown) => void;
  log: (message: string, data?: unknown) => void;
  time: (label: string) => () => void;
  withContext: (context: Record<string, unknown>) => Logger;
}

// Queue for batching log entries
const logQueue: LogEntry[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL = 500; // ms
const MAX_QUEUE_SIZE = 50;

// Correlation ID generation (cryptographically secure)
function generateCorrelationId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('').slice(0, 21);
}

// Session correlation ID (persists for the session)
const sessionCorrelationId = generateCorrelationId();

// Get or create correlation ID for current operation
function getCorrelationId(): string {
  // Try to get from current context, fallback to session ID
  return sessionCorrelationId;
}

// Environment-based log level filtering
const isDevelopment = import.meta.env.DEV;
const enabledLevels = new Set<LogLevel>(
  isDevelopment
    ? ['error', 'warn', 'info', 'debug']
    : ['error', 'warn', 'info']
);

// Flush logs to backend
async function flushLogs(): Promise<void> {
  if (logQueue.length === 0) return;

  const entries = logQueue.splice(0, logQueue.length);

  try {
    await fetch(`${API_BASE}/api/log/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': sessionCorrelationId,
      },
      body: JSON.stringify({
        entries,
        sessionId: sessionCorrelationId,
      }),
    });
  } catch {
    // Silently fail - don't want logging to break the app
    // Log entries are already in console anyway
  }
}

// Schedule flush
function scheduleFlush(): void {
  if (flushTimeout) return;

  flushTimeout = setTimeout(() => {
    flushTimeout = null;
    flushLogs();
  }, FLUSH_INTERVAL);
}

// Add entry to queue
function queueLog(entry: LogEntry): void {
  logQueue.push(entry);

  // Immediate flush if queue is full or it's an error
  if (logQueue.length >= MAX_QUEUE_SIZE || entry.level === 'error') {
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }
    flushLogs();
  } else {
    scheduleFlush();
  }
}

// Serialize data for logging with enhanced error handling
function serializeData(data: unknown): unknown {
  if (data === undefined) return undefined;

  try {
    // Handle Error objects specially with cause chain
    if (data instanceof Error) {
      const errorData: {
        name: string;
        message: string;
        stack?: string;
        cause?: unknown;
        componentStack?: string;
      } = {
        name: data.name,
        message: data.message,
        stack: data.stack,
      };

      // Include error cause chain (ES2022 feature)
      if ('cause' in data && data.cause) {
        errorData.cause = serializeData(data.cause);
      }

      // Include React error boundary component stack
      if ('componentStack' in data && typeof data.componentStack === 'string') {
        errorData.componentStack = data.componentStack;
      }

      return errorData;
    }

    // Try to clone - will fail for circular refs or functions
    JSON.stringify(data);
    return data;
  } catch {
    return String(data);
  }
}

function createLogger(prefix: string, additionalContext?: Record<string, unknown>): Logger {
  const formatMessage = (level: LogLevel): string => {
    const timestamp = (new Date().toISOString().split('T')[1] ?? '').slice(0, 12);
    return `[${timestamp}] [${level.toUpperCase()}] [${prefix}]`;
  };

  const log = (level: LogLevel, message: string, data?: unknown): void => {
    // Skip if level is filtered out
    if (!enabledLevels.has(level)) {
      return;
    }

    // Console logging
    const consolePrefix = formatMessage(level);
    const consoleMethod = level === 'error' ? console.error
      : level === 'warn' ? console.warn
      : level === 'debug' ? console.log
      : console.info;

    if (data !== undefined) {
      consoleMethod(consolePrefix, message, data);
    } else {
      consoleMethod(consolePrefix, message);
    }

    // Queue for backend
    queueLog({
      level,
      component: prefix,
      message,
      data: serializeData(data),
      timestamp: new Date().toISOString(),
      correlationId: getCorrelationId(),
      context: additionalContext,
    });
  };

  // Performance timing
  const time = (label: string): (() => void) => {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      log('debug', `${label} took ${duration.toFixed(2)}ms`);
    };
  };

  // Create logger with additional context
  const withContext = (context: Record<string, unknown>): Logger => {
    return createLogger(prefix, { ...additionalContext, ...context });
  };

  return {
    error: (message: string, data?: unknown) => log('error', message, data),
    warn: (message: string, data?: unknown) => log('warn', message, data),
    info: (message: string, data?: unknown) => log('info', message, data),
    debug: (message: string, data?: unknown) => log('debug', message, data),
    log: (message: string, data?: unknown) => log('info', message, data),
    time,
    withContext,
  };
}

// Pre-configured loggers for different modules
export const logger = createLogger('App');
export const apiLogger = createLogger('API');
export const wsLogger = createLogger('WebSocket');
export const uiLogger = createLogger('UI');

// Factory function for custom loggers
export function getLogger(prefix: string): Logger {
  return createLogger(prefix);
}

// Export session ID for correlation
export function getSessionId(): string {
  return sessionCorrelationId;
}

// Flush remaining logs when page unloads
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (logQueue.length > 0) {
      // Use sendBeacon for reliability on page unload
      const data = JSON.stringify({
        entries: logQueue,
        sessionId: sessionCorrelationId,
      });
      navigator.sendBeacon(`${API_BASE}/api/log/batch`, data);
    }
  });
}

// Export for direct use
export default logger;

// Export types for external use
export type { Logger, LogLevel, LogEntry };
