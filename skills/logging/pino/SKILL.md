---
name: pino
description: |
  Pino - extremely fast and low overhead Node.js logger with JSON-native structured logging.
  10x faster than Winston. Optimized for high-performance APIs and production environments.

  USE WHEN: user mentions "pino", "fast logging", "high performance logging", "fastify logging",
  asks about "fastest node.js logger", "JSON structured logging", "low overhead logging"

  DO NOT USE FOR: Winston logging - use `winston` instead, Python logging - use `python-logging` instead,
  Complex transport requirements - use `winston` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Pino Logger - Quick Reference

## When to Use This Skill
- Structured logging in Node.js applications
- High-performance logging
- Integration with log aggregation systems

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `pino` for comprehensive documentation.

## Basic Setup

```bash
npm install pino pino-pretty
```

## Essential Patterns

### Logger Base
```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

logger.info('Server started');
logger.error({ err }, 'Failed to connect');
```

### Child Logger
```typescript
const childLogger = logger.child({
  module: 'auth',
  requestId: req.id
});

childLogger.info({ userId }, 'User authenticated');
```

### Express Integration
```typescript
import pinoHttp from 'pino-http';

app.use(pinoHttp({ logger }));
```

### Fastify Integration
```typescript
import Fastify from 'fastify';

const fastify = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty'
    }
  }
});
```

## Production Configuration

```typescript
const logger = pino({
  level: 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    pid: process.pid,
    hostname: os.hostname(),
  },
});
```

## When NOT to Use This Skill

- **Complex multi-transport requirements**: Winston offers more flexible transport system
- **Custom log formatting beyond JSON**: Winston has more formatting options
- **Development-only logging**: Built-in console is simpler for quick debugging
- **Python/Java projects**: Use language-specific logging frameworks
- **Legacy apps expecting text logs**: Pino is JSON-first, requires parsing tools

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Using pino-pretty in production | 2-3x performance penalty | Only use in development, raw JSON in prod |
| Logging large objects | Serialization overhead | Log only necessary fields |
| Synchronous logging | Defeats Pino's async advantage | Use default async mode, avoid `pino.final()` |
| Nested child loggers without cleanup | Memory leak over time | Reuse child loggers or clear references |
| Logging in hot paths without level check | Still has minimal overhead | Use `if (logger.isLevelEnabled('debug'))` for extreme cases |
| Mixing multiple logger instances | Inconsistent configuration | Create one base logger, use child loggers |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Unreadable JSON in console | No pretty-printer configured | Add `pino-pretty` transport for development |
| Performance slower than expected | pino-pretty enabled in production | Remove pretty-printer, use raw JSON |
| Missing logs | Level too high | Check `level` configuration matches environment |
| Context not included | Not using child logger | Use `logger.child({ context })` for request scoping |
| Logs not flushing on exit | Async logging buffer | Use `pino.final()` or flush on SIGTERM |
| Extra fields not appearing | Incorrect syntax | Use object as first param: `logger.info({ field }, 'msg')` |
