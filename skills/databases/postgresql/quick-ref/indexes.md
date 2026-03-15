# PostgreSQL Indexes

> **Knowledge Base:** Read `knowledge/postgresql/indexes.md` for complete documentation.

## Index Types

```sql
-- B-tree (default) - equality and range
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created ON users(created_at DESC);

-- Unique index
CREATE UNIQUE INDEX idx_users_email_unique ON users(email);

-- Partial index
CREATE INDEX idx_active_users ON users(email) WHERE is_active = true;

-- Composite index
CREATE INDEX idx_users_name_email ON users(last_name, first_name, email);

-- GIN for arrays/JSONB
CREATE INDEX idx_posts_tags ON posts USING GIN(tags);
CREATE INDEX idx_users_metadata ON users USING GIN(metadata);

-- GiST for geometric/full-text
CREATE INDEX idx_locations_point ON locations USING GIST(coordinates);
```

## Index Usage

```sql
-- Check if index is used
EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'test@example.com';

-- Index scan statistics
SELECT
    indexrelname AS index_name,
    idx_scan AS times_used,
    idx_tup_read AS tuples_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

## Common Patterns

```sql
-- Foreign key index (not automatic!)
CREATE INDEX idx_posts_user_id ON posts(user_id);

-- Covering index (include columns)
CREATE INDEX idx_users_lookup ON users(email) INCLUDE (name, created_at);

-- Expression index
CREATE INDEX idx_users_lower_email ON users(LOWER(email));
CREATE INDEX idx_posts_year ON posts(EXTRACT(YEAR FROM created_at));

-- BRIN for time-series
CREATE INDEX idx_events_timestamp ON events USING BRIN(created_at);
```

## Index Maintenance

```sql
-- Reindex (rebuild)
REINDEX INDEX idx_users_email;
REINDEX TABLE users;

-- Concurrent reindex (no lock)
REINDEX INDEX CONCURRENTLY idx_users_email;

-- Analyze for query planner
ANALYZE users;
```

**Official docs:** https://www.postgresql.org/docs/current/indexes.html
