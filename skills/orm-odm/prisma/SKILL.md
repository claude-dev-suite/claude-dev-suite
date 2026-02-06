---
name: prisma
description: |
  Prisma ORM for Node.js/TypeScript. Covers schema definition,
  migrations, and type-safe queries. Use when working with Prisma.

  USE WHEN: user mentions "prisma", "schema.prisma", "prisma migrate", "prisma generate",
  "prisma studio", "@prisma/client", asks about "how to define models in prisma",
  "prisma relations", "prisma transactions", "type-safe database queries"

  DO NOT USE FOR: raw SQL queries - use `database-query` MCP; Drizzle ORM - use `drizzle` skill;
  TypeORM - use `typeorm` skill; SQLAlchemy - use `sqlalchemy` skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Prisma Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `prisma` for comprehensive documentation.

## When NOT to Use This Skill

- **Raw SQL Operations**: Use the `database-query` MCP server for direct SQL queries and database inspection
- **Other ORMs**: Use appropriate skills (`drizzle`, `typeorm`, `sqlalchemy`) for other ORM frameworks
- **Database Design**: Consult `architect-expert` or `sql-expert` for database architecture decisions
- **Performance Profiling**: Use `performance-profiler` MCP for query performance analysis
- **Migration Rollbacks**: Engage `devops-expert` for production migration strategies

## Schema Definition

```prisma
// schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  posts     Post[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String?
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  Int
}
```

## CRUD Operations

```typescript
// Create
const user = await prisma.user.create({
  data: { email: 'user@example.com', name: 'John' }
});

// Read
const users = await prisma.user.findMany({
  where: { email: { contains: '@example.com' } },
  include: { posts: true },
  orderBy: { createdAt: 'desc' },
  take: 10
});

const user = await prisma.user.findUnique({
  where: { id: 1 }
});

// Update
await prisma.user.update({
  where: { id: 1 },
  data: { name: 'Jane' }
});

// Delete
await prisma.user.delete({ where: { id: 1 } });
```

## Relations

```typescript
// Create with relation
await prisma.user.create({
  data: {
    email: 'user@example.com',
    posts: {
      create: [
        { title: 'First Post' },
        { title: 'Second Post' }
      ]
    }
  }
});

// Query with relation
const userWithPosts = await prisma.user.findUnique({
  where: { id: 1 },
  include: { posts: { where: { published: true } } }
});
```

## Commands

```bash
npx prisma init
npx prisma migrate dev --name init
npx prisma generate
npx prisma studio
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|-------------|--------------|-----------------|
| `synchronize: true` in production | Can cause data loss, no migration history | Use `prisma migrate deploy` |
| No `select` or `include` on queries | Fetches all fields, performance waste | Select only needed fields |
| N+1 queries without `include` | Multiple round trips to database | Use `include` or `select` with nested relations |
| Missing indexes on foreign keys | Slow joins and lookups | Add `@@index([foreignKeyField])` |
| Hardcoded connection strings | Security risk, no environment flexibility | Use `env("DATABASE_URL")` |
| No transaction for multi-step operations | Data inconsistency risk | Wrap in `$transaction` |
| Using `findMany()` without pagination | Memory issues with large datasets | Add `take` and `skip` or cursor-based pagination |
| Ignoring Prisma error codes | Poor user experience, security risks | Handle `PrismaClientKnownRequestError` codes |
| No connection pool limits | Connection exhaustion | Configure `connection_limit` in URL |
| Running migrations manually in prod | Human error, no audit trail | Automate via CI/CD with `migrate deploy` |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| "Can't reach database server" | Wrong DATABASE_URL or DB not running | Verify connection string, check DB status |
| "Unique constraint failed" (P2002) | Duplicate value in unique field | Check for existing record, handle error gracefully |
| "Foreign key constraint failed" (P2003) | Referenced record doesn't exist | Verify related record exists before insertion |
| "Record not found" (P2025) | Query returned no results | Use `findUnique` with null check or handle error |
| Slow queries | Missing indexes, N+1 problem | Add indexes, use `include` for relations |
| "Type 'X' is not assignable" | Generated client out of sync | Run `npx prisma generate` |
| Migration conflicts | Multiple developers creating migrations | Coordinate migrations, use git properly |
| Connection pool exhausted | Too many concurrent connections | Increase `connection_limit` or use Prisma Accelerate |
| "Client is not connected" | PrismaClient not initialized | Ensure `new PrismaClient()` before use |
| Schema drift | Manual DB changes not in schema | Use `prisma db pull` to sync or create migration |

## Production Readiness

### Security Configuration

```prisma
// schema.prisma - Secure connection
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")  // Use env vars, never hardcode
}

