# SQL Server Partitioning Quick Reference

## Partitioning Overview

```
Partition Function → Defines boundaries
         ↓
Partition Scheme → Maps to filegroups
         ↓
Partitioned Table/Index → Uses scheme
```

## Create Partition Function

```sql
-- RANGE LEFT: boundary values go to left partition
CREATE PARTITION FUNCTION pf_date_left (DATE)
AS RANGE LEFT FOR VALUES ('2022-12-31', '2023-12-31', '2024-12-31');
-- Partition 1: <= 2022-12-31
-- Partition 2: > 2022-12-31 AND <= 2023-12-31
-- Partition 3: > 2023-12-31 AND <= 2024-12-31
-- Partition 4: > 2024-12-31

-- RANGE RIGHT: boundary values go to right partition
CREATE PARTITION FUNCTION pf_date_right (DATE)
AS RANGE RIGHT FOR VALUES ('2023-01-01', '2024-01-01', '2025-01-01');
-- Partition 1: < 2023-01-01
-- Partition 2: >= 2023-01-01 AND < 2024-01-01
-- Partition 3: >= 2024-01-01 AND < 2025-01-01
-- Partition 4: >= 2025-01-01
```

## Create Partition Scheme

```sql
-- Map partitions to filegroups
CREATE PARTITION SCHEME ps_date
AS PARTITION pf_date_right
TO (fg_2022, fg_2023, fg_2024, fg_future);

-- All to same filegroup
CREATE PARTITION SCHEME ps_date
AS PARTITION pf_date_right
ALL TO ([PRIMARY]);
```

## Create Partitioned Table

```sql
-- Table with partitioning
CREATE TABLE sales (
    id INT IDENTITY(1,1),
    sale_date DATE NOT NULL,
    customer_id INT,
    amount DECIMAL(10,2),
    CONSTRAINT PK_sales PRIMARY KEY (id, sale_date)  -- Must include partition column
) ON ps_date(sale_date);

-- Clustered index follows partitioning by default
-- Non-clustered can be aligned or non-aligned

-- Aligned index (same partitioning)
CREATE INDEX IX_sales_customer ON sales(customer_id)
ON ps_date(sale_date);

-- Non-aligned index (not recommended usually)
CREATE INDEX IX_sales_customer ON sales(customer_id)
ON [PRIMARY];
```

## Query Partitions

```sql
-- Find which partition a value belongs to
SELECT $PARTITION.pf_date_right('2024-06-15');

-- Count rows per partition
SELECT
    p.partition_number,
    p.rows
FROM sys.partitions p
WHERE p.object_id = OBJECT_ID('sales')
AND p.index_id IN (0, 1);  -- Heap or clustered

-- Query specific partition
SELECT * FROM sales
WHERE $PARTITION.pf_date_right(sale_date) = 3;

-- Partition elimination (automatic with predicate)
SELECT * FROM sales
WHERE sale_date >= '2024-01-01' AND sale_date < '2025-01-01';
-- Only reads partition 3
```

## Add New Partition

```sql
-- 1. Specify next filegroup
ALTER PARTITION SCHEME ps_date
NEXT USED fg_2025;

-- 2. Split the rightmost partition
ALTER PARTITION FUNCTION pf_date_right()
SPLIT RANGE ('2026-01-01');

-- Result: New partition for 2025 data
```

## Merge Partitions

```sql
-- Combine two partitions
ALTER PARTITION FUNCTION pf_date_right()
MERGE RANGE ('2023-01-01');

-- Removes boundary, merges partitions
```

## Switch Partition (Instant)

```sql
-- Move partition to archive table
CREATE TABLE sales_2022 (
    -- Same structure as sales
    id INT,
    sale_date DATE NOT NULL,
    customer_id INT,
    amount DECIMAL(10,2)
) ON fg_2022;

-- Switch (instant, metadata-only)
ALTER TABLE sales SWITCH PARTITION 1 TO sales_2022;

-- Requirements:
-- - Same structure (columns, types, nullability)
-- - Same indexes and constraints
-- - Target must be empty (unless switching in)
-- - Same filegroup

-- Switch in (load data instantly)
ALTER TABLE sales_staging SWITCH TO sales PARTITION 3;
```

## Truncate Partition (2016+)

```sql
-- Delete all data from specific partition
TRUNCATE TABLE sales WITH (PARTITIONS (1));

-- Multiple partitions
TRUNCATE TABLE sales WITH (PARTITIONS (1, 2, 3));

-- Range
TRUNCATE TABLE sales WITH (PARTITIONS (1 TO 3));
```

## Sliding Window Pattern

```sql
-- Maintain N partitions (e.g., rolling 3 years)

-- 1. Create staging table for old data
CREATE TABLE sales_archive (...) ON fg_archive;

-- 2. Switch out oldest partition
ALTER TABLE sales SWITCH PARTITION 1 TO sales_archive;

-- 3. Merge the now-empty partition
ALTER PARTITION FUNCTION pf_date_right() MERGE RANGE ('2022-01-01');

-- 4. Add new partition for next year
ALTER PARTITION SCHEME ps_date NEXT USED fg_2026;
ALTER PARTITION FUNCTION pf_date_right() SPLIT RANGE ('2027-01-01');
```

## Partition Metadata

```sql
-- View partition function
SELECT
    pf.name AS function_name,
    pf.type_desc,
    prv.boundary_id,
    prv.value
FROM sys.partition_functions pf
JOIN sys.partition_range_values prv ON pf.function_id = prv.function_id
ORDER BY prv.boundary_id;

-- View partition scheme
SELECT
    ps.name AS scheme_name,
    pf.name AS function_name,
    fg.name AS filegroup_name,
    dds.destination_id
FROM sys.partition_schemes ps
JOIN sys.partition_functions pf ON ps.function_id = pf.function_id
JOIN sys.destination_data_spaces dds ON ps.data_space_id = dds.partition_scheme_id
JOIN sys.filegroups fg ON dds.data_space_id = fg.data_space_id
ORDER BY dds.destination_id;

-- View table partitions with row counts
SELECT
    OBJECT_NAME(p.object_id) AS table_name,
    p.partition_number,
    p.rows,
    prv.value AS boundary_value
FROM sys.partitions p
JOIN sys.indexes i ON p.object_id = i.object_id AND p.index_id = i.index_id
LEFT JOIN sys.partition_schemes ps ON i.data_space_id = ps.data_space_id
LEFT JOIN sys.partition_functions pf ON ps.function_id = pf.function_id
LEFT JOIN sys.partition_range_values prv ON pf.function_id = prv.function_id
    AND p.partition_number = prv.boundary_id + 1
WHERE i.index_id IN (0, 1)
AND OBJECT_NAME(p.object_id) = 'sales'
ORDER BY p.partition_number;
```

## Index Partitioning

```sql
-- Aligned index (recommended)
CREATE INDEX IX_sales_customer ON sales(customer_id)
ON ps_date(sale_date);  -- Same scheme

-- Non-aligned index
CREATE INDEX IX_sales_amount ON sales(amount)
ON [PRIMARY];  -- Different storage

-- Rebuild single partition
ALTER INDEX IX_sales_customer ON sales
REBUILD PARTITION = 3;
```

## Best Practices

1. **Choose right boundary** - RANGE RIGHT for date partitioning
2. **Include partition column in PK** - Required for uniqueness
3. **Use aligned indexes** - Better partition elimination
4. **Plan for growth** - Pre-create future partitions
5. **Switch for bulk operations** - Instant load/archive
6. **Monitor partition sizes** - Keep relatively even
