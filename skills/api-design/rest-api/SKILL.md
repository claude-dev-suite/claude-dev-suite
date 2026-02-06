---
name: rest-api
description: |
  REST API design principles. Covers resources, methods, and status codes.
  Use when designing or reviewing REST APIs.

  USE WHEN: user mentions "REST API", "RESTful", "HTTP methods", "status codes", "resource naming",
  "API endpoints", "pagination", "versioning", asks about "how to design REST API",
  "REST best practices", "API documentation", "HTTP verbs"

  DO NOT USE FOR: GraphQL APIs - use `graphql` instead; tRPC - use `trpc` instead;
  OpenAPI specs - use `openapi` instead; Spring Boot REST - combine with `springdoc-openapi`
allowed-tools: Read, Grep, Glob
---
# REST API Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `rest-api` for comprehensive documentation.

## Resource Naming

```
# Collections (plural nouns)
GET    /users              # List users
POST   /users              # Create user
GET    /users/{id}         # Get user
PUT    /users/{id}         # Update user
DELETE /users/{id}         # Delete user

# Nested resources
GET    /users/{id}/posts   # User's posts
POST   /users/{id}/posts   # Create user's post

# Avoid verbs in URLs
❌ GET /getUsers
❌ POST /createUser
✅ GET /users
✅ POST /users
```

## HTTP Methods

| Method | Purpose | Idempotent |
|--------|---------|------------|
| GET | Read resource | Yes |
| POST | Create resource | No |
| PUT | Replace resource | Yes |
| PATCH | Partial update | Yes |
| DELETE | Remove resource | Yes |

## Status Codes

| Code | Meaning | Use Case |
|------|---------|----------|
| 200 | OK | Successful GET/PUT/PATCH |
| 201 | Created | Successful POST |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Validation error |
| 401 | Unauthorized | Missing/invalid auth |
| 403 | Forbidden | No permission |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate/conflict |
| 422 | Unprocessable | Semantic error |
| 500 | Server Error | Internal error |

## Response Format

```json
// Success
{
  "data": { "id": 1, "name": "John" },
  "meta": { "timestamp": "2024-01-15T10:00:00Z" }
}

// Collection
{
  "data": [...],
  "meta": { "total": 100, "page": 1, "limit": 20 }
}

// Error
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": [{ "field": "email", "message": "Required" }]
  }
}
```

## Query Parameters

```
GET /users?status=active&sort=-createdAt&page=1&limit=20
GET /users?fields=id,name,email
GET /users?include=posts,profile
GET /users?filter[age][gte]=18
```

## When NOT to Use This Skill

- GraphQL API design (use `graphql` skill)
- tRPC type-safe APIs (use `trpc` skill)
- OpenAPI specification writing (use `openapi` skill)
- Real-time APIs requiring WebSockets or SSE
- APIs requiring complex nested queries (consider GraphQL)

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Using verbs in URLs (`/getUser`, `/createOrder`) | Not RESTful, violates resource naming | Use HTTP methods on nouns (`GET /users`, `POST /orders`) |
| Returning 200 for errors | Misleading, breaks HTTP semantics | Use appropriate 4xx/5xx status codes |
| Not versioning API | Breaking changes affect all clients | Use URL or header versioning (`/v1/`, `/v2/`) |
| Exposing database IDs directly | Security risk, implementation leak | Use UUIDs or opaque identifiers |
| No pagination on large collections | Performance issues, timeouts | Implement cursor or offset pagination |
| Ignoring HTTP caching headers | Poor performance, unnecessary load | Use ETag, Cache-Control, Last-Modified |
| Using GET for state-changing operations | Security risk, breaks REST principles | Use POST, PUT, PATCH, DELETE |
| Inconsistent response formats | Client confusion, integration issues | Standardize on JSON envelope format |
| Missing rate limiting | API abuse, resource exhaustion | Implement rate limiting with 429 responses |

## Quick Troubleshooting

