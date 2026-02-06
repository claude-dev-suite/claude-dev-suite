---
name: migrations
description: |
  Database migration strategies and best practices. Covers schema versioning,
  zero-downtime migrations, rollback patterns, and data migration techniques.
  Use for database evolution and deployment planning.

  USE WHEN: user mentions "database migrations", "schema changes", "versioning",
  "rollback", "zero-downtime", "expand-contract", "schema evolution"

  DO NOT USE FOR: Flyway specifics - use `flyway` instead,
  Prisma migrations - use `prisma` instead, TypeORM migrations - use `typeorm` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Database Migrations Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `migrations` for comprehensive documentation.

## Migration Fundamentals

### What is a Migration?
A migration is a version-controlled change to your database schema or data.

### Migration Types
| Type | Description | Example |
|------|-------------|---------|
| Schema | DDL changes | Add column, create index |
| Data | DML changes | Backfill data, transform values |
| Combined | Both schema and data | Add column with default, populate |

## Version Naming Conventions

### Timestamp-based (Recommended)
```
V20240115103000__create_users_table.sql
V20240115104500__add_email_index.sql
V20240116090000__add_status_column.sql
```

### Sequential
```
V001__create_users_table.sql
V002__add_email_index.sql
V003__add_status_column.sql
```

### Semantic
```
V1.0.0__initial_schema.sql
V1.1.0__add_orders_table.sql
V1.1.1__fix_orders_constraint.sql
```

## Migration File Structure

### Flyway Format
```sql
-- V20240115103000__create_users_table.sql

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
```

### With Rollback (Flyway Pro/Enterprise)
```sql
-- V20240115103000__create_users_table.sql
CREATE TABLE users (...);

-- U20240115103000__create_users_table.sql (undo)
DROP TABLE IF EXISTS users;
```

### Liquibase Format
```xml
<!-- changelog.xml -->
<databaseChangeLog>
    <changeSet id="1" author="dev">
        <createTable tableName="users">
            <column name="id" type="int" autoIncrement="true">
                <constraints primaryKey="true"/>
            </column>
            <column name="email" type="varchar(255)">
                <constraints nullable="false" unique="true"/>
            </column>
        </createTable>
        <rollback>
            <dropTable tableName="users"/>
        </rollback>
    </changeSet>
</databaseChangeLog>
```

## Migration Strategies

### Expand-Contract Pattern

For backward-compatible changes:

```
Phase 1: EXPAND
├── Add new column (nullable or with default)
├── Add new table
├── Deploy new code that writes to both old and new
└── Backfill existing data

Phase 2: CONTRACT
├── Remove old column usage from code
├── Make new column non-nullable if needed
├── Drop old column
└── Deploy final code
```

Example - Renaming a column:
```sql
-- Phase 1: Expand
ALTER TABLE users ADD COLUMN full_name VARCHAR(200);
UPDATE users SET full_name = name;
-- Deploy code that reads from both, writes to both

-- Phase 2: Contract (after verification)
ALTER TABLE users DROP COLUMN name;
```

### Blue-Green Deployment

```
┌─────────────┐     ┌─────────────┐
│   Blue      │     │   Green     │
│  (Current)  │     │   (New)     │
└──────┬──────┘     └──────┬──────┘
       │                   │
       └───────┬───────────┘
               │
        ┌──────┴──────┐
        │  Database   │
        │  (Shared)   │
        └─────────────┘

1. Green environment runs migrations
2. Test Green with new schema
3. Switch traffic Blue → Green
4. Blue becomes standby
```

### Rolling Updates

```
1. Apply backward-compatible migration
2. Update servers one by one
3. Old code continues working
4. After all servers updated, remove old code paths
5. Apply cleanup migration
```

## Zero-Downtime Patterns

### Add Column (Safe)

