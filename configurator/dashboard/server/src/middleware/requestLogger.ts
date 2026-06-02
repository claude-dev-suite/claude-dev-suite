// SPDX-License-Identifier: MIT
/**
 * HTTP Request/Response Logging Middleware
 *
 * Features:
 * - Correlation ID tracking (UUID per request)
 * - Request logging (method, URL, query, body with sensitive data redaction)
 * - Response logging (status, time, content-length)
 * - Performance tracking (warnings for slow requests > 1000ms)
 * - Error logging with stack traces
 * - Sensitive data redaction (passwords, tokens, keys, secrets)
 *
 * Note: This middleware integrates with the Winston logger from utils/logger.ts
 */

import { Request, Response, NextFunction } from 'express';
import { generateCorrelationId, apiLogger, type LogContext } from '../utils/logger.js';

// Extend Express Request type to include correlation ID and logger
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      startTime?: number;
      logger?: ReturnType<typeof apiLogger.createChildLogger>;
    }
  }
}

/**
 * List of sensitive field names to redact from logs
 */
const SENSITIVE_FIELDS = new Set([
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'apiKey',
  'accesstoken',
  'access_token',
  'accessToken',
  'refreshtoken',
  'refresh_token',
  'refreshToken',
  'auth',
  'authorization',
  'private_key',
  'privateKey',
  'client_secret',
  'clientSecret',
  'sessionid',
  'session_id',
  'sessionId',
  'cookie',
  'creditcard',
  'credit_card',
  'cvv',
  'ssn',
]);

/**
 * Redact sensitive data from an object
 */
function redactSensitiveData(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item));
  }

  if (typeof obj === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_FIELDS.has(lowerKey)) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = redactSensitiveData(value);
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
  }

  return obj;
}

/**
 * Redact sensitive headers
 */
function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'authorization' || lowerKey === 'cookie' || lowerKey === 'x-api-key') {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/**
 * Select important headers for logging
 */
function selectHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const important = [
    'content-type',
    'content-length',
    'user-agent',
    'accept',
    'origin',
    'referer',
    'x-forwarded-for',
    'x-real-ip',
  ];

  const selected: Record<string, unknown> = {};
  for (const key of important) {
    if (headers[key]) {
      selected[key] = headers[key];
    }
  }

  return selected;
}

/**
 * Request logging middleware
 * Logs incoming requests and attaches correlation ID
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Generate or extract correlation ID
  const correlationId = (req.headers['x-correlation-id'] as string) || generateCorrelationId();
  req.correlationId = correlationId;
  req.startTime = Date.now();

  // Create request-scoped logger
  req.logger = apiLogger.createChildLogger({ correlationId });

  // Set correlation ID in response headers
  res.setHeader('X-Correlation-ID', correlationId);

  // Build request log context
  const requestContext: LogContext = {
    correlationId,
    data: {
      method: req.method,
      url: req.originalUrl || req.url,
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
      body: req.body && Object.keys(req.body).length > 0 ? redactSensitiveData(req.body) : undefined,
      headers: redactHeaders(selectHeaders(req.headers as Record<string, unknown>)),
      ip: req.ip || req.socket.remoteAddress,
    },
  };

  // Log incoming request
  apiLogger.http(`→ ${req.method} ${req.originalUrl || req.url}`, requestContext);

  // Hook into response finish event
  const cleanup = () => {
    res.removeListener('finish', logResponse);
    res.removeListener('close', logResponse);
  };

  const logResponse = () => {
    cleanup();

    const responseTime = req.startTime ? Date.now() - req.startTime : 0;
    const statusCode = res.statusCode;

    // Determine log level based on status code and response time
    let logLevel: 'http' | 'warn' | 'error' = 'http';
    if (statusCode >= 500) {
      logLevel = 'error';
    } else if (statusCode >= 400 || responseTime > 1000) {
      logLevel = 'warn';
    }

    // Build response log context
    const responseContext: LogContext = {
      correlationId,
      data: {
        method: req.method,
        url: req.originalUrl || req.url,
        statusCode,
        responseTime,
        contentLength: res.get('content-length'),
      },
      duration: responseTime,
    };

    // Build log message
    let message = `← ${statusCode} ${req.method} ${req.originalUrl || req.url}`;
    if (responseTime > 1000) {
      message += ' [SLOW]';
    }

    // Log response using appropriate level
    if (logLevel === 'http') {
      apiLogger.http(message, responseContext);
    } else if (logLevel === 'warn') {
      apiLogger.warn(message, responseContext);
    } else {
      apiLogger.error(message, responseContext);
    }
  };

  res.on('finish', logResponse);
  res.on('close', logResponse);

  next();
}

/**
 * Error logging middleware
 * Catches all Express errors and logs them with full details
 *
 * IMPORTANT: This must be registered AFTER all routes
 */
export function errorLogger(
  err: Error & { status?: number; statusCode?: number },
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const correlationId = req.correlationId || 'unknown';
  const statusCode = err.status || err.statusCode || 500;

  // Build error log context
  const errorContext: LogContext = {
    correlationId,
    data: {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode,
      errorName: err.name,
      errorMessage: err.message,
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
      body: req.body && Object.keys(req.body).length > 0 ? redactSensitiveData(req.body) : undefined,
    },
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
    },
  };

  // Log error with full context
  apiLogger.error(
    `✖ ${statusCode} ${req.method} ${req.originalUrl || req.url} - ${err.message}`,
    errorContext
  );

  // Send sanitized error response to client.
  // SECURITY: stack traces are NEVER sent to the client — they expose internal
  // file paths and library versions.  Full error details are always logged
  // server-side (above).  The explicit opt-in env flag DEV_SUITE_DEBUG_ERRORS
  // only controls whether the raw err.message (non-stack) is surfaced; the
  // stack is never included.
  const isProduction = process.env.NODE_ENV === 'production';
  const debugErrors = process.env.DEV_SUITE_DEBUG_ERRORS === 'true';
  const clientMessage = (isProduction || !debugErrors) ? 'Internal server error' : err.message;

  res.status(statusCode).json({
    success: false,
    error: clientMessage,
    correlationId,
  });
}
