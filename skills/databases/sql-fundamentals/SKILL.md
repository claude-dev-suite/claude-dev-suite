---
name: sql-fundamentals
description: |
  Core SQL knowledge based on ANSI SQL standard. Covers DML (SELECT, INSERT,
  UPDATE, DELETE), DDL (CREATE, ALTER, DROP), joins, transactions, and
  fundamental database concepts. Foundation for all SQL database work.

  USE WHEN: user mentions "SQL basics", "SELECT", "JOIN", "INSERT", "UPDATE", "DELETE",
  "DDL", "DML", "transactions", "foreign keys", "indexes", asks about basic SQL queries

  DO NOT USE FOR: advanced queries (CTEs, window functions) - use `sql-advanced` instead,
  PostgreSQL specifics - use `postgresql` instead, NoSQL - use `mongodb` or `redis` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---

# SQL Fundamentals Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `sql` for comprehensive documentation.

## SQL Statement Categories

| Category | Statements | Purpose |
|----------|------------|---------|
| **DML** | SELECT, INSERT, UPDATE, DELETE, MERGE | Data manipulation |
| **DDL** | CREATE, ALTER, DROP, TRUNCATE | Schema definition |
| **DCL** | GRANT, REVOKE | Access control |
| **TCL** | BEGIN, COMMIT, ROLLBACK, SAVEPOINT | Transaction control |

## SELECT Statement

```sql
SELECT [DISTINCT] columns
FROM table
[JOIN other_table ON condition]
[WHERE condition]
[GROUP BY columns]
[HAVING condition]
[ORDER BY columns [ASC|DESC]]
[LIMIT n OFFSET m];
```

### Execution Order
1. FROM (and JOINs)
2. WHERE
3. GROUP BY
4. HAVING
5. SELECT
6. DISTINCT
7. ORDER BY
8. LIMIT/OFFSET

## INSERT Patterns

```sql
-- Single row
INSERT INTO users (name, email) VALUES ('John', 'john@example.com');

-- Multiple rows
INSERT INTO users (name, email) VALUES
    ('John', 'john@example.com'),
    ('Jane', 'jane@example.com');

-- Insert from SELECT
INSERT INTO users_backup (name, email)
SELECT name, email FROM users WHERE created_at < '2024-01-01';

-- Insert with RETURNING (PostgreSQL)
INSERT INTO users (name, email) VALUES ('John', 'john@example.com')
RETURNING id, created_at;
```

## UPDATE Patterns

```sql
-- Simple update
UPDATE users SET name = 'John Doe' WHERE id = 1;

-- Multiple columns
UPDATE users SET name = 'John', status = 'active' WHERE id = 1;

-- Update with subquery
UPDATE orders SET status = 'shipped'
WHERE user_id IN (SELECT id FROM users WHERE is_premium = true);

-- Update with JOIN (varies by database)
-- PostgreSQL
UPDATE orders o SET status = 'vip'
FROM users u WHERE o.user_id = u.id AND u.is_premium = true;
```

## DELETE Patterns

```sql
-- Delete with condition
DELETE FROM users WHERE id = 1;

-- Delete with subquery
DELETE FROM orders WHERE user_id IN (
    SELECT id FROM users WHERE status = 'deleted'
);

-- Soft delete pattern (prefer this)
UPDATE users SET deleted_at = NOW() WHERE id = 1;
```

## JOIN Types

| Join Type | Returns |
|-----------|---------|
| `INNER JOIN` | Only matching rows from both tables |
| `LEFT JOIN` | All left + matching right (NULL if no match) |
| `RIGHT JOIN` | All right + matching left (NULL if no match) |
| `FULL OUTER JOIN` | All rows from both tables |
| `CROSS JOIN` | Cartesian product (all combinations) |

```sql
-- INNER JOIN
SELECT u.name, o.total
FROM users u
INNER JOIN orders o ON o.user_id = u.id;

-- LEFT JOIN (include users without orders)
SELECT u.name, COALESCE(o.total, 0) as total
FROM users u
LEFT JOIN orders o ON o.user_id = u.id;

-- Self JOIN (hierarchical data)
SELECT e.name as employee, m.name as manager
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.id;
```

## Aggregations

```sql
-- Basic aggregates
SELECT
    COUNT(*) as total,
    COUNT(DISTINCT user_id) as unique_users,
    SUM(amount) as total_amount,
    AVG(amount) as avg_amount,
    MIN(amount) as min_amount,
    MAX(amount) as max_amount
FROM orders;

-- GROUP BY
SELECT user_id, COUNT(*) as order_count, SUM(amount) as total
FROM orders
GROUP BY user_id;

-- HAVING (filter after GROUP BY)
SELECT user_id, SUM(amount) as total
FROM orders
GROUP BY user_id
HAVING SUM(amount) > 1000;
```

## DDL - Table Definition

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,              -- PostgreSQL auto-increment
    -- id INT AUTO_INCREMENT PRIMARY KEY -- MySQL
    -- id INT IDENTITY(1,1) PRIMARY KEY  -- SQL Server
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_status CHECK (status IN ('active', 'inactive', 'deleted'))
);

-- Foreign key
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    total DECIMAL(10, 2) NOT NULL,

    CONSTRAINT fk_orders_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);
```

## ALTER TABLE

```sql
-- Add column
ALTER TABLE users ADD COLUMN phone VARCHAR(20);

-- Drop column
ALTER TABLE users DROP COLUMN phone;

-- Modify column
ALTER TABLE users ALTER COLUMN name TYPE VARCHAR(200);

