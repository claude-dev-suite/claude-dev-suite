# MySQL Queries Quick Reference

> **Knowledge Base:** Read `knowledge/mysql/queries.md` for complete documentation.

## Basic CRUD

```sql
-- Create
INSERT INTO users (name, email) VALUES ('John', 'john@example.com');
INSERT INTO users (name, email) VALUES
  ('Jane', 'jane@example.com'),
  ('Bob', 'bob@example.com');

-- Read
SELECT * FROM users WHERE age >= 18;
SELECT name, email FROM users WHERE id = 1;

-- Update
UPDATE users SET age = 31 WHERE id = 1;
UPDATE users SET status = 'active' WHERE created_at > '2024-01-01';

-- Delete
DELETE FROM users WHERE id = 1;
DELETE FROM users WHERE status = 'inactive';
```

## Filtering & Sorting

```sql
-- WHERE clauses
SELECT * FROM users WHERE age BETWEEN 18 AND 30;
SELECT * FROM users WHERE name LIKE 'John%';
SELECT * FROM users WHERE email IN ('a@x.com', 'b@x.com');
SELECT * FROM users WHERE phone IS NOT NULL;

-- Sorting
SELECT * FROM users ORDER BY created_at DESC;
SELECT * FROM users ORDER BY last_name ASC, first_name ASC;

-- Pagination
SELECT * FROM users LIMIT 10 OFFSET 20;

-- Distinct
SELECT DISTINCT country FROM users;
```

## Joins

```sql
-- INNER JOIN
SELECT u.name, o.total
FROM users u
INNER JOIN orders o ON u.id = o.user_id;

-- LEFT JOIN
SELECT u.name, COUNT(o.id) as order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id;

-- Multiple joins
SELECT u.name, p.name as product, o.quantity
FROM users u
JOIN orders o ON u.id = o.user_id
JOIN products p ON o.product_id = p.id;
```

## Aggregations

```sql
-- Basic aggregates
SELECT COUNT(*) FROM users;
SELECT SUM(amount), AVG(amount) FROM orders;
SELECT MIN(price), MAX(price) FROM products;

-- GROUP BY
SELECT status, COUNT(*) as count
FROM orders
GROUP BY status;

-- HAVING (filter groups)
SELECT user_id, SUM(amount) as total
FROM orders
GROUP BY user_id
HAVING total > 1000;
```

## Subqueries & CTEs

```sql
-- Subquery
SELECT * FROM users
WHERE id IN (SELECT user_id FROM orders WHERE amount > 100);

-- CTE (Common Table Expression)
WITH active_users AS (
  SELECT * FROM users WHERE status = 'active'
)
SELECT au.name, COUNT(o.id)
FROM active_users au
LEFT JOIN orders o ON au.id = o.user_id
GROUP BY au.id;

-- Recursive CTE
WITH RECURSIVE hierarchy AS (
  SELECT id, name, parent_id, 0 as level
  FROM categories WHERE parent_id IS NULL
  UNION ALL
  SELECT c.id, c.name, c.parent_id, h.level + 1
  FROM categories c
  JOIN hierarchy h ON c.parent_id = h.id
)
SELECT * FROM hierarchy;
```

## Window Functions

```sql
-- Row number
SELECT name, ROW_NUMBER() OVER (ORDER BY created_at) as row_num
FROM users;

-- Ranking
SELECT name, amount,
  RANK() OVER (ORDER BY amount DESC) as rank,
  DENSE_RANK() OVER (ORDER BY amount DESC) as dense_rank
FROM orders;

-- Running total
SELECT date, amount,
  SUM(amount) OVER (ORDER BY date) as running_total
FROM orders;

-- Partition
SELECT department, name, salary,
  AVG(salary) OVER (PARTITION BY department) as dept_avg
FROM employees;
```

**Official docs:** https://dev.mysql.com/doc/refman/8.0/en/sql-statements.html
