# Enhanced Logging System - Usage Examples

## Overview

The enhanced logging system provides:
- Correlation ID tracking across all logs
- Environment-based log level filtering
- Performance timing utilities
- Context propagation
- Enhanced error serialization (cause chains, component stacks)
- Pre-configured loggers for different modules
- Component lifecycle logging via hooks
- Global error handlers for uncaught errors
- Event handler error wrapping

## Basic Usage

### Using Pre-configured Loggers

```tsx
import { logger, apiLogger, wsLogger, uiLogger } from '@/utils/logging';

// General app logging
logger.info('Application started');
logger.debug('Config loaded', { config });
logger.warn('Deprecation warning', { feature: 'oldApi' });
logger.error('Failed to initialize', error);

// API-specific logging
apiLogger.info('Request sent', { method: 'POST', url: '/api/data' });
apiLogger.error('Request failed', { status: 500, error });

// WebSocket logging
wsLogger.info('Connected to server');
wsLogger.debug('Message received', { type: 'update' });

// UI interaction logging
uiLogger.info('Button clicked', { buttonId: 'submit' });
uiLogger.debug('Form validation', { isValid: true });
```

### Custom Loggers

```tsx
import { getLogger } from '@/utils/logging';

const moduleLogger = getLogger('MyModule');
moduleLogger.info('Module initialized');
```

## Component Logging

### Using the useComponentLogger Hook

```tsx
import { useComponentLogger } from '@/hooks';

function MyComponent() {
  // Automatically logs mount/unmount
  const log = useComponentLogger('MyComponent');

  useEffect(() => {
    log.info('Data loaded', { count: data.length });
  }, [data]);

  const handleClick = () => {
    log.debug('Button clicked', { userId });
  };

  return <button onClick={handleClick}>Click me</button>;
}
```

### Silent Component Logger (No Lifecycle Logs)

```tsx
import { useComponentLoggerQuiet } from '@/hooks';

function MyComponent() {
  // No mount/unmount logs
  const log = useComponentLoggerQuiet('MyComponent');

  const handleSubmit = () => {
    log.info('Form submitted', formData);
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

## Context Propagation

### Adding Context to Logs

```tsx
import { logger } from '@/utils/logging';

// Create a logger with additional context
const userLogger = logger.withContext({ userId: '123', sessionId: 'abc' });

// All logs from this logger will include the context
userLogger.info('User action'); // Includes userId and sessionId
userLogger.error('User error', error); // Includes userId and sessionId
```

### Nested Contexts

```tsx
const userLogger = logger.withContext({ userId: '123' });
const requestLogger = userLogger.withContext({ requestId: 'req-456' });

// Includes both userId and requestId
requestLogger.info('Request processed');
```

## Performance Timing

### Measuring Operation Duration

```tsx
import { logger } from '@/utils/logging';

async function loadData() {
  const endTimer = logger.time('loadData');

  try {
    const data = await fetchData();
    return data;
  } finally {
    endTimer(); // Logs: "loadData took 125.43ms"
  }
}
```

### Multiple Timers

```tsx
async function processRequest() {
  const endRequest = logger.time('processRequest');
  const endValidation = logger.time('validation');

  const isValid = await validate();
  endValidation(); // Logs validation time

  const result = await process();
  endRequest(); // Logs total request time

  return result;
}
```

## Error Handling

### Wrapping Event Handlers

```tsx
import { withErrorLogging } from '@/utils/logging';

function MyComponent() {
  const handleClick = withErrorLogging(
    async () => {
      await dangerousOperation();
    },
    { component: 'MyComponent', action: 'handleClick' }
  );

  return <button onClick={handleClick}>Click</button>;
}
```

### Safe Event Handlers (Don't Re-throw)

```tsx
import { createSafeHandler } from '@/utils/logging';

function MyComponent() {
  // Error is logged but not thrown - component continues working
  const handleClick = createSafeHandler(
    () => {
      throw new Error('Something went wrong');
    },
    { component: 'MyComponent', action: 'handleClick' }
  );

  return <button onClick={handleClick}>Click</button>;
}
```

### Wrapping Async Functions

```tsx
import { withAsyncErrorLogging } from '@/utils/logging';

const fetchData = withAsyncErrorLogging(
  async (id: string) => {
    const response = await fetch(`/api/data/${id}`);
    return response.json();
  },
  { component: 'DataLoader', action: 'fetchData' }
);
```

### Higher-Order Component for Error Logging

```tsx
import { withErrorBoundaryLogging } from '@/utils/logging';

const MyComponent = () => {
  // Component logic
  return <div>...</div>;
};

