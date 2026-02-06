---
name: error-contract
description: |
  Standardized error response handling between frontend and backend.
  Covers error structure, status codes, and consistent error handling.

  USE WHEN: user asks about "error handling", "API errors", "error response format", "status codes", "error messages", "validation errors"

  DO NOT USE FOR: logging - use logging skills, exception handling - use language-specific skills
allowed-tools: Read, Grep, Glob, Bash
---
# Error Contract - Quick Reference

## When NOT to Use This Skill
- **Logging configuration** - Use logging skills
- **Exception handling patterns** - Use language-specific skills
- **Security error handling** - Use security skills

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` for framework-specific error handling patterns.

## Standard Error Response Structure

### RFC 7807 (Problem Details)

```json
{
  "type": "https://api.example.com/errors/validation",
  "title": "Validation Error",
  "status": 400,
  "detail": "The request body contains invalid data",
  "instance": "/users/123",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format",
      "code": "INVALID_FORMAT"
    }
  ],
  "traceId": "abc123-def456"
}
```

### Simple Error Structure

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request body contains invalid data",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

## OpenAPI Error Definition

```yaml
components:
  schemas:
    Error:
      type: object
      required:
        - code
        - message
      properties:
        code:
          type: string
          description: Machine-readable error code
          example: "VALIDATION_ERROR"
        message:
          type: string
          description: Human-readable error message
          example: "Invalid request data"
        details:
          type: array
          items:
            $ref: '#/components/schemas/ErrorDetail'
        traceId:
          type: string
          description: Request trace ID for debugging
          example: "abc123-def456"

    ErrorDetail:
      type: object
      properties:
        field:
          type: string
          example: "email"
        message:
          type: string
          example: "Invalid email format"
        code:
          type: string
          example: "INVALID_FORMAT"

  responses:
    BadRequest:
      description: Invalid request data
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          example:
            code: "VALIDATION_ERROR"
            message: "Invalid request data"
            details:
              - field: "email"
                message: "Invalid email format"

    Unauthorized:
      description: Authentication required
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          example:
            code: "UNAUTHORIZED"
            message: "Authentication required"

    NotFound:
      description: Resource not found
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          example:
            code: "NOT_FOUND"
            message: "User not found"
```

## Status Code Mapping

| Status | Code Constant | When to Use |
|--------|---------------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid request body/params |
| 401 | `UNAUTHORIZED` | Missing or invalid auth |
| 403 | `FORBIDDEN` | Valid auth, insufficient permissions |
| 404 | `NOT_FOUND` | Resource doesn't exist |
| 409 | `CONFLICT` | Duplicate resource, state conflict |
| 422 | `UNPROCESSABLE_ENTITY` | Semantic validation failure |
| 429 | `TOO_MANY_REQUESTS` | Rate limit exceeded |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
| 503 | `SERVICE_UNAVAILABLE` | Temporary unavailability |

## Frontend Error Handling

### TypeScript Error Types

```typescript
// Base error interface matching backend
interface ApiError {
  code: string;
  message: string;
  details?: ErrorDetail[];
  traceId?: string;
}

interface ErrorDetail {
  field: string;
  message: string;
  code?: string;
}

// Error class for typed handling
class ApiRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: ErrorDetail[],
    public readonly traceId?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  static fromResponse(status: number, body: ApiError): ApiRequestError {
    return new ApiRequestError(
      body.code,
      body.message,
      status,
      body.details,
      body.traceId,
    );
  }

  isValidationError(): boolean {
    return this.code === 'VALIDATION_ERROR';
  }

  isNotFound(): boolean {
    return this.code === 'NOT_FOUND';
  }

  isUnauthorized(): boolean {
    return this.code === 'UNAUTHORIZED';
  }

  getFieldError(field: string): string | undefined {
    return this.details?.find(d => d.field === field)?.message;
  }
}
```

### Fetch Wrapper with Error Handling

```typescript
async function fetchApi<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const errorBody: ApiError = await response.json();
    throw ApiRequestError.fromResponse(response.status, errorBody);
  }

  return response.json();
}

