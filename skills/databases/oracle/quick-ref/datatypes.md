# Oracle Data Types Quick Reference

## Numeric Types

| Type | Description | Range/Precision |
|------|-------------|-----------------|
| `NUMBER` | Floating-point | Up to 38 digits |
| `NUMBER(p)` | Integer with precision | p digits |
| `NUMBER(p,s)` | Fixed-point | p precision, s scale |
| `BINARY_FLOAT` | 32-bit floating | ~7 digits precision |
| `BINARY_DOUBLE` | 64-bit floating | ~15 digits precision |

```sql
-- Examples
id NUMBER(10)              -- Integer up to 10 digits
price NUMBER(10,2)         -- 99999999.99
percentage NUMBER(5,4)     -- 0.9999
amount NUMBER              -- Any precision

-- Integer aliases (for migration compatibility)
INTEGER                    -- Same as NUMBER(38)
SMALLINT                   -- Same as NUMBER(38)
```

## Character Types

| Type | Description | Max Size |
|------|-------------|----------|
| `VARCHAR2(n)` | Variable-length | 4000 bytes (32767 with extended) |
| `NVARCHAR2(n)` | Unicode variable | 4000 bytes |
| `CHAR(n)` | Fixed-length | 2000 bytes |
| `NCHAR(n)` | Unicode fixed | 2000 bytes |
| `CLOB` | Large text | 4 GB |
| `NCLOB` | Unicode large text | 4 GB |

```sql
CREATE TABLE example (
    code CHAR(10),           -- Always 10 chars (padded)
    name VARCHAR2(100),      -- Up to 100 bytes
    description VARCHAR2(4000 CHAR),  -- Up to 4000 characters
    notes CLOB,              -- Large text
    unicode_name NVARCHAR2(100)  -- Unicode
);
```

## Date/Time Types

| Type | Description | Example |
|------|-------------|---------|
| `DATE` | Date + time (to seconds) | `2024-01-15 10:30:00` |
| `TIMESTAMP` | Date + time (to fractions) | `2024-01-15 10:30:00.123456` |
| `TIMESTAMP(p)` | Fractional seconds precision | p = 0-9 (default 6) |
| `TIMESTAMP WITH TIME ZONE` | With timezone offset | `2024-01-15 10:30:00 -05:00` |
| `TIMESTAMP WITH LOCAL TIME ZONE` | Normalized to DB timezone | Converted on retrieval |
| `INTERVAL YEAR TO MONTH` | Year/month interval | `INTERVAL '1-6' YEAR TO MONTH` |
| `INTERVAL DAY TO SECOND` | Day/time interval | `INTERVAL '5 12:30:00' DAY TO SECOND` |

```sql
CREATE TABLE events (
    event_date DATE,
    created_at TIMESTAMP DEFAULT SYSTIMESTAMP,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    duration INTERVAL DAY TO SECOND
);

-- Insert examples
INSERT INTO events VALUES (
    DATE '2024-01-15',
    SYSTIMESTAMP,
    TIMESTAMP '2024-01-15 10:30:00 -05:00',
    INTERVAL '2 03:30:00' DAY TO SECOND
);
```

## Binary Types

| Type | Description | Max Size |
|------|-------------|----------|
| `RAW(n)` | Binary data | 2000 bytes |
| `LONG RAW` | Legacy binary | 2 GB (deprecated) |
| `BLOB` | Binary large object | 4 GB |
| `BFILE` | External file reference | OS file |

```sql
CREATE TABLE documents (
    id NUMBER,
    thumbnail RAW(2000),     -- Small binary (e.g., icon)
    content BLOB,            -- Large binary (e.g., PDF)
    external_file BFILE      -- Reference to OS file
);
```

## Other Types

| Type | Description |
|------|-------------|
| `ROWID` | Physical row address |
| `UROWID` | Universal ROWID |
| `XMLTYPE` | XML data |
| `JSON` | JSON data (21c+) |
| `BOOLEAN` | TRUE/FALSE/NULL (23c+) |

```sql
-- ROWID
SELECT ROWID, employee_id, name FROM employees WHERE ROWID = 'AAASfPAAEAAAADNAAA';

-- XMLTYPE
CREATE TABLE xml_data (
    id NUMBER,
    data XMLTYPE
);

INSERT INTO xml_data VALUES (1, XMLTYPE('<root><item>value</item></root>'));

-- JSON (21c+)
CREATE TABLE json_data (
    id NUMBER,
    data JSON
);
```

## Type Conversion

```sql
-- To number
SELECT TO_NUMBER('123.45') FROM DUAL;
SELECT TO_NUMBER('$1,234.56', '$9,999.99') FROM DUAL;
SELECT CAST('123' AS NUMBER) FROM DUAL;

-- To string
SELECT TO_CHAR(SYSDATE, 'YYYY-MM-DD') FROM DUAL;
SELECT TO_CHAR(12345.67, '99,999.99') FROM DUAL;
SELECT CAST(123 AS VARCHAR2(10)) FROM DUAL;

-- To date
SELECT TO_DATE('2024-01-15', 'YYYY-MM-DD') FROM DUAL;
SELECT TO_TIMESTAMP('2024-01-15 10:30:00', 'YYYY-MM-DD HH24:MI:SS') FROM DUAL;
SELECT CAST('15-JAN-2024' AS DATE) FROM DUAL;

-- Implicit conversion (avoid when possible)
SELECT * FROM employees WHERE employee_id = '100';  -- String to number
```

## ANSI vs Oracle Types

| ANSI Type | Oracle Type |
|-----------|-------------|
| `INTEGER` | `NUMBER(38)` |
| `SMALLINT` | `NUMBER(38)` |
| `DECIMAL(p,s)` | `NUMBER(p,s)` |
| `FLOAT` | `BINARY_DOUBLE` |
| `REAL` | `BINARY_FLOAT` |
| `VARCHAR(n)` | `VARCHAR2(n)` |
| `CHARACTER(n)` | `CHAR(n)` |

## Best Practices

1. **Use VARCHAR2** over CHAR (saves space)
2. **Use NUMBER(p,s)** with explicit precision
3. **Use TIMESTAMP** when you need fractional seconds
4. **Use CLOB/BLOB** for large data (not LONG)
5. **Specify BYTE or CHAR** for VARCHAR2 semantics
6. **Use native JSON type** in 21c+ for JSON data
