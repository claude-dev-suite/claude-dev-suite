# JOIN Quick Reference

## Join Types Visual

```
INNER JOIN:     A ∩ B       (only matching rows)
LEFT JOIN:      A           (all A + matching B)
RIGHT JOIN:         B       (matching A + all B)
FULL OUTER:     A ∪ B       (all rows from both)
CROSS JOIN:     A × B       (cartesian product)
```

## INNER JOIN

Returns only rows with matches in both tables.

```sql
-- Explicit INNER JOIN (preferred)
SELECT u.name, o.total
FROM users u
INNER JOIN orders o ON o.user_id = u.id;

-- With multiple conditions
SELECT u.name, o.total
FROM users u
INNER JOIN orders o ON o.user_id = u.id AND o.status = 'completed';

-- Multiple tables
SELECT u.name, o.id as order_id, p.name as product
FROM users u
INNER JOIN orders o ON o.user_id = u.id
INNER JOIN order_items oi ON oi.order_id = o.id
INNER JOIN products p ON p.id = oi.product_id;
```

## LEFT JOIN (LEFT OUTER JOIN)

Returns all rows from left table, with matching rows from right (or NULL).

```sql
-- Include users even without orders
SELECT u.name, COALESCE(COUNT(o.id), 0) as order_count
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id, u.name;

-- Find users WITHOUT orders
SELECT u.name
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE o.id IS NULL;

-- Multiple LEFT JOINs
SELECT u.name, o.id, p.name as product
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
LEFT JOIN order_items oi ON oi.order_id = o.id
LEFT JOIN products p ON p.id = oi.product_id;
```

## RIGHT JOIN (RIGHT OUTER JOIN)

Returns all rows from right table, with matching rows from left (or NULL).

```sql
-- Include all orders, even orphaned ones
SELECT u.name, o.id as order_id
FROM users u
RIGHT JOIN orders o ON o.user_id = u.id;

-- Note: RIGHT JOIN can always be rewritten as LEFT JOIN
-- This is equivalent:
SELECT u.name, o.id as order_id
FROM orders o
LEFT JOIN users u ON o.user_id = u.id;
```

## FULL OUTER JOIN

Returns all rows from both tables, with NULLs where no match.

```sql
-- All users and all orders, matched where possible
SELECT u.name, o.id as order_id
FROM users u
FULL OUTER JOIN orders o ON o.user_id = u.id;

-- Find unmatched rows from either side
SELECT u.name, o.id
FROM users u
FULL OUTER JOIN orders o ON o.user_id = u.id
WHERE u.id IS NULL OR o.id IS NULL;

-- MySQL doesn't support FULL OUTER JOIN, use UNION:
SELECT u.name, o.id FROM users u LEFT JOIN orders o ON o.user_id = u.id
UNION
SELECT u.name, o.id FROM users u RIGHT JOIN orders o ON o.user_id = u.id;
```

## CROSS JOIN

Returns cartesian product (all possible combinations).

```sql
-- Every user paired with every product
SELECT u.name, p.name as product
FROM users u
CROSS JOIN products p;

-- Equivalent to:
SELECT u.name, p.name FROM users u, products p;

-- Practical use: Generate date series with products
SELECT d.date, p.id as product_id, 0 as sales
FROM generate_series('2024-01-01'::date, '2024-12-31', '1 day') d(date)
CROSS JOIN products p;
```

## SELF JOIN

Join a table to itself.

```sql
-- Employees with their managers
SELECT e.name as employee, m.name as manager
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.id;

-- Find duplicate emails
SELECT a.id, b.id, a.email
FROM users a
INNER JOIN users b ON a.email = b.email AND a.id < b.id;

-- Hierarchical data traversal
SELECT child.name, parent.name as parent_name
FROM categories child
LEFT JOIN categories parent ON child.parent_id = parent.id;
```

## NATURAL JOIN

Automatically joins on columns with same name (avoid in production).

```sql
-- Joins on all columns with matching names
SELECT * FROM orders NATURAL JOIN customers;

-- Equivalent to:
SELECT * FROM orders o
JOIN customers c ON o.customer_id = c.customer_id;
```

## USING Clause

Shorthand when join columns have same name.

```sql
-- When both tables have 'user_id' column
SELECT u.name, o.total
FROM users u
JOIN orders o USING (user_id);

-- Multiple columns
SELECT * FROM order_items
JOIN inventory USING (product_id, warehouse_id);
```

## Join with Subquery

```sql
-- Join with aggregated data
SELECT u.name, stats.order_count, stats.total_spent
FROM users u
LEFT JOIN (
    SELECT user_id, COUNT(*) as order_count, SUM(total) as total_spent
    FROM orders
    GROUP BY user_id
) stats ON stats.user_id = u.id;

-- Join with filtered subquery
SELECT u.name, recent_orders.count
FROM users u
JOIN (
    SELECT user_id, COUNT(*) as count
    FROM orders
    WHERE created_at > CURRENT_DATE - INTERVAL '30 days'
    GROUP BY user_id
) recent_orders ON recent_orders.user_id = u.id;
```

## LATERAL JOIN (PostgreSQL, MySQL 8+)

Subquery can reference columns from preceding tables.

```sql
-- Get top 3 orders for each user
SELECT u.name, top_orders.*
FROM users u
LEFT JOIN LATERAL (
    SELECT o.id, o.total, o.created_at
    FROM orders o
    WHERE o.user_id = u.id
    ORDER BY o.total DESC
    LIMIT 3
) top_orders ON true;

-- With aggregation
SELECT u.name, stats.total, stats.avg_order
FROM users u
CROSS JOIN LATERAL (
    SELECT SUM(total) as total, AVG(total) as avg_order
    FROM orders WHERE user_id = u.id
) stats;
```

## Performance Tips

### Use Appropriate Join Type
```sql
-- If you only need matching rows, use INNER JOIN
-- It's faster than LEFT JOIN with WHERE clause:

-- Slower
SELECT * FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE o.id IS NOT NULL;

-- Faster
SELECT * FROM users u
INNER JOIN orders o ON o.user_id = u.id;
```

### Index Join Columns
```sql
-- Ensure indexes exist on join columns
CREATE INDEX idx_orders_user_id ON orders(user_id);
```

### Avoid Functions in Join Conditions
```sql
-- Bad (can't use index)
SELECT * FROM users u
JOIN orders o ON LOWER(o.user_email) = LOWER(u.email);

-- Better (use expression index or normalize data)
CREATE INDEX idx_orders_email_lower ON orders(LOWER(user_email));
```

### Limit Rows Before Join
```sql
-- Filter early to reduce join work
SELECT u.name, o.total
FROM users u
JOIN (SELECT * FROM orders WHERE status = 'completed') o ON o.user_id = u.id
WHERE u.status = 'active';
```
