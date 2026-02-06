---
name: sqlserver
description: |
  Microsoft SQL Server specific features. Covers data types, indexes,
  partitioning, and SQL Server-specific syntax. Use for SQL Server database work.

  USE WHEN: user mentions "sql server", "mssql", "IDENTITY", "GETDATE()",
  "temporal tables", "columnstore", "SQL Server specifics", "Azure SQL"

  DO NOT USE FOR: T-SQL programming - use `tsql` instead,
  PostgreSQL - use `postgresql` instead, Oracle - use `oracle` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---

# SQL Server Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `sqlserver` for comprehensive documentation.

## Data Types

### Numeric Types

| Type | Description | Range |
|------|-------------|-------|
| `BIT` | Boolean (0/1) | 0, 1, NULL |
| `TINYINT` | 1 byte integer | 0 to 255 |
| `SMALLINT` | 2 byte integer | -32,768 to 32,767 |
| `INT` | 4 byte integer | -2^31 to 2^31-1 |
| `BIGINT` | 8 byte integer | -2^63 to 2^63-1 |
| `DECIMAL(p,s)` | Fixed precision | p: 1-38 digits |
| `NUMERIC(p,s)` | Same as DECIMAL | p: 1-38 digits |
| `FLOAT` | 8 byte float | ~15 digits precision |
| `REAL` | 4 byte float | ~7 digits precision |
| `MONEY` | 8 byte currency | ±922 trillion |
| `SMALLMONEY` | 4 byte currency | ±214,748 |

### String Types

| Type | Description | Max Size |
|------|-------------|----------|
| `CHAR(n)` | Fixed-length | 8,000 bytes |
| `VARCHAR(n)` | Variable-length | 8,000 bytes |
| `VARCHAR(MAX)` | Large variable | 2 GB |
| `NCHAR(n)` | Unicode fixed | 4,000 chars |
| `NVARCHAR(n)` | Unicode variable | 4,000 chars |
| `NVARCHAR(MAX)` | Unicode large | 1 GB |
| `TEXT` | Legacy large (deprecated) | 2 GB |
| `NTEXT` | Legacy Unicode (deprecated) | 1 GB |

### Date/Time Types

| Type | Description | Range |
|------|-------------|-------|
| `DATE` | Date only | 0001-01-01 to 9999-12-31 |
| `TIME(n)` | Time only (n=0-7 precision) | 00:00:00 to 23:59:59 |
| `DATETIME` | Date + time | 1753-01-01 to 9999-12-31 |
| `DATETIME2(n)` | Extended datetime | 0001-01-01 to 9999-12-31 |
| `DATETIMEOFFSET(n)` | With timezone | Same + timezone |
| `SMALLDATETIME` | Less precision | 1900-01-01 to 2079-06-06 |

### Other Types

| Type | Description |
|------|-------------|
| `UNIQUEIDENTIFIER` | 16-byte GUID |
| `BINARY(n)` | Fixed binary |
| `VARBINARY(n)` | Variable binary |
| `VARBINARY(MAX)` | Large binary (2 GB) |
| `XML` | XML data |
| `JSON` | JSON (stored as NVARCHAR) |
| `GEOGRAPHY` | Spatial data |
| `GEOMETRY` | Geometric data |
| `HIERARCHYID` | Hierarchy position |

```sql
CREATE TABLE example (
    id INT IDENTITY(1,1) PRIMARY KEY,
    uuid UNIQUEIDENTIFIER DEFAULT NEWID(),
    name NVARCHAR(100) NOT NULL,
    price DECIMAL(10,2),
    quantity INT DEFAULT 0,
    is_active BIT DEFAULT 1,
    created_at DATETIME2 DEFAULT SYSDATETIME(),
    metadata NVARCHAR(MAX),  -- For JSON
    document VARBINARY(MAX)  -- For files
);
```

## Identity Columns

