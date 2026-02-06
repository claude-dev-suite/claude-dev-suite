---
name: drizzle
description: |
  Drizzle ORM for TypeScript. Covers schema definition, queries,
  and migrations. Use for type-safe SQL with minimal overhead.

  USE WHEN: user mentions "drizzle", "drizzle-orm", "drizzle-kit", "pgTable", "mysqlTable",
  asks about "lightweight orm", "sql-like orm", "drizzle schema", "drizzle migrations",
  "drizzle studio", "type-safe sql builder"

  DO NOT USE FOR: Prisma projects - use `prisma` skill; TypeORM - use `typeorm` skill;
  raw SQL - use `database-query` MCP; SQLAlchemy - use `sqlalchemy` skill;
  NoSQL databases - use `mongodb` skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Drizzle Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `drizzle` for comprehensive documentation.

## When NOT to Use This Skill

- **Existing Prisma Projects**: Use `prisma` skill for Prisma-based codebases
- **TypeORM Projects**: Use `typeorm` skill for TypeORM-based applications
- **Raw SQL Execution**: Use `database-query` MCP server for direct SQL queries
- **NoSQL Databases**: Use `mongodb` skill for MongoDB operations
- **Complex ORM Features**: Drizzle is lightweight; consider Prisma/TypeORM for advanced features
- **Database Architecture**: Consult `sql-expert` or `architect-expert` for schema design

## Schema Definition

```typescript
// schema.ts
import { pgTable, serial, varchar, timestamp, boolean, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  name: varchar('name', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow(),
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  content: varchar('content'),
  published: boolean('published').default(false),
  authorId: integer('author_id').references(() => users.id),
});
```

## CRUD Operations

```typescript
import { eq, and, like, desc } from 'drizzle-orm';
import { db } from './db';
import { users, posts } from './schema';

// Create
const [user] = await db.insert(users)
  .values({ email: 'user@example.com', name: 'John' })
  .returning();

// Read
const allUsers = await db.select().from(users)
  .where(like(users.email, '%@example.com'))
  .orderBy(desc(users.createdAt))
  .limit(10);

const user = await db.select().from(users)
  .where(eq(users.id, 1))
  .limit(1);

// Update
await db.update(users)
  .set({ name: 'Jane' })
  .where(eq(users.id, 1));

// Delete
await db.delete(users).where(eq(users.id, 1));
```

## Joins

```typescript
const usersWithPosts = await db
  .select({
    userId: users.id,
    userName: users.name,
    postTitle: posts.title,
  })
  .from(users)
  .leftJoin(posts, eq(users.id, posts.authorId))
  .where(eq(posts.published, true));
```

## Migrations

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
npx drizzle-kit studio
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|-------------|--------------|-----------------|
| Not using connection pooling | Connection exhaustion, poor performance | Use `pg.Pool` or equivalent with proper limits |
| Selecting all columns with `select()` | Unnecessary data transfer | Specify only needed columns in select object |
| Manual SQL string concatenation | SQL injection risk, type unsafety | Use Drizzle query builder with parameterization |
| No transaction for related operations | Data inconsistency | Use `db.transaction()` for atomic operations |
| Missing indexes on filter columns | Slow queries | Add `.index()` to frequently queried columns |
| Not reusing prepared statements | Slower execution, resource waste | Use `.prepare()` for repeated queries |
| Hardcoded connection strings | Security risk | Use environment variables |
| No error handling on queries | Poor UX, silent failures | Wrap queries in try-catch |
| Using `drizzle-kit push` in production | No migration history, risky | Use `generate` + `migrate` workflow |
| Not defining foreign key constraints | Data integrity issues | Use `.references()` in schema |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| "relation does not exist" | Schema not migrated or wrong DB | Run `drizzle-kit migrate`, check connection |
| "column does not exist" | Schema out of sync with code | Regenerate and apply migrations |
| Type errors on queries | Schema types not matching DB | Run `drizzle-kit generate` to sync types |
| Slow queries | Missing indexes, N+1 queries | Add indexes, use joins instead of separate queries |
| Connection timeouts | Pool exhausted or network issues | Check pool size, increase timeout limits |
| "Cannot find module 'drizzle-orm'" | Missing dependency | Run `npm install drizzle-orm` |
| Migration conflicts | Multiple devs generating migrations | Coordinate migration naming, merge carefully |
| "ECONNREFUSED" | Database not running or wrong URL | Verify DATABASE_URL, start database |
| Foreign key violations | Inserting with invalid references | Ensure referenced records exist first |
| Duplicate key errors | Unique constraint violation | Check for existing record before insert |

