// SPDX-License-Identifier: MIT
/**
 * Validation middleware using Zod schemas
 *
 * Provides middleware functions to validate request bodies, query parameters,
 * and params against Zod schemas.
 */

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { ZodSchema, ZodError } from 'zod';

/**
 * Format Zod validation errors into a readable format
 */
function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return `${path ? path + ': ' : ''}${issue.message}`;
    })
    .join(', ');
}

/**
 * Middleware to validate request body against a Zod schema
 */
export function validateBody<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: formatZodError(result.error),
        issues: result.error.issues,
      });
      return;
    }

    // Replace req.body with validated and typed data
    req.body = result.data;
    next();
  };
}

/**
 * Middleware to validate query parameters against a Zod schema
 */
export function validateQuery<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Query validation failed',
        details: formatZodError(result.error),
        issues: result.error.issues,
      });
      return;
    }

    // Express 5: req.query is read-only, but validation already passed
    // so req.query contains valid data (no transforms/defaults in query schemas)
    next();
  };
}

/**
 * Middleware to validate route parameters against a Zod schema
 */
export function validateParams<T extends ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Params validation failed',
        details: formatZodError(result.error),
        issues: result.error.issues,
      });
      return;
    }

    // Express 5: req.params is read-only, but validation already passed
    // so req.params contains valid data (no transforms/defaults in params schemas)
    next();
  };
}

/**
 * Validate data synchronously without Express middleware
 * Useful for validating data in service functions or WebSocket handlers
 */
export function validate<T extends ZodSchema>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; error: string; issues: ZodError['issues'] } {
  const result = schema.safeParse(data);

  if (!result.success) {
    return {
      success: false,
      error: formatZodError(result.error),
      issues: result.error.issues,
    };
  }

  return {
    success: true,
    data: result.data,
  };
}
