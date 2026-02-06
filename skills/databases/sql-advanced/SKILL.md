---
name: sql-advanced
description: |
  Advanced SQL patterns including CTEs, window functions, recursive queries,
  query optimization, and EXPLAIN analysis. Use for complex query writing
  and performance tuning.

  USE WHEN: user mentions "CTE", "window functions", "recursive queries", "EXPLAIN",
  "query optimization", "ROW_NUMBER", "RANK", "PARTITION BY", "running totals"

  DO NOT USE FOR: basic SQL - use `sql-fundamentals` instead,
  database-specific features - use `postgresql`, `mysql`, or `sqlserver` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---

# SQL Advanced Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `sql` for comprehensive documentation.

## Common Table Expressions (CTEs)

### Basic CTE
```sql
WITH active_users AS (
    SELECT id, name, email
    FROM users
    WHERE status = 'active'
)
SELECT u.name, COUNT(o.id) as order_count
FROM active_users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id, u.name;
```

### Multiple CTEs
```sql
WITH
active_users AS (
    SELECT id, name FROM users WHERE status = 'active'
),
user_orders AS (
    SELECT user_id, COUNT(*) as order_count, SUM(total) as total_spent
    FROM orders
    WHERE status = 'completed'
    GROUP BY user_id
),
high_value_users AS (
    SELECT u.*, uo.order_count, uo.total_spent
    FROM active_users u
    JOIN user_orders uo ON uo.user_id = u.id
    WHERE uo.total_spent > 10000
)
SELECT * FROM high_value_users ORDER BY total_spent DESC;
```

### Recursive CTEs
```sql
-- Hierarchical data (org chart, categories)
WITH RECURSIVE org_chart AS (
    -- Base case: top-level employees
    SELECT id, name, manager_id, 1 as level, ARRAY[name] as path
    FROM employees
    WHERE manager_id IS NULL

    UNION ALL

    -- Recursive case
    SELECT e.id, e.name, e.manager_id, oc.level + 1, oc.path || e.name
    FROM employees e
    JOIN org_chart oc ON e.manager_id = oc.id
)
SELECT * FROM org_chart ORDER BY path;

-- Generate series
WITH RECURSIVE numbers AS (
    SELECT 1 as n
    UNION ALL
    SELECT n + 1 FROM numbers WHERE n < 100
)
SELECT * FROM numbers;

-- Date range
WITH RECURSIVE dates AS (
    SELECT DATE '2024-01-01' as date
    UNION ALL
    SELECT date + INTERVAL '1 day' FROM dates WHERE date < '2024-12-31'
)
SELECT * FROM dates;
```

### Materialized CTE (PostgreSQL 12+)
```sql
-- Force CTE to be materialized (evaluated once)
WITH active_users AS MATERIALIZED (
    SELECT * FROM users WHERE status = 'active'
)
SELECT * FROM active_users WHERE id = 1
UNION ALL
SELECT * FROM active_users WHERE id = 2;

-- Force CTE to be inlined (not materialized)
WITH active_users AS NOT MATERIALIZED (
    SELECT * FROM users WHERE status = 'active'
)
SELECT * FROM active_users WHERE id = 1;
```

## Window Functions Deep Dive

### Partitioned Calculations
```sql
SELECT
    department,
    name,
    salary,
    -- Within department
    SUM(salary) OVER (PARTITION BY department) as dept_total,
    AVG(salary) OVER (PARTITION BY department) as dept_avg,
    salary - AVG(salary) OVER (PARTITION BY department) as diff_from_avg,
    -- Percentage of department total
    ROUND(100.0 * salary / SUM(salary) OVER (PARTITION BY department), 2) as pct_of_dept
FROM employees;
```

### Running Calculations
```sql
SELECT
    date,
    amount,
    -- Running totals
    SUM(amount) OVER (ORDER BY date) as running_total,
    SUM(amount) OVER (ORDER BY date ROWS UNBOUNDED PRECEDING) as same_as_above,
    -- Moving averages
    AVG(amount) OVER (ORDER BY date ROWS 6 PRECEDING) as moving_avg_7d,
    AVG(amount) OVER (ORDER BY date ROWS BETWEEN 3 PRECEDING AND 3 FOLLOWING) as centered_avg,
    -- Cumulative stats
    COUNT(*) OVER (ORDER BY date) as cumulative_count,
    MIN(amount) OVER (ORDER BY date) as running_min,
    MAX(amount) OVER (ORDER BY date) as running_max
FROM daily_transactions;
```

