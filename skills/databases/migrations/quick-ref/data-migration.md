# Data Migration Quick Reference

## Data Migration Types

| Type | Description | Example |
|------|-------------|---------|
| Backfill | Populate new column | Add default values |
| Transform | Change data format | Phone format normalization |
| Split | Distribute to new structure | Normalize table |
| Merge | Combine data | Denormalize |
| Archive | Move old data | Archive old orders |
| ETL | Extract, Transform, Load | Full data migration |

## Batch Processing

### Simple Batch Update

```sql
-- PostgreSQL
DO $$
DECLARE
    batch_size INT := 10000;
    rows_affected INT := 1;
BEGIN
    WHILE rows_affected > 0 LOOP
        UPDATE users
        SET status = 'active'
        WHERE id IN (
            SELECT id FROM users
            WHERE status IS NULL
            LIMIT batch_size
        );
        GET DIAGNOSTICS rows_affected = ROW_COUNT;
        COMMIT;
        RAISE NOTICE 'Updated % rows', rows_affected;
    END LOOP;
END $$;
```

### With Progress Tracking

```sql
-- Create progress table
CREATE TABLE migration_progress (
    migration_name VARCHAR(100) PRIMARY KEY,
    last_processed_id BIGINT,
    total_processed BIGINT DEFAULT 0,
    started_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Initialize
INSERT INTO migration_progress (migration_name, last_processed_id)
VALUES ('backfill_status', 0);

-- Batch processing with resume
DO $$
DECLARE
    batch_size INT := 10000;
    last_id BIGINT;
    max_id BIGINT;
    processed INT;
BEGIN
    SELECT last_processed_id INTO last_id
    FROM migration_progress WHERE migration_name = 'backfill_status';

    SELECT MAX(id) INTO max_id FROM users;

    WHILE last_id < max_id LOOP
        WITH batch AS (
            UPDATE users
            SET status = 'active'
            WHERE id > last_id AND id <= last_id + batch_size
            AND status IS NULL
            RETURNING id
        )
        SELECT COUNT(*), MAX(id) INTO processed, last_id FROM batch;

        UPDATE migration_progress
        SET last_processed_id = last_id,
            total_processed = total_processed + processed,
            updated_at = NOW()
        WHERE migration_name = 'backfill_status';

        COMMIT;
        PERFORM pg_sleep(0.1);  -- Rate limit
    END LOOP;
END $$;
```

### Skip Locked (Concurrent Safe)

```sql
-- Multiple processes can run simultaneously
UPDATE users
SET status = 'active'
WHERE id IN (
    SELECT id FROM users
    WHERE status IS NULL
    LIMIT 1000
    FOR UPDATE SKIP LOCKED
);
```

## Transform Patterns

### String Normalization

```sql
-- Normalize phone numbers
UPDATE users
SET phone = regexp_replace(phone, '[^0-9]', '', 'g')
WHERE phone IS NOT NULL AND phone ~ '[^0-9]';

-- Trim whitespace
UPDATE users
SET email = LOWER(TRIM(email)),
    name = TRIM(name);

-- Standardize case
UPDATE products
SET sku = UPPER(sku);
```

### Data Type Conversion

```sql
-- String to Integer (with validation)
-- Step 1: Add new column
ALTER TABLE orders ADD COLUMN quantity_new INT;

-- Step 2: Convert valid data
UPDATE orders
SET quantity_new = quantity::INT
WHERE quantity ~ '^[0-9]+$';

-- Step 3: Handle invalid data
UPDATE orders
SET quantity_new = 0
WHERE quantity_new IS NULL;

-- Step 4: Swap columns
ALTER TABLE orders DROP COLUMN quantity;
ALTER TABLE orders RENAME COLUMN quantity_new TO quantity;
```

### JSON Extraction

```sql
-- Extract from JSON to columns
UPDATE users
SET
    first_name = profile->>'firstName',
    last_name = profile->>'lastName',
    phone = profile->'contact'->>'phone'
WHERE profile IS NOT NULL;
```

## Split Table

### Normalize (Extract to New Table)

```sql
-- Original: users(id, name, address, city, country)
-- Target: users(id, name, address_id), addresses(id, city, country)

-- Step 1: Create new table
CREATE TABLE addresses (
    id SERIAL PRIMARY KEY,
    city VARCHAR(100),
    country VARCHAR(100),
    UNIQUE(city, country)
);

-- Step 2: Populate addresses
INSERT INTO addresses (city, country)
SELECT DISTINCT city, country
FROM users
WHERE city IS NOT NULL;

-- Step 3: Add FK column
ALTER TABLE users ADD COLUMN address_id INT;

-- Step 4: Set FK values
UPDATE users u
SET address_id = a.id
FROM addresses a
WHERE u.city = a.city AND u.country = a.country;

-- Step 5: Add constraint
ALTER TABLE users
ADD CONSTRAINT fk_users_address
FOREIGN KEY (address_id) REFERENCES addresses(id);

-- Step 6: Drop old columns
ALTER TABLE users DROP COLUMN city, DROP COLUMN country;
```

