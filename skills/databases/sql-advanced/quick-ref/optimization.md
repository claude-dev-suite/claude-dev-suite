# Query Optimization Quick Reference

## EXPLAIN Basics

### PostgreSQL

```sql
-- Basic plan
EXPLAIN SELECT * FROM users WHERE email = 'test@example.com';

-- With execution stats
EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'test@example.com';

-- Full details
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
SELECT * FROM users WHERE email = 'test@example.com';

-- JSON format (for tools)
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT * FROM users WHERE email = 'test@example.com';
```

### MySQL

```sql
EXPLAIN SELECT * FROM users WHERE email = 'test@example.com';
EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'test@example.com';
EXPLAIN FORMAT=JSON SELECT * FROM users WHERE email = 'test@example.com';
```

### SQL Server

```sql
SET SHOWPLAN_ALL ON;
SELECT * FROM users WHERE email = 'test@example.com';
SET SHOWPLAN_ALL OFF;

-- Or graphical plan in SSMS
SET STATISTICS IO ON;
SET STATISTICS TIME ON;
```

## Reading EXPLAIN Output

### Scan Types (Best to Worst)

| Scan Type | Description | Performance |
|-----------|-------------|-------------|
| Index Only Scan | All data from index | Best |
| Index Scan | Index lookup + table fetch | Good |
| Bitmap Index Scan | Multiple index conditions | Good |
| Index Seek (SQL Server) | Direct index lookup | Good |
| Seq Scan / Table Scan | Full table scan | Worst |

### Join Types

| Join Type | Description |
|-----------|-------------|
| Nested Loop | Good for small tables or indexed joins |
| Hash Join | Good for large tables, equality joins |
| Merge Join | Good for sorted data, equality joins |

### Key Metrics

```
Seq Scan on users  (cost=0.00..155.00 rows=1 width=100) (actual time=0.015..0.842 rows=1 loops=1)
                    ^^^^^^^^^^^^^^^^^  ^^^^^^           ^^^^^^^^^^^^^^^^^^^^^^^^^
                    estimated cost     estimated rows   actual time (ms)

  Buffers: shared hit=50 read=10
           ^^^^^^^^^^^^^^^^^^^^^^
           cache hits vs disk reads
```

## Index Strategies

### When to Create Index

```sql
-- High selectivity columns (unique or near-unique)
CREATE INDEX idx_users_email ON users(email);

-- Foreign key columns
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- Columns in WHERE clauses
CREATE INDEX idx_orders_status ON orders(status);

-- Columns in ORDER BY
CREATE INDEX idx_orders_created ON orders(created_at DESC);

-- Columns in GROUP BY
CREATE INDEX idx_sales_category ON sales(category_id);
```

### Composite Indexes

```sql
-- Column order matters!
-- Good for: WHERE a = ? AND b = ?
-- Good for: WHERE a = ? ORDER BY b
-- Good for: WHERE a = ?
-- NOT good for: WHERE b = ?
CREATE INDEX idx_orders_user_status ON orders(user_id, status);

-- Include columns to avoid table lookup
CREATE INDEX idx_orders_user ON orders(user_id) INCLUDE (total, status);
```

### Partial Indexes

```sql
-- Index only active records
CREATE INDEX idx_active_users ON users(email) WHERE status = 'active';

-- Index only recent data
CREATE INDEX idx_recent_orders ON orders(user_id, created_at)
WHERE created_at > '2024-01-01';
```

### Expression Indexes

```sql
-- For functions in WHERE clause
CREATE INDEX idx_users_email_lower ON users(LOWER(email));

-- For computed columns
CREATE INDEX idx_orders_year ON orders(EXTRACT(YEAR FROM created_at));
```

## Common Anti-Patterns

### Functions on Indexed Columns

```sql
-- Bad: Index not used
SELECT * FROM users WHERE LOWER(email) = 'test@example.com';
SELECT * FROM orders WHERE YEAR(created_at) = 2024;

-- Good: Expression index or rewrite
CREATE INDEX idx_users_email_lower ON users(LOWER(email));
-- or
SELECT * FROM orders WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01';
```

### Implicit Type Conversion

```sql
-- Bad: String column compared to number (implicit cast)
SELECT * FROM users WHERE phone = 1234567890;

-- Good: Use correct type
SELECT * FROM users WHERE phone = '1234567890';
```

### Leading Wildcard

