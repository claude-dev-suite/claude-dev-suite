# Comprehensive Logging Service

Production-ready Winston-based logging system with advanced features for request tracking, performance monitoring, and security.

## Features

- **Structured Logging**: JSON format for files, pretty format for console
- **Correlation IDs**: Track requests across services and components
- **Child Loggers**: Component-specific loggers with inherited context
- **File Rotation**: Daily rotation, max 14 days, max 20MB per file
- **Sensitive Data Redaction**: Automatic redaction of passwords, tokens, keys
- **Performance Timing**: Built-in operation timing utilities
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Error Serialization**: Full stack traces and nested error handling
- **Express Middleware**: Ready-to-use request logging middleware

## Log Directory

Logs are stored in platform-specific user directories:

- **Windows**: `%APPDATA%\@dev-suite\dashboard\logs\`
- **macOS**: `~/.dev-suite/dashboard/logs/`
- **Linux**: `~/.dev-suite/dashboard/logs/`

## Log Files

- `combined-%DATE%.log` - All log levels
- `error-%DATE%.log` - Errors only
- `exceptions-%DATE%.log` - Uncaught exceptions
- `rejections-%DATE%.log` - Unhandled promise rejections

## Log Levels

1. **error** (0) - Critical errors requiring immediate attention
2. **warn** (1) - Warning conditions
3. **info** (2) - General informational messages (default)
4. **http** (3) - HTTP request/response logs
5. **debug** (4) - Detailed debugging information

Set level via environment variable:
```bash
LOG_LEVEL=debug npm start
```

## Quick Start

### Basic Logging

```typescript
import { serverLogger } from './utils/logger.js';

serverLogger.info('Server starting on port 3456');
serverLogger.warn('Cache is disabled');
serverLogger.error('Failed to connect to database');
serverLogger.debug('Debug information');
serverLogger.http('HTTP request received');
```

### Logging with Data

```typescript
serverLogger.info('User logged in', {
  data: {
    userId: '12345',
    username: 'john.doe',
    ip: '192.168.1.1',
  },
});
```

### Error Logging

```typescript
try {
  throw new Error('Something went wrong');
} catch (error) {
  serverLogger.error('Operation failed', {
    error,
    data: {
      operation: 'processData',
      input: { id: 123 },
    },
  });
}
```

## Pre-configured Loggers

```typescript
import {
  serverLogger,    // [Server] component
  wsLogger,        // [WebSocket] component
  apiLogger,       // [API] component
  serviceLogger,   // [Service] component
} from './utils/logger.js';

wsLogger.info('WebSocket connection established');
apiLogger.http('GET /api/projects');
serviceLogger.debug('Cache hit for key: projects:123');
```

## Custom Loggers

```typescript
import { getLogger } from './utils/logger.js';

const dbLogger = getLogger('Database');
dbLogger.info('Connection pool initialized');
dbLogger.debug('Query executed', {
  data: {
    query: 'SELECT * FROM users',
    duration: 45,
  },
});
```

## Child Loggers

Create child loggers with inherited context:

```typescript
import { getLogger, generateCorrelationId } from './utils/logger.js';

const parentLogger = getLogger('Service', {
  correlationId: generateCorrelationId(),
  userId: '12345',
});

// All logs include correlationId and userId
parentLogger.info('Processing request');

// Create child with additional context
const childLogger = parentLogger.createChildLogger({
  operation: 'validateInput',
});

// Inherits parent context and adds operation
childLogger.debug('Validating input data');
childLogger.info('Validation successful');
```

## Performance Timing

Time operations automatically:

```typescript
import { getLogger } from './utils/logger.js';

const logger = getLogger('API');

// Time a synchronous operation
const endTimer = logger.time('processData');
// ... do some work ...
endTimer(); // Logs duration automatically

// Time an async operation
const endAsyncTimer = logger.time('fetchFromDatabase');
try {
  await fetchData();
  endAsyncTimer();
} catch (error) {
  endAsyncTimer(); // Still logs duration
  logger.error('Fetch failed', { error });
}
```

## Express Middleware

Add request logging to your Express app:

```typescript
import express from 'express';
import { requestLoggingMiddleware } from './utils/logger.js';

const app = express();

// Enable request logging
app.use(requestLoggingMiddleware());

// The middleware:
// 1. Generates or uses existing correlation ID from header
// 2. Attaches logger to req.logger
// 3. Attaches correlation ID to req.correlationId
// 4. Sets X-Correlation-ID response header
// 5. Logs request start and completion with timing

// Use in route handlers
app.get('/api/projects', (req, res) => {
  req.logger.info('Processing project request');
  req.logger.debug('User ID', { data: { userId: req.user?.id } });
  res.json({ projects: [] });
});
```

## Request-Scoped Logging

Create loggers scoped to a specific request:

```typescript
import { createRequestLogger, generateCorrelationId } from './utils/logger.js';

const correlationId = req.headers['x-correlation-id'] || generateCorrelationId();
const requestLogger = createRequestLogger(correlationId);

requestLogger.http('Processing request', {
  data: {
    method: 'GET',
    path: '/api/projects',
    query: { page: 1 },
  },
});

requestLogger.debug('Fetching projects from database');
requestLogger.info('Request completed successfully');
```

## Service Pattern

Best practice for service-level logging:

```typescript
import { getLogger, generateCorrelationId, type Logger } from './utils/logger.js';

class ProjectService {
  private logger: Logger;

  constructor() {
    this.logger = getLogger('ProjectService');
  }

