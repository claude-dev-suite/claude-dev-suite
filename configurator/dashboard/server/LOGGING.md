# Backend Logging Service

Production-ready logging system for the Dev-Suite dashboard server.

## Quick Links

- **Implementation**: `src/utils/logger.ts`
- **Documentation**: `src/utils/logger.README.md`
- **Examples**: `src/utils/logger.example.ts`
- **Tests**: `src/utils/logger.test.ts`

## Installation

Dependencies are already installed in `package.json`:
- `winston@^3.19.0`
- `winston-daily-rotate-file@^5.0.0`

## Quick Start

```typescript
import { serverLogger } from './utils/logger.js';

serverLogger.info('Server starting', {
  data: { port: 3456, environment: 'development' }
});
```

## Key Features

### 1. Correlation IDs
Track requests across services with automatic correlation ID propagation:

```typescript
import { requestLoggingMiddleware } from './utils/logger.js';

app.use(requestLoggingMiddleware());
// Adds correlation ID to all requests and responses
```

### 2. Child Loggers
Create component-specific loggers with inherited context:

```typescript
const logger = getLogger('ProjectService', { userId: '12345' });
const childLogger = logger.createChildLogger({ operation: 'create' });
```

### 3. Performance Timing
Built-in operation timing:

```typescript
const endTimer = logger.time('database_query');
await db.query();
endTimer(); // Logs duration automatically
```

### 4. Sensitive Data Redaction
Passwords, tokens, and keys are automatically redacted:

```typescript
logger.info('Auth attempt', {
  data: {
    username: 'john',
    password: 'secret', // Will be [REDACTED]
    token: 'abc123',    // Will be [REDACTED]
  }
});
```

### 5. Cross-Platform Log Storage

Logs are stored in user directories:
- **Windows**: `%APPDATA%\@dev-suite\dashboard\logs\`
- **macOS**: `~/.dev-suite/dashboard/logs\`
- **Linux**: `~/.dev-suite/dashboard/logs\`

## Log Files

- `combined-YYYY-MM-DD.log` - All log levels (JSON format)
- `error-YYYY-MM-DD.log` - Errors only (JSON format)
- `exceptions-YYYY-MM-DD.log` - Uncaught exceptions
- `rejections-YYYY-MM-DD.log` - Unhandled promise rejections

Rotation: Daily, max 20MB per file, max 14 days retention.

## Pre-configured Loggers

```typescript
import {
  serverLogger,   // [Server] component
  wsLogger,       // [WebSocket] component
  apiLogger,      // [API] component
  serviceLogger,  // [Service] component
  getLogger,      // Custom logger factory
} from './utils/logger.js';
```

## Log Levels

1. `error` - Critical errors
2. `warn` - Warning conditions
3. `info` - General information (default)
4. `http` - HTTP requests/responses
5. `debug` - Detailed debugging

Set via environment variable:
```bash
LOG_LEVEL=debug npm start
```

## Express Integration

The request logging middleware automatically:
- Generates correlation IDs
- Attaches logger to `req.logger`
- Logs request start/completion
- Includes timing information

```typescript
import express from 'express';
import { requestLoggingMiddleware } from './utils/logger.js';

const app = express();
app.use(requestLoggingMiddleware());

app.get('/api/projects', (req, res) => {
  req.logger.info('Fetching projects');
  // ... handle request
});
```

## Service Pattern

Recommended pattern for service classes:

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

    logger.info('Creating project', { data });

    const endTimer = logger.time('database_insert');
    try {
      const result = await db.insert(data);
      endTimer();
      logger.info('Project created', { data: { id: result.id } });
      return result;
    } catch (error) {
      endTimer();
      logger.error('Failed to create project', { error, data });
      throw error;
    }
  }
}
```

## Testing

Run tests:
```bash
npm test -- logger.test.ts
```

All tests passed (21/21):
- Pre-configured loggers
- Custom logger creation
- Child logger inheritance
- Correlation ID generation
- Performance timing
- Log directory path
- Logging methods
- Backward compatibility

## Log Format

### Console (Development)
```
2024-01-10 12:00:00 [info] [Server] [a1b2c3d4]: Server starting
  {
    "port": 3456,
    "environment": "development"
  }
```

### File (JSON)
```json
{
  "timestamp": "2024-01-10T12:00:00.000Z",
  "level": "info",
  "component": "Server",
  "correlationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "message": "Server starting",
  "data": {
    "port": 3456,
    "environment": "development"
  }
}
```

## API Reference

### Factory Functions
- `getLogger(name, context?)` - Create custom logger
- `generateCorrelationId()` - Generate UUID v4
- `createRequestLogger(correlationId?)` - Create request-scoped logger
- `getLogDirectoryPath()` - Get log directory path

### Pre-configured Loggers
- `serverLogger` - Main server logger
- `wsLogger` - WebSocket logger
- `apiLogger` - API logger
- `serviceLogger` - Service logger

### Middleware
- `requestLoggingMiddleware()` - Express request logging

### Logger Methods
- `logger.error(message, meta?)` - Log error
- `logger.warn(message, meta?)` - Log warning
- `logger.info(message, meta?)` - Log info
- `logger.http(message, meta?)` - Log HTTP
- `logger.debug(message, meta?)` - Log debug
- `logger.time(operation, context?)` - Time operation
- `logger.createChildLogger(context)` - Create child logger

## Migration from Old Logger

Backward compatibility maintained:

```typescript
// Old API (still works)
import { logger, httpLogger, log } from './utils/logger.js';

// New API (recommended)
import { serverLogger, apiLogger, getLogger } from './utils/logger.js';
```

## Production Recommendations

1. **Use correlation IDs**: Always pass through request chains
2. **Set appropriate log level**: `LOG_LEVEL=info` in production
3. **Include context data**: Use data objects for structured logging
4. **Time critical operations**: Use `logger.time()` for monitoring
5. **Monitor log files**: Set up alerts for error spikes

## Environment Variables

- `LOG_LEVEL` - Log level (error, warn, info, http, debug)
- `LOG_DIR` - Override log directory (optional)

## Files

```
server/src/utils/
├── logger.ts              # Main implementation (400 lines)
├── logger.README.md       # Detailed documentation
├── logger.example.ts      # Usage examples (excluded from build)
└── logger.test.ts         # Unit tests (21 tests, all passing)
```

## Status

- ✅ Implementation complete
- ✅ Winston + winston-daily-rotate-file installed
- ✅ Cross-platform log directory support
- ✅ Correlation ID tracking
- ✅ Child loggers with context inheritance
- ✅ Performance timing utilities
- ✅ Sensitive data redaction
- ✅ Express middleware
- ✅ Unit tests (21/21 passing)
- ✅ TypeScript compilation successful
- ✅ Documentation complete

## Next Steps (Optional)

1. Integrate with existing routes
2. Add log aggregation (e.g., Elasticsearch, Datadog)
3. Set up log monitoring alerts
4. Add request ID to WebSocket connections
5. Create log analysis utilities
