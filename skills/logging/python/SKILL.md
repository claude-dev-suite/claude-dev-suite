---
name: python-logging
description: |
  Python logging with the standard library logging module and structlog.
  Covers log levels, handlers, formatters, structured logging, and
  production best practices for FastAPI/Django applications.

  USE WHEN: user mentions "python logging", "fastapi logging", "django logging",
  asks about "how to log in python", "python logging module", "logging configuration python"

  DO NOT USE FOR: Node.js logging - use `nodejs-logging` instead, Java logging - use `slf4j` or `logback`,
  structlog-specific - use `structlog` skill for deep dive
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Python Logging

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `python` for comprehensive documentation.

## Standard Library (logging)

### Basic Setup

```python
import logging

# Configure root logger
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# Get logger for module
logger = logging.getLogger(__name__)

# Usage
logger.debug('Debug message')
logger.info('Info message')
logger.warning('Warning message')
logger.error('Error message')
logger.critical('Critical message')
```

### Advanced Configuration

```python
import logging
import logging.handlers
import sys

def setup_logging(level: str = 'INFO') -> None:
    """Configure application logging."""

    # Create formatter
    formatter = logging.Formatter(
        fmt='%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    console_handler.setLevel(logging.DEBUG)

    # File handler with rotation
    file_handler = logging.handlers.RotatingFileHandler(
        filename='logs/app.log',
        maxBytes=100 * 1024 * 1024,  # 100MB
        backupCount=5,
        encoding='utf-8'
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.INFO)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper()))
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)

    # Reduce noise from third-party libraries
    logging.getLogger('urllib3').setLevel(logging.WARNING)
    logging.getLogger('httpx').setLevel(logging.WARNING)
```

### Log Levels

| Level | Numeric | Usage |
|-------|---------|-------|
| `CRITICAL` | 50 | System unusable |
| `ERROR` | 40 | Error conditions |
| `WARNING` | 30 | Warning conditions |
| `INFO` | 20 | Normal operations |
| `DEBUG` | 10 | Debug information |
| `NOTSET` | 0 | Inherit from parent |

### Exception Logging

```python
try:
    result = process_data(data)
except ValueError as e:
    logger.error('Invalid data format: %s', e)
except Exception:
    logger.exception('Unexpected error processing data')  # Includes traceback
    raise
```

### Extra Context

```python
# Using extra parameter
logger.info('User logged in', extra={'user_id': user.id, 'ip': request.ip})

# Custom LoggerAdapter for consistent context
class ContextLogger(logging.LoggerAdapter):
    def process(self, msg, kwargs):
        extra = kwargs.get('extra', {})
        extra.update(self.extra)
        kwargs['extra'] = extra
        return msg, kwargs

logger = ContextLogger(logging.getLogger(__name__), {'request_id': request_id})
logger.info('Processing request')
```

## Structlog (Structured Logging)

### Installation

```bash
pip install structlog
```

### Basic Setup

```python
import structlog

structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt='iso'),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()  # or ConsoleRenderer() for dev
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()
```

### Usage

```python
# Basic logging
logger.info('Server started', port=8000, host='0.0.0.0')

# Bind context
log = logger.bind(user_id=user.id, request_id=request_id)
log.info('Processing request')
log.info('Request completed', status=200, duration_ms=45)

# Exception logging
try:
    process()
except Exception:
    logger.exception('Processing failed', order_id=order.id)
```

### Output (JSON)

```json
{
  "event": "Processing request",
  "user_id": 123,
  "request_id": "abc-123",
  "timestamp": "2025-01-15T10:30:00.000000Z",
  "level": "info",
  "logger": "myapp.services"
}
```

### Development vs Production

```python
import structlog
import sys

def configure_logging(env: str = 'development'):
    shared_processors = [
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt='iso'),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if env == 'production':
        # JSON output for log aggregation
        processors = shared_processors + [
            structlog.processors.JSONRenderer()
        ]
    else:
        # Pretty console output for development
        processors = shared_processors + [
            structlog.dev.ConsoleRenderer(colors=True)
        ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
```

## FastAPI Integration

### Middleware for Request Logging

```python
import time
import uuid
from fastapi import FastAPI, Request
import structlog

app = FastAPI()
logger = structlog.get_logger()

@app.middleware('http')
async def logging_middleware(request: Request, call_next):
    request_id = str(uuid.uuid4())
    start_time = time.perf_counter()

    # Bind context for this request
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(
        request_id=request_id,
        method=request.method,
        path=request.url.path,
    )

    logger.info('Request started')

    response = await call_next(request)

    duration_ms = (time.perf_counter() - start_time) * 1000
    logger.info(
        'Request completed',
        status_code=response.status_code,
        duration_ms=round(duration_ms, 2)
    )

    response.headers['X-Request-ID'] = request_id
    return response
```

