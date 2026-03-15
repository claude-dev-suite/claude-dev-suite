# HTTP Request/Response Logging Middleware

Comprehensive logging middleware for the Dev-Suite Dashboard Server.

## Features

### Request Logging
- Generates unique correlation ID (UUID) for each request
- Attaches correlation ID to request object (`req.correlationId`)
- Sets `X-Correlation-ID` response header for client tracking
- Logs request method, URL, query parameters, and body
- Redacts sensitive data from request bodies

### Response Logging
- Logs HTTP status code
- Tracks response time in milliseconds
- Logs content-length header
- Uses different log levels based on status:
  - 2xx → `http` level (info)
  - 4xx → `warn` level
  - 5xx → `error` level

### Performance Tracking
- Warns on slow requests (> 1000ms)
- Includes `[SLOW]` tag in log message
- Tracks timing from request start to response finish

### Error Logging
- Catches all Express errors via error middleware
- Logs full stack trace in development
- Sanitizes error messages in production
- Includes request context with errors

### Sensitive Data Redaction
Automatically redacts the following fields from logs:
- `password`, `passwd`, `pwd`
- `token`, `apiKey`, `api_key`
- `secret`, `client_secret`
- `accessToken`, `refreshToken`
- `authorization`, `auth`, `bearer`
- `sessionId`, `session_id`
- `privateKey`, `private_key`
- `cookie`, `jwt`
- `creditcard`, `cvv`, `ssn`

## Usage

### Server Setup

```typescript
import { createServer } from './server.js';

const app = createServer();
// Request logger is automatically registered first
// Error logger is automatically registered last
```

### Accessing Logger in Routes

```typescript
import { Request, Response } from 'express';

export function myRoute(req: Request, res: Response) {
  // Use request-scoped logger with correlation ID
  req.logger?.info('Processing request', { data: { userId: 123 } });

  // Access correlation ID
  console.log('Correlation ID:', req.correlationId);

  res.json({ success: true });
}
```

## Log Format

### Console Output (Development)

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
    "method": "POST",
    "url": "/api/install",
    "statusCode": 200,
    "responseTime": 145,
    "contentLength": "567"
  }
```

### File Output (JSON)

Logs are written to:
- **Windows**: `%APPDATA%/@dev-suite/dashboard/logs/`
- **Unix**: `~/.dev-suite/dashboard/logs/`

Files:
- `combined-YYYY-MM-DD.log` - All logs
- `error-YYYY-MM-DD.log` - Errors only
- `exceptions-YYYY-MM-DD.log` - Uncaught exceptions
- `rejections-YYYY-MM-DD.log` - Unhandled rejections

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
    "body": { "projectPath": "/path", "password": "[REDACTED]" },
    "ip": "127.0.0.1"
  }
}
```

## Log Levels

Winston log levels (from highest to lowest priority):

| Level | Priority | Usage |
|-------|----------|-------|
| `error` | 0 | 5xx errors, exceptions |
| `warn` | 1 | 4xx errors, slow requests |
| `info` | 2 | Server startup, shutdown |
| `http` | 3 | HTTP requests/responses |
| `debug` | 4 | Detailed debugging |

Set log level via environment variable:
```bash
export LOG_LEVEL=debug  # Show all logs
export LOG_LEVEL=warn   # Show only warnings and errors
```

## Examples

### Successful Request
```
[http] [API] [abc-123]: → GET /api/health
[http] [API] [abc-123]: ← 200 GET /api/health (5ms)
```

### Slow Request
```
[http] [API] [def-456]: → POST /api/install
[warn] [API] [def-456]: ← 200 POST /api/install (1234ms) [SLOW]
```

### Error
```
[http] [API] [ghi-789]: → POST /api/detection
[error] [API] [ghi-789]: ✖ 500 POST /api/detection - Database connection failed
  {
    "error": {
      "name": "Error",
      "message": "Database connection failed",
      "stack": "Error: Database connection failed\n    at ..."
    }
  }
```

### Sensitive Data Redaction
```typescript
// Request body:
{
  "username": "john",
  "password": "secret123",
  "apiKey": "sk_live_abc123"
}

// Logged as:
{
  "username": "john",
  "password": "[REDACTED]",
  "apiKey": "[REDACTED]"
}
```

## Integration with Routes

The middleware is automatically integrated in `server.ts`:

```typescript
export function createServer(): Express {
  const app = express();

  // Request logging middleware (MUST be first)
  app.use(requestLogger);

  // ... other middleware ...

  // Routes registered here

  // Error handling middleware (MUST be last)
  app.use(errorLogger);

  return app;
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Winston log level |
| `LOG_DIR` | Platform-specific | Log directory path |
| `NODE_ENV` | `development` | Affects error detail in responses |

## Log Rotation

Logs are automatically rotated daily with the following settings:
- **Max file size**: 20MB (compressed after rotation)
- **Max retention**: 14 days
- **Compression**: Enabled (gzip)

## Security Considerations

1. **Sensitive Data**: All sensitive fields are automatically redacted
2. **Production Mode**: Stack traces are hidden in production responses
3. **Authorization Headers**: Always redacted from logs
4. **Body Logging**: Only logs request bodies, never response bodies (may contain sensitive data)

## Troubleshooting

### Logs not appearing
- Check `LOG_LEVEL` environment variable
- Verify log directory permissions
- Check console for Winston errors

### Missing correlation IDs
- Ensure `requestLogger` is registered before routes
- Check that middleware chain is not broken

### Large log files
- Reduce `LOG_LEVEL` to `warn` or `error`
- Decrease retention period (modify `maxFiles` in logger.ts)
- Reduce max file size (modify `maxSize` in logger.ts)

## Performance Impact

The logging middleware has minimal performance impact:
- Correlation ID generation: < 1ms
- Log writing: Asynchronous (non-blocking)
- Sensitive data redaction: Only applied to objects with data

Expected overhead: < 5ms per request