// Usage
try {
  const user = await fetchApi<User>('/api/users/123');
} catch (error) {
  if (error instanceof ApiRequestError) {
    if (error.isNotFound()) {
      showNotification('User not found');
    } else if (error.isValidationError()) {
      setFormErrors(error.details);
    } else {
      showNotification(error.message);
    }
  }
}
```

### React Error Handling

```typescript
// Error boundary for unexpected errors
class ErrorBoundary extends React.Component<Props, State> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}

// Form validation errors
function UserForm() {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: createUser,
    onError: (error) => {
      if (error instanceof ApiRequestError && error.isValidationError()) {
        const errors: Record<string, string> = {};
        error.details?.forEach(detail => {
          errors[detail.field] = detail.message;
        });
        setFieldErrors(errors);
      } else {
        toast.error(error.message);
      }
    },
  });

  return (
    <form onSubmit={handleSubmit}>
      <input name="email" />
      {fieldErrors.email && <span className="error">{fieldErrors.email}</span>}
    </form>
  );
}
```

### React Query Error Handling

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry on client errors
        if (error instanceof ApiRequestError && error.status < 500) {
          return false;
        }
        return failureCount < 3;
      },
    },
    mutations: {
      onError: (error) => {
        // Global error handler
        if (error instanceof ApiRequestError) {
          if (error.isUnauthorized()) {
            window.location.href = '/login';
          }
        }
      },
    },
  },
});
```

## Backend Error Implementation

### NestJS

```typescript
// Error filter
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = 500;
    let errorResponse: ApiError = {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      traceId: request.headers['x-trace-id'] as string,
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        errorResponse = {
          ...errorResponse,
          ...(exceptionResponse as object),
        };
      }
    }

    response.status(status).json(errorResponse);
  }
}

// Custom exceptions
export class ValidationException extends HttpException {
  constructor(details: ErrorDetail[]) {
    super(
      {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
```

### Spring Boot

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(
            MethodArgumentNotValidException ex) {

        List<ErrorDetail> details = ex.getBindingResult()
            .getFieldErrors()
            .stream()
            .map(error -> new ErrorDetail(
                error.getField(),
                error.getDefaultMessage(),
                error.getCode()
            ))
            .toList();

        ApiError error = new ApiError(
            "VALIDATION_ERROR",
            "Validation failed",
            details
        );

        return ResponseEntity.badRequest().body(error);
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiError> handleNotFound(
            ResourceNotFoundException ex) {

        ApiError error = new ApiError(
            "NOT_FOUND",
            ex.getMessage()
        );

        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
    }
}
```

## Validation Report Template

```markdown
## Error Contract Validation

### Error Response Structure
| Field | Backend | Frontend Handles | Status |
|-------|---------|------------------|--------|
| code | Present | Parsed | OK |
| message | Present | Displayed | OK |
| details | Present | Form errors | OK |
| traceId | Present | Not used | WARNING |

### Status Code Handling
| Status | Backend Returns | Frontend Handles | Status |
|--------|-----------------|------------------|--------|
| 400 | VALIDATION_ERROR | Shows form errors | OK |
| 401 | UNAUTHORIZED | Redirects to login | OK |
| 403 | FORBIDDEN | Shows permission error | OK |
| 404 | NOT_FOUND | Shows not found page | OK |
| 500 | INTERNAL_ERROR | Shows generic error | OK |

### Recommendations
1. Frontend should log traceId for debugging
2. Add retry logic for 503 responses
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Inconsistent error structure | Hard to parse | Use standard format |
| Stack traces in production | Security risk | Use error codes only |
| Generic "Error occurred" | Poor UX | Specific messages |
| No error codes | Hard to handle | Add machine-readable codes |
| Swallowing errors silently | Hidden failures | Log and notify |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Error not parsed | Wrong Content-Type | Check `application/json` |
| Missing field errors | Different structure | Align error schema |
| No trace ID | Not generated | Add trace ID middleware |
| Wrong status code | Backend misconfiguration | Check exception handlers |
| Error message empty | Serialization issue | Check DTO annotations |

## Related Skills
- [OpenAPI Contract](../openapi-contract/SKILL.md)
- [Auth Flow Validation](../auth-flow-validation/SKILL.md)
- [API Versioning](../api-versioning/SKILL.md)
