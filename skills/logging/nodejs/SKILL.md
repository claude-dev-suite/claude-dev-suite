---
name: nodejs-logging
description: |
  Node.js logging with Winston, Pino, and built-in console. Covers structured
  logging, log levels, transports, async logging, and production best practices
  for Express/NestJS applications.

  USE WHEN: user mentions "node.js logging", "express logging", "nestjs logging",
  asks about "how to log in node", "winston vs pino", "node logging best practices"

  DO NOT USE FOR: Python logging - use `python-logging` instead, Java logging - use `slf4j` or `logback`,
  Browser logging - different environment and APIs
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Node.js Logging

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `nodejs` for comprehensive documentation.

## Library Comparison

| Library | Performance | Features | Best For |
|---------|-------------|----------|----------|
| **Pino** | Fastest (10x+ faster) | JSON-native, low overhead | High-performance APIs |
| **Winston** | Good | Flexible transports, formatting | Enterprise apps, flexibility |
| **Bunyan** | Good | JSON-native, streams | Legacy projects |
| **console** | Basic | Built-in, no deps | Simple scripts, debugging |

## Pino (Recommended for Performance)

### Installation

```bash
npm install pino pino-pretty  # pino-pretty for dev
```

### Basic Setup

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

// Usage
logger.info('Server started');
logger.info({ userId: 123, action: 'login' }, 'User logged in');
logger.error({ err }, 'Database connection failed');
```

### Child Loggers (Request Context)

```typescript
import { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  req.log = logger.child({
    requestId: crypto.randomUUID(),
    method: req.method,
    path: req.path,
  });

  req.log.info('Request started');

  res.on('finish', () => {
    req.log.info({ statusCode: res.statusCode }, 'Request completed');
  });

  next();
}
```

### Express Integration

```typescript
import express from 'express';
import pino from 'pino';
import pinoHttp from 'pino-http';

const app = express();
const logger = pino();

app.use(pinoHttp({ logger }));

app.get('/users/:id', (req, res) => {
  req.log.info({ userId: req.params.id }, 'Fetching user');
  // ...
});
```

### NestJS Integration

```typescript
// logger.module.ts
import { Module, Global } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

@Global()
@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty' }
          : undefined,
      },
    }),
  ],
})
export class LoggerModule {}

// usage in service
import { Logger } from 'nestjs-pino';

@Injectable()
export class UserService {
  constructor(private readonly logger: Logger) {}

  findUser(id: string) {
    this.logger.log({ userId: id }, 'Finding user');
  }
}
```

## Winston

### Installation

```bash
npm install winston
```

### Basic Setup

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'my-service' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// Pretty console in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
}

export { logger };
```

### Usage

```typescript
import { logger } from './logger';

// Basic logging
logger.info('Server started on port 3000');
logger.warn('Cache miss for key: user:123');
logger.error('Database connection failed', { error: err });

// With metadata
logger.info('User action', {
  userId: user.id,
  action: 'purchase',
  amount: 99.99,
});
```

### Child Loggers

```typescript
const orderLogger = logger.child({ module: 'orders' });
orderLogger.info('Order created', { orderId: '12345' });
// Output: { module: 'orders', orderId: '12345', message: 'Order created', ... }
```

### Custom Transports

```typescript
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const rotateTransport = new DailyRotateFile({
  filename: 'logs/app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '100m',
  maxFiles: '30d',
  zippedArchive: true,
});

rotateTransport.on('rotate', (oldFilename, newFilename) => {
  logger.info('Log file rotated', { oldFilename, newFilename });
});

logger.add(rotateTransport);
```

### Express Middleware

```typescript
import expressWinston from 'express-winston';

app.use(expressWinston.logger({
  winstonInstance: logger,
  meta: true,
  msg: 'HTTP {{req.method}} {{req.url}} {{res.statusCode}} {{res.responseTime}}ms',
  expressFormat: false,
  colorize: false,
}));

app.use(expressWinston.errorLogger({
  winstonInstance: logger,
}));
```

## Log Levels

