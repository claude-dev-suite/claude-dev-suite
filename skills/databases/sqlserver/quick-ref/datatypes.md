# SQL Server Data Types Quick Reference

## Numeric Types

| Type | Bytes | Range | Use Case |
|------|-------|-------|----------|
| `BIT` | 1* | 0, 1, NULL | Booleans |
| `TINYINT` | 1 | 0 to 255 | Small positive numbers |
| `SMALLINT` | 2 | -32,768 to 32,767 | Small integers |
| `INT` | 4 | ±2.1 billion | Most integers |
| `BIGINT` | 8 | ±9.2 quintillion | Large integers |
| `DECIMAL(p,s)` | 5-17 | 10^38 | Exact numerics |
| `MONEY` | 8 | ±922 trillion | Currency |
| `SMALLMONEY` | 4 | ±214,748 | Small currency |
| `FLOAT` | 8 | ±1.79E+308 | Scientific data |
| `REAL` | 4 | ±3.4E+38 | Less precision float |

*Multiple BIT columns packed into bytes

```sql
-- Best practices
salary DECIMAL(10,2)      -- Currency: exact precision
quantity INT              -- Counts: integer
percentage DECIMAL(5,2)   -- 0.00 to 100.00
latitude FLOAT            -- Geographic coordinates
is_active BIT             -- Boolean flag
```

## String Types

| Type | Max Size | Storage | Unicode |
|------|----------|---------|---------|
| `CHAR(n)` | 8,000 | Fixed | No |
| `VARCHAR(n)` | 8,000 | Variable | No |
| `VARCHAR(MAX)` | 2 GB | Variable | No |
| `NCHAR(n)` | 4,000 | Fixed | Yes |
| `NVARCHAR(n)` | 4,000 | Variable | Yes |
| `NVARCHAR(MAX)` | 1 GB | Variable | Yes |

```sql
-- Best practices
code CHAR(10)             -- Fixed-length codes
name NVARCHAR(100)        -- Unicode names
description NVARCHAR(MAX) -- Large text
email VARCHAR(255)        -- ASCII-only data

-- Avoid deprecated types
-- TEXT → VARCHAR(MAX)
-- NTEXT → NVARCHAR(MAX)
```

## Date/Time Types

| Type | Range | Precision | Bytes |
|------|-------|-----------|-------|
| `DATE` | 0001-9999 | 1 day | 3 |
| `TIME(n)` | 00:00-23:59 | 100ns | 3-5 |
| `DATETIME` | 1753-9999 | 3.33ms | 8 |
| `DATETIME2(n)` | 0001-9999 | 100ns | 6-8 |
| `DATETIMEOFFSET(n)` | 0001-9999 | 100ns + TZ | 8-10 |
| `SMALLDATETIME` | 1900-2079 | 1 minute | 4 |

```sql
-- Best practices
created_at DATETIME2(0)       -- No fractional seconds
event_time DATETIME2(3)       -- Milliseconds
precise_time DATETIME2(7)     -- Maximum precision
appointment_date DATE         -- Date only
meeting_time TIME(0)          -- Time only
global_timestamp DATETIMEOFFSET(0)  -- With timezone
```

## Binary Types

| Type | Max Size | Description |
|------|----------|-------------|
| `BINARY(n)` | 8,000 | Fixed-length |
| `VARBINARY(n)` | 8,000 | Variable-length |
| `VARBINARY(MAX)` | 2 GB | Large binary |

```sql
-- Best practices
hash BINARY(32)              -- SHA-256 hash
thumbnail VARBINARY(8000)    -- Small images
document VARBINARY(MAX)      -- Files
```

## Special Types

```sql
-- UNIQUEIDENTIFIER (GUID)
id UNIQUEIDENTIFIER DEFAULT NEWID()
-- Or sequential (better for clustered index)
id UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID()

-- XML
data XML
data XML(SchemaCollection)  -- With schema validation

-- GEOGRAPHY (spatial)
location GEOGRAPHY
-- Insert
INSERT INTO places VALUES (geography::Point(40.7128, -74.0060, 4326))

-- GEOMETRY
shape GEOMETRY

-- HIERARCHYID
org_node HIERARCHYID
```

## Type Conversion

```sql
-- CAST (ANSI standard)
SELECT CAST('123' AS INT);
SELECT CAST(GETDATE() AS DATE);
SELECT CAST(123.456 AS DECIMAL(10,2));

-- CONVERT (SQL Server specific, with styles)
SELECT CONVERT(VARCHAR, GETDATE(), 120);  -- 'yyyy-mm-dd hh:mi:ss'
SELECT CONVERT(INT, '123');

-- TRY_CAST / TRY_CONVERT (returns NULL on failure)
SELECT TRY_CAST('abc' AS INT);  -- NULL
SELECT TRY_CONVERT(DATE, 'invalid');  -- NULL

-- PARSE / TRY_PARSE (culture-aware)
SELECT PARSE('01/15/2024' AS DATE USING 'en-US');
SELECT TRY_PARSE('invalid' AS DATE);  -- NULL

-- FORMAT (2012+)
SELECT FORMAT(GETDATE(), 'yyyy-MM-dd');
SELECT FORMAT(1234.56, 'C', 'en-US');  -- '$1,234.56'
SELECT FORMAT(123, '00000');  -- '00123'
```

## Conversion Styles (CONVERT)

| Style | Date Format | Example |
|-------|-------------|---------|
| 101 | mm/dd/yyyy | 01/15/2024 |
| 103 | dd/mm/yyyy | 15/01/2024 |
| 104 | dd.mm.yyyy | 15.01.2024 |
| 120 | yyyy-mm-dd hh:mi:ss | 2024-01-15 10:30:00 |
| 126 | yyyy-mm-ddThh:mi:ss | 2024-01-15T10:30:00 |
| 112 | yyyymmdd | 20240115 |

## NULL Handling

```sql
-- ISNULL (SQL Server specific)
SELECT ISNULL(phone, 'N/A');

-- COALESCE (ANSI standard)
SELECT COALESCE(phone, mobile, email, 'N/A');

-- NULLIF (return NULL if equal)
SELECT NULLIF(value, 0);  -- Returns NULL if value is 0

-- IS NULL / IS NOT NULL
WHERE phone IS NULL
WHERE phone IS NOT NULL
```

## Type Precedence

When mixing types, SQL Server converts to higher precedence:
1. user-defined types
2. sql_variant
3. xml
4. datetimeoffset
5. datetime2
6. datetime
7. smalldatetime
8. date
9. time
10. float
11. real
12. decimal
13. money
14. smallmoney
15. bigint
16. int
17. smallint
18. tinyint
19. bit
20. ntext
21. text
22. image
23. timestamp
24. uniqueidentifier
25. nvarchar
26. nchar
27. varchar
28. char
29. varbinary
30. binary
