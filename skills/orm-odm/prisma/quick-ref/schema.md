# Prisma Schema Quick Reference

> **Knowledge Base:** Read `knowledge/prisma/schema.md` for complete documentation.

## Data Source & Generator

```prisma
// schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql" // mysql, sqlite, mongodb, cockroachdb
  url      = env("DATABASE_URL")
}
```

## Models

```prisma
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  role      Role     @default(USER)
  posts     Post[]
  profile   Profile?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([email])
  @@map("users") // Table name
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String?
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  Int
  tags      Tag[]

  @@index([authorId, published])
}

model Profile {
  id     Int    @id @default(autoincrement())
  bio    String
  user   User   @relation(fields: [userId], references: [id])
  userId Int    @unique
}
```

## Relations

```prisma
// One-to-One
model User {
  profile Profile?
}
model Profile {
  user   User @relation(fields: [userId], references: [id])
  userId Int  @unique
}

// One-to-Many
model User {
  posts Post[]
}
model Post {
  author   User @relation(fields: [authorId], references: [id])
  authorId Int
}

// Many-to-Many (implicit)
model Post {
  tags Tag[]
}
model Tag {
  posts Post[]
}

// Many-to-Many (explicit)
model Post {
  categories CategoriesOnPosts[]
}
model Category {
  posts CategoriesOnPosts[]
}
model CategoriesOnPosts {
  post       Post     @relation(fields: [postId], references: [id])
  postId     Int
  category   Category @relation(fields: [categoryId], references: [id])
  categoryId Int
  assignedAt DateTime @default(now())

  @@id([postId, categoryId])
}
```

## Field Types & Attributes

```prisma
// Scalar types
String    // VARCHAR
Int       // INTEGER
BigInt    // BIGINT
Float     // DOUBLE
Decimal   // DECIMAL
Boolean   // BOOLEAN
DateTime  // TIMESTAMP
Json      // JSON
Bytes     // BYTEA

// Attributes
@id                          // Primary key
@unique                      // Unique constraint
@default(value)              // Default value
@relation(fields, references) // Foreign key
@updatedAt                   // Auto-update timestamp

// Default values
@default(autoincrement())    // Auto ID
@default(uuid())             // UUID
@default(cuid())             // CUID
@default(now())              // Current timestamp
@default(dbgenerated())      // DB-generated

// Model attributes
@@id([field1, field2])       // Composite PK
@@unique([field1, field2])   // Composite unique
@@index([field1, field2])    // Composite index
@@map("table_name")          // Table name
```

## Enums

```prisma
enum Role {
  USER
  ADMIN
  MODERATOR
}

model User {
  role Role @default(USER)
}
```

## CLI Commands

```bash
# Initialize
npx prisma init

# Migrations
npx prisma migrate dev --name init
npx prisma migrate deploy
npx prisma migrate reset

# Generate client
npx prisma generate

# Database tools
npx prisma db push    # Sync without migration
npx prisma db pull    # Introspect existing DB
npx prisma db seed

# Studio
npx prisma studio
```

**Official docs:** https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference
