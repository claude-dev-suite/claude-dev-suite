// SPDX-License-Identifier: MIT
/**
 * Comprehensive Logging Service
 *
 * Features:
 * - Winston-based structured logging
 * - Correlation ID support for request tracking
 * - Child loggers for component-specific contexts
 * - File rotation (daily, max 14 days, max 20MB)
 * - Sensitive data redaction
 * - Performance timing utilities
 * - Cross-platform log directory support
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Log levels
export const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
} as const;

export type LogLevel = keyof typeof LOG_LEVELS;

// Sensitive fields to redact.
// The redaction loop uses lowerKey.includes(field.toLowerCase()) so these
// entries can be any case — but keep them lowercase for clarity.
// IMPORTANT: add new secret field names here AND in requestLogger.ts.
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'apikey',       // matches apiKey, api_key, adminApiKey, etc. via includes()
  'api_key',
  'adminapikey',
  'admin_api_key',
  'secret',
  'authorization',
  'auth',
  'bearer',
  'jwt',
  'sessionid',
  'session_id',
  'privatekey',
  'private_key',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
];

/**
 * Get cross-platform log directory
 */
function getLogDirectory(): string {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    // Windows: %APPDATA%/@dev-suite/dashboard/logs/
    const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
    return join(appData, '@dev-suite', 'dashboard', 'logs');
  } else {
    // Unix: ~/.dev-suite/dashboard/logs/
    return join(homedir(), '.dev-suite', 'dashboard', 'logs');
  }
}

/**
 * Ensure log directory exists
 */
function ensureLogDirectory(): string {
  const logDir = getLogDirectory();

  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  return logDir;
}

/**
 * Redact sensitive data from objects
 */
function redactSensitiveData(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveData);
  }

  const redacted: any = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_FIELDS.some(field =>
      lowerKey.includes(field.toLowerCase())
    );

    if (isSensitive) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveData(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Custom format for error serialization
 */
const errorFormat = winston.format((info) => {
  if (info.error instanceof Error) {
    info.error = {
      message: info.error.message,
      stack: info.error.stack,
      name: info.error.name,
      ...(info.error as any),
    };
  }
  return info;
});

/**
 * Redaction format
 */
const redactionFormat = winston.format((info) => {
  if (info.data) {
    info.data = redactSensitiveData(info.data);
  }
  if (info.meta) {
    info.meta = redactSensitiveData(info.meta);
  }
  return info;
});

/**
 * Console format (colorized, pretty)
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errorFormat(),
  redactionFormat(),
  winston.format.printf(({ timestamp, level, component, correlationId, message, data, duration, error }) => {
    let log = `${timestamp} [${level}]`;

    if (component) {
      log += ` [${component}]`;
    }

    if (correlationId && typeof correlationId === 'string') {
      log += ` [${correlationId.substring(0, 8)}]`;
    }

    log += `: ${message}`;

    if (duration !== undefined) {
      log += ` (${duration}ms)`;
    }

    if (data && Object.keys(data).length > 0) {
      log += `\n  ${JSON.stringify(data, null, 2)}`;
    }

    if (error) {
      log += `\n  Error: ${JSON.stringify(error, null, 2)}`;
    }

    return log;
  })
);

/**
 * File format (JSON)
 */
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  errorFormat(),
  redactionFormat(),
  winston.format.json()
);

/**
 * Create file transport with rotation
 */
