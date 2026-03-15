# DDL Quick Reference

## CREATE TABLE

### Basic Table
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    age INT CHECK (age >= 0),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Auto-Increment by Database
```sql
-- PostgreSQL
id SERIAL PRIMARY KEY              -- 32-bit
id BIGSERIAL PRIMARY KEY           -- 64-bit
id INT GENERATED ALWAYS AS IDENTITY

-- MySQL
id INT AUTO_INCREMENT PRIMARY KEY

-- SQL Server
id INT IDENTITY(1,1) PRIMARY KEY

-- Oracle
id NUMBER GENERATED ALWAYS AS IDENTITY
```

### UUID Primary Key
```sql
-- PostgreSQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- or with gen_random_uuid() in PG13+
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- MySQL 8+
CREATE TABLE users (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID())
);

-- SQL Server
CREATE TABLE users (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID()
);
```

### Foreign Keys
```sql
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,

    -- Simple foreign key
    CONSTRAINT fk_orders_user
        FOREIGN KEY (user_id) REFERENCES users(id),

    -- Foreign key with cascade
    CONSTRAINT fk_orders_product
        FOREIGN KEY (product_id) REFERENCES products(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);
```

### Foreign Key Actions
| Action | On DELETE | On UPDATE |
|--------|-----------|-----------|
| `CASCADE` | Delete child rows | Update child FK values |
| `SET NULL` | Set FK to NULL | Set FK to NULL |
| `SET DEFAULT` | Set FK to default | Set FK to default |
| `RESTRICT` | Prevent deletion | Prevent update |
| `NO ACTION` | Same as RESTRICT (deferred check) |

### Composite Primary Key
```sql
CREATE TABLE order_items (
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,

    PRIMARY KEY (order_id, product_id),
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);
```

### CHECK Constraints
```sql
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    quantity INT NOT NULL,
    status VARCHAR(20) NOT NULL,

    CONSTRAINT chk_price_positive CHECK (price > 0),
    CONSTRAINT chk_quantity_non_negative CHECK (quantity >= 0),
    CONSTRAINT chk_valid_status CHECK (status IN ('active', 'inactive', 'discontinued'))
);
```

## ALTER TABLE

### Add Column
```sql
ALTER TABLE users ADD COLUMN phone VARCHAR(20);

-- With default value
ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT false NOT NULL;

-- PostgreSQL: Add column if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
```

### Drop Column
```sql
ALTER TABLE users DROP COLUMN phone;

-- PostgreSQL: Drop if exists
ALTER TABLE users DROP COLUMN IF EXISTS phone;

-- Drop with cascade (removes dependent objects)
ALTER TABLE users DROP COLUMN phone CASCADE;
```

### Modify Column
```sql
-- PostgreSQL
ALTER TABLE users ALTER COLUMN name TYPE VARCHAR(200);
ALTER TABLE users ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE users ALTER COLUMN status DROP DEFAULT;
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- MySQL
ALTER TABLE users MODIFY COLUMN name VARCHAR(200) NOT NULL;
ALTER TABLE users CHANGE COLUMN name full_name VARCHAR(200);

-- SQL Server
ALTER TABLE users ALTER COLUMN name VARCHAR(200) NOT NULL;
```

### Rename
```sql
-- Rename column
ALTER TABLE users RENAME COLUMN name TO full_name;

-- Rename table
ALTER TABLE users RENAME TO customers;
-- or
RENAME TABLE users TO customers;  -- MySQL
```

### Constraints
```sql
-- Add primary key
ALTER TABLE users ADD PRIMARY KEY (id);

-- Add unique constraint
ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email);

-- Add foreign key
ALTER TABLE orders ADD CONSTRAINT fk_orders_user
    FOREIGN KEY (user_id) REFERENCES users(id);

-- Add check constraint
ALTER TABLE users ADD CONSTRAINT chk_age CHECK (age >= 0);

-- Drop constraint
ALTER TABLE users DROP CONSTRAINT uq_users_email;
ALTER TABLE orders DROP CONSTRAINT fk_orders_user;
```

## DROP Statements

