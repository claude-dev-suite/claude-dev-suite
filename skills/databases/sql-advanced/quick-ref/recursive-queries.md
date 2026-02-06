# Recursive Queries Quick Reference

## Basic Structure

```sql
WITH RECURSIVE cte_name AS (
    -- Anchor member (base case)
    SELECT columns
    FROM table
    WHERE base_condition

    UNION ALL  -- or UNION (removes duplicates)

    -- Recursive member
    SELECT columns
    FROM table
    JOIN cte_name ON recursive_condition
    WHERE termination_condition
)
SELECT * FROM cte_name;
```

## Organizational Hierarchy

### Basic Org Chart

```sql
WITH RECURSIVE org_chart AS (
    -- Root: employees without managers (CEO, etc.)
    SELECT id, name, manager_id, 1 as level
    FROM employees
    WHERE manager_id IS NULL

    UNION ALL

    -- Recursive: find reports
    SELECT e.id, e.name, e.manager_id, oc.level + 1
    FROM employees e
    INNER JOIN org_chart oc ON e.manager_id = oc.id
)
SELECT
    REPEAT('  ', level - 1) || name as org_tree,
    level
FROM org_chart
ORDER BY level, name;
```

### With Path and Cycle Detection

```sql
WITH RECURSIVE org_chart AS (
    SELECT
        id,
        name,
        manager_id,
        1 as level,
        ARRAY[id] as path,
        false as cycle
    FROM employees
    WHERE manager_id IS NULL

    UNION ALL

    SELECT
        e.id,
        e.name,
        e.manager_id,
        oc.level + 1,
        oc.path || e.id,
        e.id = ANY(oc.path) as cycle
    FROM employees e
    INNER JOIN org_chart oc ON e.manager_id = oc.id
    WHERE NOT oc.cycle
)
SELECT * FROM org_chart WHERE NOT cycle;
```

### Find All Reports (Direct + Indirect)

```sql
WITH RECURSIVE all_reports AS (
    -- Direct reports
    SELECT id, name, manager_id
    FROM employees
    WHERE manager_id = 1  -- Manager ID

    UNION ALL

    -- Indirect reports
    SELECT e.id, e.name, e.manager_id
    FROM employees e
    INNER JOIN all_reports ar ON e.manager_id = ar.id
)
SELECT * FROM all_reports;
```

### Find All Managers (Path to Root)

```sql
WITH RECURSIVE management_chain AS (
    -- Start with employee
    SELECT id, name, manager_id, 1 as level
    FROM employees
    WHERE id = 42  -- Employee ID

    UNION ALL

    -- Find manager of current
    SELECT e.id, e.name, e.manager_id, mc.level + 1
    FROM employees e
    INNER JOIN management_chain mc ON e.id = mc.manager_id
)
SELECT * FROM management_chain ORDER BY level;
```

## Category/Menu Trees

### Full Category Tree

```sql
WITH RECURSIVE category_tree AS (
    SELECT id, name, parent_id, name::text as path
    FROM categories
    WHERE parent_id IS NULL

    UNION ALL

    SELECT c.id, c.name, c.parent_id, ct.path || ' > ' || c.name
    FROM categories c
    INNER JOIN category_tree ct ON c.parent_id = ct.id
)
SELECT * FROM category_tree ORDER BY path;
```

### Subtree from Node

```sql
WITH RECURSIVE subtree AS (
    SELECT id, name, parent_id
    FROM categories
    WHERE id = 5  -- Root of subtree

    UNION ALL

    SELECT c.id, c.name, c.parent_id
    FROM categories c
    INNER JOIN subtree st ON c.parent_id = st.id
)
SELECT * FROM subtree;
```

### Breadcrumb Path

```sql
WITH RECURSIVE breadcrumb AS (
    SELECT id, name, parent_id, ARRAY[name] as path
    FROM categories
    WHERE id = 42  -- Current category

    UNION ALL

    SELECT c.id, c.name, c.parent_id, c.name || b.path
    FROM categories c
    INNER JOIN breadcrumb b ON c.id = b.parent_id
)
SELECT array_to_string(path, ' > ') as breadcrumb
FROM breadcrumb
WHERE parent_id IS NULL;
```

## Graph Traversal

### All Connected Nodes

```sql
WITH RECURSIVE connected AS (
    SELECT node_id, ARRAY[node_id] as visited
    FROM nodes
    WHERE node_id = 1

    UNION ALL

    SELECT
        CASE WHEN e.from_node = c.node_id THEN e.to_node ELSE e.from_node END,
        c.visited || CASE WHEN e.from_node = c.node_id THEN e.to_node ELSE e.from_node END
    FROM edges e
    INNER JOIN connected c ON e.from_node = c.node_id OR e.to_node = c.node_id
    WHERE NOT (
        CASE WHEN e.from_node = c.node_id THEN e.to_node ELSE e.from_node END
    ) = ANY(c.visited)
)
SELECT DISTINCT node_id FROM connected;
```

