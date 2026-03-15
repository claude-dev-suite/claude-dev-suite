# DML Quick Reference

## SELECT Patterns

### Basic Filtering
```sql
-- Comparison operators
WHERE age >= 18
WHERE status != 'deleted'
WHERE created_at BETWEEN '2024-01-01' AND '2024-12-31'

-- Pattern matching
WHERE name LIKE 'John%'      -- starts with
WHERE name LIKE '%son'       -- ends with
WHERE name LIKE '%oh%'       -- contains
WHERE name ILIKE '%john%'    -- case-insensitive (PostgreSQL)

-- List matching
WHERE status IN ('active', 'pending')
WHERE id NOT IN (1, 2, 3)

-- NULL checks
WHERE phone IS NULL
WHERE phone IS NOT NULL

-- Logical operators
WHERE age >= 18 AND status = 'active'
WHERE role = 'admin' OR role = 'moderator'
WHERE NOT (status = 'deleted')
```

### Advanced SELECT
```sql
-- DISTINCT
SELECT DISTINCT country FROM users;
SELECT DISTINCT ON (user_id) * FROM orders ORDER BY user_id, created_at DESC;

-- Aliasing
SELECT u.name AS user_name, COUNT(o.id) AS order_count
FROM users u LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id;

-- CASE expression
SELECT name,
    CASE status
        WHEN 'active' THEN 'Active User'
        WHEN 'pending' THEN 'Pending Approval'
        ELSE 'Unknown'
    END AS status_label
FROM users;

-- Searched CASE
SELECT name,
    CASE
        WHEN age < 18 THEN 'Minor'
        WHEN age < 65 THEN 'Adult'
        ELSE 'Senior'
    END AS age_group
FROM users;
```

### Pagination Patterns
```sql
-- LIMIT/OFFSET (PostgreSQL, MySQL)
SELECT * FROM users ORDER BY id LIMIT 20 OFFSET 40;

-- Keyset pagination (better performance)
SELECT * FROM users WHERE id > 100 ORDER BY id LIMIT 20;

-- SQL Server
SELECT * FROM users ORDER BY id OFFSET 40 ROWS FETCH NEXT 20 ROWS ONLY;

-- Oracle (12c+)
SELECT * FROM users ORDER BY id OFFSET 40 ROWS FETCH NEXT 20 ROWS ONLY;

-- Oracle (older)
SELECT * FROM (
    SELECT t.*, ROWNUM rn FROM (
        SELECT * FROM users ORDER BY id
    ) t WHERE ROWNUM <= 60
) WHERE rn > 40;
```

## INSERT Patterns

### Basic Insert
```sql
-- Explicit columns (preferred)
INSERT INTO users (name, email, status)
VALUES ('John Doe', 'john@example.com', 'active');

-- Multiple rows
INSERT INTO users (name, email) VALUES
    ('John', 'john@example.com'),
    ('Jane', 'jane@example.com'),
    ('Bob', 'bob@example.com');
```

### Insert from Query
```sql
-- Copy data
INSERT INTO users_archive (id, name, email, archived_at)
SELECT id, name, email, NOW()
FROM users
WHERE status = 'deleted';
```

### UPSERT (Insert or Update)
```sql
-- PostgreSQL
INSERT INTO users (email, name) VALUES ('john@example.com', 'John')
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();

-- PostgreSQL (do nothing on conflict)
INSERT INTO users (email, name) VALUES ('john@example.com', 'John')
ON CONFLICT (email) DO NOTHING;

-- MySQL
INSERT INTO users (email, name) VALUES ('john@example.com', 'John')
ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = NOW();

-- SQL Server (MERGE)
MERGE INTO users AS target
USING (VALUES ('john@example.com', 'John')) AS source (email, name)
ON target.email = source.email
WHEN MATCHED THEN UPDATE SET name = source.name
WHEN NOT MATCHED THEN INSERT (email, name) VALUES (source.email, source.name);
```

### RETURNING Clause
```sql
-- PostgreSQL
INSERT INTO users (name, email) VALUES ('John', 'john@example.com')
RETURNING id, created_at;

-- SQL Server
INSERT INTO users (name, email)
OUTPUT INSERTED.id, INSERTED.created_at
VALUES ('John', 'john@example.com');
```

## UPDATE Patterns

### Basic Update
```sql
UPDATE users SET status = 'inactive' WHERE id = 1;

UPDATE users SET
    name = 'John Doe',
    status = 'active',
    updated_at = NOW()
WHERE id = 1;
```

### Conditional Update
```sql
UPDATE users SET
    status = CASE
        WHEN last_login < NOW() - INTERVAL '1 year' THEN 'inactive'
        ELSE status
    END
WHERE status = 'active';
```

### Update with JOIN
```sql
-- PostgreSQL
UPDATE orders o
SET status = 'priority'
FROM users u
WHERE o.user_id = u.id AND u.is_premium = true;

-- MySQL
UPDATE orders o
INNER JOIN users u ON o.user_id = u.id
SET o.status = 'priority'
WHERE u.is_premium = true;

-- SQL Server
UPDATE o
SET o.status = 'priority'
FROM orders o
INNER JOIN users u ON o.user_id = u.id
WHERE u.is_premium = 1;
```

### Update with Subquery
```sql
UPDATE users SET
    order_count = (SELECT COUNT(*) FROM orders WHERE user_id = users.id);
```

## DELETE Patterns

### Basic Delete
```sql
DELETE FROM users WHERE id = 1;

DELETE FROM orders WHERE created_at < '2020-01-01';
```

### Delete with JOIN
```sql
-- PostgreSQL
DELETE FROM orders o
USING users u
WHERE o.user_id = u.id AND u.status = 'deleted';

-- MySQL
DELETE o FROM orders o
INNER JOIN users u ON o.user_id = u.id
WHERE u.status = 'deleted';

-- SQL Server
DELETE o FROM orders o
INNER JOIN users u ON o.user_id = u.id
WHERE u.status = 'deleted';
```

### Soft Delete (Recommended)
```sql
-- Instead of DELETE, use UPDATE
UPDATE users SET
    deleted_at = NOW(),
    status = 'deleted'
WHERE id = 1;

-- Query active records
SELECT * FROM users WHERE deleted_at IS NULL;
```

### TRUNCATE (Fast delete all)
```sql
-- Remove all rows (no WHERE, no logging, resets auto-increment)
TRUNCATE TABLE temp_data;

-- With foreign keys (PostgreSQL)
TRUNCATE TABLE orders CASCADE;
```

## MERGE Statement (Standard SQL)

```sql
MERGE INTO target_table t
USING source_table s
ON t.id = s.id
WHEN MATCHED AND s.deleted = true THEN
    DELETE
WHEN MATCHED THEN
    UPDATE SET t.name = s.name, t.updated_at = NOW()
WHEN NOT MATCHED THEN
    INSERT (id, name) VALUES (s.id, s.name);
```
