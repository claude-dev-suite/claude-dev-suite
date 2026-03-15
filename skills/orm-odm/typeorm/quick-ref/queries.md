# TypeORM Queries Quick Reference

> **Knowledge Base:** Read `knowledge/typeorm/queries.md` for complete documentation.

## Repository Pattern

```typescript
import { AppDataSource } from './data-source';
import { User } from './entities/User';

const userRepository = AppDataSource.getRepository(User);

// Find
const user = await userRepository.findOneBy({ id: 1 });
const users = await userRepository.find();
const count = await userRepository.count();

// Save (insert or update)
const user = userRepository.create({ email: 'a@b.com' });
await userRepository.save(user);

// Update
await userRepository.update({ id: 1 }, { name: 'Updated' });

// Delete
await userRepository.delete({ id: 1 });
await userRepository.softDelete({ id: 1 }); // Soft delete
```

## Find Options

```typescript
// Basic find
await userRepository.findOneBy({ id: 1 });
await userRepository.findBy({ role: 'admin' });

// Advanced find
await userRepository.find({
  where: { role: 'admin', isActive: true },
  select: ['id', 'email', 'name'],
  order: { createdAt: 'DESC' },
  skip: 0,
  take: 10,
  relations: ['posts', 'profile']
});

// Find or fail
await userRepository.findOneByOrFail({ id: 1 });

// Find with count
const [users, total] = await userRepository.findAndCount({
  where: { isActive: true },
  take: 10
});
```

## Where Conditions

```typescript
import { In, Not, LessThan, MoreThan, Like, Between, IsNull } from 'typeorm';

// Operators
where: { id: In([1, 2, 3]) }
where: { role: Not('admin') }
where: { age: LessThan(30) }
where: { age: MoreThan(18) }
where: { age: Between(18, 65) }
where: { email: Like('%@gmail.com') }
where: { deletedAt: IsNull() }

// OR conditions (array)
where: [
  { role: 'admin' },
  { role: 'moderator' }
]

// AND conditions (object)
where: {
  role: 'admin',
  isActive: true
}

// Nested conditions
where: {
  isActive: true,
  profile: { verified: true }
}
```

## Relations

```typescript
// Load relations
await userRepository.find({
  relations: {
    posts: true,
    profile: true
  }
});

// Nested relations
await userRepository.find({
  relations: {
    posts: {
      tags: true
    }
  }
});

// Select specific relation columns
await userRepository.find({
  relations: ['posts'],
  select: {
    id: true,
    name: true,
    posts: { id: true, title: true }
  }
});
```

## QueryBuilder

```typescript
// Select
const users = await userRepository
  .createQueryBuilder('user')
  .where('user.isActive = :active', { active: true })
  .andWhere('user.role IN (:...roles)', { roles: ['admin', 'mod'] })
  .orderBy('user.createdAt', 'DESC')
  .skip(0)
  .take(10)
  .getMany();

// Single result
const user = await userRepository
  .createQueryBuilder('user')
  .where('user.id = :id', { id: 1 })
  .getOne();

// Count
const count = await userRepository
  .createQueryBuilder('user')
  .where('user.isActive = :active', { active: true })
  .getCount();
```

## Joins

```typescript
// Inner join
await userRepository
  .createQueryBuilder('user')
  .innerJoinAndSelect('user.posts', 'post')
  .where('post.published = :published', { published: true })
  .getMany();

// Left join
await userRepository
  .createQueryBuilder('user')
  .leftJoinAndSelect('user.profile', 'profile')
  .getMany();

// Join without select
await userRepository
  .createQueryBuilder('user')
  .innerJoin('user.posts', 'post')
  .where('post.published = true')
  .getMany();

// Multiple joins
await postRepository
  .createQueryBuilder('post')
  .innerJoinAndSelect('post.author', 'author')
  .innerJoinAndSelect('post.tags', 'tag')
  .where('author.id = :authorId', { authorId: 1 })
  .getMany();
```

## Aggregations

```typescript
// Count, Sum, Avg
const { sum } = await orderRepository
  .createQueryBuilder('order')
  .select('SUM(order.amount)', 'sum')
  .getRawOne();

// Group by
const stats = await orderRepository
  .createQueryBuilder('order')
  .select('order.status', 'status')
  .addSelect('COUNT(*)', 'count')
  .addSelect('SUM(order.amount)', 'total')
  .groupBy('order.status')
  .getRawMany();
```

## Transactions

```typescript
// Using DataSource
await AppDataSource.transaction(async (manager) => {
  const user = manager.create(User, { email: 'a@b.com' });
  await manager.save(user);

  const post = manager.create(Post, { authorId: user.id, title: 'Hello' });
  await manager.save(post);
});

// Using QueryRunner (more control)
const queryRunner = AppDataSource.createQueryRunner();
await queryRunner.connect();
await queryRunner.startTransaction();

try {
  await queryRunner.manager.save(user);
  await queryRunner.manager.save(post);
  await queryRunner.commitTransaction();
} catch (err) {
  await queryRunner.rollbackTransaction();
} finally {
  await queryRunner.release();
}
```

## Raw Queries

```typescript
// Raw SQL
const users = await userRepository.query(
  'SELECT * FROM users WHERE role = $1',
  ['admin']
);

// With QueryBuilder
await userRepository
  .createQueryBuilder()
  .select()
  .where('LOWER(email) = LOWER(:email)', { email: 'Test@Example.com' })
  .getMany();
```

**Official docs:** https://typeorm.io/find-options
