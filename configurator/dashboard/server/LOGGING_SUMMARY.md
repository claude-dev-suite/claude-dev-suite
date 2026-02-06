# HTTP Request/Response Logging Implementation Summary

Comprehensive logging middleware has been implemented for the Dev-Suite Dashboard Server.

## Files Created

### 1. `src/utils/logger.ts`
Winston-based logging configuration with:
- Daily log rotation (14-day retention, 20MB max size)
- Cross-platform log directory support (Windows: `%APPDATA%`, Unix: `~/.dev-suite`)
- Multiple log files: combined, error, exceptions, rejections
- Console and file transports with different formats
- Sensitive data redaction utilities
- Pre-configured loggers: `serverLogger`, `wsLogger`, `apiLogger`, `serviceLogger`
- Correlation ID generation and tracking
- Request-scoped loggers

**Location**: Windows: `C:\Users\username\AppData\Roaming\@dev-suite\dashboard\logs\`
**Location**: Unix: `~/.dev-suite/dashboard/logs/`

### 2. `src/middleware/requestLogger.ts`
Express middleware for comprehensive HTTP logging:

#### Request Logging
- Generates unique correlation ID (UUID) per request
- Attaches `correlationId` to `req` object
- Sets `X-Correlation-ID` response header
- Logs: method, URL, query params, request body (redacted)
- Logs important headers (excluding sensitive ones)
- Creates request-scoped logger (`req.logger`)

#### Response Logging
- Logs: status code, response time, content-length
- Different log levels based on status:
  - 2xx → `http` level
  - 4xx → `warn` level
  - 5xx → `error` level
- Warns on slow requests (> 1000ms) with `[SLOW]` tag

#### Error Logging
- Error middleware catches all Express errors
- Logs full stack trace with request context
- Sanitizes error responses in production
- Returns correlation ID to client for troubleshooting

#### Sensitive Data Redaction
Automatically redacts these fields from logs:
```typescript
password, passwd, pwd, secret, token, apiKey, api_key,
accessToken, refreshToken, authorization, auth, bearer,
sessionId, privateKey, client_secret, cookie, jwt,
creditcard, cvv, ssn
```

### 3. `src/middleware/README.md`
Complete documentation including:
- Feature overview
- Usage examples
- Log format specifications
- Environment variables
- Security considerations
- Troubleshooting guide
- Performance impact analysis

### 4. `LOGGING_EXAMPLE.md`
Real-world examples showing:
- Successful requests
- POST requests with sensitive data
- Slow requests
- Client errors (4xx)
- Server errors (5xx)
- Authorization header redaction
- Correlation ID tracking
- Query parameter logging
- Log file locations
- Real-time log viewing commands
- Integration with monitoring tools

## Updated Files

### `src/server.ts`
Integrated logging middleware:
```typescript
export function createServer(): Express {
  const app = express();

  // Request logging middleware (MUST be first)
  app.use(requestLogger);

  // ... other middleware ...

  // Error handling middleware (MUST be last)
  app.use(errorLogger);

  return app;
}
```

### `src/index.ts`
Replaced `console.log` with Winston logger:
```typescript
import { logger } from './utils/logger.js';

logger.info('Starting Dev-Suite Dashboard Server...');
logger.info(`HTTP server running on http://${HOST}:${HTTP_PORT}`);
logger.error('Fatal error', { error: err });
```

## Log Format

### Console (Development)
```
2026-01-10 12:00:00 [http] [API] [abc-123]: → POST /api/install
  {
    "method": "POST",
    "url": "/api/install",
    "body": { "projectPath": "/path", "password": "[REDACTED]" },
    "ip": "127.0.0.1"
  }
2026-01-10 12:00:01 [http] [API] [abc-123]: ← 200 POST /api/install (145ms)
  {
    "statusCode": 200,
    "responseTime": 145
  }