```sql
-- Bad: Can't use index
SELECT * FROM users WHERE email LIKE '%@gmail.com';

-- Better: Full-text search or reverse index
CREATE INDEX idx_users_email_rev ON users(REVERSE(email));
SELECT * FROM users WHERE REVERSE(email) LIKE REVERSE('%@gmail.com');
```

### OR Conditions

```sql
-- Bad: May not use index efficiently
SELECT * FROM users WHERE email = 'a@b.com' OR phone = '123';

-- Better: UNION
SELECT * FROM users WHERE email = 'a@b.com'
UNION
SELECT * FROM users WHERE phone = '123';
```

### NOT IN with NULLs

```sql
-- Bad: Unexpected results if subquery has NULLs
SELECT * FROM users WHERE id NOT IN (SELECT user_id FROM banned);

-- Good: NOT EXISTS
SELECT * FROM users u
WHERE NOT EXISTS (SELECT 1 FROM banned b WHERE b.user_id = u.id);
```

### SELECT *

```sql
-- Bad: Fetches unnecessary columns
SELECT * FROM users WHERE id = 1;

-- Good: Only needed columns
SELECT id, name, email FROM users WHERE id = 1;
```

## Query Rewriting

### Subquery to JOIN

```sql
-- Before: Correlated subquery
SELECT
    name,
    (SELECT COUNT(*) FROM orders WHERE user_id = users.id) as order_count
FROM users;

-- After: JOIN with aggregation
SELECT u.name, COALESCE(o.order_count, 0) as order_count
FROM users u
LEFT JOIN (
    SELECT user_id, COUNT(*) as order_count
    FROM orders GROUP BY user_id
) o ON o.user_id = u.id;
```

### DISTINCT to GROUP BY

```sql
-- Before: DISTINCT on large result
SELECT DISTINCT user_id, product_id FROM orders;

-- After: GROUP BY (often faster)
SELECT user_id, product_id FROM orders GROUP BY user_id, product_id;
```

### EXISTS vs IN

```sql
-- EXISTS often faster for large outer table
SELECT * FROM users u
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);

-- IN often faster for small subquery result
SELECT * FROM users
WHERE id IN (SELECT user_id FROM vip_users);
```

### Pagination Optimization

```sql
-- Bad: Large OFFSET
SELECT * FROM orders ORDER BY id LIMIT 20 OFFSET 100000;

-- Good: Keyset pagination
SELECT * FROM orders WHERE id > 100000 ORDER BY id LIMIT 20;
```

## Statistics

### Update Statistics

```sql
-- PostgreSQL
ANALYZE users;
ANALYZE;  -- All tables

-- MySQL
ANALYZE TABLE users;

-- SQL Server
UPDATE STATISTICS users;
```

### View Statistics

```sql
-- PostgreSQL
SELECT * FROM pg_stats WHERE tablename = 'users';

-- MySQL
SHOW INDEX FROM users;

-- SQL Server
DBCC SHOW_STATISTICS('users', 'idx_users_email');
```

## Query Hints

### PostgreSQL

```sql
-- Force index scan
SET enable_seqscan = off;
SELECT * FROM users WHERE ...;
SET enable_seqscan = on;
```

### MySQL

```sql
-- Force index
SELECT * FROM users FORCE INDEX (idx_users_email) WHERE ...;

-- Ignore index
SELECT * FROM users IGNORE INDEX (idx_users_email) WHERE ...;
```

### SQL Server

```sql
-- Force index
SELECT * FROM users WITH (INDEX(idx_users_email)) WHERE ...;

-- Force join type
SELECT * FROM users u
INNER LOOP JOIN orders o ON o.user_id = u.id;
```

## Monitoring Slow Queries

### PostgreSQL

```sql
-- Enable slow query logging
SET log_min_duration_statement = 1000;  -- ms

-- View slow queries
SELECT * FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;
```

### MySQL

```sql
-- Enable slow query log
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;  -- seconds
```

### SQL Server

```sql
-- Query store
SELECT TOP 10 *
FROM sys.query_store_query_text qt
JOIN sys.query_store_plan p ON qt.query_text_id = p.query_text_id
ORDER BY p.avg_duration DESC;
```

## Checklist

- [ ] Indexes on WHERE columns
- [ ] Indexes on JOIN columns
- [ ] Indexes on ORDER BY columns
- [ ] Composite indexes for multi-column conditions
- [ ] No functions on indexed columns in WHERE
- [ ] Appropriate data types (avoid implicit conversion)
- [ ] Statistics up to date
- [ ] No SELECT * in production
- [ ] Pagination uses keyset instead of OFFSET
- [ ] EXPLAIN ANALYZE reviewed for expensive queries
