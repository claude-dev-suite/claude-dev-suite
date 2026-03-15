# Drizzle Schema Quick Reference

> **Knowledge Base:** Read `knowledge/drizzle/schema.md` for complete documentation.

## PostgreSQL Schema

```typescript
// schema.ts
import { pgTable, serial, text, varchar, integer, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core';

// Enum
export const roleEnum = pgEnum('role', ['user', 'admin', 'moderator']);

// Users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  name: text('name'),
  role: roleEnum('role').default('user'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Posts table
export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content'),
  published: boolean('published').default(false),
  authorId: integer('author_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow()
});

// Tags (many-to-many)
export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).unique().notNull()
});

export const postsToTags = pgTable('posts_to_tags', {
  postId: integer('post_id').references(() => posts.id).notNull(),
  tagId: integer('tag_id').references(() => tags.id).notNull()
}, (t) => ({
  pk: primaryKey({ columns: [t.postId, t.tagId] })
}));
```

## MySQL Schema

```typescript
import { mysqlTable, serial, varchar, text, int, boolean, timestamp, mysqlEnum } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  name: varchar('name', { length: 100 }),
  status: mysqlEnum('status', ['active', 'inactive']).default('active'),
  createdAt: timestamp('created_at').defaultNow()
});
```

## SQLite Schema

```typescript
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').unique().notNull(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' })
});
```

## Relations

```typescript
import { relations } from 'drizzle-orm';

// One-to-Many
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts)
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id]
  }),
  tags: many(postsToTags)
}));

// Many-to-Many
export const postsToTagsRelations = relations(postsToTags, ({ one }) => ({
  post: one(posts, {
    fields: [postsToTags.postId],
    references: [posts.id]
  }),
  tag: one(tags, {
    fields: [postsToTags.tagId],
    references: [tags.id]
  })
}));
```

## Column Types

```typescript
// Numbers
serial('id')                     // Auto-increment
integer('count')
bigint('big_num', { mode: 'number' })
real('float')
doublePrecision('double')
numeric('decimal', { precision: 10, scale: 2 })

// Strings
text('content')
varchar('name', { length: 255 })
char('code', { length: 2 })

// Boolean & Date
boolean('active')
timestamp('created_at')
date('birth_date')
time('start_time')

// JSON
json('metadata')
jsonb('data')

// Arrays (PostgreSQL)
integer('scores').array()
text('tags').array()
```

## Indexes & Constraints

```typescript
import { index, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: varchar('title').notNull(),
  slug: varchar('slug').notNull(),
  authorId: integer('author_id').notNull()
}, (table) => ({
  // Indexes
  authorIdx: index('author_idx').on(table.authorId),
  slugIdx: uniqueIndex('slug_idx').on(table.slug),
  // Composite index
  titleAuthorIdx: index('title_author_idx').on(table.title, table.authorId)
}));

// Composite primary key
export const postsTags = pgTable('posts_tags', {
  postId: integer('post_id').notNull(),
  tagId: integer('tag_id').notNull()
}, (table) => ({
  pk: primaryKey({ columns: [table.postId, table.tagId] })
}));
```

## Migrations

```bash
# Generate migration
npx drizzle-kit generate

# Push to database (dev)
npx drizzle-kit push

# Run migrations
npx drizzle-kit migrate

# Open Drizzle Studio
npx drizzle-kit studio
```

**Official docs:** https://orm.drizzle.team/docs/sql-schema-declaration
