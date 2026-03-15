# Drizzle Queries Quick Reference

> **Knowledge Base:** Read `knowledge/drizzle/queries.md` for complete documentation.

## Setup

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });
```

## Basic CRUD

```typescript
import { eq, and, or, gt, gte, lt, lte, ne, like, ilike, inArray } from 'drizzle-orm';
import { users, posts } from './schema';

// Create
const user = await db.insert(users).values({
  email: 'john@example.com',
  name: 'John'
}).returning();

// Create many
await db.insert(users).values([
  { email: 'jane@example.com', name: 'Jane' },
  { email: 'bob@example.com', name: 'Bob' }
]);

// Read
const allUsers = await db.select().from(users);
const user = await db.select().from(users).where(eq(users.id, 1));

// Update
await db.update(users)
  .set({ name: 'Updated' })
  .where(eq(users.id, 1));

// Delete
await db.delete(users).where(eq(users.id, 1));
```

## Filtering

```typescript
// Comparison operators
where(eq(users.role, 'admin'))
where(ne(users.status, 'banned'))
where(gt(users.age, 18))
where(gte(users.age, 18))
where(lt(users.age, 65))
where(lte(users.age, 65))

// String operators
where(like(users.email, '%@gmail.com'))
where(ilike(users.name, '%john%'))  // Case-insensitive

// Array operators
where(inArray(users.id, [1, 2, 3]))
where(notInArray(users.status, ['banned', 'suspended']))

// Null checks
where(isNull(users.deletedAt))
where(isNotNull(users.verifiedAt))

// Logical operators
where(and(
  eq(users.role, 'admin'),
  gt(users.age, 18)
))

where(or(
  eq(users.role, 'admin'),
  eq(users.role, 'moderator')
))

// Between
where(between(users.age, 18, 65))
```

## Select & Projections

```typescript
// Select specific columns
const result = await db
  .select({
    id: users.id,
    email: users.email
  })
  .from(users);

// Select with alias
const result = await db
  .select({
    userId: users.id,
    userName: users.name
  })
  .from(users);

// Distinct
const emails = await db
  .selectDistinct({ email: users.email })
  .from(users);
```

## Joins

```typescript
// Inner join
const result = await db
  .select({
    user: users,
    post: posts
  })
  .from(users)
  .innerJoin(posts, eq(users.id, posts.authorId));

// Left join
const result = await db
  .select()
  .from(users)
  .leftJoin(posts, eq(users.id, posts.authorId));

// Multiple joins
const result = await db
  .select()
  .from(posts)
  .innerJoin(users, eq(posts.authorId, users.id))
  .innerJoin(postsToTags, eq(posts.id, postsToTags.postId))
  .innerJoin(tags, eq(postsToTags.tagId, tags.id));
```

## Relations (Query API)

```typescript
// Find with relations
const usersWithPosts = await db.query.users.findMany({
  with: {
    posts: true
  }
});

// Nested relations
const usersWithPostsAndTags = await db.query.users.findMany({
  with: {
    posts: {
      with: {
        tags: true
      }
    }
  }
});

// Filter relations
const user = await db.query.users.findFirst({
  where: eq(users.id, 1),
  with: {
    posts: {
      where: eq(posts.published, true),
      orderBy: [desc(posts.createdAt)],
      limit: 5
    }
  }
});

// Select columns
const result = await db.query.users.findMany({
  columns: {
    id: true,
    name: true
  },
  with: {
    posts: {
      columns: { title: true }
    }
  }
});
```

## Aggregations

```typescript
import { count, sum, avg, min, max } from 'drizzle-orm';

// Count
const userCount = await db.select({ count: count() }).from(users);

// Aggregate functions
const stats = await db
  .select({
    total: sum(orders.amount),
    average: avg(orders.amount),
    minimum: min(orders.amount),
    maximum: max(orders.amount)
  })
  .from(orders);

// Group by
const grouped = await db
  .select({
    status: orders.status,
    count: count(),
    total: sum(orders.amount)
  })
  .from(orders)
  .groupBy(orders.status);
```

## Pagination & Sorting

```typescript
// Pagination
const page = await db
  .select()
  .from(users)
  .orderBy(desc(users.createdAt))
  .limit(10)
  .offset(20);

// Sorting
import { asc, desc } from 'drizzle-orm';

const sorted = await db
  .select()
  .from(users)
  .orderBy(asc(users.name), desc(users.createdAt));
```

## Transactions

```typescript
await db.transaction(async (tx) => {
  const user = await tx.insert(users).values({ email: 'a@b.com' }).returning();
  await tx.insert(posts).values({ authorId: user[0].id, title: 'Hello' });
});

// With rollback
await db.transaction(async (tx) => {
  await tx.insert(users).values({ email: 'a@b.com' });
  tx.rollback(); // Explicit rollback
});
```

**Official docs:** https://orm.drizzle.team/docs/select