## Merge Tables

### Denormalize (Combine Tables)

```sql
-- Original: users(id, name), profiles(user_id, bio, avatar)
-- Target: users(id, name, bio, avatar)

-- Step 1: Add columns
ALTER TABLE users
ADD COLUMN bio TEXT,
ADD COLUMN avatar VARCHAR(500);

-- Step 2: Copy data
UPDATE users u
SET bio = p.bio, avatar = p.avatar
FROM profiles p
WHERE p.user_id = u.id;

-- Step 3: Set up sync trigger (during transition)
CREATE OR REPLACE FUNCTION sync_profile() RETURNS TRIGGER AS $$
BEGIN
    UPDATE users SET bio = NEW.bio, avatar = NEW.avatar WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_sync_profile AFTER INSERT OR UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION sync_profile();

-- Step 4: Drop old table (after code migration)
DROP TRIGGER tr_sync_profile ON profiles;
DROP TABLE profiles;
```

## Archive Data

### Move to Archive Table

```sql
-- Create archive table
CREATE TABLE orders_archive (LIKE orders INCLUDING ALL);

-- Move old data
WITH moved AS (
    DELETE FROM orders
    WHERE created_at < NOW() - INTERVAL '2 years'
    RETURNING *
)
INSERT INTO orders_archive SELECT * FROM moved;

-- Or in batches
DO $$
DECLARE
    batch_size INT := 10000;
    moved INT := 1;
BEGIN
    WHILE moved > 0 LOOP
        WITH batch AS (
            DELETE FROM orders
            WHERE id IN (
                SELECT id FROM orders
                WHERE created_at < NOW() - INTERVAL '2 years'
                LIMIT batch_size
            )
            RETURNING *
        )
        INSERT INTO orders_archive SELECT * FROM batch;

        GET DIAGNOSTICS moved = ROW_COUNT;
        COMMIT;
        RAISE NOTICE 'Archived % rows', moved;
    END LOOP;
END $$;
```

### Partition-Based Archive

```sql
-- Detach old partition (instant)
ALTER TABLE orders DETACH PARTITION orders_2022;

-- Rename to archive
ALTER TABLE orders_2022 RENAME TO orders_2022_archive;

-- Move to archive schema
ALTER TABLE orders_2022_archive SET SCHEMA archive;
```

## ETL Migration

### Full Table Migration

```sql
-- 1. Create new table
CREATE TABLE users_v2 (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(200),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Transform and load
INSERT INTO users_v2 (id, email, full_name, created_at)
SELECT
    id,
    LOWER(TRIM(email)),
    TRIM(first_name) || ' ' || TRIM(last_name),
    COALESCE(created_at, '2020-01-01')
FROM users;

-- 3. Reset sequence
SELECT setval('users_v2_id_seq', (SELECT MAX(id) FROM users_v2));

-- 4. Swap tables
ALTER TABLE users RENAME TO users_old;
ALTER TABLE users_v2 RENAME TO users;

-- 5. Drop old table (after verification)
DROP TABLE users_old;
```

## Zero-Downtime Data Migration

```sql
-- 1. Add new column
ALTER TABLE users ADD COLUMN email_normalized VARCHAR(255);

-- 2. Create trigger for new data
CREATE OR REPLACE FUNCTION normalize_email() RETURNS TRIGGER AS $$
BEGIN
    NEW.email_normalized := LOWER(TRIM(NEW.email));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_normalize_email
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION normalize_email();

-- 3. Backfill existing data (in batches)
UPDATE users SET email_normalized = LOWER(TRIM(email))
WHERE email_normalized IS NULL;

-- 4. Add constraint
ALTER TABLE users ALTER COLUMN email_normalized SET NOT NULL;
CREATE UNIQUE INDEX idx_users_email_norm ON users(email_normalized);

-- 5. Switch application to use new column

-- 6. Cleanup
DROP TRIGGER tr_normalize_email ON users;
ALTER TABLE users DROP COLUMN email;
ALTER TABLE users RENAME COLUMN email_normalized TO email;
```

## Monitoring Progress

```sql
-- Create monitoring view
CREATE VIEW migration_status AS
SELECT
    'users' AS table_name,
    COUNT(*) AS total_rows,
    COUNT(*) FILTER (WHERE status IS NOT NULL) AS migrated,
    ROUND(100.0 * COUNT(*) FILTER (WHERE status IS NOT NULL) / COUNT(*), 2) AS percent_complete
FROM users;

-- Check progress
SELECT * FROM migration_status;
```