```sql
-- Auto-increment
CREATE TABLE employees (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100)
);

-- Get last identity
SELECT SCOPE_IDENTITY();      -- Current scope
SELECT @@IDENTITY;            -- Any scope (avoid)
SELECT IDENT_CURRENT('employees');  -- Specific table

-- Insert with identity off
SET IDENTITY_INSERT employees ON;
INSERT INTO employees (id, name) VALUES (100, 'Admin');
SET IDENTITY_INSERT employees OFF;

-- Reseed identity
DBCC CHECKIDENT ('employees', RESEED, 0);
```

## Sequences (2012+)

```sql
-- Create sequence
CREATE SEQUENCE dbo.OrderSeq
    AS INT
    START WITH 1
    INCREMENT BY 1
    MINVALUE 1
    NO MAXVALUE
    NO CYCLE
    CACHE 20;

-- Use sequence
INSERT INTO orders (id, customer_id)
VALUES (NEXT VALUE FOR dbo.OrderSeq, 1);

-- In DEFAULT
ALTER TABLE orders
ADD CONSTRAINT df_order_id DEFAULT (NEXT VALUE FOR dbo.OrderSeq) FOR id;

-- Get current without incrementing
SELECT current_value FROM sys.sequences WHERE name = 'OrderSeq';

-- Reset sequence
ALTER SEQUENCE dbo.OrderSeq RESTART WITH 1;
```

## Date/Time Functions

```sql
-- Current date/time
SELECT GETDATE();           -- DATETIME
SELECT SYSDATETIME();       -- DATETIME2 (more precise)
SELECT GETUTCDATE();        -- UTC datetime
SELECT SYSUTCDATETIME();    -- UTC datetime2
SELECT SYSDATETIMEOFFSET(); -- With timezone

-- Date parts
SELECT YEAR(GETDATE());
SELECT MONTH(GETDATE());
SELECT DAY(GETDATE());
SELECT DATEPART(QUARTER, GETDATE());
SELECT DATENAME(WEEKDAY, GETDATE());  -- 'Monday'

-- Date arithmetic
SELECT DATEADD(DAY, 7, GETDATE());     -- Add 7 days
SELECT DATEADD(MONTH, -1, GETDATE());  -- Subtract 1 month
SELECT DATEDIFF(DAY, '2024-01-01', GETDATE());  -- Days between

-- Format (2012+)
SELECT FORMAT(GETDATE(), 'yyyy-MM-dd');
SELECT FORMAT(GETDATE(), 'dd/MM/yyyy HH:mm:ss');

-- Parse
SELECT CAST('2024-01-15' AS DATE);
SELECT CONVERT(DATETIME, '01/15/2024', 101);  -- US format
SELECT PARSE('15 January 2024' AS DATE);

-- First/last of month
SELECT DATEADD(MONTH, DATEDIFF(MONTH, 0, GETDATE()), 0);  -- First of month
SELECT EOMONTH(GETDATE());  -- Last of month (2012+)
```

## String Functions

```sql
-- Concatenation
SELECT 'Hello' + ' ' + 'World';
SELECT CONCAT('Hello', ' ', 'World');
SELECT CONCAT_WS(' ', 'Hello', 'World', NULL);  -- With separator, ignores NULL

-- Substring
SELECT SUBSTRING('Hello World', 1, 5);  -- 'Hello'
SELECT LEFT('Hello World', 5);          -- 'Hello'
SELECT RIGHT('Hello World', 5);         -- 'World'

-- Length
SELECT LEN('Hello');     -- 5 (chars, trims trailing spaces)
SELECT DATALENGTH('Hello');  -- 5 (bytes)

-- Case
SELECT UPPER('hello');
SELECT LOWER('HELLO');

-- Trim
SELECT TRIM('  hello  ');
SELECT LTRIM('  hello');
SELECT RTRIM('hello  ');
SELECT TRIM('x' FROM 'xxxhelloxxx');  -- 2017+

-- Replace
SELECT REPLACE('hello', 'l', 'L');
SELECT STUFF('Hello World', 7, 5, 'SQL');  -- 'Hello SQL'

-- Position
SELECT CHARINDEX('o', 'Hello World');      -- 5
SELECT CHARINDEX('o', 'Hello World', 6);   -- 8 (start from 6)

-- Padding
SELECT RIGHT('0000000000' + '123', 10);    -- '0000000123'
SELECT FORMAT(123, '0000000000');          -- 2012+

-- Split (2016+)
SELECT value FROM STRING_SPLIT('a,b,c', ',');

-- Aggregate strings (2017+)
SELECT STRING_AGG(name, ', ') FROM employees;
SELECT STRING_AGG(name, ', ') WITHIN GROUP (ORDER BY name) FROM employees;
```

