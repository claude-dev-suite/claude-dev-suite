# Error Handling Quick Reference

> See [HTTP Clients SKILL](../SKILL.md) for core knowledge

## Error Types

### HTTP Errors (4xx, 5xx)

```typescript
interface HttpError {
  status: number;
  statusText: string;
  message: string;
  code?: string;
  errors?: Record<string, string[]>;
}
```

### Network Errors

- No internet connection
- DNS resolution failure
- Server unreachable
- SSL/TLS errors

### Timeout Errors

- Request exceeded timeout
- Server took too long to respond

### Abort Errors

- Request manually cancelled
- Component unmounted

---

## Error Handling Patterns

### Custom Error Class

```typescript
export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public code: string,
    public data?: unknown
  ) {
    super(`${status}: ${statusText}`);
    this.name = 'ApiError';
  }

  static isApiError(error: unknown): error is ApiError {
    return error instanceof ApiError;
  }

  static fromResponse(response: Response, data?: unknown): ApiError {
    return new ApiError(
      response.status,
      response.statusText,
      data?.code || 'UNKNOWN',
      data
    );
  }
}

// Specific error types
export class ValidationError extends ApiError {
  constructor(public errors: Record<string, string[]>) {
    super(422, 'Unprocessable Entity', 'VALIDATION_ERROR', { errors });
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED');
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string) {
    super(404, 'Not Found', 'NOT_FOUND', { resource });
  }
}
```

### Axios Error Handling

```typescript
import axios, { AxiosError, isAxiosError } from 'axios';

async function handleApiCall<T>(promise: Promise<T>): Promise<[T, null] | [null, ApiError]> {
  try {
    const data = await promise;
    return [data, null];
  } catch (error) {
    if (isAxiosError(error)) {
      const apiError = new ApiError(
        error.response?.status || 0,
        error.response?.statusText || 'Unknown',
        error.code || 'UNKNOWN',
        error.response?.data
      );
      return [null, apiError];
    }
    return [null, new ApiError(0, 'Unknown Error', 'UNKNOWN')];
  }
}

// Usage
const [data, error] = await handleApiCall(api.get<User[]>('/users'));
if (error) {
  console.error(error.message);
  return;
}
console.log(data);
```

### Fetch Error Handling

```typescript
async function safeFetch<T>(
  url: string,
  options?: RequestInit
): Promise<{ data: T | null; error: ApiError | null }> {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        data: null,
        error: ApiError.fromResponse(response, data),
      };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          data: null,
          error: new ApiError(0, 'Aborted', 'REQUEST_ABORTED'),
        };
      }
      if (error.name === 'TypeError') {
        return {
          data: null,
          error: new ApiError(0, 'Network Error', 'NETWORK_ERROR'),
        };
      }
    }
    return {
      data: null,
      error: new ApiError(0, 'Unknown Error', 'UNKNOWN'),
    };
  }
}
```

---

## Error Display Patterns

### Toast Notifications

```typescript
import { toast } from 'sonner';

function showApiError(error: ApiError) {
  switch (error.status) {
    case 400:
      toast.error('Invalid request. Please check your input.');
      break;
    case 401:
      toast.error('Please log in to continue.');
      break;
    case 403:
      toast.error('You don\'t have permission to perform this action.');
      break;
    case 404:
      toast.error('The requested resource was not found.');
      break;
    case 409:
      toast.error('This action conflicts with the current state.');
      break;
    case 422:
      toast.error('Validation failed. Please check your input.');
      break;
    case 429:
      toast.error('Too many requests. Please try again later.');
      break;
    case 500:
    case 502:
    case 503:
      toast.error('Server error. Please try again later.');
      break;
    default:
      toast.error(error.message || 'An unexpected error occurred.');
  }
}
```

### Form Validation Errors

```typescript
interface FieldError {
  field: string;
  message: string;
}

function extractValidationErrors(error: ApiError): FieldError[] {
  if (error.status !== 422 || !error.data?.errors) {
    return [];
  }

  const errors: FieldError[] = [];
  for (const [field, messages] of Object.entries(error.data.errors)) {
    for (const message of messages as string[]) {
      errors.push({ field, message });
    }
  }
  return errors;
}

// React Hook Form integration
function setFormErrors(
  error: ApiError,
  setError: (name: string, error: { message: string }) => void
) {
  const validationErrors = extractValidationErrors(error);
  for (const { field, message } of validationErrors) {
    setError(field, { message });
  }
}
```

---

## React Error Handling

### Error Boundary for API Errors

```typescript
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ApiErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-container">
          <h2>Something went wrong</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### useQuery Error Handling

```typescript
import { useQuery } from '@tanstack/react-query';

function UserProfile({ userId }: { userId: string }) {
  const { data, error, isError, isLoading, refetch } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
    retry: (failureCount, error) => {
      // Don't retry on 4xx errors
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        return false;
      }
      return failureCount < 3;
    },
  });

  if (isLoading) return <Skeleton />;

  if (isError) {
    if (error instanceof ApiError) {
      if (error.status === 404) return <NotFound />;
      if (error.status === 403) return <Forbidden />;
    }
    return (
      <ErrorDisplay
        message={error.message}
        onRetry={refetch}
      />
    );
  }

  return <UserCard user={data} />;
}
```

---

## Retry Strategies

### Exponential Backoff

```typescript
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    shouldRetry = (error) => {
      if (error instanceof ApiError) {
        return error.status >= 500 || error.status === 429;
      }
      return true; // Retry network errors
    },
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error, attempt)) {
        throw error;
      }

      // Calculate delay with jitter
      const delay = Math.min(
        baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelay
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
```

### Rate Limit Handling

```typescript
async function handleRateLimit<T>(
  fn: () => Promise<T>,
  maxWait = 60000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      // Get retry-after from response headers or use default
      const retryAfter = error.data?.retryAfter || 5;
      const waitTime = Math.min(retryAfter * 1000, maxWait);

      console.log(`Rate limited. Waiting ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      return fn();
    }
    throw error;
  }
}
```

---

## Logging and Monitoring

### Error Logging

```typescript
interface ErrorLog {
  timestamp: string;
  type: string;
  status?: number;
  message: string;
  url?: string;
  method?: string;
  stack?: string;
}

function logApiError(error: ApiError, context?: Record<string, unknown>) {
  const log: ErrorLog = {
    timestamp: new Date().toISOString(),
    type: error.name,
    status: error.status,
    message: error.message,
    ...context,
  };

  // Send to monitoring service
  if (process.env.NODE_ENV === 'production') {
    sendToMonitoring(log);
  } else {
    console.error('[API Error]', log);
  }
}

// Axios interceptor for logging
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    logApiError(
      new ApiError(
        error.response?.status || 0,
        error.response?.statusText || 'Unknown',
        error.code || 'UNKNOWN',
        error.response?.data
      ),
      {
        url: error.config?.url,
        method: error.config?.method,
      }
    );
    return Promise.reject(error);
  }
);
```
