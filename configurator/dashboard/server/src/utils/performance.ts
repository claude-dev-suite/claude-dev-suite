// SPDX-License-Identifier: MIT
/**
 * Performance Timing Utilities
 *
 * Helper functions for timing critical operations with automatic slow operation warnings.
 */

import { getLogger, type Logger, type LogContext } from './logger.js';

/**
 * Timing thresholds for different operation types (in milliseconds)
 */
export const TIMING_THRESHOLDS = {
  // API operations
  API_CALL: 2000,

  // File operations
  FILE_READ: 500,
  FILE_WRITE: 1000,
  FILE_COPY: 1000,
  DIRECTORY_SCAN: 1000,

  // Detection operations
  DETECTION_FULL: 5000,
  DETECTION_FRAMEWORK: 2000,
  DETECTION_DATABASE: 1000,
  DETECTION_GIT: 1000,
  DETECTION_ENV: 1000,

  // Installation operations
  INSTALLATION_FULL: 10000,
  INSTALLATION_AGENT: 2000,
  INSTALLATION_MCP: 5000,
  INSTALLATION_NPM: 30000,

  // Orchestrator operations
  JOB_EXECUTION: 60000,
  CHAT_MESSAGE: 30000,
  SUBTASK_EXECUTION: 20000,

  // Data loading operations
  LOAD_AGENTS: 2000,
  LOAD_MCP_SERVERS: 2000,
  LOAD_ENV_VARS: 1000,

  // Git operations
  GIT_STATUS: 2000,
  GIT_DIFF: 3000,
  GIT_COMMIT: 2000,
  GIT_PUSH: 10000,
  GIT_PULL: 10000,
} as const;

/**
 * Create a timed operation with automatic slow operation warning
 *
 * @param logger - Logger instance to use
 * @param operation - Operation name
 * @param slowThreshold - Threshold in ms after which operation is considered slow
 * @param context - Additional context data to log
 * @returns Function to call when operation completes
 */
export function timeOperation(
  logger: Logger,
  operation: string,
  slowThreshold: number,
  context: LogContext = {}
): () => void {
  const startTime = Date.now();

  logger.debug(`Starting: ${operation}`, context);

  return () => {
    const duration = Date.now() - startTime;
    const isSlow = duration > slowThreshold;

    if (isSlow) {
      logger.warn(`Completed (SLOW): ${operation}`, {
        ...context,
        duration,
        threshold: slowThreshold,
        data: {
          ...context.data,
          duration,
          threshold: slowThreshold,
          slowBy: duration - slowThreshold,
        },
      });
    } else {
      logger.debug(`Completed: ${operation}`, {
        ...context,
        duration,
        data: {
          ...context.data,
          duration,
        },
      });
    }
  };
}

/**
 * Decorator-style timing wrapper for async functions
 *
 * @param operation - Operation name
 * @param slowThreshold - Threshold in ms
 * @param loggerName - Logger component name
 */
export function timed(
  operation: string,
  slowThreshold: number,
  loggerName?: string
) {
  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args: any[]) {
      const logger = loggerName ? getLogger(loggerName) : getLogger('TimedOperation');
      const endTimer = timeOperation(logger, operation, slowThreshold);

      try {
        const result = await originalMethod.apply(this, args);
        endTimer();
        return result;
      } catch (error) {
        endTimer();
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Helper to format file sizes for logging
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = sizes[i] ?? 'B';
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${size}`;
}

/**
 * Helper to format counts for logging
 */
export function formatCount(count: number, singular: string, plural?: string): string {
  const label = count === 1 ? singular : (plural || `${singular}s`);
  return `${count} ${label}`;
}
