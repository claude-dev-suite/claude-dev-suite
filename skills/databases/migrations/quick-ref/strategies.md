# Migration Strategies Quick Reference

## Deployment Strategies Comparison

| Strategy | Downtime | Complexity | Rollback | Best For |
|----------|----------|------------|----------|----------|
| Big Bang | Yes | Low | Hard | Small apps, dev |
| Blue-Green | No | High | Easy | Critical apps |
| Rolling | No | Medium | Medium | Microservices |
| Canary | No | High | Easy | Large user base |
| Expand-Contract | No | Medium | N/A | Schema changes |

## Big Bang Deployment

```
1. Schedule maintenance window
2. Stop application
3. Backup database
4. Run migrations
5. Verify migration success
6. Start application
7. Verify application
```

**Use when:**
- Development/staging environments
- Small databases
- Infrequent deployments
- Breaking changes that can't be made backward-compatible

## Blue-Green Deployment

```
┌─────────────────────────────────────────────────┐
│                                                 │
│   ┌───────┐         ┌───────┐                  │
│   │ Blue  │    →    │ Green │                  │
│   │ (v1)  │         │ (v2)  │                  │
│   └───┬───┘         └───┬───┘                  │
│       │                 │                       │
│       └────────┬────────┘                       │
│                │                                │
│         ┌──────┴──────┐                         │
│         │  Database   │                         │
│         │  (Shared)   │                         │
│         └─────────────┘                         │
│                                                 │
└─────────────────────────────────────────────────┘

Steps:
1. Green runs migration (backward-compatible)
2. Green starts with new code
3. Test Green environment
4. Switch traffic: Blue → Green
5. Blue becomes standby
6. Remove backward compatibility (optional)
```

**Database Requirements:**
- All migrations must be backward-compatible
- Old code must work with new schema
- New code must work with old schema (during transition)

## Rolling Deployment

```
Time →
─────────────────────────────────────────────
Server 1: [v1][v1][v1][migrate][v2][v2][v2]
Server 2: [v1][v1][v1][v1][migrate][v2][v2]
Server 3: [v1][v1][v1][v1][v1][migrate][v2]
─────────────────────────────────────────────
Database: [schema v1 → compatible → schema v2]

Steps:
1. Apply backward-compatible migration
2. Update Server 1, verify
3. Update Server 2, verify
4. Update Server 3, verify
5. Apply cleanup migration (if needed)
```

## Canary Deployment

```
         ┌─────────────────────────────────┐
         │          Load Balancer          │
         │   ┌───────────┬───────────┐    │
         │   │    95%    │    5%     │    │
         │   └─────┬─────┴─────┬─────┘    │
         │         │           │          │
         │   ┌─────▼─────┐ ┌───▼───┐      │
         │   │  Stable   │ │Canary │      │
         │   │   (v1)    │ │ (v2)  │      │
         │   └─────┬─────┘ └───┬───┘      │
         │         │           │          │
         │         └─────┬─────┘          │
         │               │                │
         │        ┌──────┴──────┐         │
         │        │  Database   │         │
         │        └─────────────┘         │
         └─────────────────────────────────┘

Steps:
1. Deploy to canary (small %)
2. Monitor errors, performance
3. Gradually increase canary traffic
4. If issues, route back to stable
5. When confident, promote to 100%
```

## Expand-Contract Pattern

### Adding a Required Column

```sql
-- Phase 1: EXPAND
ALTER TABLE users ADD COLUMN phone VARCHAR(20);  -- nullable

-- Deploy code that populates phone for new records
-- Backfill existing records
UPDATE users SET phone = 'unknown' WHERE phone IS NULL;

-- Phase 2: CONTRACT
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;
```

### Renaming a Column

```sql
-- Phase 1: EXPAND
ALTER TABLE users ADD COLUMN full_name VARCHAR(200);
UPDATE users SET full_name = CONCAT(first_name, ' ', last_name);

-- Phase 2: MIGRATE
-- Deploy code that reads both, writes both
CREATE TRIGGER sync_names BEFORE INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION sync_name_columns();

-- Phase 3: CONTRACT
-- Deploy code that only uses full_name
DROP TRIGGER sync_names ON users;
ALTER TABLE users DROP COLUMN first_name;
ALTER TABLE users DROP COLUMN last_name;
```

### Changing Column Type

```sql
-- Phase 1: EXPAND
ALTER TABLE orders ADD COLUMN amount_new DECIMAL(15,2);
UPDATE orders SET amount_new = amount::DECIMAL(15,2);

-- Phase 2: MIGRATE
-- Application writes to both columns

-- Phase 3: CONTRACT
ALTER TABLE orders DROP COLUMN amount;
ALTER TABLE orders RENAME COLUMN amount_new TO amount;
```

### Splitting a Table

```sql
-- Phase 1: EXPAND - Create new tables
CREATE TABLE user_profiles (
    user_id INT PRIMARY KEY REFERENCES users(id),
    bio TEXT,
    avatar_url VARCHAR(500)
);

-- Copy data
INSERT INTO user_profiles (user_id, bio, avatar_url)
SELECT id, bio, avatar_url FROM users;

-- Phase 2: MIGRATE - Application uses both
-- Write to new table, read from both (fallback to old)

-- Phase 3: CONTRACT
ALTER TABLE users DROP COLUMN bio;
ALTER TABLE users DROP COLUMN avatar_url;
```

## Parallel Change Pattern

For high-traffic tables:

```sql
-- 1. Create shadow table
CREATE TABLE users_v2 (LIKE users INCLUDING ALL);

-- 2. Set up replication trigger
CREATE TRIGGER replicate_to_v2
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION replicate_user_to_v2();

-- 3. Copy existing data
INSERT INTO users_v2 SELECT * FROM users;

-- 4. Verify sync
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM users_v2;

-- 5. Switch reads to v2 (application change)

-- 6. Switch writes to v2 (application change)

-- 7. Remove trigger and old table
DROP TRIGGER replicate_to_v2 ON users;
DROP TABLE users;
ALTER TABLE users_v2 RENAME TO users;
```

## Feature Flags Integration

```python
# Application code
def get_user_name(user_id):
    if feature_flags.is_enabled('use_full_name'):
        return db.query("SELECT full_name FROM users WHERE id = ?", user_id)
    else:
        return db.query("SELECT CONCAT(first_name, ' ', last_name) FROM users WHERE id = ?", user_id)

# Migration sequence:
# 1. Deploy code with feature flag OFF
# 2. Run migration to add full_name column
# 3. Backfill data
# 4. Enable feature flag for small % of users
# 5. Monitor
# 6. Enable for all users
# 7. Remove old column
# 8. Remove feature flag
```

## Choosing a Strategy

```
                    ┌─────────────────────┐
                    │  Breaking change?   │
                    └──────────┬──────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
              ▼                                 ▼
         ┌────┴────┐                       ┌────┴────┐
         │   Yes   │                       │   No    │
         └────┬────┘                       └────┬────┘
              │                                 │
              ▼                                 ▼
    ┌─────────────────┐              ┌─────────────────┐
    │ Can split into  │              │ Simple Rolling  │
    │ expand/contract?│              │  Deployment OK  │
    └────────┬────────┘              └─────────────────┘
             │
    ┌────────┴────────┐
    │                 │
    ▼                 ▼
┌───┴───┐        ┌────┴────┐
│  Yes  │        │   No    │
└───┬───┘        └────┬────┘
    │                 │
    ▼                 ▼
┌───────────┐   ┌───────────┐
│  Expand   │   │ Big Bang  │
│ Contract  │   │(Downtime) │
└───────────┘   └───────────┘
```