```sql
-- Safe: Column added as nullable
ALTER TABLE users ADD COLUMN phone VARCHAR(20);

-- Safe: Column added with default
ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active';

-- PostgreSQL 11+: Fast default
ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
```

### Add Non-Nullable Column

```sql
-- Step 1: Add nullable
ALTER TABLE users ADD COLUMN email_verified BOOLEAN;

-- Step 2: Backfill
UPDATE users SET email_verified = FALSE WHERE email_verified IS NULL;

-- Step 3: Add constraint
ALTER TABLE users ALTER COLUMN email_verified SET NOT NULL;
```

### Rename Column

```sql
-- Step 1: Add new column
ALTER TABLE users ADD COLUMN full_name VARCHAR(200);

-- Step 2: Copy data
UPDATE users SET full_name = name;

-- Step 3: Add trigger for sync (during transition)
CREATE TRIGGER sync_name BEFORE INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION sync_name_columns();

-- Step 4: Update application to use new column

-- Step 5: Remove old column
ALTER TABLE users DROP COLUMN name;
DROP TRIGGER sync_name ON users;
```

### Add Index (Non-Blocking)

```sql
-- PostgreSQL: CONCURRENTLY
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);

-- MySQL: ALGORITHM=INPLACE, LOCK=NONE
ALTER TABLE users ADD INDEX idx_email (email), ALGORITHM=INPLACE, LOCK=NONE;

-- SQL Server: ONLINE
CREATE INDEX idx_users_email ON users(email) WITH (ONLINE = ON);
```

### Drop Column (Safe)

```sql
-- Step 1: Stop writing to column (application change)
-- Step 2: Deploy application
-- Step 3: Drop column
ALTER TABLE users DROP COLUMN deprecated_field;
```

### Rename Table

```sql
-- Step 1: Create view with old name pointing to new table
ALTER TABLE orders RENAME TO order_records;
CREATE VIEW orders AS SELECT * FROM order_records;

-- Step 2: Update application to use new name
-- Step 3: Drop view
DROP VIEW orders;
```

## Data Migration Patterns

### Batch Processing

```sql
-- Process in batches to avoid locking
DO $$
DECLARE
    batch_size INT := 1000;
    affected INT := 1;
BEGIN
    WHILE affected > 0 LOOP
        UPDATE users
        SET status = 'active'
        WHERE id IN (
            SELECT id FROM users
            WHERE status IS NULL
            LIMIT batch_size
            FOR UPDATE SKIP LOCKED
        );
        GET DIAGNOSTICS affected = ROW_COUNT;
        COMMIT;
        PERFORM pg_sleep(0.1);  -- Small delay
    END LOOP;
END $$;
```

### Background Job Migration

```python
# Instead of SQL, use application code
def migrate_user_status():
    batch_size = 1000
    offset = 0

    while True:
        users = User.query.filter(User.status == None) \
                         .limit(batch_size).all()
        if not users:
            break

        for user in users:
            user.status = calculate_status(user)

        db.session.commit()
        time.sleep(0.1)  # Rate limiting
```

### ETL Pattern

```sql
-- 1. Create new table with desired structure
CREATE TABLE users_new (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(200) NOT NULL,  -- Combined from first_name, last_name
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Copy and transform data
INSERT INTO users_new (id, email, full_name, created_at)
SELECT id, email, first_name || ' ' || last_name, created_at
FROM users;

-- 3. Swap tables
ALTER TABLE users RENAME TO users_old;
ALTER TABLE users_new RENAME TO users;

-- 4. Update sequences
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- 5. Drop old table (after verification)
DROP TABLE users_old;
```

## Rollback Strategies

### Immediate Rollback Script

```sql
-- migration.sql
ALTER TABLE users ADD COLUMN phone VARCHAR(20);

-- rollback.sql
ALTER TABLE users DROP COLUMN phone;
```

### Point-in-Time Recovery

