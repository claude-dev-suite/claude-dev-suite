---
name: winston
description: |
  Winston - versatile logging library for Node.js with multiple transports, custom formatting,
  and log rotation. Supports structured logging, custom levels, and enterprise integration.

  USE WHEN: user mentions "winston", "node.js logging", "multiple transports", "log rotation",
  asks about "how to log to multiple destinations", "rotate log files in Node.js", "custom log formats"

  DO NOT USE FOR: Pino logging - use `pino` instead, Python logging - use `python-logging` instead,
  Java logging - use `slf4j` or `logback` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Winston Logger - Quick Reference

## When to Use This Skill
- Logging with multiple transports (file, console, HTTP)
- Structured logging with custom levels
- Automatic log file rotation

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `winston` for comprehensive documentation.

## Basic Setup

```bash
npm install winston
```

## Essential Patterns

### Logger Base
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// Add console in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}
```

### Custom Format
```typescript
const customFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  return `${timestamp} [${level.toUpperCase()}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
});

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    customFormat
  ),
  transports: [new winston.transports.Console()],
});
```

### Child Logger
```typescript
const childLogger = logger.child({ requestId: req.id, module: 'auth' });
childLogger.info('User authenticated', { userId: user.id });
```

### Daily Rotate File
```typescript
import DailyRotateFile from 'winston-daily-rotate-file';

const transport = new DailyRotateFile({
  filename: 'logs/app-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
});

logger.add(transport);
```

## When NOT to Use This Skill

- **High-performance APIs**: Use Pino instead - 10x faster than Winston
- **JSON-only logging**: Pino is more optimized for structured JSON output
- **Serverless/Lambda**: Prefer simpler console logging or Pino for lower overhead
- **Python/Java projects**: Use language-specific logging frameworks
- **Simple scripts**: Built-in console is sufficient for basic debugging

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Synchronous file logging | Blocks event loop, degrades performance | Use async transports with `{ stream: ... }` |
| Logging objects without serialization | Can log `[Object]` instead of data | Use `JSON.stringify()` or Winston JSON format |
| No log rotation | Disk fills up in production | Use `winston-daily-rotate-file` |
| Logging in tight loops | Overwhelms I/O, fills disks | Add conditional logic or sample logs |
| String concatenation | Always evaluated, even when disabled | Use format strings: `logger.info('User %s', userId)` |
| Missing error stack traces | Loses debugging context | Use `{ error: err }` or Winston error format |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Logs not appearing | Wrong log level configured | Check `logger.level` and transport levels |
| Performance degradation | Synchronous file writes | Use async transports or reduce log verbosity |
| Disk full | No log rotation | Configure `winston-daily-rotate-file` with `maxFiles` |
| `[Object]` in logs | Improper object formatting | Use `winston.format.json()` or `winston.format.prettyPrint()` |
| Duplicate logs | Multiple transports to same destination | Review transport configuration |
| Colors not showing | Console transport missing colorize | Add `winston.format.colorize()` to console transport |