// DATABASE_URL format with SSL
// postgresql://user:pass@host:5432/db?sslmode=require&sslcert=/path/to/client-cert.pem
```

```typescript
// Secure PrismaClient initialization
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production'
    ? ['error']
    : ['query', 'info', 'warn', 'error'],
  errorFormat: process.env.NODE_ENV === 'production' ? 'minimal' : 'pretty',
});
```

### Connection Pooling

```prisma
// schema.prisma - Connection pool settings
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // For serverless (e.g., Vercel, AWS Lambda)
  // Use Prisma Accelerate or PgBouncer
}
```

```typescript
// Connection management
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Connection pool via URL params
// ?connection_limit=5&pool_timeout=10

// For serverless: use Prisma Accelerate
// DATABASE_URL="prisma://accelerate.prisma-data.net/?api_key=xxx"
```

### Query Optimization

```typescript
// Select only needed fields
const users = await prisma.user.findMany({
  select: {
    id: true,
    email: true,
    // Don't select unnecessary fields
  },
});

// Use pagination
const users = await prisma.user.findMany({
  take: 20,
  skip: (page - 1) * 20,
  cursor: lastId ? { id: lastId } : undefined,
});

// Batch operations for bulk inserts
await prisma.user.createMany({
  data: users,
  skipDuplicates: true,
});

// Use transactions for related operations
await prisma.$transaction([
  prisma.order.create({ data: orderData }),
  prisma.inventory.update({ where: { productId }, data: { quantity: { decrement: 1 } } }),
]);

// Interactive transactions with timeout
await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({ data: userData });
  await tx.profile.create({ data: { userId: user.id, ...profileData } });
  return user;
}, {
  maxWait: 5000,  // Wait for connection
  timeout: 10000, // Transaction timeout
});
```

### Error Handling

```typescript
import { Prisma } from '@prisma/client';

async function createUser(data: UserInput) {
  try {
    return await prisma.user.create({ data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Unique constraint violation
      if (error.code === 'P2002') {
        throw new ConflictError(`User with this ${error.meta?.target} already exists`);
      }
      // Foreign key constraint violation
      if (error.code === 'P2003') {
        throw new BadRequestError('Related record not found');
      }
      // Record not found
      if (error.code === 'P2025') {
        throw new NotFoundError('Record not found');
      }
    }
    throw error;
  }
}
```

### Migrations in Production

```bash
# Generate migration (development)
npx prisma migrate dev --name add_user_status

# Apply migrations (production)
npx prisma migrate deploy

# Reset database (DANGER - only for development)
npx prisma migrate reset

# Check migration status
npx prisma migrate status
```

```yaml
# CI/CD migration workflow
jobs:
  migrate:
    steps:
      - name: Apply migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

### Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Query duration p99 | > 100ms |
| Connection pool wait time | > 5s |
| Failed queries | > 1% |
| Connection pool exhaustion | Any occurrence |
| Slow queries count | > 10/min |

### Logging & Tracing

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'stdout' },
  ],
});

// Log slow queries
prisma.$on('query', (e) => {
  if (e.duration > 100) {
    console.log(`Slow query (${e.duration}ms): ${e.query}`);
  }
});

// OpenTelemetry integration
import { PrismaInstrumentation } from '@prisma/instrumentation';

registerInstrumentations({
  instrumentations: [new PrismaInstrumentation()],
});
```

### Graceful Shutdown

```typescript
// Proper cleanup on shutdown
async function gracefulShutdown() {
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
```

### Checklist

- [ ] Database URL via environment variables
- [ ] SSL/TLS connection enabled
- [ ] Connection pooling configured
- [ ] Error handling for Prisma errors
- [ ] Migrations via CI/CD pipeline
- [ ] Select only needed fields
- [ ] Pagination on list queries
- [ ] Transactions for related operations
- [ ] Slow query logging
- [ ] Graceful shutdown handling
- [ ] OpenTelemetry tracing (optional)
- [ ] Prisma Accelerate for serverless (optional)

## Reference Documentation
- [Schema Reference](quick-ref/schema.md)
- [Query Patterns](quick-ref/queries.md)
- [Deep: Relations](deep-docs/relations/)
