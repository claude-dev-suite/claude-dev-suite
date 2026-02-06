# TypeORM Entities Quick Reference

> **Knowledge Base:** Read `knowledge/typeorm/entities.md` for complete documentation.

## Basic Entity

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  name: string;

  @Column({ type: 'enum', enum: ['user', 'admin'], default: 'user' })
  role: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

## Column Types

```typescript
// Basic types
@Column() // inferred from TypeScript
@Column('varchar')
@Column({ type: 'varchar', length: 255 })
@Column({ type: 'text' })
@Column({ type: 'int' })
@Column({ type: 'bigint' })
@Column({ type: 'float' })
@Column({ type: 'decimal', precision: 10, scale: 2 })
@Column({ type: 'boolean', default: false })

// Date types
@Column({ type: 'timestamp' })
@Column({ type: 'date' })
@Column({ type: 'time' })

// JSON
@Column({ type: 'json' })
@Column({ type: 'jsonb' }) // PostgreSQL

// Special columns
@PrimaryGeneratedColumn()          // Auto-increment
@PrimaryGeneratedColumn('uuid')    // UUID
@PrimaryColumn()                   // Manual PK
@CreateDateColumn()                // Auto set on insert
@UpdateDateColumn()                // Auto set on update
@DeleteDateColumn()                // Soft delete timestamp
@VersionColumn()                   // Optimistic locking
```

## Relations

```typescript
// One-to-One
@Entity()
export class User {
  @OneToOne(() => Profile, profile => profile.user)
  @JoinColumn()
  profile: Profile;
}

@Entity()
export class Profile {
  @OneToOne(() => User, user => user.profile)
  user: User;
}

// One-to-Many / Many-to-One
@Entity()
export class User {
  @OneToMany(() => Post, post => post.author)
  posts: Post[];
}

@Entity()
export class Post {
  @ManyToOne(() => User, user => user.posts)
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column()
  authorId: number;
}

// Many-to-Many
@Entity()
export class Post {
  @ManyToMany(() => Tag, tag => tag.posts)
  @JoinTable({
    name: 'posts_tags',
    joinColumn: { name: 'post_id' },
    inverseJoinColumn: { name: 'tag_id' }
  })
  tags: Tag[];
}

@Entity()
export class Tag {
  @ManyToMany(() => Post, post => post.tags)
  posts: Post[];
}
```

## Inheritance

```typescript
// Single Table Inheritance
@Entity()
@TableInheritance({ column: { type: 'varchar', name: 'type' } })
export class Content {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;
}

@ChildEntity()
export class Article extends Content {
  @Column()
  body: string;
}

@ChildEntity()
export class Video extends Content {
  @Column()
  url: string;
}
```

## Indexes & Constraints

```typescript
@Entity()
@Index(['firstName', 'lastName']) // Composite index
@Unique(['email'])
export class User {
  @Index()
  @Column()
  email: string;

  @Index('idx_user_name')
  @Column()
  firstName: string;

  @Column()
  lastName: string;
}
```

## Embedded Entities

```typescript
// Embeddable class
export class Address {
  @Column()
  street: string;

  @Column()
  city: string;

  @Column()
  zipCode: string;
}

@Entity()
export class User {
  @Column(() => Address)
  address: Address;
}
// Creates: address_street, address_city, address_zipCode columns
```

## Entity Options

```typescript
@Entity({
  name: 'users',                    // Table name
  schema: 'public',                 // Schema
  orderBy: { createdAt: 'DESC' },   // Default order
  engine: 'InnoDB'                  // MySQL engine
})
export class User {
  // ...
}
```

## Listeners & Subscribers

```typescript
@Entity()
export class User {
  @BeforeInsert()
  hashPassword() {
    this.password = hash(this.password);
  }

  @AfterLoad()
  async loadRelations() {
    // Custom logic after loading
  }

  @BeforeUpdate()
  updateTimestamp() {
    this.updatedAt = new Date();
  }
}

// Hooks: @BeforeInsert, @AfterInsert, @BeforeUpdate, @AfterUpdate,
//        @BeforeRemove, @AfterRemove, @AfterLoad
```

**Official docs:** https://typeorm.io/entities