### Shortest Path (Unweighted)

```sql
WITH RECURSIVE paths AS (
    SELECT
        1 as current_node,           -- Start node
        ARRAY[1] as path,
        1 as length
    WHERE 1 = 1

    UNION ALL

    SELECT
        e.to_node,
        p.path || e.to_node,
        p.length + 1
    FROM edges e
    INNER JOIN paths p ON e.from_node = p.current_node
    WHERE NOT e.to_node = ANY(p.path)
      AND p.length < 20  -- Max depth
)
SELECT path, length
FROM paths
WHERE current_node = 5  -- Target node
ORDER BY length
LIMIT 1;
```

### All Paths Between Two Nodes

```sql
WITH RECURSIVE all_paths AS (
    SELECT
        1 as current_node,
        5 as target_node,
        ARRAY[1] as path,
        false as reached
    WHERE 1 = 1

    UNION ALL

    SELECT
        e.to_node,
        ap.target_node,
        ap.path || e.to_node,
        e.to_node = ap.target_node
    FROM edges e
    INNER JOIN all_paths ap ON e.from_node = ap.current_node
    WHERE NOT e.to_node = ANY(ap.path)
      AND NOT ap.reached
      AND array_length(ap.path, 1) < 10
)
SELECT path
FROM all_paths
WHERE reached;
```

## Sequence Generation

### Number Series

```sql
WITH RECURSIVE numbers(n) AS (
    SELECT 1
    UNION ALL
    SELECT n + 1 FROM numbers WHERE n < 100
)
SELECT * FROM numbers;

-- Alternative: generate_series (PostgreSQL)
SELECT generate_series(1, 100);
```

### Date Series

```sql
WITH RECURSIVE dates(d) AS (
    SELECT DATE '2024-01-01'
    UNION ALL
    SELECT d + INTERVAL '1 day' FROM dates WHERE d < DATE '2024-12-31'
)
SELECT * FROM dates;

-- Alternative: generate_series (PostgreSQL)
SELECT generate_series('2024-01-01'::date, '2024-12-31', '1 day')::date;
```

### Working Days Only

```sql
WITH RECURSIVE work_days(d) AS (
    SELECT DATE '2024-01-01'
    UNION ALL
    SELECT
        CASE EXTRACT(DOW FROM d + 1)
            WHEN 6 THEN d + 3  -- Saturday -> Monday
            WHEN 0 THEN d + 1  -- Sunday -> Monday (shouldn't happen)
            ELSE d + 1
        END
    FROM work_days
    WHERE d < DATE '2024-12-31'
)
SELECT * FROM work_days
WHERE EXTRACT(DOW FROM d) NOT IN (0, 6);  -- Extra filter for edge cases
```

## Bill of Materials (BOM)

### Explode BOM

```sql
WITH RECURSIVE bom_explosion AS (
    -- Top-level product
    SELECT
        product_id,
        component_id,
        quantity,
        1 as level
    FROM bill_of_materials
    WHERE product_id = 1

    UNION ALL

    -- Components of components
    SELECT
        bom.product_id,
        bom.component_id,
        bom.quantity * be.quantity as quantity,
        be.level + 1
    FROM bill_of_materials bom
    INNER JOIN bom_explosion be ON bom.product_id = be.component_id
    WHERE be.level < 10
)
SELECT
    component_id,
    SUM(quantity) as total_quantity
FROM bom_explosion
GROUP BY component_id;
```

## Performance Tips

### Always Set Depth Limit

```sql
WITH RECURSIVE cte AS (
    SELECT *, 1 as depth FROM ...
    UNION ALL
    SELECT *, depth + 1 FROM cte WHERE depth < 100  -- Prevent infinite loops
)
```

### Use UNION for Cycle Prevention

```sql
-- UNION removes duplicates, preventing cycles
WITH RECURSIVE cte AS (
    SELECT id FROM nodes WHERE id = 1
    UNION  -- Not UNION ALL
    SELECT n.id FROM nodes n JOIN cte c ON n.parent_id = c.id
)
```

### Index Recursive Join Columns

```sql
CREATE INDEX idx_employees_manager ON employees(manager_id);
CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_edges_from_to ON edges(from_node, to_node);
```

### Materialize Intermediate Results

```sql
WITH RECURSIVE large_tree AS MATERIALIZED (
    SELECT ... UNION ALL SELECT ...
)
SELECT * FROM large_tree WHERE condition;
```
