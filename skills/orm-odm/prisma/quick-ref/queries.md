# Prisma Queries Quick Reference

> **Knowledge Base:** Read `knowledge/prisma/queries.md` for complete documentation.

## Basic CRUD

```typescript
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Create
const user = await prisma.user.create({
  data: { email: 'john@example.com', name: 'John' }
});

// Create many
const users = await prisma.user.createMany({
  data: [
    { email: 'jane@example.com', name: 'Jane' },
    { email: 'bob@example.com', name: 'Bob' }
  ],
  skipDuplicates: true
});

// Read
const user = await prisma.user.findUnique({ where: { id: 1 } });
const user = await prisma.user.findFirst({ where: { email: { contains: '@' } } });
const users = await prisma.user.findMany();

// Update
const user = await prisma.user.update({
  where: { id: 1 },
  data: { name: 'Updated' }
});

// Upsert
const user = await prisma.user.upsert({
  where: { email: 'john@example.com' },
  update: { name: 'John Updated' },
  create: { email: 'john@example.com', name: 'John' }
});

// Delete
await prisma.user.delete({ where: { id: 1 } });
await prisma.user.deleteMany({ where: { status: 'inactive' } });
```

## Filtering

```typescript
// Comparison
where: { age: { equals: 25 } }
where: { age: { not: 25 } }
where: { age: { gt: 18 } }
where: { age: { gte: 18 } }
where: { age: { lt: 65 } }
where: { age: { lte: 65 } }
where: { age: { in: [18, 21, 25] } }
where: { age: { notIn: [18, 21] } }

// String
where: { email: { contains: 'gmail' } }
where: { email: { startsWith: 'admin' } }
where: { email: { endsWith: '.com' } }
where: { name: { contains: 'john', mode: 'insensitive' } }

// Logical
where: { AND: [{ age: { gte: 18 } }, { status: 'active' }] }
where: { OR: [{ role: 'ADMIN' }, { role: 'MOD' }] }
where: { NOT: { status: 'banned' } }

// Null checks
where: { deletedAt: null }
where: { deletedAt: { not: null } }
```

## Relations

```typescript
// Include relations
const user = await prisma.user.findUnique({
  where: { id: 1 },
  include: {
    posts: true,
    profile: true
  }
});

// Nested include
const user = await prisma.user.findUnique({
  where: { id: 1 },
  include: {
    posts: {
      include: { tags: true }
    }
  }
});

// Select specific fields
const user = await prisma.user.findUnique({
  where: { id: 1 },
  select: {
    name: true,
    email: true,
    posts: { select: { title: true } }
  }
});

// Filter relations
const user = await prisma.user.findUnique({
  where: { id: 1 },
  include: {
    posts: {
      where: { published: true },
      orderBy: { createdAt: 'desc' },
      take: 5
    }
  }
});
```

## Nested Writes

```typescript
// Create with relation
const user = await prisma.user.create({
  data: {
    email: 'john@example.com',
    posts: {
      create: [
        { title: 'First post' },
        { title: 'Second post' }
      ]
    }
  }
});

// Connect existing
const post = await prisma.post.create({
  data: {
    title: 'New post',
    author: { connect: { id: userId } },
    tags: { connect: [{ id: 1 }, { id: 2 }] }
  }
});

// Update relations
await prisma.user.update({
  where: { id: 1 },
  data: {
    posts: {
      updateMany: {
        where: { published: false },
        data: { published: true }
      }
    }
  }
});
```

## Aggregations

```typescript
// Count
const count = await prisma.user.count({ where: { status: 'active' } });

// Aggregate
const stats = await prisma.order.aggregate({
  _sum: { amount: true },
  _avg: { amount: true },
  _min: { amount: true },
  _max: { amount: true }
});

// Group by
const grouped = await prisma.order.groupBy({
  by: ['status'],
  _count: { _all: true },
  _sum: { amount: true }
});
```

## Pagination

```typescript
// Offset pagination
const users = await prisma.user.findMany({
  skip: 20,
  take: 10,
  orderBy: { createdAt: 'desc' }
});

// Cursor pagination
const users = await prisma.user.findMany({
  take: 10,
  cursor: { id: lastId },
  skip: 1, // Skip the cursor
  orderBy: { id: 'asc' }
});
```

## Transactions

```typescript
// Interactive transaction
const result = await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({ data: { email: 'a@b.com' } });
  const post = await tx.post.create({ data: { authorId: user.id, title: 'Hi' } });
  return { user, post };
});

// Sequential operations
await prisma.$transaction([
  prisma.post.deleteMany({ where: { authorId: 1 } }),
  prisma.user.delete({ where: { id: 1 } })
]);
```

**Official docs:** https://www.prisma.io/docs/reference/api-reference/prisma-client-reference