```

### File (JSON)
```json
{
  "timestamp": "2026-01-10T12:00:00.000Z",
  "level": "http",
  "component": "API",
  "correlationId": "abc-123-def-456",
  "message": "→ POST /api/install",
  "data": {
    "method": "POST",
    "url": "/api/install",
    "body": { "projectPath": "/path", "password": "[REDACTED]" }
  }
}
```

## Log Levels

| Level | Priority | Usage |
|-------|----------|-------|
| error | 0 | 5xx errors, exceptions |
| warn | 1 | 4xx errors, slow requests |
| info | 2 | Server lifecycle events |
| http | 3 | HTTP requests/responses |
| debug | 4 | Detailed debugging |

Set via: `export LOG_LEVEL=debug`

## Log Rotation

- **Daily rotation**: Logs rotate at midnight
- **Max file size**: 20MB (then compressed)
- **Retention**: 14 days
- **Compression**: gzip after rotation

## Key Features

### 1. Correlation ID Tracking
Every request gets a unique UUID that:
- Is attached to all logs for that request
- Is returned in `X-Correlation-ID` header
- Can be provided by client for distributed tracing
- Enables end-to-end request tracking

### 2. Sensitive Data Protection
Automatically redacts:
- Passwords and secrets from request bodies
- Authorization and API key headers
- Session IDs and tokens
- Credit card and PII data

### 3. Performance Monitoring
- Tracks response time for every request
- Warns on requests > 1000ms
- Includes timing in log context
- Non-blocking async logging

### 4. Error Context
When errors occur, logs include:
- Full stack trace
- Request method and URL
- Request body (redacted)
- Query parameters
- Correlation ID
- Error name and message

### 5. Production Safety
In production mode (`NODE_ENV=production`):
- Stack traces hidden from client responses
- Still logged to files for debugging
- Generic error messages returned to client
- Full context preserved in logs

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Winston log level |
| `LOG_DIR` | Platform-specific | Override log directory |
| `NODE_ENV` | `development` | Affects error detail in responses |

## Usage in Routes

```typescript
import { Request, Response } from 'express';

export function myRoute(req: Request, res: Response) {
  // Use request-scoped logger with correlation ID
  req.logger?.info('Processing request', {
    data: { userId: 123 }
  });

  // Access correlation ID
  const correlationId = req.correlationId;

  res.json({ success: true, correlationId });
}
```

## TypeScript Integration

Types are properly extended:
```typescript
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      startTime?: number;
      logger?: Logger;
    }
  }
}
```

## Performance Impact

- Correlation ID generation: < 1ms
- Log writing: Async (non-blocking)
- Sensitive data redaction: Only on logged objects
- Expected overhead: < 5ms per request

## Testing Status

- TypeScript compilation: ✅ Passing
- No ESLint errors: ✅ Clean
- No type errors: ✅ Validated
- Integration: ✅ Middleware registered

## Next Steps

To use the logging system:

1. **Start the server**
   ```bash
   cd configurator/dashboard/server
   npm run dev
   ```

2. **View logs in real-time**
   ```bash
   # Windows (PowerShell)
   Get-Content "$env:APPDATA\@dev-suite\dashboard\logs\combined-*.log" -Wait -Tail 50

   # Unix
   tail -f ~/.dev-suite/dashboard/logs/combined-$(date +%Y-%m-%d).log
   ```

3. **Make a test request**
   ```bash
   curl http://localhost:3456/api/health
   ```

4. **Check logs**
   - Console: See colorized output
   - Files: Check JSON logs in log directory

## Monitoring Integration

The JSON format works with:
- Elasticsearch/Kibana
- Grafana Loki
- AWS CloudWatch
- Datadog
- Splunk

## Security Notes

1. All sensitive fields automatically redacted
2. Authorization headers never logged
3. Stack traces hidden from client in production
4. Request bodies redacted before logging
5. No response bodies logged (may contain sensitive data)

## Files Summary

| File | Purpose | Lines |
|------|---------|-------|
| `utils/logger.ts` | Winston logger setup | ~400 |
| `middleware/requestLogger.ts` | Request/response logging | ~270 |
| `middleware/README.md` | Documentation | ~350 |
| `LOGGING_EXAMPLE.md` | Real examples | ~400 |

## Dependencies Used

- `winston` (v3.17.0): Core logging
- `winston-daily-rotate-file` (v5.0.0): Log rotation
- `uuid` (v10.0.0): Correlation IDs

All dependencies were already present in `package.json`.

## Complete Implementation

The logging system is fully implemented and ready to use. All files are created, TypeScript is validated, and the middleware is integrated into the server pipeline.