```sql
-- Drop table
DROP TABLE users;
DROP TABLE IF EXISTS users;
DROP TABLE users CASCADE;  -- drops dependent objects

-- Drop multiple tables
DROP TABLE users, orders, products;

-- Drop database
DROP DATABASE mydb;
DROP DATABASE IF EXISTS mydb;

-- Drop schema (PostgreSQL)
DROP SCHEMA myschema CASCADE;
```

## TRUNCATE

```sql
-- Fast delete all rows (DDL, not DML)
TRUNCATE TABLE users;

-- Restart identity/auto-increment
TRUNCATE TABLE users RESTART IDENTITY;  -- PostgreSQL
-- MySQL resets auto-increment automatically

-- Cascade to dependent tables
TRUNCATE TABLE users CASCADE;

-- Multiple tables
TRUNCATE TABLE users, orders, products;
```

## CREATE INDEX

```sql
-- Basic index
CREATE INDEX idx_users_email ON users(email);

-- Unique index
CREATE UNIQUE INDEX idx_users_email ON users(email);

-- Composite index (order matters!)
CREATE INDEX idx_orders_user_date ON orders(user_id, created_at DESC);

-- Partial/filtered index (PostgreSQL)
CREATE INDEX idx_active_users ON users(email) WHERE status = 'active';

-- Covering index (include non-key columns)
-- PostgreSQL
CREATE INDEX idx_orders_user ON orders(user_id) INCLUDE (status, total);
-- SQL Server
CREATE INDEX idx_orders_user ON orders(user_id) INCLUDE (status, total);

-- Expression index
CREATE INDEX idx_users_lower_email ON users(LOWER(email));

-- Concurrent index creation (no table lock, PostgreSQL)
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
```

### Index Types
```sql
-- B-tree (default, most common)
CREATE INDEX idx_btree ON users USING btree(email);

-- Hash (equality only)
CREATE INDEX idx_hash ON users USING hash(email);

-- GIN (arrays, full-text, JSONB - PostgreSQL)
CREATE INDEX idx_gin_tags ON posts USING gin(tags);
CREATE INDEX idx_gin_search ON posts USING gin(to_tsvector('english', content));

-- GiST (geometric, full-text - PostgreSQL)
CREATE INDEX idx_gist_location ON places USING gist(location);

-- BRIN (large sequential data - PostgreSQL)
CREATE INDEX idx_brin_created ON events USING brin(created_at);
```

## DROP INDEX

```sql
-- Basic
DROP INDEX idx_users_email;

-- PostgreSQL (index is schema-scoped)
DROP INDEX idx_users_email;

-- MySQL (need table name)
DROP INDEX idx_users_email ON users;

-- SQL Server
DROP INDEX idx_users_email ON users;
-- or
DROP INDEX users.idx_users_email;

-- Concurrent drop (PostgreSQL)
DROP INDEX CONCURRENTLY idx_users_email;
```

## Sequences

```sql
-- Create sequence
CREATE SEQUENCE user_id_seq START WITH 1 INCREMENT BY 1;

-- Use sequence
INSERT INTO users (id, name) VALUES (NEXTVAL('user_id_seq'), 'John');

-- Get current value
SELECT CURRVAL('user_id_seq');

-- Reset sequence
ALTER SEQUENCE user_id_seq RESTART WITH 100;

-- Drop sequence
DROP SEQUENCE user_id_seq;
```

## Views

```sql
-- Create view
CREATE VIEW active_users AS
SELECT id, name, email FROM users WHERE status = 'active';

-- Create or replace
CREATE OR REPLACE VIEW active_users AS
SELECT id, name, email, created_at FROM users WHERE status = 'active';

-- Materialized view (PostgreSQL)
CREATE MATERIALIZED VIEW user_stats AS
SELECT user_id, COUNT(*) as order_count, SUM(total) as total_spent
FROM orders GROUP BY user_id;

-- Refresh materialized view
REFRESH MATERIALIZED VIEW user_stats;
REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats;  -- requires unique index

-- Drop view
DROP VIEW active_users;
DROP MATERIALIZED VIEW user_stats;
```

## Schema Management

```sql
-- Create schema
CREATE SCHEMA sales;

-- Create table in schema
CREATE TABLE sales.orders (...);

-- Set search path (PostgreSQL)
SET search_path TO sales, public;

-- Drop schema
DROP SCHEMA sales;
DROP SCHEMA sales CASCADE;  -- drops all objects in schema
```
