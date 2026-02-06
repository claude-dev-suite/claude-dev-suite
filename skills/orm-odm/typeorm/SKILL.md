---
name: typeorm
description: |
  TypeORM for TypeScript/JavaScript. Covers entities, repositories,
  and relations. Use with SQL databases.

  USE WHEN: user mentions "typeorm", "@Entity", "Repository", "DataSource",
  "QueryBuilder", "typeorm migration", asks about "decorators for database",
  "active record pattern", "entity relationships", "typeorm relations"

  DO NOT USE FOR: Prisma projects - use `prisma` skill; Drizzle - use `drizzle` skill;
  SQLAlchemy (Python) - use `sqlalchemy` skill; raw SQL - use `database-query` MCP;
  NoSQL - use `mongodb` skill; Sequelize - not supported
allowed-tools: Read, Grep, Glob, Write, Edit
---
# TypeORM Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `typeorm` for comprehensive documentation.

## When NOT to Use This Skill

- **Prisma Projects**: Use `prisma` skill for Prisma-based applications
- **Drizzle Projects**: Use `drizzle` skill for Drizzle ORM
- **Python Applications**: Use `sqlalchemy` skill for Python ORMs
- **Raw SQL Operations**: Use `database-query` MCP server for direct SQL
- **NoSQL Databases**: Use `mongodb` skill for MongoDB (TypeORM MongoDB support is limited)
- **Database Design**: Consult `sql-expert` or `architect-expert` for schema architecture
- **Migration Strategy**: Engage `devops-expert` for production deployment planning

## Entity Definition

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Post, post => post.author)
  posts: Post[];
}

@Entity()
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  content: string;

  @ManyToOne(() => User, user => user.posts)
  author: User;
}
```

## Repository Operations

```typescript
import { AppDataSource } from './data-source';

const userRepository = AppDataSource.getRepository(User);

// Create
const user = userRepository.create({ name: 'John', email: 'john@example.com' });
await userRepository.save(user);

// Read
const users = await userRepository.find();
const user = await userRepository.findOneBy({ id: 1 });
const userWithPosts = await userRepository.findOne({
  where: { id: 1 },
  relations: { posts: true },
});

// Update
await userRepository.update(1, { name: 'Jane' });

// Delete
await userRepository.delete(1);
```

## Query Builder

```typescript
const users = await userRepository
  .createQueryBuilder('user')
  .leftJoinAndSelect('user.posts', 'post')
  .where('user.isActive = :active', { active: true })
  .andWhere('post.published = :published', { published: true })
  .orderBy('user.createdAt', 'DESC')
  .take(10)
  .getMany();
```

## Data Source Config

```typescript
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'user',
  password: 'password',
  database: 'mydb',
  entities: [User, Post],
  synchronize: false,
  migrations: ['src/migrations/*.ts'],
});
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|-------------|--------------|-----------------|
| `synchronize: true` in production | Can drop tables, loses data | Always use migrations in production |
| Using `find()` without relations | N+1 query problem | Use `relations` option or QueryBuilder with joins |
| Not using transactions for multi-step ops | Data inconsistency risk | Wrap related operations in `transaction()` |
| Hardcoded credentials in DataSource | Security vulnerability | Use environment variables |
| No connection pool configuration | Connection exhaustion | Set `extra.max` and pool timeouts |
| Using `@Column()` without type for large text | May truncate data | Specify `type: 'text'` for long content |
| Lazy loading relations everywhere | Performance issues, N+1 queries | Use eager loading strategically |
| Not handling unique constraint errors | Poor error messages to users | Catch and handle constraint violations |
| Manual SQL without parameters | SQL injection risk | Use QueryBuilder with parameters |
| No indexes on frequently queried columns | Slow queries | Add `@Index()` decorators |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| "Cannot find name 'AppDataSource'" | DataSource not initialized | Call `AppDataSource.initialize()` at startup |
| "relation does not exist" | Migration not run | Execute pending migrations |
| "column does not exist" | Entity/DB out of sync | Generate and run new migration |
| Type errors on entities | Decorator metadata issue | Enable `emitDecoratorMetadata` and `experimentalDecorators` in tsconfig |
| "Repository not found" | Entity not registered | Add entity to DataSource `entities` array |
| Slow queries | Missing indexes, no joins | Add indexes, use `leftJoinAndSelect` |
| Connection pool exhausted | Too many concurrent queries | Increase `extra.max` pool size |
| "Cannot query across many-to-many" | Missing join table | Add explicit join table or use QueryBuilder |
| Migration generation creates no file | No entity changes detected | Manually create migration if needed |
| "ECONNREFUSED" | Database not running | Start database, verify connection details |

## Production Readiness

### Data Source Configuration

