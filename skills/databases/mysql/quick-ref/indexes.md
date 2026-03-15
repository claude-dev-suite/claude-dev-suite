# MySQL Indexes Quick Reference

> **Knowledge Base:** Read `knowledge/mysql/indexes.md` for complete documentation.

## Create Indexes

```sql
-- Single column index
CREATE INDEX idx_email ON users(email);

-- Unique index
CREATE UNIQUE INDEX idx_email_unique ON users(email);

-- Composite index
CREATE INDEX idx_user_date ON orders(user_id, created_at);

-- With table creation
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(100),
  created_at TIMESTAMP,
  INDEX idx_name (name),
  INDEX idx_created (created_at)
);

-- Descending index (MySQL 8.0+)
CREATE INDEX idx_date_desc ON orders(created_at DESC);
```

## Index Types

```sql
-- B-Tree (default) - equality and range
CREATE INDEX idx_btree ON users(age);

-- Full-text index
CREATE FULLTEXT INDEX idx_content ON articles(title, body);
SELECT * FROM articles
WHERE MATCH(title, body) AGAINST('mysql tutorial' IN NATURAL LANGUAGE MODE);

-- Spatial index
CREATE SPATIAL INDEX idx_location ON places(coordinates);

-- Hash index (MEMORY tables only)
CREATE TABLE cache (
  key_col VARCHAR(255),
  value_col TEXT,
  INDEX USING HASH (key_col)
) ENGINE=MEMORY;
```

## Prefix Indexes

```sql
-- Index first N characters (for long strings)
CREATE INDEX idx_email_prefix ON users(email(50));

-- Check prefix selectivity
SELECT
  COUNT(DISTINCT LEFT(email, 10)) / COUNT(*) as sel_10,
  COUNT(DISTINCT LEFT(email, 20)) / COUNT(*) as sel_20,
  COUNT(DISTINCT email) / COUNT(*) as sel_full
FROM users;
```

## Index Management

```sql
-- Show indexes
SHOW INDEX FROM users;

-- Drop index
DROP INDEX idx_email ON users;
ALTER TABLE users DROP INDEX idx_email;

-- Rename index (MySQL 5.7+)
ALTER TABLE users RENAME INDEX idx_old TO idx_new;

-- Invisible index (for testing)
ALTER TABLE users ALTER INDEX idx_email INVISIBLE;
ALTER TABLE users ALTER INDEX idx_email VISIBLE;
```

## Query Analysis

```sql
-- EXPLAIN
EXPLAIN SELECT * FROM users WHERE email = 'test@example.com';

-- EXPLAIN ANALYZE (MySQL 8.0.18+)
EXPLAIN ANALYZE SELECT * FROM users WHERE age > 25;

-- Key columns to check:
-- type: const/eq_ref/ref (good) vs ALL (bad)
-- possible_keys: available indexes
-- key: actually used index
-- rows: estimated rows examined
```

## Index Best Practices

```sql
-- Covering index (index-only scan)
CREATE INDEX idx_covering ON users(status, name, email);
SELECT name, email FROM users WHERE status = 'active';

-- Composite index order matters!
-- Good for: (a), (a,b), (a,b,c)
-- Bad for: (b), (c), (b,c)
CREATE INDEX idx_composite ON orders(user_id, status, created_at);

-- Force index usage
SELECT * FROM users FORCE INDEX (idx_email) WHERE email LIKE 'a%';

-- Index hints
SELECT * FROM users USE INDEX (idx_created) WHERE created_at > '2024-01-01';
SELECT * FROM users IGNORE INDEX (idx_name) WHERE name = 'John';
```

## Index Statistics

```sql
-- Update statistics
ANALYZE TABLE users;

-- Check cardinality
SELECT
  INDEX_NAME,
  COLUMN_NAME,
  CARDINALITY
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_NAME = 'users';
```

**Official docs:** https://dev.mysql.com/doc/refman/8.0/en/optimization-indexes.html