| Level | Priority | Usage |
|-------|----------|-------|
| `fatal` | 60 | App crash imminent |
| `error` | 50 | Error conditions |
| `warn` | 40 | Warning conditions |
| `info` | 30 | Normal operations |
| `debug` | 20 | Debug information |
| `trace` | 10 | Very detailed tracing |

```typescript
// Pino
logger.fatal('Uncaught exception');
logger.error('Failed to connect to database');
logger.warn('Deprecated API called');
logger.info('Server started');
logger.debug('Query executed');
logger.trace('Entering function');

// Winston (no fatal, uses error)
logger.error('Critical error');
logger.warn('Warning');
logger.info('Info');
logger.verbose('Verbose');  // between info and debug
logger.debug('Debug');
logger.silly('Trace-level'); // lowest
```

## Structured Logging Best Practices

### DO

```typescript
// Include context
logger.info({ userId, orderId, action: 'checkout' }, 'Order placed');

// Log errors properly
logger.error({ err, userId }, 'Payment failed');

// Use child loggers for context
const reqLogger = logger.child({ requestId, userId });
reqLogger.info('Processing request');
```

### DON'T

```typescript
// Don't log sensitive data
logger.info({ password, creditCard }, 'User registered'); // BAD!

// Don't use string interpolation for objects
logger.info(`User ${JSON.stringify(user)} logged in`); // BAD!

// Don't log PII without masking
logger.info({ email: user.email }); // Consider masking
```

### Sensitive Data Handling

```typescript
import pino from 'pino';

const logger = pino({
  redact: {
    paths: ['password', 'creditCard', 'req.headers.authorization'],
    censor: '[REDACTED]',
  },
});

// Logs: { password: '[REDACTED]', username: 'john' }
logger.info({ password: 'secret123', username: 'john' });
```

## Production Configuration

### Environment Variables

```bash
LOG_LEVEL=info          # Log level
LOG_FORMAT=json         # json or pretty
LOG_FILE=logs/app.log   # File output
```

### Docker/Container Logging

```typescript
// Log to stdout (Docker captures this)
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // No file transport - Docker handles log collection
});

// Ensure logs are flushed
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down');
  logger.flush();
  process.exit(0);
});
```

### Correlation IDs

```typescript
import { AsyncLocalStorage } from 'async_hooks';

const asyncLocalStorage = new AsyncLocalStorage<{ requestId: string }>();

export function withRequestContext(req: Request, res: Response, next: NextFunction) {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  asyncLocalStorage.run({ requestId }, () => next());
}

export function getRequestId(): string | undefined {
  return asyncLocalStorage.getStore()?.requestId;
}

// In logger
const logger = pino({
  mixin() {
    return { requestId: getRequestId() };
  },
});
```

## When NOT to Use This Skill

- **Python applications**: Use `python-logging` skill instead
- **Java/Spring Boot**: Use `slf4j` and `logback` skills instead
- **Browser/frontend logging**: Different APIs and requirements
- **Simple CLI tools**: console.log may be sufficient
- **Framework-specific details**: Use `winston` or `pino` skills for deep dives

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Using console.log in production | No control, no persistence | Use Winston or Pino |
| Synchronous file logging | Blocks event loop | Use async transports |
| Logging entire request/response objects | Contains sensitive data, huge size | Log only necessary fields |
| No request correlation IDs | Can't trace requests across services | Use AsyncLocalStorage or child loggers |
| String interpolation in logs | Always evaluated | Use template strings or parameterized logging |
| Missing error stack traces | Loses debugging context | Always include error object: `logger.error({ err })` |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Performance degradation | Synchronous logging | Switch to Pino or async Winston transports |
| Logs not appearing | Wrong log level | Check LOG_LEVEL environment variable |
| Unreadable JSON in console | No pretty-printer | Add pino-pretty or Winston simple format for dev |
| Memory leak | Log files growing unbounded | Configure log rotation (daily-rotate-file) |
| Missing request context | No correlation ID | Use child loggers or AsyncLocalStorage |
| Duplicate logs | Multiple loggers/transports | Consolidate to single logger instance |

## Reference

- [Quick Reference: Cheatsheet](quick-ref/cheatsheet.md)
- [Pino Documentation](https://getpino.io/)
- [Winston Documentation](https://github.com/winstonjs/winston)
