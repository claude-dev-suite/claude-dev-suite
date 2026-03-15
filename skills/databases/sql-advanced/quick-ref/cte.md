# CTE (Common Table Expressions) Quick Reference

## Basic Syntax

```sql
WITH cte_name AS (
    -- Query definition
    SELECT ...
)
SELECT * FROM cte_name;
```

## Single CTE

```sql
-- Simple CTE
WITH regional_sales AS (
    SELECT region, SUM(amount) as total_sales
    FROM orders
    GROUP BY region
)
SELECT region, total_sales
FROM regional_sales
WHERE total_sales > 1000000;
```

## Multiple CTEs

```sql
WITH
-- First CTE
sales_by_region AS (
    SELECT region, SUM(amount) as total
    FROM orders
    GROUP BY region
),
-- Second CTE (can reference first)
top_regions AS (
    SELECT region, total
    FROM sales_by_region
    WHERE total > (SELECT AVG(total) FROM sales_by_region)
)
-- Final query
SELECT * FROM top_regions ORDER BY total DESC;
```

## CTE with INSERT/UPDATE/DELETE

```sql
-- CTE in INSERT
WITH new_data AS (
    SELECT 'John' as name, 'john@example.com' as email
)
INSERT INTO users (name, email)
SELECT name, email FROM new_data;

-- CTE in UPDATE
WITH avg_salary AS (
    SELECT department_id, AVG(salary) as avg_sal
    FROM employees
    GROUP BY department_id
)
UPDATE employees e
SET salary = a.avg_sal * 1.1
FROM avg_salary a
WHERE e.department_id = a.department_id AND e.salary < a.avg_sal;

-- CTE in DELETE (returning deleted rows)
WITH deleted AS (
    DELETE FROM orders
    WHERE created_at < '2020-01-01'
    RETURNING *
)
INSERT INTO orders_archive SELECT * FROM deleted;
```

## Materialized CTEs (PostgreSQL 12+)

```sql
-- Force CTE to be evaluated once and stored
WITH users_cte AS MATERIALIZED (
    SELECT * FROM users WHERE status = 'active'
)
SELECT * FROM users_cte WHERE id = 1
UNION ALL
SELECT * FROM users_cte WHERE id = 2;

-- Force CTE to be inlined (optimized into main query)
WITH users_cte AS NOT MATERIALIZED (
    SELECT * FROM users WHERE status = 'active'
)
SELECT * FROM users_cte WHERE id = 1;
```

## Recursive CTE Syntax

```sql
WITH RECURSIVE cte_name AS (
    -- Base case (anchor member)
    SELECT ... WHERE condition_for_base

    UNION ALL  -- or UNION for distinct

    -- Recursive case (recursive member)
    SELECT ...
    FROM cte_name
    WHERE termination_condition
)
SELECT * FROM cte_name;
```

## Recursive Examples

### Hierarchical Data (Tree)

```sql
-- Employee org chart
WITH RECURSIVE hierarchy AS (
    -- Base: top-level (no manager)
    SELECT id, name, manager_id, 1 as level
    FROM employees
    WHERE manager_id IS NULL

    UNION ALL

    -- Recursive: employees with managers
    SELECT e.id, e.name, e.manager_id, h.level + 1
    FROM employees e
    JOIN hierarchy h ON e.manager_id = h.id
)
SELECT * FROM hierarchy ORDER BY level, name;

-- With path tracking
WITH RECURSIVE hierarchy AS (
    SELECT
        id, name, manager_id,
        name::text as path,
        ARRAY[id] as id_path
    FROM employees WHERE manager_id IS NULL

    UNION ALL

    SELECT
        e.id, e.name, e.manager_id,
        h.path || ' > ' || e.name,
        h.id_path || e.id
    FROM employees e
    JOIN hierarchy h ON e.manager_id = h.id
)
SELECT * FROM hierarchy;
```

### Category Tree with Depth Limit

```sql
WITH RECURSIVE category_tree AS (
    SELECT id, name, parent_id, 0 as depth
    FROM categories
    WHERE parent_id IS NULL

    UNION ALL

    SELECT c.id, c.name, c.parent_id, ct.depth + 1
    FROM categories c
    JOIN category_tree ct ON c.parent_id = ct.id
    WHERE ct.depth < 5  -- Limit depth to prevent infinite loops
)
SELECT * FROM category_tree;
```

### Generate Number Series

```sql
WITH RECURSIVE numbers(n) AS (
    SELECT 1

    UNION ALL

    SELECT n + 1 FROM numbers WHERE n < 100
)
SELECT * FROM numbers;
```

### Generate Date Series

```sql
WITH RECURSIVE dates(d) AS (
    SELECT DATE '2024-01-01'

    UNION ALL

    SELECT d + INTERVAL '1 day'
    FROM dates
    WHERE d < DATE '2024-12-31'
)
SELECT * FROM dates;
```

### Find All Ancestors

```sql
WITH RECURSIVE ancestors AS (
    -- Start with target node
    SELECT id, name, parent_id
    FROM categories
    WHERE id = 42

    UNION ALL

    -- Find parent of current node
    SELECT c.id, c.name, c.parent_id
    FROM categories c
    JOIN ancestors a ON c.id = a.parent_id
)
SELECT * FROM ancestors;
```

### Find All Descendants

```sql
WITH RECURSIVE descendants AS (
    -- Start with target node
    SELECT id, name, parent_id
    FROM categories
    WHERE id = 1

    UNION ALL

    -- Find children of current nodes
    SELECT c.id, c.name, c.parent_id
    FROM categories c
    JOIN descendants d ON c.parent_id = d.id
)
SELECT * FROM descendants;
```

### Graph Traversal

```sql
-- Find all connected nodes
WITH RECURSIVE connected AS (
    -- Start node
    SELECT node_id, ARRAY[node_id] as path
    FROM nodes
    WHERE node_id = 1

    UNION ALL

    -- Connected nodes (prevent cycles with path check)
    SELECT e.to_node, c.path || e.to_node
    FROM edges e
    JOIN connected c ON e.from_node = c.node_id
    WHERE NOT e.to_node = ANY(c.path)  -- Cycle detection
)
SELECT DISTINCT node_id FROM connected;
```

### Shortest Path (BFS)

```sql
WITH RECURSIVE paths AS (
    SELECT
        start_node as current,
        end_node as target,
        ARRAY[start_node] as path,
        1 as distance
    FROM edges
    WHERE start_node = 1

    UNION ALL

    SELECT
        e.end_node,
        p.target,
        p.path || e.end_node,
        p.distance + 1
    FROM edges e
    JOIN paths p ON e.start_node = p.current
    WHERE NOT e.end_node = ANY(p.path)
      AND p.distance < 10  -- Max depth
)
SELECT * FROM paths
WHERE current = 5  -- target node
ORDER BY distance
LIMIT 1;
```

## Performance Tips

### Limit Recursion Depth
```sql
WITH RECURSIVE cte AS (
    SELECT *, 1 as depth FROM ...
    UNION ALL
    SELECT *, depth + 1 FROM cte WHERE depth < 100
)
SELECT * FROM cte;
```

### Use UNION Instead of UNION ALL
```sql
-- UNION removes duplicates (slower but prevents cycles)
WITH RECURSIVE cte AS (
    SELECT ...
    UNION  -- Not UNION ALL
    SELECT ...
)
```

### Index Join Columns
```sql
-- Ensure index on recursive join column
CREATE INDEX idx_categories_parent ON categories(parent_id);
```
