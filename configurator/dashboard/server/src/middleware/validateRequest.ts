// SPDX-License-Identifier: MIT
/**
 * Validation middleware using Zod schemas
 *
 * Provides middleware functions to validate request bodies, query parameters,
 * and params against Zod schemas.
 */

import type { Request, Response, NextFunction } from 'express';
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

    // Replace req.query with validated and typed data
    req.query = result.data as any;
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

    // Replace req.params with validated and typed data
    req.params = result.data as any;
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
): { success: true; data: ReturnType<T['parse']> } | { success: false; error: string; issues: ZodError['issues'] } {
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