function createFileTransport(filename: string): DailyRotateFile {
  const logDir = ensureLogDirectory();

  return new DailyRotateFile({
    dirname: logDir,
    filename: `${filename}-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    format: fileFormat,
    zippedArchive: true,
  });
}

/**
 * Logger interface with additional methods
 */
export interface Logger extends winston.Logger {
  /**
   * Create a child logger with additional context
   */
  createChildLogger(context: LogContext): Logger;

  /**
   * Start timing an operation
   * @returns Function to call when operation completes
   */
  time(operation: string, context?: LogContext): () => void;
}

/**
 * Log context for structured logging
 */
export interface LogContext {
  component?: string;
  correlationId?: string;
  data?: Record<string, any>;
  [key: string]: any;
}

/**
 * Create a logger instance
 */
/**
 * Build the `time()` extension bound to a specific logger, so a child logger
 * times against its own context rather than the parent's.
 */
function makeTimer(target: winston.Logger) {
  return (operation: string, context: LogContext = {}) => {
    const startTime = Date.now();
    const operationId = uuidv4();

    target.debug(`Starting: ${operation}`, { ...context, operationId });

    return () => {
      const duration = Date.now() - startTime;
      target.debug(`Completed: ${operation}`, { ...context, operationId, duration });
    };
  };
}

function createLogger(defaultContext: LogContext = {}): Logger {
  const baseLogger = winston.createLogger({
    levels: LOG_LEVELS,
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: defaultContext,
    transports: [
      // Console transport (colorized for development)
      new winston.transports.Console({
        format: consoleFormat,
      }),
      // Combined log file (all levels)
      createFileTransport('combined'),
      // Error log file (errors only)
      createFileTransport('error'),
    ],
    // Handle uncaught exceptions
    exceptionHandlers: [
      createFileTransport('exceptions'),
    ],
    // Handle unhandled rejections
    rejectionHandlers: [
      createFileTransport('rejections'),
    ],
  });

  // Only log errors to error file
  (baseLogger.transports[2] as DailyRotateFile).level = 'error';

  // Add custom methods
  const logger = baseLogger as Logger;

  /**
   * Derive a context-scoped logger that SHARES this logger's transports.
   *
   * This used to call `createLogger()`, which builds a fresh Console plus four
   * DailyRotateFile transports and registers `process.on('uncaughtException')`
   * handlers. `requestLogger` calls it once per HTTP request, so every request
   * leaked four file handles and two process listeners — the process degraded
   * steadily over a long session and eventually tripped the max-listeners
   * warning. `winston.child()` reuses the parent's transports and only merges
   * the extra default metadata, which is all a request-scoped logger ever needed.
   */
  logger.createChildLogger = (context: LogContext): Logger => {
    const child = baseLogger.child({ ...context }) as Logger;

    // `child()` keeps the extra bindings in a closure and merges them at write
    // time, so the child inherits the *parent's* `defaultMeta` prototypally and
    // callers inspecting it would not see their own context. Publish the merged
    // view as an own property: it is what the child actually emits, and it
    // shadows rather than mutates the parent's.
    child.defaultMeta = { ...baseLogger.defaultMeta, ...context };

    // `child()` returns a plain winston Logger; re-attach our extensions so a
    // child behaves like any other dev-suite logger (including nesting).
    child.createChildLogger = (nested: LogContext): Logger =>
      logger.createChildLogger({ ...context, ...nested });
    child.time = makeTimer(child);

    return child;
  };

  logger.time = makeTimer(logger);

  return logger;
}

/**
 * Pre-configured loggers
 */
export const serverLogger = createLogger({ component: 'Server' });
export const wsLogger = createLogger({ component: 'WebSocket' });
export const apiLogger = createLogger({ component: 'API' });
export const serviceLogger = createLogger({ component: 'Service' });

/**
 * Factory for custom loggers
 */
export function getLogger(name: string, context: LogContext = {}): Logger {
  return createLogger({
    component: name,
    ...context,
  });
}

/**
 * Generate correlation ID for request tracking
 */
export function generateCorrelationId(): string {
  return uuidv4();
}

/**
 * Create request-scoped logger with correlation ID
 */
export function createRequestLogger(correlationId?: string): Logger {
  return createLogger({
    component: 'Request',
    correlationId: correlationId || generateCorrelationId(),
  });
}

/**
 * Express middleware for request logging
 */
export function requestLoggingMiddleware() {
  return (req: any, res: any, next: any) => {
    const correlationId = (req.headers['x-correlation-id'] as string) || generateCorrelationId();
    const logger = createRequestLogger(correlationId);

    // Attach logger to request
    req.logger = logger;
    req.correlationId = correlationId;

    // Set response header
    res.setHeader('X-Correlation-ID', correlationId);

    // Log request
    const startTime = Date.now();
    logger.http(`${req.method} ${req.path}`, {
      data: {
        method: req.method,
        path: req.path,
        query: req.query,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    // Log response
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const level = res.statusCode >= 400 ? 'warn' : 'http';

      logger[level](`${req.method} ${req.path} - ${res.statusCode}`, {
        data: {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
        },
        duration,
      });
    });

    next();
  };
}

/**
 * Get log directory path (for diagnostics)
 */
export function getLogDirectoryPath(): string {
  return getLogDirectory();
}

// Export default logger
export default serverLogger;

// Backward compatibility exports
export const logger = serverLogger;
export const httpLogger = apiLogger;
export const log = {
  error: (message: string, meta?: Record<string, unknown>) => serverLogger.error(message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => serverLogger.warn(message, meta),
  info: (message: string, meta?: Record<string, unknown>) => serverLogger.info(message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => serverLogger.debug(message, meta),
  http: (message: string, meta?: Record<string, unknown>) => apiLogger.info(message, meta),
};