-- Add constraint
ALTER TABLE users ADD CONSTRAINT uq_phone UNIQUE (phone);

-- Drop constraint
ALTER TABLE users DROP CONSTRAINT uq_phone;

-- Rename column
ALTER TABLE users RENAME COLUMN name TO full_name;

-- Rename table
ALTER TABLE users RENAME TO customers;
```

## Indexes

```sql
-- Create index
CREATE INDEX idx_users_email ON users(email);

-- Unique index
CREATE UNIQUE INDEX idx_users_email ON users(email);

-- Composite index
CREATE INDEX idx_orders_user_date ON orders(user_id, created_at DESC);

-- Partial index (PostgreSQL)
CREATE INDEX idx_active_users ON users(email) WHERE status = 'active';

-- Drop index
DROP INDEX idx_users_email;
```

## Transactions

```sql
-- Basic transaction
BEGIN;
    UPDATE accounts SET balance = balance - 100 WHERE id = 1;
    UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;

-- With savepoint
BEGIN;
    UPDATE accounts SET balance = balance - 100 WHERE id = 1;
    SAVEPOINT after_debit;

    UPDATE accounts SET balance = balance + 100 WHERE id = 2;
    -- Something went wrong with the credit
    ROLLBACK TO after_debit;

    -- Try different approach
    UPDATE accounts SET balance = balance + 100 WHERE id = 3;
COMMIT;

-- Rollback on error
BEGIN;
    -- operations...
ROLLBACK;  -- cancel all changes
```

### Isolation Levels

| Level | Dirty Read | Non-Repeatable Read | Phantom Read |
|-------|------------|---------------------|--------------|
| READ UNCOMMITTED | Yes | Yes | Yes |
| READ COMMITTED | No | Yes | Yes |
| REPEATABLE READ | No | No | Yes |
| SERIALIZABLE | No | No | No |

```sql
-- Set isolation level
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
BEGIN;
    -- operations
COMMIT;
```

## NULL Handling

```sql
-- Check for NULL
SELECT * FROM users WHERE phone IS NULL;
SELECT * FROM users WHERE phone IS NOT NULL;

-- COALESCE (first non-null)
SELECT COALESCE(phone, 'N/A') as phone FROM users;

-- NULLIF (return NULL if equal)
SELECT NULLIF(status, 'unknown') FROM users;

-- NULL in aggregates (ignored except COUNT(*))
SELECT AVG(score) FROM tests;  -- NULLs ignored
SELECT COUNT(*) FROM tests;    -- counts all rows
SELECT COUNT(score) FROM tests; -- counts non-NULL only
```

## Subqueries

```sql
-- Scalar subquery
SELECT name, (SELECT COUNT(*) FROM orders WHERE user_id = users.id) as order_count
FROM users;

-- IN subquery
SELECT * FROM users WHERE id IN (
    SELECT DISTINCT user_id FROM orders WHERE total > 100
);

-- EXISTS subquery (often faster than IN)
SELECT * FROM users u WHERE EXISTS (
    SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.total > 100
);

-- Correlated subquery
SELECT * FROM orders o1 WHERE total > (
    SELECT AVG(total) FROM orders o2 WHERE o2.user_id = o1.user_id
);
```

## Best Practices

### DO
- Use parameterized queries (prevent SQL injection)
- Add indexes on WHERE/JOIN columns
- Use appropriate data types
- Define foreign keys for data integrity
- Use transactions for multiple related operations
- Use EXPLAIN to analyze query performance

### DON'T
- Use SELECT * in production
- UPDATE/DELETE without WHERE clause
- Store comma-separated values in columns
- Use reserved words as identifiers
- Ignore NULL handling

## When NOT to Use This Skill

- **Advanced SQL** (CTEs, window functions, recursive queries) - Use `sql-advanced` skill
- **PostgreSQL specifics** (arrays, JSONB, extensions) - Use `postgresql` skill
- **MySQL specifics** (engine selection, stored procedures) - Use `mysql` skill
- **Document databases** - Use `mongodb` for document-oriented data
- **Caching** - Use `redis` for caching needs

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| SELECT * in production | Transfers unnecessary data | Specify only needed columns |
| No WHERE on UPDATE/DELETE | Unintended changes to all rows | Always add WHERE clause |
| Missing indexes on JOIN columns | Slow queries, full table scans | Add indexes on foreign keys |
| String concatenation in SQL | SQL injection vulnerability | Use parameterized queries |
| Implicit data type conversions | Performance loss, unexpected results | Use explicit CAST |
| Storing CSV in columns | Violates 1NF, hard to query | Normalize into separate table |
| Using reserved words as identifiers | Syntax errors, portability issues | Choose different names |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Syntax errors | Check SQL dialect | Use correct syntax for your database |
| Slow queries | `EXPLAIN` or `EXPLAIN ANALYZE` | Add indexes, rewrite query |
| Deadlocks | Check transaction logs | Reduce transaction scope, consistent ordering |
| Foreign key violation | Check referenced table data | Insert parent record first |
| Duplicate key error | Check UNIQUE constraints | Use UPSERT or handle conflict |
| NULL comparison fails | Remember NULL != NULL | Use IS NULL, IS NOT NULL |

## Reference Documentation

- [DML Patterns](quick-ref/dml.md)
- [DDL Patterns](quick-ref/ddl.md)
- [JOIN Patterns](quick-ref/joins.md)
- [Aggregations & Window Functions](quick-ref/aggregations.md)
- [Transactions](quick-ref/transactions.md)
