---
name: nestjs
description: |
  NestJS enterprise Node.js framework. Covers modules, controllers,
  services, guards, and dependency injection. Use when building
  scalable Node.js applications.

  USE WHEN: user mentions "NestJS", "nest", "@nestjs", "@Module", "@Controller", "@Injectable", asks about "dependency injection in Node.js", "enterprise Node.js framework", "TypeScript backend framework", "decorators in backend", "guards and pipes", "modular Node.js architecture"

  DO NOT USE FOR: Express (minimalist framework) - use `express` instead, Fastify (performance-focused) - use `fastify` instead, Hono (edge runtimes) - use `hono` instead, Deno frameworks - use `oak` or `fresh` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# NestJS Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `nestjs` for comprehensive documentation.

## Module Structure

```ts
// users.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

## Controller

```ts
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(): Promise<User[]> {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<User> {
    return this.usersService.findOne(id);
  }

  @Post()
  @HttpCode(201)
  create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.usersService.create(createUserDto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
```

## Service

```ts
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  findAll(): Promise<User[]> {
    return this.usersRepository.find();
  }

  findOne(id: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ id });
  }
}
```

## Key Decorators

| Decorator | Purpose |
|-----------|---------|
| `@Module` | Define module |
| `@Controller` | Define controller |
| `@Injectable` | Mark as provider |
| `@Get/@Post/@Put/@Delete` | HTTP methods |
| `@Body/@Param/@Query` | Request data |
| `@UseGuards` | Apply guards |
| `@UsePipes` | Apply pipes |

## Production Readiness

### Security Configuration

```ts
// main.ts - Security setup
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as compression from 'compression';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers
  app.use(helmet());

  // CORS configuration
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,           // Strip non-whitelisted properties
    forbidNonWhitelisted: true, // Throw on non-whitelisted
    transform: true,            // Auto-transform payloads
  }));

  // Response compression
  app.use(compression());

  // Rate limiting (with @nestjs/throttler)
  // Configured in AppModule

  await app.listen(process.env.PORT || 3000);
}
```

```ts
// Rate limiting module
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,    // 1 minute
      limit: 100,    // 100 requests per minute
    }]),
  ],
  providers: [{
    provide: APP_GUARD,
    useClass: ThrottlerGuard,
  }],
})
export class AppModule {}
```

### Health Checks

```ts
// health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HttpHealthIndicator, TypeOrmHealthIndicator } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
    ]);
  }

  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.http.pingCheck('external-api', 'https://api.example.com/health'),
    ]);
  }
}
```

### Logging

```ts
// Structured logging with Pino
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty' }
          : undefined,
        redact: ['req.headers.authorization', 'req.body.password'],
      },
    }),
  ],
})
export class AppModule {}
```

### Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Request latency p99 | > 500ms |
| Error rate (5xx) | > 1% |
| Memory usage | > 80% |
| CPU usage | > 70% |
| Active connections | > 1000 |
| Request queue depth | > 100 |

### Exception Handling

```ts
// Global exception filter
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = exception instanceof HttpException
      ? exception.getResponse()
      : 'Internal server error';

    this.logger.error({
      statusCode: status,
      path: request.url,
      method: request.method,
      message,
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    response.status(status).json({
      statusCode: status,
      message: status === 500 ? 'Internal server error' : message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

### Checklist

- [ ] Helmet security headers enabled
- [ ] CORS properly configured
- [ ] Rate limiting implemented
- [ ] Input validation with class-validator
- [ ] Global exception filter
- [ ] Health/readiness endpoints
- [ ] Structured logging (no console.log)
- [ ] Secrets via environment variables
- [ ] HTTPS in production
- [ ] Request timeout configured
- [ ] Graceful shutdown handling

## When NOT to Use This Skill

- **Minimalist APIs**: Use Express for lightweight, unopinionated APIs
- **Maximum Performance**: Use Fastify for high-throughput, low-latency requirements
- **Edge Runtimes**: Use Hono for Cloudflare Workers, Vercel Edge, or Deno Deploy
- **Microservices Communication**: Defer to `kafka-expert` or `rabbitmq-expert` for message brokers
- **Database Operations**: Use `prisma-expert` or `sql-expert` for ORM/database specifics
- **WebSocket Implementation**: Use dedicated WebSocket skill (coming soon)

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using `console.log()` for logging | No structured logging, hard to query | Use `nestjs-pino` or Winston with structured logs |
| Circular dependencies between modules | Causes initialization failures | Use `forwardRef()` or redesign module boundaries |
| Business logic in controllers | Violates SRP, hard to test | Move logic to services, controllers orchestrate only |
| Not using DTOs for validation | Security risk, inconsistent data | Use `class-validator` with DTOs for all inputs |
| Hardcoding config values | Not portable, security risk | Use `@nestjs/config` with env variables |
| Not implementing graceful shutdown | Data loss, incomplete requests | Handle `SIGTERM`, close connections properly |
| Mixing ORM logic with business logic | Tight coupling, hard to test | Use repository pattern, inject repositories |
| Not using guards for authorization | Security vulnerabilities | Implement guards for auth/authz checks |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| "Circular dependency detected" | Module A imports B, B imports A | Use `forwardRef()` or extract shared logic |
| "Cannot find module" in tests | Path mapping not resolved | Configure `moduleNameMapper` in Jest config |
| Guards not executing | Wrong order in app setup | Apply guards after pipes: `app.useGlobalGuards()` |
| DTOs not validating | ValidationPipe not global | Add `app.useGlobalPipes(new ValidationPipe())` in main.ts |
| High memory usage | Memory leaks in subscriptions | Use `takeUntil()` or unsubscribe in `onModuleDestroy()` |
| Slow startup time | Too many providers/imports | Lazy load modules, optimize dependency tree |
| 404 for all routes | Controllers not registered | Add controllers to module's `controllers` array |
| Middleware not executing | Incorrect order or path | Check middleware order, use `forRoutes('*')` for global |

## Reference Documentation
- [Module Structure](quick-ref/modules.md)
- [Guards & Pipes](quick-ref/guards.md)
- [Deep: Architecture](deep-docs/architecture/)
