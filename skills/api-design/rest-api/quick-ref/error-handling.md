# REST API Error Handling Quick Reference

> **Knowledge Base:** Read `knowledge/rest-api/error-handling.md` for complete documentation.

## Error Response Structure

```typescript
interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: ErrorDetail[];
  timestamp?: string;
  path?: string;
  requestId?: string;
}

interface ErrorDetail {
  field?: string;
  code?: string;
  message: string;
}
```

## Standard Error Response

```json
{
  "error": {
    "status": 400,
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "email",
        "code": "INVALID_FORMAT",
        "message": "Must be a valid email address"
      },
      {
        "field": "password",
        "code": "MIN_LENGTH",
        "message": "Must be at least 8 characters"
      }
    ],
    "timestamp": "2024-01-15T10:30:00Z",
    "path": "/api/users",
    "requestId": "req-123456"
  }
}
```

## Error Types

```typescript
// Application error codes
const ErrorCodes = {
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_FORMAT: 'INVALID_FORMAT',
  REQUIRED_FIELD: 'REQUIRED_FIELD',
  MIN_LENGTH: 'MIN_LENGTH',
  MAX_LENGTH: 'MAX_LENGTH',

  // Authentication
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',

  // Authorization
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',

  // Server
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
} as const;
```

## Express Error Handler

```typescript
import { Request, Response, NextFunction } from 'express';

// Custom error class
class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: ErrorDetail[]
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, details?: ErrorDetail[]) {
    return new AppError(400, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Forbidden') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(resource = 'Resource') {
    return new AppError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static conflict(message: string) {
    return new AppError(409, 'CONFLICT', message);
  }
}

// Error handler middleware
function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log error
  console.error({
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId: req.headers['x-request-id'],
  });

  // Handle known errors
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: {
        status: err.status,
        code: err.code,
        message: err.message,
        details: err.details,
        timestamp: new Date().toISOString(),
        path: req.path,
        requestId: req.headers['x-request-id'],
      },
    });
  }

  // Handle validation errors (e.g., from Zod)
  if (err.name === 'ZodError') {
    const zodError = err as any;
    return res.status(400).json({
      error: {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: zodError.errors.map((e: any) => ({
          field: e.path.join('.'),
          code: e.code,
          message: e.message,
        })),
      },
    });
  }

  // Handle unknown errors
  res.status(500).json({
    error: {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
      timestamp: new Date().toISOString(),
      path: req.path,
    },
  });
}

// Usage
app.use(errorHandler);

// In routes
app.get('/users/:id', async (req, res, next) => {
  try {
    const user = await userService.findById(req.params.id);
    if (!user) {
      throw AppError.notFound('User');
    }
    res.json({ data: user });
  } catch (error) {
    next(error);
  }
});
```

## Validation with Zod

```typescript
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
});

function validate<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}

app.post('/users', validate(createUserSchema), createUserHandler);
```

## Async Error Wrapper

```typescript
// Wrap async route handlers
const asyncHandler = (fn: RequestHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Usage
app.get('/users', asyncHandler(async (req, res) => {
  const users = await userService.findAll();
  res.json({ data: users });
}));
```

## HTTP Status Guidelines

```typescript
// When to use each status:

// 400 Bad Request - Invalid syntax, missing fields
if (!req.body.email) {
  throw AppError.badRequest('Email is required');
}

// 401 Unauthorized - No/invalid authentication
if (!req.headers.authorization) {
  throw AppError.unauthorized('Authentication required');
}

// 403 Forbidden - Authenticated but not authorized
if (user.role !== 'admin') {
  throw AppError.forbidden('Admin access required');
}

// 404 Not Found - Resource doesn't exist
if (!user) {
  throw AppError.notFound('User');
}

// 409 Conflict - Resource state conflict
if (existingUser) {
  throw AppError.conflict('Email already registered');
}

// 422 Unprocessable - Valid syntax but semantic errors
if (!isValidBusinessRule(data)) {
  throw new AppError(422, 'UNPROCESSABLE', 'Business rule violation');
}

// 429 Too Many Requests - Rate limiting
throw new AppError(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests');
```

**Official docs:** https://httpstatuses.com/
