# Rollback Patterns Quick Reference

## Rollback Strategies

| Strategy | Recovery Time | Data Loss | Complexity |
|----------|--------------|-----------|------------|
| Forward Fix | Minutes | None | Low |
| Undo Migration | Minutes | Possible | Medium |
| Point-in-Time | Hours | Some | High |
| Full Restore | Hours | More | High |

## Forward Fix (Preferred)

Instead of rolling back, deploy a new migration to fix the issue.

```sql
-- Original migration (V1) had a bug
ALTER TABLE users ADD COLUMN status VARCHAR(10) DEFAULT 'actve';  -- Typo!

-- Forward fix (V2)
UPDATE users SET status = 'active' WHERE status = 'actve';
```

**When to use:**
- Minor data issues
- Quick fix available
- No structural problems
- Production data already affected

## Undo Migrations

### Manual Undo Script

```sql
-- V20240115103000__add_phone_column.sql
ALTER TABLE users ADD COLUMN phone VARCHAR(20);

-- rollback/V20240115103000__add_phone_column.sql
ALTER TABLE users DROP COLUMN phone;
```

### Flyway Undo (Pro/Enterprise)

```sql
-- V20240115103000__add_phone_column.sql
ALTER TABLE users ADD COLUMN phone VARCHAR(20);

-- U20240115103000__add_phone_column.sql
ALTER TABLE users DROP COLUMN phone;
```

```bash
# Run undo
flyway undo -target=20240115102000

# Undo last migration
flyway undo
```

### Liquibase Rollback

```xml
<changeSet id="add-phone" author="dev">
    <addColumn tableName="users">
        <column name="phone" type="varchar(20)"/>
    </addColumn>
    <rollback>
        <dropColumn tableName="users" columnName="phone"/>
    </rollback>
</changeSet>
```

```bash
# Rollback last changeset
liquibase rollback-count 1

# Rollback to tag
liquibase rollback release-1.0

# Rollback to date
liquibase rollback-to-date 2024-01-15
```

## Point-in-Time Recovery

### PostgreSQL

```bash
# Enable WAL archiving (postgresql.conf)
archive_mode = on
archive_command = 'cp %p /archive/%f'
wal_level = replica

# Restore to point in time
pg_restore \
  --target-time="2024-01-15 10:30:00" \
  --target-action=promote \
  -d mydb backup.dump
```

### MySQL

```bash
# Enable binary logging
# my.cnf: log_bin = mysql-bin

# Restore
mysqlbinlog \
  --stop-datetime="2024-01-15 10:30:00" \
  mysql-bin.000001 | mysql -u root -p mydb
```

### SQL Server

```sql
-- Restore to point in time
RESTORE DATABASE mydb
FROM DISK = 'C:\backups\mydb.bak'
WITH NORECOVERY;

RESTORE LOG mydb
FROM DISK = 'C:\backups\mydb_log.trn'
WITH STOPAT = '2024-01-15T10:30:00',
RECOVERY;
```

## Rollback Decision Tree

```
                ┌─────────────────┐
                │  Migration      │
                │  Failed?        │
                └────────┬────────┘
                         │
            ┌────────────┴────────────┐
            │                         │
            ▼                         ▼
      ┌─────┴─────┐             ┌─────┴─────┐
      │    Yes    │             │    No     │
      └─────┬─────┘             │ (Issues   │
            │                   │  Found)   │
            ▼                   └─────┬─────┘
    ┌───────────────┐                 │
    │ Auto-rollback │                 ▼
    │ (if in txn)   │         ┌───────────────┐
    └───────────────┘         │ Data          │
                              │ Corrupted?    │
                              └───────┬───────┘
                                      │
                         ┌────────────┴────────────┐
                         │                         │
                         ▼                         ▼
                   ┌─────┴─────┐             ┌─────┴─────┐
                   │    Yes    │             │    No     │
                   └─────┬─────┘             └─────┬─────┘
                         │                         │
                         ▼                         ▼
              ┌──────────────────┐      ┌──────────────────┐
              │ Point-in-Time    │      │ Forward Fix      │
              │ Recovery         │      │ or Undo Migration│
              └──────────────────┘      └──────────────────┘
```

