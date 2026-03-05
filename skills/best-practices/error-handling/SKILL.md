---
name: error-handling
description: |
  Error handling patterns across languages and frameworks. Custom error classes,
  global exception handlers, Problem Details (RFC 9457), error boundaries (React),
  Result types, and structured error responses.

  USE WHEN: user mentions "error handling", "exception handler", "error boundary",
  "custom error", "Problem Details", "error response", "global error handler"

  DO NOT USE FOR: logging errors - use logging skills;
  error tracking services - use `error-tracking`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Error Handling

## Custom Error Classes (TypeScript)

```typescript
class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code: string = 'INTERNAL_ERROR',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} ${id} not found`, 404, 'NOT_FOUND');
  }
}

class ValidationError extends AppError {
  constructor(errors: { field: string; message: string }[]) {
    super('Validation failed', 400, 'VALIDATION_ERROR', errors);
  }
}
```

## Global Error Handler (Express)

```typescript
// Must have 4 parameters for Express to recognize as error middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      type: `https://api.example.com/errors/${err.code}`,
      title: err.message,
      status: err.statusCode,
      detail: err.details,
      instance: req.originalUrl,
    });
  }

  // Unexpected errors
  logger.error('Unhandled error', { error: err, path: req.originalUrl });
  res.status(500).json({
    type: 'https://api.example.com/errors/INTERNAL_ERROR',
    title: 'Internal server error',
    status: 500,
  });
});
```

## Problem Details (RFC 9457)

```json
{
  "type": "https://api.example.com/errors/INSUFFICIENT_FUNDS",
  "title": "Insufficient funds",
  "status": 422,
  "detail": "Account balance is $10.00, but transfer requires $25.00",
  "instance": "/transfers/abc123"
}
```

## React Error Boundaries

```tsx
import { Component, ErrorInfo, ReactNode } from 'react';

class ErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() { return { hasError: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, info.componentStack);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

// Usage
<ErrorBoundary fallback={<ErrorPage />}>
  <App />
</ErrorBoundary>
```

## Spring Boot (@ControllerAdvice)

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ProblemDetail handleNotFound(ResourceNotFoundException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
        pd.setType(URI.create("https://api.example.com/errors/NOT_FOUND"));
        pd.setTitle("Resource not found");
        return pd;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        pd.setTitle("Validation failed");
        Map<String, String> errors = new HashMap<>();
        ex.getFieldErrors().forEach(e -> errors.put(e.getField(), e.getDefaultMessage()));
        pd.setProperty("errors", errors);
        return pd;
    }
}
```

## FastAPI Exception Handlers

```python
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(status_code=exc.status_code, content={
        "type": f"https://api.example.com/errors/{exc.code}",
        "title": exc.message,
        "status": exc.status_code,
    })
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Catching all exceptions silently | Log and re-throw or return structured error |
| Exposing stack traces to clients | Return generic message, log details server-side |
| String-based error checking | Use typed error classes or error codes |
| No global error handler | Add framework-level catch-all middleware |
| Inconsistent error response format | Use Problem Details (RFC 9457) everywhere |

## Production Checklist

- [ ] Custom error classes with status codes
- [ ] Global error handler catches all unhandled errors
- [ ] Problem Details format for API errors
- [ ] Stack traces never exposed to clients
- [ ] React Error Boundaries around route-level components
- [ ] Errors logged with context (request ID, user, path)