### Gap and Island Analysis
```sql
-- Find consecutive sequences (islands)
WITH numbered AS (
    SELECT
        date,
        value,
        ROW_NUMBER() OVER (ORDER BY date) as rn,
        date - (ROW_NUMBER() OVER (ORDER BY date) * INTERVAL '1 day') as grp
    FROM daily_data
)
SELECT
    MIN(date) as island_start,
    MAX(date) as island_end,
    COUNT(*) as days_in_sequence
FROM numbered
GROUP BY grp
ORDER BY island_start;

-- Find gaps in sequence
SELECT
    id,
    LEAD(id) OVER (ORDER BY id) as next_id,
    LEAD(id) OVER (ORDER BY id) - id - 1 as gap_size
FROM items
WHERE LEAD(id) OVER (ORDER BY id) - id > 1;
```

### First/Last in Group
```sql
-- Get first and last values per group
SELECT DISTINCT ON (department)
    department,
    name as highest_paid,
    salary
FROM employees
ORDER BY department, salary DESC;

-- With window functions
SELECT DISTINCT
    department,
    FIRST_VALUE(name) OVER w as highest_paid,
    LAST_VALUE(name) OVER w as lowest_paid
FROM employees
WINDOW w AS (
    PARTITION BY department
    ORDER BY salary DESC
    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
);
```

## Query Optimization

### EXPLAIN Basics
```sql
-- Show query plan
EXPLAIN SELECT * FROM users WHERE email = 'test@example.com';

-- Show actual execution stats
EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'test@example.com';

-- More details
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM users WHERE email = 'test@example.com';

-- JSON output for tools
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT * FROM users WHERE email = 'test@example.com';
```

### Reading EXPLAIN Output
```
Seq Scan on users  (cost=0.00..155.00 rows=1 width=100) (actual time=0.015..0.842 rows=1 loops=1)
  Filter: (email = 'test@example.com'::text)
  Rows Removed by Filter: 4999
```

| Term | Meaning |
|------|---------|
| `Seq Scan` | Full table scan (often bad) |
| `Index Scan` | Using index (good) |
| `Index Only Scan` | Using covering index (best) |
| `Bitmap Index Scan` | Using multiple indexes |
| `cost=0.00..155.00` | Estimated startup..total cost |
| `rows=1` | Estimated rows returned |
| `actual time=0.015..0.842` | Real startup..total time (ms) |
| `Rows Removed by Filter` | Rows read but not returned |

### Common Performance Issues

#### Missing Index
```sql
-- Problem: Seq Scan
EXPLAIN SELECT * FROM users WHERE email = 'test@example.com';

-- Solution: Add index
CREATE INDEX idx_users_email ON users(email);
```

#### Index Not Used
```sql
-- Problem: Function on column prevents index use
SELECT * FROM users WHERE LOWER(email) = 'test@example.com';

-- Solution: Expression index
CREATE INDEX idx_users_email_lower ON users(LOWER(email));
```

#### N+1 Query Problem
```sql
-- Problem: Querying in a loop (application code)
-- For each user: SELECT * FROM orders WHERE user_id = ?

-- Solution: Single query with JOIN
SELECT u.*, o.*
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.id IN (1, 2, 3, 4, 5);
```

### Index Strategies

```sql
-- Composite index (column order matters!)
-- Good for: WHERE a = ? AND b = ?
-- Good for: WHERE a = ? ORDER BY b
CREATE INDEX idx_orders_user_date ON orders(user_id, created_at DESC);

-- Covering index (all needed columns in index)
CREATE INDEX idx_orders_user_covering ON orders(user_id) INCLUDE (status, total);

-- Partial index (filtered)
CREATE INDEX idx_active_orders ON orders(user_id) WHERE status = 'active';

-- Expression index
CREATE INDEX idx_orders_year ON orders(EXTRACT(YEAR FROM created_at));
```

### Query Rewriting