## Safe Rollback Patterns

### DDL with Rollback Point

```sql
-- PostgreSQL: DDL in transaction
BEGIN;

-- Set rollback point
SAVEPOINT before_migration;

-- Run migration
ALTER TABLE users ADD COLUMN phone VARCHAR(20);
CREATE INDEX idx_users_phone ON users(phone);

-- If something goes wrong
-- ROLLBACK TO SAVEPOINT before_migration;

COMMIT;
```

### Pre-Migration Backup

```bash
#!/bin/bash
# pre_migrate.sh

# 1. Create backup point
pg_dump -Fc mydb > "backup_$(date +%Y%m%d_%H%M%S).dump"

# 2. Store schema version
psql -c "SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1" > version.txt

# 3. Run migration
flyway migrate

# 4. Verify
if ! psql -c "SELECT 1" mydb; then
    echo "Migration failed, restore from backup"
    pg_restore -d mydb "backup_*.dump"
fi
```

### Shadow Table Rollback

```sql
-- Before migration: Create backup
CREATE TABLE users_backup AS SELECT * FROM users;

-- Run migration
ALTER TABLE users ADD COLUMN phone VARCHAR(20);
UPDATE users SET phone = 'unknown';

-- If rollback needed:
DROP TABLE users;
ALTER TABLE users_backup RENAME TO users;
```

## Common Rollback Scenarios

### Added Column - Remove It

```sql
-- Rollback
ALTER TABLE users DROP COLUMN IF EXISTS phone;
```

### Created Index - Drop It

```sql
-- Rollback
DROP INDEX IF EXISTS idx_users_phone;
```

### Changed Column Type - Restore

```sql
-- Original: VARCHAR(100)
-- Migration changed to: VARCHAR(50)

-- Rollback (may lose data if > 50 chars existed)
ALTER TABLE users ALTER COLUMN name TYPE VARCHAR(100);
```

### Dropped Column - Cannot Easily Restore

```sql
-- If you have backup:
-- 1. Add column back
ALTER TABLE users ADD COLUMN phone VARCHAR(20);

-- 2. Restore data from backup
UPDATE users u
SET phone = b.phone
FROM users_backup b
WHERE u.id = b.id;
```

### Created Table - Drop It

```sql
-- Rollback
DROP TABLE IF EXISTS new_table CASCADE;
```

### Dropped Table - Restore from Backup

```sql
-- Restore entire table from backup
pg_restore -t dropped_table backup.dump | psql mydb
```

## Testing Rollbacks

```bash
#!/bin/bash
# test_rollback.sh

# 1. Clone production to test environment
pg_dump production_db | psql test_db

# 2. Get current version
CURRENT=$(psql -t -c "SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1" test_db)

# 3. Run migration
flyway -url=jdbc:postgresql://localhost/test_db migrate

# 4. Run application tests
npm test

# 5. Run rollback
flyway -url=jdbc:postgresql://localhost/test_db undo

# 6. Verify schema restored
NEW_VERSION=$(psql -t -c "SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1" test_db)

if [ "$CURRENT" != "$NEW_VERSION" ]; then
    echo "Rollback successful: $NEW_VERSION"
else
    echo "ERROR: Rollback failed"
    exit 1
fi

# 7. Run application tests again
npm test
```

## Rollback Checklist

```markdown
Pre-Rollback:
- [ ] Identify exact migration to rollback
- [ ] Review rollback script for data impact
- [ ] Check dependent objects (views, functions)
- [ ] Notify stakeholders
- [ ] Take fresh backup

During Rollback:
- [ ] Stop application traffic (if needed)
- [ ] Execute rollback in transaction
- [ ] Verify schema state
- [ ] Verify data integrity

Post-Rollback:
- [ ] Restart application
- [ ] Monitor error rates
- [ ] Verify functionality
- [ ] Document incident
- [ ] Plan forward fix
```