```typescript
// data-source.ts
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  // SECURITY: Use proper CA certificate in production instead of disabling verification
  // ssl: { rejectUnauthorized: false } is INSECURE - vulnerable to MITM attacks
  ssl: process.env.NODE_ENV === 'production'
    ? { ca: process.env.DB_CA_CERT }
    : false,

  // Connection pool
  extra: {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  },

  entities: ['dist/entities/**/*.js'],
  migrations: ['dist/migrations/**/*.js'],
  subscribers: ['dist/subscribers/**/*.js'],

  // Never use in production
  synchronize: false,

  // Logging
  logging: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  logger: 'advanced-console',

  // Cache
  cache: {
    type: 'ioredis',
    options: {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
    duration: 30000, // 30 seconds
  },
});

// Initialize
AppDataSource.initialize()
  .then(() => console.log('Database connected'))
  .catch((err) => console.error('Database connection error:', err));
```

### Transaction Management

```typescript
import { EntityManager } from 'typeorm';

async function transferFunds(
  manager: EntityManager,
  fromId: number,
  toId: number,
  amount: number
) {
  return await manager.transaction(async (transactionalManager) => {
    const from = await transactionalManager
      .createQueryBuilder(Account, 'account')
      .setLock('pessimistic_write')
      .where('account.id = :id', { id: fromId })
      .getOne();

    if (!from || from.balance < amount) {
      throw new Error('Insufficient funds');
    }

    await transactionalManager
      .createQueryBuilder()
      .update(Account)
      .set({ balance: () => `balance - ${amount}` })
      .where('id = :id', { id: fromId })
      .execute();

    await transactionalManager
      .createQueryBuilder()
      .update(Account)
      .set({ balance: () => `balance + ${amount}` })
      .where('id = :id', { id: toId })
      .execute();
  });
}
```

### Query Optimization

```typescript
// Pagination
async function getUsers(page: number, limit: number) {
  const [users, total] = await userRepository.findAndCount({
    skip: (page - 1) * limit,
    take: limit,
    order: { createdAt: 'DESC' },
  });

  return {
    data: users,
    meta: {
      total,
      page,
      lastPage: Math.ceil(total / limit),
    },
  };
}

// Select specific columns
const users = await userRepository
  .createQueryBuilder('user')
  .select(['user.id', 'user.name', 'user.email'])
  .where('user.isActive = :active', { active: true })
  .getMany();

// Batch operations
await userRepository
  .createQueryBuilder()
  .insert()
  .into(User)
  .values(usersToCreate)
  .orIgnore() // Skip duplicates
  .execute();
```

### Soft Deletes

```typescript
@Entity()
@DeleteDateColumn()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @DeleteDateColumn()
  deletedAt?: Date;
}

// Soft delete
await userRepository.softDelete(1);

// Include soft deleted
const allUsers = await userRepository
  .createQueryBuilder('user')
  .withDeleted()
  .getMany();

// Restore
await userRepository.restore(1);
```

### Migration Best Practices

```typescript
// migrations/1234567890-CreateUsersTable.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersTable1234567890 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" SERIAL PRIMARY KEY,
        "email" VARCHAR(255) UNIQUE NOT NULL,
        "name" VARCHAR(100) NOT NULL,
        "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_users_email" ON "users" ("email")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "users"`);
  }
}

// CLI commands
// npm run typeorm migration:generate -- -n CreateUsersTable
// npm run typeorm migration:run
// npm run typeorm migration:revert
```

### Testing

```typescript
// test-utils.ts
import { DataSource } from 'typeorm';

export const TestDataSource = new DataSource({
  type: 'postgres',
  url: process.env.TEST_DATABASE_URL,
  entities: ['src/entities/**/*.ts'],
  synchronize: true,
  dropSchema: true,
});

// tests/user.test.ts
describe('UserRepository', () => {
  beforeAll(async () => {
    await TestDataSource.initialize();
  });

  afterAll(async () => {
    await TestDataSource.destroy();
  });

  beforeEach(async () => {
    await TestDataSource.synchronize(true);
  });

  it('should create user', async () => {
    const repo = TestDataSource.getRepository(User);
    const user = await repo.save({ name: 'Test', email: 'test@example.com' });
    expect(user.id).toBeDefined();
  });
});
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Query time (p99) | < 100ms |
| Connection pool usage | < 80% |
| Slow query count | 0 |
| Migration success | 100% |

### Checklist

- [ ] Connection pooling configured
- [ ] SSL in production
- [ ] synchronize: false in production
- [ ] Query caching with Redis
- [ ] Transaction management
- [ ] Soft deletes where appropriate
- [ ] Pagination for list queries
- [ ] Migration versioning
- [ ] Logging only errors in production
- [ ] Test database isolation

## Reference Documentation
- [Relations](quick-ref/relations.md)
- [Migrations](quick-ref/migrations.md)
