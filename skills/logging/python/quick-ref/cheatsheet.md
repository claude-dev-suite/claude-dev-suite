# Python Logging Quick Reference

## Standard Library

```python
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

logger.debug('Debug')
logger.info('Info')
logger.warning('Warning')
logger.error('Error')
logger.exception('With traceback')  # In except block
```

## Log Levels

```
CRITICAL (50) > ERROR (40) > WARNING (30) > INFO (20) > DEBUG (10)
```

## Lazy Formatting

```python
# GOOD - lazy evaluation
logger.info('User %s action %s', user_id, action)

# BAD - always evaluated
logger.debug(f'Expensive: {compute()}')
```

## Structlog

```python
import structlog
logger = structlog.get_logger()

logger.info('event', key='value', count=42)
log = logger.bind(user_id=123)
log.info('bound context')
```

## File Rotation

```python
from logging.handlers import RotatingFileHandler

handler = RotatingFileHandler(
    'app.log',
    maxBytes=100*1024*1024,  # 100MB
    backupCount=5
)
```

## FastAPI Middleware

```python
@app.middleware('http')
async def log_requests(request, call_next):
    logger.info('Request', path=request.url.path)
    response = await call_next(request)
    return response
```

## Django settings.py

```python
LOGGING = {
    'version': 1,
    'handlers': {
        'console': {'class': 'logging.StreamHandler'},
    },
    'root': {'handlers': ['console'], 'level': 'INFO'},
}
```