```sql
-- Avoid: Subquery in SELECT
SELECT
    name,
    (SELECT COUNT(*) FROM orders WHERE user_id = users.id) as order_count
FROM users;

-- Better: JOIN with aggregation
SELECT u.name, COALESCE(o.order_count, 0) as order_count
FROM users u
LEFT JOIN (
    SELECT user_id, COUNT(*) as order_count
    FROM orders GROUP BY user_id
) o ON o.user_id = u.id;

-- Avoid: OR conditions on different columns
SELECT * FROM users WHERE email = 'a@b.com' OR phone = '123';

-- Better: UNION (can use indexes)
SELECT * FROM users WHERE email = 'a@b.com'
UNION
SELECT * FROM users WHERE phone = '123';

-- Avoid: NOT IN with NULLs (tricky behavior)
SELECT * FROM users WHERE id NOT IN (SELECT user_id FROM banned);

-- Better: NOT EXISTS
SELECT * FROM users u WHERE NOT EXISTS (
    SELECT 1 FROM banned b WHERE b.user_id = u.id
);
```

## Advanced Patterns

### Pivot/Unpivot
```sql
-- Pivot: Rows to columns
SELECT
    product_id,
    SUM(CASE WHEN month = 1 THEN sales END) as jan,
    SUM(CASE WHEN month = 2 THEN sales END) as feb,
    SUM(CASE WHEN month = 3 THEN sales END) as mar
FROM monthly_sales
GROUP BY product_id;

-- PostgreSQL: crosstab
SELECT * FROM crosstab(
    'SELECT product_id, month, sales FROM monthly_sales ORDER BY 1,2'
) AS ct(product_id INT, jan INT, feb INT, mar INT);

-- Unpivot: Columns to rows (PostgreSQL)
SELECT product_id, month, sales
FROM products,
LATERAL (VALUES
    ('jan', jan_sales),
    ('feb', feb_sales),
    ('mar', mar_sales)
) AS t(month, sales);
```

### De-duplication
```sql
-- Keep first occurrence
DELETE FROM users a USING users b
WHERE a.id > b.id AND a.email = b.email;

-- With CTE (safer)
WITH duplicates AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at) as rn
    FROM users
)
DELETE FROM users WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);
```

### Temporal Queries
```sql
-- Events active at specific time
SELECT * FROM events
WHERE start_time <= '2024-06-15 10:00:00'
  AND end_time > '2024-06-15 10:00:00';

-- Overlapping periods
SELECT a.*, b.*
FROM reservations a, reservations b
WHERE a.id < b.id
  AND a.room_id = b.room_id
  AND a.start_time < b.end_time
  AND a.end_time > b.start_time;

-- Fill gaps with generate_series
SELECT
    d.date,
    COALESCE(s.revenue, 0) as revenue
FROM generate_series(
    '2024-01-01'::date,
    '2024-12-31'::date,
    '1 day'
) d(date)
LEFT JOIN daily_sales s ON s.date = d.date;
```

## When NOT to Use This Skill

- **Basic SQL** (SELECT, JOIN, INSERT) - Use `sql-fundamentals` skill
- **PostgreSQL specifics** (arrays, JSONB) - Use `postgresql` skill
- **MySQL specifics** (stored procedures) - Use `mysql` skill
- **ORM queries** - Use `prisma`, `typeorm`, or relevant ORM skill

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Correlated subqueries | Slow performance, N+1 | Use JOINs or window functions |
| Functions on indexed columns | Index not used | Use functional indexes |
| Deep recursion without limit | Stack overflow | Add recursion depth limit |
| Missing WHERE in CTEs | Processes unnecessary data | Filter early in CTEs |
| Over-using window functions | Memory pressure | Limit result set first |
| Not analyzing EXPLAIN output | Slow queries go unnoticed | Always check execution plans |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Slow CTE execution | EXPLAIN ANALYZE | Add MATERIALIZED hint or rewrite |
| High memory usage | Check sort/hash operations | Increase work_mem, optimize query |
| Recursion limit exceeded | Check recursion depth | Add LIMIT, redesign query |
| Window function slow | Check PARTITION BY cardinality | Add indexes on partition columns |
| Query plan changes | Compare EXPLAIN outputs | Update statistics, pin plan |

## Reference Documentation

- [CTEs and Recursive Queries](quick-ref/cte.md)
- [Window Functions](quick-ref/window-functions.md)
- [Recursive Queries](quick-ref/recursive-queries.md)
- [Query Optimization](quick-ref/optimization.md)