## JSON Support

```sql
-- JSON functions (2016+)
DECLARE @json NVARCHAR(MAX) = '{"name":"John","age":30,"address":{"city":"NYC"}}';

-- Extract values
SELECT JSON_VALUE(@json, '$.name');           -- 'John'
SELECT JSON_VALUE(@json, '$.address.city');   -- 'NYC'
SELECT JSON_QUERY(@json, '$.address');        -- '{"city":"NYC"}'

-- Check if valid JSON
SELECT ISJSON(@json);  -- 1

-- Modify JSON
SELECT JSON_MODIFY(@json, '$.age', 31);
SELECT JSON_MODIFY(@json, '$.email', 'john@example.com');

-- Parse JSON array
DECLARE @arr NVARCHAR(MAX) = '[{"id":1,"name":"A"},{"id":2,"name":"B"}]';
SELECT * FROM OPENJSON(@arr) WITH (id INT, name NVARCHAR(50));

-- Generate JSON
SELECT id, name, email
FROM employees
FOR JSON AUTO;  -- Auto-structure

SELECT id, name, email
FROM employees
FOR JSON PATH, ROOT('employees');  -- Custom structure
```

## Index Types

```sql
-- Clustered index (one per table, defines physical order)
CREATE CLUSTERED INDEX IX_emp_id ON employees(id);

-- Non-clustered index
CREATE NONCLUSTERED INDEX IX_emp_email ON employees(email);

-- Unique index
CREATE UNIQUE INDEX IX_emp_email ON employees(email);

-- Composite index
CREATE INDEX IX_emp_dept_name ON employees(department_id, last_name);

-- Included columns (covering index)
CREATE INDEX IX_emp_email ON employees(email)
INCLUDE (first_name, last_name, phone);

-- Filtered index
CREATE INDEX IX_active_emp ON employees(email)
WHERE is_active = 1;

-- Columnstore index (analytics)
CREATE COLUMNSTORE INDEX IX_sales_cs ON sales(product_id, amount, sale_date);
-- Or clustered columnstore
CREATE CLUSTERED COLUMNSTORE INDEX IX_sales_ccs ON sales;

-- Full-text index
CREATE FULLTEXT CATALOG ft_catalog;
CREATE FULLTEXT INDEX ON documents(content) KEY INDEX PK_documents;
```

## Table Partitioning

```sql
-- 1. Create partition function
CREATE PARTITION FUNCTION pf_sales_date (DATE)
AS RANGE RIGHT FOR VALUES ('2022-01-01', '2023-01-01', '2024-01-01');

-- 2. Create partition scheme
CREATE PARTITION SCHEME ps_sales_date
AS PARTITION pf_sales_date
TO (fg_2021, fg_2022, fg_2023, fg_2024);

-- 3. Create partitioned table
CREATE TABLE sales (
    id INT IDENTITY(1,1),
    sale_date DATE,
    amount DECIMAL(10,2),
    CONSTRAINT PK_sales PRIMARY KEY (id, sale_date)
) ON ps_sales_date(sale_date);

-- View partitions
SELECT
    $PARTITION.pf_sales_date(sale_date) AS partition_number,
    COUNT(*) AS row_count
FROM sales
GROUP BY $PARTITION.pf_sales_date(sale_date);

-- Split partition (add new)
ALTER PARTITION SCHEME ps_sales_date NEXT USED fg_2025;
ALTER PARTITION FUNCTION pf_sales_date() SPLIT RANGE ('2025-01-01');

-- Merge partitions
ALTER PARTITION FUNCTION pf_sales_date() MERGE RANGE ('2022-01-01');

-- Switch partition (instant move)
ALTER TABLE sales SWITCH PARTITION 1 TO sales_archive;
```