// Wrap component to log render errors before they reach ErrorBoundary
export default withErrorBoundaryLogging(MyComponent, 'MyComponent');
```

## Global Error Handlers

Global error handlers are automatically initialized in `main.tsx`:

```tsx
// main.tsx
import { initGlobalErrorHandler } from '@/utils/globalErrorHandler';

initGlobalErrorHandler(); // Catches all uncaught errors and unhandled rejections
```

This catches:
- Uncaught errors (`window.onerror`)
- Unhandled promise rejections (`window.onunhandledrejection`)

All caught errors are logged with full context:
- URL, user agent, timestamp
- Viewport dimensions
- Error stack trace
- Source file, line, column

## Error Boundary Integration

The `ErrorBoundary` component now includes:
- Full error logging with component stack
- Recovery attempt tracking (max 3 attempts)
- Automatic correlation with backend logs

```tsx
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <YourApp />
    </ErrorBoundary>
  );
}
```

## Log Levels and Filtering

### Environment-Based Filtering

Logs are automatically filtered based on environment:

- **Development**: All levels (error, warn, info, debug)
- **Production**: Limited levels (error, warn, info)

Debug logs are automatically suppressed in production.

### Available Log Levels

```tsx
logger.error('Critical error', error);   // Always logged
logger.warn('Warning message', data);    // Always logged
logger.info('Informational message');    // Always logged
logger.debug('Debug details', state);    // Only in development
```

## Correlation IDs

All logs include:
- **Session Correlation ID**: Unique per browser session, persists across requests
- **Request Correlation ID**: Can be added via context for specific operations

Session ID is automatically included in all backend requests via `X-Correlation-Id` header.

### Getting the Session ID

```tsx
import { getSessionId } from '@/utils/logging';

const sessionId = getSessionId();
// Use for external API calls, analytics, etc.
```

## Backend Integration

All logs are batched and sent to the backend:

- **Batch Size**: Max 50 logs per batch
- **Flush Interval**: 500ms
- **Immediate Flush**: On errors or when batch is full
- **Page Unload**: Uses `sendBeacon` for reliability

Backend receives:
```json
{
  "entries": [
    {
      "level": "error",
      "component": "App",
      "message": "Failed to load data",
      "data": { ... },
      "timestamp": "2026-01-10T10:30:45.123Z",
      "correlationId": "abc123...",
      "context": { "userId": "123" }
    }
  ],
  "sessionId": "abc123..."
}
```

## Best Practices

1. **Use appropriate log levels**:
   - `error`: Failures, exceptions
   - `warn`: Unexpected but handled situations
   - `info`: Important state changes, user actions
   - `debug`: Detailed debugging info (development only)

2. **Include relevant context**:
   ```tsx
   logger.error('Failed to save', { userId, formData, validationErrors });
   ```

3. **Use component loggers for React components**:
   ```tsx
   const log = useComponentLogger('MyComponent');
   ```

4. **Use pre-configured loggers for modules**:
   ```tsx
   import { apiLogger } from '@/utils/logging';
   apiLogger.info('Request sent', { url, method });
   ```

5. **Wrap event handlers in production code**:
   ```tsx
   const handleClick = withErrorLogging(onClick, {
     component: 'Button',
     action: 'onClick'
   });
   ```

6. **Use performance timing for slow operations**:
   ```tsx
   const endTimer = logger.time('dataProcessing');
   processData();
   endTimer();
   ```

7. **Propagate context for related operations**:
   ```tsx
   const requestLogger = logger.withContext({ requestId });
   requestLogger.info('Processing request');
   requestLogger.info('Request complete');
   ```

## Advanced Patterns

### Request Lifecycle Logging

```tsx
async function handleRequest(requestId: string) {
  const requestLogger = apiLogger.withContext({ requestId });
  const endTimer = requestLogger.time('request');

  requestLogger.info('Request started');

  try {
    const result = await processRequest();
    requestLogger.info('Request succeeded', { result });
    return result;
  } catch (error) {
    requestLogger.error('Request failed', error);
    throw error;
  } finally {
    endTimer();
  }
}
```

### User Action Tracking

```tsx
function MyComponent() {
  const log = useComponentLogger('MyComponent');
  const userLogger = log.withContext({ userId: currentUser.id });

  const handleAction = createSafeHandler(
    async () => {
      const endTimer = userLogger.time('userAction');

      userLogger.info('Action started');
      await performAction();
      userLogger.info('Action completed');

      endTimer();
    },
    { component: 'MyComponent', action: 'handleAction' }
  );

  return <button onClick={handleAction}>Do Action</button>;
}
```

### Error Cause Chains (ES2022)

```tsx
try {
  await operation();
} catch (error) {
  // Create error with cause chain
  const wrappedError = new Error('Operation failed', { cause: error });
  logger.error('Failed to complete operation', wrappedError);
  // Logs include the full cause chain
}
```
