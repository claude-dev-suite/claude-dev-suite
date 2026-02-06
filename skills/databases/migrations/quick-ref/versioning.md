# Schema Versioning Quick Reference

## Version Tracking Table

```sql
-- Flyway-style
CREATE TABLE flyway_schema_history (
    installed_rank INT NOT NULL,
    version VARCHAR(50),
    description VARCHAR(200),
    type VARCHAR(20) NOT NULL,
    script VARCHAR(1000) NOT NULL,
    checksum INT,
    installed_by VARCHAR(100) NOT NULL,
    installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    execution_time INT NOT NULL,
    success BOOLEAN NOT NULL,
    PRIMARY KEY (installed_rank)
);

-- Liquibase-style
CREATE TABLE databasechangelog (
    id VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    dateexecuted TIMESTAMP NOT NULL,
    orderexecuted INT NOT NULL,
    exectype VARCHAR(10) NOT NULL,
    md5sum VARCHAR(35),
    description VARCHAR(255),
    comments VARCHAR(255),
    tag VARCHAR(255),
    liquibase VARCHAR(20),
    contexts VARCHAR(255),
    labels VARCHAR(255)
);
```

## Naming Conventions

### Timestamp-Based (Recommended)

```
Format: V{YYYYMMDDHHMMSS}__{description}.sql

Examples:
V20240115103000__create_users_table.sql
V20240115104530__add_email_index.sql
V20240116090000__add_status_column.sql
```

**Pros:**
- Natural ordering
- Merge conflicts visible
- Timezone-aware

**Cons:**
- Long filenames
- Harder to see sequence

### Sequential

```
Format: V{NNN}__{description}.sql

Examples:
V001__create_users_table.sql
V002__add_email_index.sql
V003__add_status_column.sql
```

**Pros:**
- Short, clean
- Easy to see order

**Cons:**
- Merge conflicts possible
- Renumbering painful

### Semantic Versioning

```
Format: V{major}.{minor}.{patch}__{description}.sql

Examples:
V1.0.0__initial_schema.sql
V1.1.0__add_orders_module.sql
V1.1.1__fix_orders_constraint.sql
V2.0.0__breaking_change.sql
```

**Pros:**
- Matches application versioning
- Semantic meaning

**Cons:**
- Complex management
- Gaps in sequences

## Migration File Organization

### Flat Structure

```
migrations/
├── V20240115103000__create_users_table.sql
├── V20240115104530__add_email_index.sql
├── V20240116090000__add_orders_table.sql
└── V20240116100000__add_order_items.sql
```

### By Feature/Module

```
migrations/
├── users/
│   ├── V20240115103000__create_users_table.sql
│   └── V20240115104530__add_email_index.sql
├── orders/
│   ├── V20240116090000__create_orders_table.sql
│   └── V20240116100000__add_order_items.sql
└── inventory/
    └── V20240117080000__create_inventory_table.sql
```

### By Environment

```
migrations/
├── common/
│   ├── V001__create_schema.sql
│   └── V002__create_base_tables.sql
├── development/
│   └── R__seed_test_data.sql
├── staging/
│   └── R__seed_staging_data.sql
└── production/
    └── R__seed_production_config.sql
```

## Migration Types

### Versioned Migrations

```sql
-- V20240115103000__create_users_table.sql
-- Runs once, tracked by version
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL
);
```

### Repeatable Migrations

```sql
-- R__create_views.sql
-- Runs when checksum changes
CREATE OR REPLACE VIEW active_users AS
SELECT * FROM users WHERE status = 'active';
```

### Baseline Migration

```sql
-- V1__baseline.sql
-- Represents existing schema state
-- Used when adopting migrations for existing database

-- This file intentionally left empty
-- or contains the current schema dump
```

### Undo Migrations (Flyway Pro)

```sql
-- V20240115103000__create_users_table.sql
CREATE TABLE users (...);

-- U20240115103000__create_users_table.sql
DROP TABLE IF EXISTS users;
```

## Checksums

### How Checksums Work

```
Migration File → Hash Algorithm → Checksum
     ↓                              ↓
  checksum                      Stored in
  validation                   schema_history
```

### Checksum Validation

```sql
-- Flyway stores CRC32 checksum
-- If file changes after applied, migration fails

-- Fix: Update checksum manually (dangerous!)
UPDATE flyway_schema_history
SET checksum = -123456789
WHERE version = '20240115103000';

-- Or repair
flyway repair
```

## Schema History Queries

### View Applied Migrations

```sql
-- All migrations
SELECT version, description, installed_on, execution_time, success
FROM flyway_schema_history
ORDER BY installed_rank;

-- Failed migrations
SELECT * FROM flyway_schema_history WHERE success = false;

-- Last migration
SELECT * FROM flyway_schema_history
ORDER BY installed_rank DESC LIMIT 1;
```

### Migration Statistics

```sql
-- Execution time analysis
SELECT
    version,
    description,
    execution_time,
    ROUND(execution_time / 1000.0, 2) AS seconds
FROM flyway_schema_history
ORDER BY execution_time DESC;

-- Migrations per day
SELECT
    DATE(installed_on) AS date,
    COUNT(*) AS migrations
FROM flyway_schema_history
GROUP BY DATE(installed_on)
ORDER BY date;
```

## Version Control Integration

### .gitignore

```gitignore
# Don't ignore migration files!
# migrations/*.sql  -- DO NOT ADD THIS

# Ignore generated files
migrations/target/
migrations/.flyway
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check migration naming convention
for file in $(git diff --cached --name-only | grep "migrations/.*\.sql$"); do
    if ! [[ $file =~ V[0-9]{14}__[a-z_]+\.sql$ ]]; then
        echo "ERROR: Migration file '$file' doesn't follow naming convention"
        echo "Expected: V{YYYYMMDDHHMMSS}__{description}.sql"
        exit 1
    fi
done
```

### CI/CD Validation

```yaml
# .github/workflows/migrations.yml
name: Validate Migrations

on: [pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Check migration ordering
        run: |
          cd migrations
          prev=""
          for file in V*.sql; do
            version=$(echo $file | grep -oP 'V\K[0-9]+')
            if [[ "$prev" && "$version" -le "$prev" ]]; then
              echo "ERROR: Migration $file is out of order"
              exit 1
            fi
            prev=$version
          done

      - name: Syntax check
        run: |
          for file in migrations/*.sql; do
            pgsql-parser "$file" || exit 1
          done
```

## Multi-Environment Versioning

```
Environment     Current Version    Target Version
─────────────────────────────────────────────────
production      V20240110000000    V20240115000000
staging         V20240115000000    V20240116000000
development     V20240116000000    (latest)
```

### Environment-Specific Config

```properties
# flyway-production.conf
flyway.url=jdbc:postgresql://prod-db:5432/myapp
flyway.locations=classpath:migrations/common

# flyway-staging.conf
flyway.url=jdbc:postgresql://staging-db:5432/myapp
flyway.locations=classpath:migrations/common,classpath:migrations/staging

# flyway-dev.conf
flyway.url=jdbc:postgresql://localhost:5432/myapp_dev
flyway.locations=classpath:migrations/common,classpath:migrations/development
```