### Dependency Injection

```python
from fastapi import Depends
import structlog

def get_logger() -> structlog.stdlib.BoundLogger:
    return structlog.get_logger()

@app.get('/users/{user_id}')
async def get_user(
    user_id: int,
    logger: structlog.stdlib.BoundLogger = Depends(get_logger)
):
    logger = logger.bind(user_id=user_id)
    logger.info('Fetching user')
    # ...
```

## Django Integration

### settings.py

```python
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{asctime} {levelname} {name} {message}',
            'style': '{',
        },
        'json': {
            '()': 'pythonjsonlogger.jsonlogger.JsonFormatter',
            'format': '%(asctime)s %(levelname)s %(name)s %(message)s',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
        'file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': 'logs/django.log',
            'maxBytes': 100 * 1024 * 1024,
            'backupCount': 5,
            'formatter': 'json',
        },
    },
    'root': {
        'handlers': ['console', 'file'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'django.db.backends': {
            'level': 'WARNING',  # Reduce SQL noise
        },
    },
}
```

## Best Practices

### DO

```python
# Use module-level loggers
logger = logging.getLogger(__name__)

# Use lazy formatting
logger.info('User %s performed %s', user_id, action)

# Include context
logger.info('Order processed', extra={'order_id': order.id, 'total': total})

# Log exceptions with traceback
logger.exception('Failed to process order')
```

### DON'T

```python
# Don't use f-strings (evaluated even when level is disabled)
logger.debug(f'Processing {expensive_computation()}')  # BAD

# Don't log sensitive data
logger.info('Login: user=%s, password=%s', user, password)  # BAD!

# Don't use print() for logging
print(f'Error: {error}')  # BAD - use logger.error()
```

### Sensitive Data Handling

```python
import re

class SensitiveDataFilter(logging.Filter):
    PATTERNS = [
        (re.compile(r'password["\']?\s*[:=]\s*["\']?[^"\'}\s]+'), 'password=***'),
        (re.compile(r'token["\']?\s*[:=]\s*["\']?[^"\'}\s]+'), 'token=***'),
    ]

    def filter(self, record):
        message = record.getMessage()
        for pattern, replacement in self.PATTERNS:
            message = pattern.sub(replacement, message)
        record.msg = message
        record.args = ()
        return True

# Add filter to handler
handler.addFilter(SensitiveDataFilter())
```

## When NOT to Use This Skill

- **structlog-specific questions**: Use `structlog` skill for detailed configuration
- **Node.js/Java projects**: Use language-appropriate logging skills
- **Simple print debugging**: print() is fine for quick scripts
- **Third-party library internals**: Consult library-specific docs
- **Log analysis**: Use `log-analyzer` MCP server instead

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Using print() for logging | No control, no filtering, no formatting | Use logging module |
| f-strings in log messages | Always evaluated, performance hit | Use lazy formatting: `logger.info('User %s', user_id)` |
| Not using module-level loggers | Loses context about log source | Use `logger = logging.getLogger(__name__)` |
| Root logger configuration in libraries | Affects all applications | Only configure in main application |
| Logging exceptions without traceback | Loses debugging context | Use `logger.exception()` in except blocks |
| Not rotating log files | Disk fills up | Use RotatingFileHandler or TimedRotatingFileHandler |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Logs not appearing | Log level too high | Check logger.setLevel() and handler levels |
| Duplicate log messages | Multiple handlers on same logger | Check handler configuration, set propagate=False |
| No traceback in logs | Using logger.error() instead of exception() | Use `logger.exception()` in except blocks |
| Third-party library spam | Noisy library logs | Set specific logger levels: `logging.getLogger('urllib3').setLevel(WARNING)` |
| Performance issues | Too many handlers or formatters | Simplify configuration, use appropriate log levels |
| Missing context | Not using extra parameter | Use `logger.info('msg', extra={'key': value})` or LoggerAdapter |

## Reference

- [Quick Reference: Cheatsheet](quick-ref/cheatsheet.md)
- [Python logging HOWTO](https://docs.python.org/3/howto/logging.html)
- [Structlog Documentation](https://www.structlog.org/)
