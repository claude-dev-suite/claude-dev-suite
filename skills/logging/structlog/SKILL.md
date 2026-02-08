---
name: structlog
description: |
  structlog - structured logging library for Python with native JSON support, context binding,
  and processor pipeline. Integrates with FastAPI, Django, and standard logging module.

  USE WHEN: user mentions "structlog", "python structured logging", "context binding",
  asks about "JSON logging python", "fastapi logging", "django structured logging"

  DO NOT USE FOR: Standard Python logging - use `python-logging` instead, Node.js logging - use `pino` or `winston`,
  Java logging - use `slf4j` or `logback` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# structlog - Quick Reference

## When to Use This Skill
- Structured logging in Python
- Integration with JSON logging
- Context binding for request tracing

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `structlog` for comprehensive documentation.

## Basic Setup

```bash
pip install structlog
```

## Essential Patterns

### Basic Configuration
```python
import structlog

structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)
```

### Basic Usage
```python
import structlog

log = structlog.get_logger()

log.info("user_logged_in", user_id=123, ip="192.168.1.1")
log.warning("rate_limit_exceeded", endpoint="/api/users", count=100)
log.error("database_error", error="connection timeout", retry=3)
```

### Context Binding
```python
log = structlog.get_logger()

# Bind context for all subsequent logs
log = log.bind(request_id="abc-123", user_id=42)

log.info("processing_started")  # Includes request_id and user_id
log.info("step_completed", step=1)
log.info("processing_finished")

# New context
log = log.new(request_id="xyz-789")
```

### FastAPI Integration
```python
from fastapi import FastAPI, Request
import structlog

app = FastAPI()

@app.middleware("http")
async def add_request_context(request: Request, call_next):
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(
        request_id=request.headers.get("X-Request-ID", str(uuid.uuid4())),
        path=request.url.path,
    )
    return await call_next(request)
```

### Django Integration
```python
# settings.py
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": structlog.stdlib.ProcessorFormatter,
            "processor": structlog.processors.JSONRenderer(),
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
}
```

### Exception Logging
```python
try:
    risky_operation()
except Exception:
    log.exception("operation_failed", operation="risky")
    # Automatically includes stack trace
```

## When NOT to Use This Skill

- **Simple scripts**: Standard logging module is sufficient for basic needs
- **Legacy codebases**: Migration effort may not be worth it for small projects
- **Text-only log requirements**: structlog is JSON-first, requires parsing
- **Non-Python projects**: Use language-appropriate logging frameworks
- **Applications without centralized logging**: Standard logging may be simpler

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Using ConsoleRenderer in production | Wastes CPU, not machine-parseable | Use JSONRenderer for production |
| Not clearing context variables | Leaks context across requests | Use `structlog.contextvars.clear_contextvars()` |
| Logging large objects | Serialization overhead | Log only necessary fields or IDs |
| Creating new logger per request | Performance overhead | Use `logger.bind()` to add context |
| Missing exception logging | Loses stack traces | Use `logger.exception()` in except blocks |
| Not configuring processors | Incomplete/inconsistent output | Configure full processor pipeline |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Plain text output instead of JSON | ConsoleRenderer configured | Change to `JSONRenderer()` in processors |
| Context not appearing in logs | Not using context binding | Use `logger.bind()` or `contextvars` |
| Performance issues | Too many processors | Remove unnecessary processors, use JSONRenderer |
| Missing timestamps | No TimeStamper processor | Add `TimeStamper(fmt='iso')` to processors |
| Logs not colorized in dev | Missing dev configuration | Use `ConsoleRenderer(colors=True)` for development |
| Context bleeding across requests | Not clearing contextvars | Clear context at request start with middleware |