| Issue | Possible Cause | Solution |
|-------|----------------|----------|
| 401 Unauthorized | Missing or invalid auth token | Check Authorization header, verify token |
| 403 Forbidden | Valid auth but insufficient permissions | Check user roles, verify access control |
| 404 Not Found | Resource doesn't exist or wrong path | Verify endpoint URL, check resource ID |
| 409 Conflict | Resource already exists or state conflict | Check uniqueness constraints, handle idempotency |
| 422 Unprocessable Entity | Validation failed | Check request body, validate against schema |
| 429 Too Many Requests | Rate limit exceeded | Implement backoff, check rate limit headers |
| 500 Internal Server Error | Server-side bug or crash | Check server logs, add error handling |
| CORS errors | Missing CORS headers | Configure CORS middleware with allowed origins |
| Slow API responses | No pagination, N+1 queries | Add pagination, optimize database queries |

## Production Readiness

### Security Configuration

```typescript
// Input validation and sanitization
import { z } from 'zod';

const CreateUserSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  email: z.string().email().toLowerCase(),
  age: z.number().int().min(0).max(150).optional(),
});

// Validate request body
app.post('/users', async (req, res) => {
  const result = CreateUserSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', details: result.error.issues },
    });
  }
  // Use result.data (validated and transformed)
});

// SQL injection prevention - always use parameterized queries
// NEVER: `SELECT * FROM users WHERE id = '${userId}'`
// GOOD: Use ORM or prepared statements
```

### Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

// Different limits for different endpoints
const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED' } },
});

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Strict for auth endpoints
  skipSuccessfulRequests: true,
});

app.use('/api', standardLimiter);
app.use('/api/auth/login', authLimiter);
```

### API Versioning

```typescript
// URL versioning (recommended for breaking changes)
app.use('/api/v1', v1Router);
app.use('/api/v2', v2Router);

// Header versioning (for minor versions)
app.use('/api', (req, res, next) => {
  const version = req.headers['api-version'] || '1.0';
  req.apiVersion = version;
  next();
});

// Sunset header for deprecated endpoints
app.get('/api/v1/legacy', (req, res) => {
  res.set('Sunset', 'Sat, 01 Jun 2025 00:00:00 GMT');
  res.set('Deprecation', 'true');
  // ... handle request
});
```

### Pagination

```typescript
// Cursor-based pagination (recommended for large datasets)
interface PaginatedResponse<T> {
  data: T[];
  meta: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

app.get('/users', async (req, res) => {
  const cursor = req.query.cursor as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

  const users = await db.users.findMany({
    take: limit + 1, // Fetch one extra to check if there's more
    cursor: cursor ? { id: cursor } : undefined,
    orderBy: { createdAt: 'desc' },
  });

  const hasMore = users.length > limit;
  const data = hasMore ? users.slice(0, -1) : users;

  res.json({
    data,
    meta: {
      nextCursor: hasMore ? data[data.length - 1].id : null,
      hasMore,
    },
  });
});
```

### Error Handling

```typescript
// Consistent error response format
interface APIError {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] as string;

  // Log error with context
  logger.error({
    err,
    requestId,
    path: req.path,
    method: req.method,
  });

  // Don't leak internal errors
  const statusCode = err instanceof HTTPError ? err.statusCode : 500;
  const message = statusCode === 500 ? 'Internal Server Error' : err.message;

  res.status(statusCode).json({
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message,
      requestId,
    },
  });
});
```

### Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Request latency p99 | > 500ms |
| Error rate (4xx) | > 5% |
| Error rate (5xx) | > 1% |
| Rate limit hits | > 100/min |
| Request size | > 10MB |

### CORS Configuration

```typescript
import cors from 'cors';

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  credentials: true,
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));
```

### Request/Response Logging

```typescript
import pino from 'pino-http';

app.use(pino({
  redact: ['req.headers.authorization', 'req.body.password'],
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      query: req.query,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
}));
```

### Checklist

- [ ] Input validation on all endpoints
- [ ] Rate limiting configured
- [ ] CORS properly restricted
- [ ] API versioning strategy
- [ ] Cursor-based pagination
- [ ] Consistent error format
- [ ] Request ID tracking
- [ ] Structured logging
- [ ] No sensitive data in URLs
- [ ] Body size limits configured
- [ ] Timeout handling
- [ ] Health check endpoint

## Reference Documentation
- [Pagination](quick-ref/pagination.md)
- [Versioning](quick-ref/versioning.md)