## Temporal Tables (2016+)

```sql
-- Create temporal table
CREATE TABLE employees (
    id INT PRIMARY KEY,
    name NVARCHAR(100),
    salary DECIMAL(10,2),
    -- System time columns
    valid_from DATETIME2 GENERATED ALWAYS AS ROW START,
    valid_to DATETIME2 GENERATED ALWAYS AS ROW END,
    PERIOD FOR SYSTEM_TIME (valid_from, valid_to)
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = dbo.employees_history));

-- Query historical data
SELECT * FROM employees FOR SYSTEM_TIME AS OF '2024-01-01';
SELECT * FROM employees FOR SYSTEM_TIME BETWEEN '2024-01-01' AND '2024-06-01';
SELECT * FROM employees FOR SYSTEM_TIME ALL;

-- Disable versioning for maintenance
ALTER TABLE employees SET (SYSTEM_VERSIONING = OFF);
-- ... maintenance ...
ALTER TABLE employees SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = dbo.employees_history));
```

## Common Table Expressions

```sql
-- Basic CTE
;WITH emp_stats AS (
    SELECT department_id, COUNT(*) AS emp_count, AVG(salary) AS avg_salary
    FROM employees
    GROUP BY department_id
)
SELECT d.name, es.emp_count, es.avg_salary
FROM departments d
JOIN emp_stats es ON d.id = es.department_id;

-- Recursive CTE
;WITH hierarchy AS (
    -- Anchor
    SELECT id, name, manager_id, 0 AS level
    FROM employees WHERE manager_id IS NULL
    UNION ALL
    -- Recursive
    SELECT e.id, e.name, e.manager_id, h.level + 1
    FROM employees e
    JOIN hierarchy h ON e.manager_id = h.id
)
SELECT * FROM hierarchy OPTION (MAXRECURSION 100);
```

## Pagination

```sql
-- OFFSET-FETCH (2012+)
SELECT id, name, email
FROM employees
ORDER BY id
OFFSET 20 ROWS
FETCH NEXT 10 ROWS ONLY;

-- With variable
DECLARE @PageNum INT = 3, @PageSize INT = 10;
SELECT id, name, email
FROM employees
ORDER BY id
OFFSET (@PageNum - 1) * @PageSize ROWS
FETCH NEXT @PageSize ROWS ONLY;

-- ROW_NUMBER (older method)
;WITH numbered AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY id) AS rn
    FROM employees
)
SELECT * FROM numbered WHERE rn BETWEEN 21 AND 30;
```

## When NOT to Use This Skill

- **T-SQL programming** - Use `tsql` skill for stored procedures, functions, triggers
- **PostgreSQL** - Use `postgresql` skill for PostgreSQL-specific features
- **Oracle** - Use `oracle` skill for Oracle features
- **Basic SQL** - Use `sql-fundamentals` for ANSI SQL basics

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Not using SET NOCOUNT ON | Network overhead | Add to all stored procedures |
| Using cursors | Slow performance | Use set-based operations |
| Missing clustered index | Heap scans | Add clustered index |
| Not using INCLUDE in indexes | Key lookups | Use covering indexes |
| Using deprecated TEXT/NTEXT | Compatibility issues | Use VARCHAR(MAX)/NVARCHAR(MAX) |
| @@IDENTITY instead of SCOPE_IDENTITY | Wrong identity value | Use SCOPE_IDENTITY() |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Slow queries | `SET STATISTICS IO ON` | Add indexes, check execution plan |
| Blocking | `sp_who2` or Activity Monitor | Kill blocking process, optimize |
| Deadlocks | Extended Events, trace flag 1222 | Consistent access order, shorter transactions |
| Identity issues | `DBCC CHECKIDENT` | Reseed or use SCOPE_IDENTITY |
| TempDB contention | Check wait stats | Add TempDB files, optimize queries |

## Reference Documentation

- [Data Types](quick-ref/datatypes.md)
- [Indexes](quick-ref/indexes.md)
- [Partitioning](quick-ref/partitioning.md)