  async createProject(data: any, correlationId?: string) {
    const logger = this.logger.createChildLogger({
      correlationId: correlationId || generateCorrelationId(),
      operation: 'createProject',
    });

    logger.info('Creating new project', { data });

    const endTimer = logger.time('database_insert');
    try {
      const project = await db.insert(data);
      endTimer();

      logger.info('Project created successfully', {
        data: { projectId: project.id },
      });

      return project;
    } catch (error) {
      endTimer();
      logger.error('Failed to create project', { error, data });
      throw error;
    }
  }
}
```

## Sensitive Data Redaction

These fields are automatically redacted:

- `password`, `token`, `apiKey`, `api_key`
- `secret`, `authorization`, `auth`, `bearer`
- `jwt`, `sessionId`, `session_id`
- `privateKey`, `private_key`
- `accessToken`, `access_token`
- `refreshToken`, `refresh_token`

Example:

```typescript
serverLogger.info('Authentication attempt', {
  data: {
    username: 'john.doe',
    password: 'secret123', // Will be [REDACTED]
    token: 'abc123xyz',    // Will be [REDACTED]
  },
});

// Output:
// {
//   "username": "john.doe",
//   "password": "[REDACTED]",
//   "token": "[REDACTED]"
// }
```

## Log Format

### Console Output (Development)

```
2024-01-10 12:00:00 [info] [Server] [a1b2c3d4]: Server starting on port 3456
2024-01-10 12:00:01 [http] [API] [e5f6g7h8]: GET /api/projects - 200 (123ms)
```

### File Output (JSON)

```json
{
  "timestamp": "2024-01-10T12:00:00.000Z",
  "level": "info",
  "component": "Server",
  "correlationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "message": "Server starting on port 3456",
  "data": {
    "port": 3456,
    "environment": "development"
  },
  "duration": 123
}
```

## Environment Variables

- `LOG_LEVEL`: log level (error, warn, info, http, debug). Default `info`.

The log directory is not configurable by environment variable — it is resolved per
platform by `getLogDirectoryPath()` (see [Log Directory](#log-directory)). A `LOG_DIR`
override was documented here for a while but was never implemented.

## Production Best Practices

1. **Use Correlation IDs**: Always pass correlation IDs through request chains
2. **Appropriate Log Levels**: Use `info` in production, `debug` for troubleshooting
3. **Include Context**: Add relevant data for debugging
4. **Time Critical Operations**: Use `logger.time()` for performance monitoring
5. **Structured Logging**: Use data objects instead of string concatenation

Example:

```typescript
// Good
logger.info('Payment completed', {
  data: {
    orderId: '12345',
    amount: 99.99,
    duration: 450,
  },
});

// Avoid
logger.info(`Payment completed for order ${orderId} amount ${amount}`);
```

## API Reference

### getLogger(name, context?)

Create a custom logger with optional context.

```typescript
const logger = getLogger('MyComponent', {
  userId: '12345',
  environment: 'production',
});
```

### logger.createChildLogger(context)

Create a child logger with inherited context.

```typescript
const childLogger = logger.createChildLogger({
  operation: 'validateInput',
});
```

### logger.time(operation, context?)

Start timing an operation. Returns a function to call when done.

```typescript
const endTimer = logger.time('database_query');
// ... do work ...
endTimer();
```

### generateCorrelationId()

Generate a unique correlation ID (UUID v4).

```typescript
const correlationId = generateCorrelationId();
```

### createRequestLogger(correlationId?)

Create a logger scoped to a request with optional correlation ID.

```typescript
const requestLogger = createRequestLogger(correlationId);
```

### requestLoggingMiddleware()

Express middleware for automatic request logging.

```typescript
app.use(requestLoggingMiddleware());
```

### getLogDirectoryPath()

Get the log directory path for diagnostics.

```typescript
console.log(getLogDirectoryPath());
// Windows: C:\Users\user\AppData\Roaming\@dev-suite\dashboard\logs
// Unix: /home/user/.dev-suite/dashboard/logs
```

## Example Output

A request against the health endpoint, at `LOG_LEVEL=http`:

```bash
curl http://localhost:3456/health
```

```
2026-01-10 12:34:56 [http] [API] [a1b2c3d4]: -> GET /health
  { "method": "GET", "url": "/health", "ip": "127.0.0.1" }
2026-01-10 12:34:56 [http] [API] [a1b2c3d4]: <- 200 GET /health (12ms)
  { "method": "GET", "url": "/health", "statusCode": 200, "responseTime": 12 }
```

The correlation id (`a1b2c3d4`) ties the two lines together and is propagated to every
child logger created during the request — see [Request-Scoped Logging](#request-scoped-logging).

## TypeScript Types

```typescript
import type { Logger, LogContext, LogLevel } from './utils/logger.js';

interface LogContext {
  component?: string;
  correlationId?: string;
  data?: Record<string, any>;
  [key: string]: any;
}

type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'debug';
```

## Migration from Old Logger

The new logger maintains backward compatibility:

```typescript
// Old API (still works)
import { logger, httpLogger, log } from './utils/logger.js';

logger.info('message');
httpLogger.info('message');
log.info('message');

// New API (recommended)
import { serverLogger, apiLogger, getLogger } from './utils/logger.js';

serverLogger.info('message');
apiLogger.http('message');
const customLogger = getLogger('MyComponent');
```

## Troubleshooting

### Logs not appearing

1. Check log level: `LOG_LEVEL=debug npm start`
2. Verify log directory exists: `getLogDirectoryPath()`
3. Check disk space and permissions

### Performance impact

- File logging is asynchronous (non-blocking)
- Redaction only processes logged data
- Consider using `debug` level only in development

### Log file size

- Files rotate daily
- Max 20MB per file
- Max 14 days retention
- Old files are automatically compressed and deleted

## Examples

See `logger.example.ts` for complete usage examples including:

- Basic logging patterns
- Service integration
- WebSocket logging
- Error handling
- Performance monitoring
- Production patterns
