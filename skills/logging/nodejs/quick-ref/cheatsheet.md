# Node.js Logging Quick Reference

## Pino (Fast)

```typescript
import pino from 'pino';

const logger = pino({ level: 'info' });
logger.info('Hello');
logger.info({ userId: 123 }, 'User action');
logger.error({ err }, 'Failed');
```

## Winston (Flexible)

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});
```

## Log Levels

```
fatal > error > warn > info > debug > trace
```

## Child Logger Pattern

```typescript
const reqLogger = logger.child({ requestId, userId });
reqLogger.info('Processing');
```

## Redact Sensitive Data

```typescript
const logger = pino({
  redact: ['password', 'token', 'req.headers.authorization'],
});
```

## Express Middleware

```typescript
// Pino
import pinoHttp from 'pino-http';
app.use(pinoHttp({ logger }));

// Winston
import expressWinston from 'express-winston';
app.use(expressWinston.logger({ winstonInstance: logger }));
```

## NestJS

```typescript
import { Logger } from 'nestjs-pino';

@Injectable()
export class MyService {
  constructor(private logger: Logger) {}
}
```

## Best Practices

```typescript
// DO - structured data
logger.info({ userId, action }, 'Event');

// DON'T - string concatenation
logger.info(`User ${userId} did ${action}`);
```