```bash
# PostgreSQL
pg_restore --target-time="2024-01-15 10:00:00" -d mydb backup.dump

# MySQL
mysqlbinlog --stop-datetime="2024-01-15 10:00:00" binlog.000001 | mysql
```

### Forward-Fix (Preferred)

Instead of rollback, deploy a fix:
```sql
-- Original migration had bug
-- V2: Create new migration to fix
ALTER TABLE users ALTER COLUMN status SET DEFAULT 'pending';  -- Fix the default
```

## Migration Testing

### Pre-deployment Checklist

```markdown
- [ ] Migration tested on copy of production data
- [ ] Rollback script tested
- [ ] Application compatible with both old and new schema
- [ ] Index creation time estimated
- [ ] Lock duration estimated
- [ ] Disk space requirements checked
- [ ] Backup taken before migration
```

### Test Environment Setup

```bash
# Create production copy
pg_dump production_db | psql test_db

# Run migration
flyway -url=jdbc:postgresql://localhost/test_db migrate

# Run application tests
npm test

# Verify schema
pg_dump --schema-only test_db > schema.sql
diff schema.sql expected_schema.sql
```

## Best Practices

### DO
- Use version control for migrations
- Test migrations on production-like data
- Make migrations idempotent when possible
- Document complex migrations
- Keep migrations small and focused
- Use expand-contract for breaking changes
- Create indexes concurrently

### DON'T
- Mix schema and data changes
- Run migrations during peak hours
- Delete migration files
- Edit applied migrations
- Skip testing rollbacks
- Make assumptions about data

## Common Pitfalls

### Lock Contention
```sql
-- Problem: Long-running transaction holds lock
BEGIN;
ALTER TABLE users ADD COLUMN x INT;
-- ... long running queries ...
COMMIT;

-- Solution: Keep transaction short
ALTER TABLE users ADD COLUMN x INT;
```

### Missing Index
```sql
-- Problem: Query becomes slow after adding data
ALTER TABLE users ADD COLUMN status VARCHAR(20);

-- Solution: Add index in same migration
ALTER TABLE users ADD COLUMN status VARCHAR(20);
CREATE INDEX CONCURRENTLY idx_users_status ON users(status);
```

### Constraint Violations
```sql
-- Problem: Existing data violates new constraint
ALTER TABLE users ADD CONSTRAINT chk_email CHECK (email LIKE '%@%');
-- Fails if bad data exists

-- Solution: Clean data first
UPDATE users SET email = 'invalid@example.com' WHERE email NOT LIKE '%@%';
ALTER TABLE users ADD CONSTRAINT chk_email CHECK (email LIKE '%@%');
```

## When NOT to Use This Skill

- **Flyway specifics** - Use `flyway` skill for Flyway commands and patterns
- **Prisma migrations** - Use `prisma` skill for Prisma migrate
- **TypeORM migrations** - Use `typeorm` skill for TypeORM migrations
- **Liquibase** - Use specific Liquibase documentation

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Mixing schema and data changes | Hard to rollback | Separate into different migrations |
| No rollback script | Can't undo changes | Always create undo migration |
| Long-running migrations | Locks tables, downtime | Use online DDL, batch processing |
| Editing applied migrations | Version conflicts, checksum errors | Create new migration |
| Missing backup | Data loss risk | Always backup before migrating |
| No testing on prod-like data | Unexpected failures | Test with production data copy |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Migration fails mid-run | Check transaction support | Use smaller batches, manual fix |
| Lock timeout | Check running queries | Run during low traffic |
| Version conflicts | Check migration history table | Resolve conflicts, rebase |
| Checksum mismatch | Compare file with history | Repair or recreate migration |
| Out of disk space | Check table sizes | Clean old data first |

## Reference Documentation

- [Migration Strategies](quick-ref/strategies.md)
- [Schema Versioning](quick-ref/versioning.md)
- [Rollback Patterns](quick-ref/rollback.md)
- [Data Migration](quick-ref/data-migration.md)
