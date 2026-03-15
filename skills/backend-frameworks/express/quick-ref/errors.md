# Express Error Handling

> **Knowledge Base:** Read `knowledge/express/errors.md` for complete documentation.

## Error Handler Middleware

```ts
import { Request, Response, NextFunction } from 'express';

// Custom error class
class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }
}

// Global error handler (must have 4 params)
const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message
    });
  }

  // Unknown error
  console.error('Unexpected error:', err);
  return res.status(500).json({
    status: 'error',
    message: 'Internal server error'
  });
};

// Register as last middleware
app.use(errorHandler);
```

## Async Error Wrapper

```ts
type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<any>;

const catchAsync = (fn: AsyncHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

// Usage
app.get('/users/:id', catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new AppError(404, 'User not found');
  }
  res.json(user);
}));
```

## Validation Errors

```ts
import { validationResult } from 'express-validator';

const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Usage
app.post('/users',
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
  validate,
  catchAsync(async (req, res) => {
    // Handler logic
  })
);
```

## 404 Handler

```ts
// Place before error handler, after all routes
app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`
  });
});
```

## Error Response Format

```ts
interface ErrorResponse {
  status: 'error';
  message: string;
  code?: string;
  errors?: Array<{ field: string; message: string }>;
  stack?: string; // Only in development
}

const formatError = (err: AppError, isDev: boolean): ErrorResponse => ({
  status: 'error',
  message: err.message,
  code: err.code,
  ...(isDev && { stack: err.stack })
});
```

## Unhandled Rejections

```ts
// Catch unhandled promise rejections
process.on('unhandledRejection', (reason: Error) => {
  console.error('Unhandled Rejection:', reason);
  // Graceful shutdown
  server.close(() => process.exit(1));
});

// Catch uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
```

**Official docs:** https://expressjs.com/en/guide/error-handling.html