## Production Readiness

### Database Connection

```typescript
// db.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // SECURITY: Use proper CA certificate in production instead of disabling verification
  // ssl: { rejectUnauthorized: false } is INSECURE - vulnerable to MITM attacks
  ssl: process.env.NODE_ENV === 'production'
    ? { ca: process.env.DB_CA_CERT }
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected pool error:', err);
});

export const db = drizzle(pool, { schema });

// Health check
export async function healthCheck() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    return { status: 'healthy' };
  } finally {
    client.release();
  }
}

// Graceful shutdown
export async function closePool() {
  await pool.end();
}
```

### Transaction Handling

```typescript
import { db } from './db';

async function transferFunds(fromId: string, toId: string, amount: number) {
  return await db.transaction(async (tx) => {
    const [from] = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.id, fromId))
      .for('update');

    if (!from || from.balance < amount) {
      throw new Error('Insufficient funds');
    }

    await tx
      .update(accounts)
      .set({ balance: sql`${accounts.balance} - ${amount}` })
      .where(eq(accounts.id, fromId));

    await tx
      .update(accounts)
      .set({ balance: sql`${accounts.balance} + ${amount}` })
      .where(eq(accounts.id, toId));

    return { success: true };
  });
}
```

### Query Optimization

```typescript
// Pagination with cursor
async function getUsers(cursor?: string, limit = 20) {
  const query = db.select().from(users);

  if (cursor) {
    query.where(gt(users.id, cursor));
  }

  const results = await query
    .orderBy(asc(users.id))
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const data = hasMore ? results.slice(0, -1) : results;

  return {
    data,
    nextCursor: hasMore ? data[data.length - 1].id : null,
  };
}

// Batch inserts
async function bulkInsertUsers(usersData: NewUser[]) {
  const batchSize = 100;
  for (let i = 0; i < usersData.length; i += batchSize) {
    const batch = usersData.slice(i, i + batchSize);
    await db.insert(users).values(batch);
  }
}

// Select only needed columns
const userNames = await db
  .select({ id: users.id, name: users.name })
  .from(users)
  .where(eq(users.isActive, true));
```

### Migration Strategy

```typescript
// drizzle.config.ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
} satisfies Config;

// package.json scripts
// "db:generate": "drizzle-kit generate:pg",
// "db:migrate": "drizzle-kit migrate",
// "db:push": "drizzle-kit push:pg", // Dev only
// "db:studio": "drizzle-kit studio"
```

### Type-Safe Prepared Statements

```typescript
import { sql } from 'drizzle-orm';

const getUserById = db.query.users
  .findFirst({
    where: eq(users.id, sql.placeholder('id')),
    with: { posts: true },
  })
  .prepare('get_user_by_id');

// Usage (reuses execution plan)
const user = await getUserById.execute({ id: userId });
```

### Testing

```typescript
// tests/db.test.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

describe('Database', () => {
  let pool: Pool;
  let testDb: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    testDb = drizzle(pool);
    await migrate(testDb, { migrationsFolder: './migrations' });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await testDb.delete(users);
  });

  it('should create user', async () => {
    const [user] = await testDb
      .insert(users)
      .values({ email: 'test@example.com', name: 'Test' })
      .returning();

    expect(user.email).toBe('test@example.com');
  });
});
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Query time (p99) | < 100ms |
| Connection pool usage | < 80% |
| Migration success | 100% |
| Transaction rollbacks | < 0.1% |

### Checklist

- [ ] Connection pooling configured
- [ ] SSL in production
- [ ] Transactions for multi-step operations
- [ ] Cursor-based pagination
- [ ] Batch operations for bulk data
- [ ] Prepared statements for repeated queries
- [ ] Migration versioning
- [ ] Test database isolation
- [ ] Query logging in development
- [ ] Health check endpoint

## Reference Documentation
- [Schema](quick-ref/schema.md)
- [Queries](quick-ref/queries.md)
