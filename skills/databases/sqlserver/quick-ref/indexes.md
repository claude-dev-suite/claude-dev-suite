# SQL Server Indexes Quick Reference

## Index Types

| Type | Description | Use Case |
|------|-------------|----------|
| Clustered | Physical row order | Primary key, range queries |
| Non-clustered | Separate structure | Secondary lookups |
| Unique | No duplicates | Constraints |
| Columnstore | Column-based storage | Analytics, warehousing |
| Full-text | Text searching | Document search |
| Spatial | Geographic data | Location queries |
| Filtered | Partial index | Subset of rows |
| Covering | Includes all columns | Avoid table lookups |

## Clustered Index

```sql
-- One per table, defines physical order
CREATE CLUSTERED INDEX IX_emp_id ON employees(id);

-- Usually the primary key
ALTER TABLE employees ADD CONSTRAINT PK_employees PRIMARY KEY CLUSTERED (id);

-- Composite clustered
CREATE CLUSTERED INDEX IX_orders ON orders(customer_id, order_date);
```

## Non-Clustered Index

```sql
-- Basic
CREATE NONCLUSTERED INDEX IX_emp_email ON employees(email);

-- Unique
CREATE UNIQUE NONCLUSTERED INDEX IX_emp_email ON employees(email);

-- Composite (column order matters!)
CREATE INDEX IX_emp_dept_name ON employees(department_id, last_name);

-- Descending
CREATE INDEX IX_orders_date ON orders(order_date DESC);
```

## Covering Index (INCLUDE)

```sql
-- Include columns not in search but needed in SELECT
CREATE INDEX IX_emp_email ON employees(email)
INCLUDE (first_name, last_name, phone);

-- Query uses index only (no table lookup)
SELECT first_name, last_name, phone
FROM employees
WHERE email = 'john@example.com';
```

## Filtered Index

```sql
-- Index only specific rows
CREATE INDEX IX_active_emp ON employees(email)
WHERE is_active = 1;

-- For nullable column (only non-null)
CREATE INDEX IX_emp_manager ON employees(manager_id)
WHERE manager_id IS NOT NULL;

-- For specific values
CREATE INDEX IX_pending_orders ON orders(customer_id, order_date)
WHERE status = 'PENDING';
```

## Columnstore Index

```sql
-- Clustered columnstore (table becomes columnstore)
CREATE CLUSTERED COLUMNSTORE INDEX IX_sales_ccs ON sales;

-- Non-clustered columnstore
CREATE NONCLUSTERED COLUMNSTORE INDEX IX_sales_ncs ON sales
(product_id, sale_date, amount, quantity);

-- With filtered
CREATE NONCLUSTERED COLUMNSTORE INDEX IX_sales_2024 ON sales
(product_id, amount)
WHERE sale_date >= '2024-01-01';
```

## Full-Text Index

```sql
-- 1. Create full-text catalog
CREATE FULLTEXT CATALOG ft_catalog AS DEFAULT;

-- 2. Create full-text index
CREATE FULLTEXT INDEX ON documents(content)
KEY INDEX PK_documents
ON ft_catalog
WITH CHANGE_TRACKING AUTO;

-- 3. Query
SELECT * FROM documents
WHERE CONTAINS(content, 'database');

SELECT * FROM documents
WHERE FREETEXT(content, 'database management');

SELECT * FROM documents
WHERE CONTAINS(content, '"SQL Server" NEAR performance');
```

## Index Options

```sql
CREATE INDEX IX_example ON table_name(column)
WITH (
    FILLFACTOR = 80,           -- Leave 20% free space
    PAD_INDEX = ON,            -- Apply fillfactor to intermediate pages
    SORT_IN_TEMPDB = ON,       -- Use tempdb for sorting
    ONLINE = ON,               -- Allow queries during creation (Enterprise)
    DATA_COMPRESSION = PAGE,   -- PAGE or ROW compression
    MAXDOP = 4,                -- Parallel threads
    DROP_EXISTING = ON         -- Replace existing index
);
```

## Index Maintenance

```sql
-- Rebuild (fully recreates)
ALTER INDEX IX_emp_email ON employees REBUILD;

-- Rebuild all indexes on table
ALTER INDEX ALL ON employees REBUILD;

-- Rebuild with options
ALTER INDEX IX_emp_email ON employees REBUILD
WITH (ONLINE = ON, FILLFACTOR = 90);

-- Reorganize (defragment, less intensive)
ALTER INDEX IX_emp_email ON employees REORGANIZE;

-- Update statistics
UPDATE STATISTICS employees IX_emp_email;
UPDATE STATISTICS employees;  -- All indexes

-- Check fragmentation
SELECT
    index_id,
    avg_fragmentation_in_percent,
    page_count
FROM sys.dm_db_index_physical_stats(
    DB_ID(), OBJECT_ID('employees'), NULL, NULL, 'LIMITED'
);

-- Rule of thumb:
-- > 5% fragmentation: REORGANIZE
-- > 30% fragmentation: REBUILD
```

## Index Usage Stats

```sql
-- Which indexes are used
SELECT
    OBJECT_NAME(i.object_id) AS table_name,
    i.name AS index_name,
    s.user_seeks,
    s.user_scans,
    s.user_lookups,
    s.user_updates
FROM sys.indexes i
LEFT JOIN sys.dm_db_index_usage_stats s
    ON i.object_id = s.object_id AND i.index_id = s.index_id
WHERE OBJECTPROPERTY(i.object_id, 'IsUserTable') = 1
ORDER BY s.user_seeks + s.user_scans DESC;

-- Missing index recommendations
SELECT
    mid.statement AS table_name,
    mid.equality_columns,
    mid.inequality_columns,
    mid.included_columns,
    migs.user_seeks,
    migs.avg_user_impact
FROM sys.dm_db_missing_index_details mid
JOIN sys.dm_db_missing_index_groups mig ON mid.index_handle = mig.index_handle
JOIN sys.dm_db_missing_index_group_stats migs ON mig.index_group_handle = migs.group_handle
ORDER BY migs.avg_user_impact * migs.user_seeks DESC;
```

## Disable/Enable Index

```sql
-- Disable (stops maintenance, queries use other paths)
ALTER INDEX IX_emp_email ON employees DISABLE;

-- Enable (must rebuild)
ALTER INDEX IX_emp_email ON employees REBUILD;
```

## Drop Index

```sql
DROP INDEX IX_emp_email ON employees;

-- If exists
DROP INDEX IF EXISTS IX_emp_email ON employees;

-- Primary key constraint
ALTER TABLE employees DROP CONSTRAINT PK_employees;
```

## Index Design Guidelines

### DO
- Clustered index on frequently queried unique column
- Index columns used in WHERE, JOIN, ORDER BY
- Use INCLUDE for covering indexes
- Filtered indexes for common query patterns
- Columnstore for analytics/warehousing

### DON'T
- Over-index (impacts INSERT/UPDATE/DELETE)
- Index on frequently updated columns
- Low selectivity columns (status flags)
- Wide composite keys (>5 columns)
- Redundant indexes

### Column Order Matters

```sql
-- Index on (A, B, C) supports:
WHERE A = ?
WHERE A = ? AND B = ?
WHERE A = ? AND B = ? AND C = ?
ORDER BY A
ORDER BY A, B
ORDER BY A, B, C

-- Does NOT efficiently support:
WHERE B = ?           -- Must scan
WHERE C = ?           -- Must scan
WHERE A = ? AND C = ? -- Partial use
ORDER BY B            -- Must sort
```
