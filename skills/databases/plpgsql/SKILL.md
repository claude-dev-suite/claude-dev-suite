---
name: plpgsql
description: |
  PostgreSQL procedural language (PL/pgSQL). Covers stored procedures,
  functions, triggers, exception handling, and control structures.
  Use for PostgreSQL server-side programming.

  USE WHEN: user mentions "plpgsql", "PostgreSQL functions", "PostgreSQL procedures",
  "PostgreSQL triggers", "RETURNS TABLE", "RETURNS SETOF", "RAISE NOTICE"

  DO NOT USE FOR: basic PostgreSQL SQL - use `postgresql` instead,
  PL/SQL (Oracle) - use `plsql` instead, T-SQL - use `tsql` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---

# PL/pgSQL Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `postgresql` for comprehensive documentation.

## Basic Structure

```sql
CREATE OR REPLACE FUNCTION function_name(param1 type, param2 type)
RETURNS return_type
LANGUAGE plpgsql
AS $$
DECLARE
    -- Variable declarations
    var1 type;
    var2 type := default_value;
BEGIN
    -- Function body
    RETURN result;
END;
$$;
```

## Functions

### Basic Function

```sql
CREATE OR REPLACE FUNCTION get_user_name(user_id INT)
RETURNS VARCHAR
LANGUAGE plpgsql
AS $$
DECLARE
    user_name VARCHAR;
BEGIN
    SELECT name INTO user_name
    FROM users
    WHERE id = user_id;

    RETURN user_name;
END;
$$;

-- Usage
SELECT get_user_name(1);
```

### Function with Multiple Return Values

```sql
CREATE OR REPLACE FUNCTION get_user_info(p_user_id INT)
RETURNS TABLE(name VARCHAR, email VARCHAR, order_count BIGINT)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT u.name, u.email, COUNT(o.id)::BIGINT
    FROM users u
    LEFT JOIN orders o ON o.user_id = u.id
    WHERE u.id = p_user_id
    GROUP BY u.id;
END;
$$;

-- Usage
SELECT * FROM get_user_info(1);
```

### Function with OUT Parameters

```sql
CREATE OR REPLACE FUNCTION calculate_stats(
    IN p_user_id INT,
    OUT total_orders INT,
    OUT total_amount NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
    SELECT COUNT(*), COALESCE(SUM(total), 0)
    INTO total_orders, total_amount
    FROM orders
    WHERE user_id = p_user_id;
END;
$$;

-- Usage
SELECT * FROM calculate_stats(1);
```

### SETOF Function (Multiple Rows)

```sql
CREATE OR REPLACE FUNCTION get_active_users()
RETURNS SETOF users
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY SELECT * FROM users WHERE status = 'active';
END;
$$;

-- Usage
SELECT * FROM get_active_users();
```

## Procedures (PostgreSQL 11+)

```sql
CREATE OR REPLACE PROCEDURE transfer_funds(
    sender_id INT,
    receiver_id INT,
    amount NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Deduct from sender
    UPDATE accounts SET balance = balance - amount WHERE id = sender_id;

    -- Add to receiver
    UPDATE accounts SET balance = balance + amount WHERE id = receiver_id;

    -- Commit transaction
    COMMIT;
END;
$$;

-- Usage
CALL transfer_funds(1, 2, 100.00);
```

## Variables and Types

```sql
DECLARE
    -- Scalar types
    v_count INT := 0;
    v_name VARCHAR(100);
    v_amount NUMERIC(10,2) DEFAULT 0.00;
    v_active BOOLEAN := TRUE;
    v_created TIMESTAMP := NOW();

    -- Type from column
    v_email users.email%TYPE;

    -- Type from row
    v_user users%ROWTYPE;

    -- Record (dynamic)
    v_record RECORD;

    -- Array
    v_ids INT[] := ARRAY[1, 2, 3];

    -- Constant
    c_tax_rate CONSTANT NUMERIC := 0.21;
BEGIN
    -- ...
END;
```

## Control Structures

### IF Statement

```sql
IF condition THEN
    -- statements
ELSIF another_condition THEN
    -- statements
ELSE
    -- statements
END IF;

-- Example
IF v_count > 100 THEN
    v_status := 'high';
ELSIF v_count > 50 THEN
    v_status := 'medium';
ELSE
    v_status := 'low';
END IF;
```

### CASE Statement

```sql
CASE expression
    WHEN value1 THEN
        -- statements
    WHEN value2 THEN
        -- statements
    ELSE
        -- statements
END CASE;

-- Searched CASE
CASE
    WHEN condition1 THEN
        -- statements
    WHEN condition2 THEN
        -- statements
    ELSE
        -- statements
END CASE;
```

### Loops

```sql
-- Simple loop
LOOP
    -- statements
    EXIT WHEN condition;
END LOOP;

-- WHILE loop
WHILE condition LOOP
    -- statements
END LOOP;

-- FOR loop (integer range)
FOR i IN 1..10 LOOP
    RAISE NOTICE 'i = %', i;
END LOOP;

-- FOR loop (reverse)
FOR i IN REVERSE 10..1 LOOP
    -- statements
END LOOP;

-- FOR loop (query result)
FOR v_record IN SELECT * FROM users WHERE status = 'active' LOOP
    RAISE NOTICE 'User: %', v_record.name;
END LOOP;

-- FOREACH (arrays)
FOREACH v_id IN ARRAY v_ids LOOP
    RAISE NOTICE 'ID: %', v_id;
END LOOP;
```

## Exception Handling

```sql
BEGIN
    -- Statements that might fail
    INSERT INTO users (email) VALUES (p_email);
EXCEPTION
    WHEN unique_violation THEN
        RAISE NOTICE 'Email already exists: %', p_email;
        RETURN NULL;
    WHEN not_null_violation THEN
        RAISE EXCEPTION 'Email cannot be null';
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Unexpected error: % %', SQLERRM, SQLSTATE;
END;
```

### Common Exception Codes

| Exception | Description |
|-----------|-------------|
| `unique_violation` | Duplicate key |
| `not_null_violation` | NULL in NOT NULL column |
| `foreign_key_violation` | FK constraint failed |
| `check_violation` | CHECK constraint failed |
| `division_by_zero` | Division by zero |
| `no_data_found` | SELECT INTO returned no rows |
| `too_many_rows` | SELECT INTO returned multiple rows |

### Raising Exceptions

```sql
-- Notice (info)
RAISE NOTICE 'Processing user %', v_user_id;

-- Warning
RAISE WARNING 'Value seems too high: %', v_amount;

-- Exception (stops execution)
RAISE EXCEPTION 'Invalid user ID: %', v_user_id;

-- With error code
RAISE EXCEPTION 'Invalid input' USING ERRCODE = 'invalid_parameter_value';
```

## Triggers

### Basic Trigger

```sql
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_update
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();
```

### Trigger Variables

| Variable | Description |
|----------|-------------|
| `NEW` | New row (INSERT/UPDATE) |
| `OLD` | Old row (UPDATE/DELETE) |
| `TG_OP` | Operation: INSERT, UPDATE, DELETE |
| `TG_TABLE_NAME` | Table name |
| `TG_WHEN` | BEFORE or AFTER |

### Audit Trigger

```sql
CREATE OR REPLACE FUNCTION audit_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (table_name, operation, new_data)
        VALUES (TG_TABLE_NAME, 'INSERT', row_to_json(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log (table_name, operation, old_data, new_data)
        VALUES (TG_TABLE_NAME, 'UPDATE', row_to_json(OLD), row_to_json(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (table_name, operation, old_data)
        VALUES (TG_TABLE_NAME, 'DELETE', row_to_json(OLD));
        RETURN OLD;
    END IF;
END;
$$;

CREATE TRIGGER trg_users_audit
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW
    EXECUTE FUNCTION audit_changes();
```

### Conditional Trigger

```sql
CREATE TRIGGER trg_orders_notify
    AFTER INSERT ON orders
    FOR EACH ROW
    WHEN (NEW.total > 1000)
    EXECUTE FUNCTION notify_high_value_order();
```

## Dynamic SQL

```sql
CREATE OR REPLACE FUNCTION search_table(
    p_table TEXT,
    p_column TEXT,
    p_value TEXT
)
RETURNS SETOF RECORD
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY EXECUTE format(
        'SELECT * FROM %I WHERE %I = $1',
        p_table, p_column
    ) USING p_value;
END;
$$;

-- With EXECUTE INTO
DECLARE
    v_count INT;
BEGIN
    EXECUTE 'SELECT COUNT(*) FROM ' || quote_ident(p_table)
    INTO v_count;
END;
```

## Cursors

```sql
CREATE OR REPLACE FUNCTION process_orders()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_cursor CURSOR FOR SELECT * FROM orders WHERE status = 'pending';
    v_order orders%ROWTYPE;
BEGIN
    OPEN v_cursor;
    LOOP
        FETCH v_cursor INTO v_order;
        EXIT WHEN NOT FOUND;

        -- Process order
        UPDATE orders SET status = 'processing' WHERE id = v_order.id;
    END LOOP;
    CLOSE v_cursor;
END;
$$;

-- FOR loop cursor (auto open/close)
FOR v_order IN SELECT * FROM orders WHERE status = 'pending' LOOP
    -- Process
END LOOP;
```

## Best Practices

### DO
- Use `%TYPE` and `%ROWTYPE` for type safety
- Use `STRICT` for SELECT INTO when expecting exactly one row
- Use `format()` with `%I` for identifiers in dynamic SQL
- Use exception blocks for error handling
- Use `RETURNS SETOF` or `RETURNS TABLE` for multiple rows

### DON'T
- Use string concatenation for dynamic SQL (SQL injection risk)
- Ignore exceptions
- Use cursors when set-based operations work
- Create functions with side effects without clear naming

## When NOT to Use This Skill

- **Basic PostgreSQL SQL** - Use `postgresql` skill for queries, indexes, data types
- **PL/SQL (Oracle)** - Use `plsql` skill for Oracle procedures
- **T-SQL (SQL Server)** - Use `tsql` skill for SQL Server procedures
- **Basic SQL** - Use `sql-fundamentals` for ANSI SQL basics

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Dynamic SQL without sanitization | SQL injection | Use quote_ident/quote_literal or format() |
| Not handling exceptions | Silent failures | Add EXCEPTION blocks |
| Using explicit cursors for loops | Slower code | Use FOR...IN loops |
| Ignoring FOUND variable | Logic errors | Check FOUND after queries |
| Not using %TYPE/%ROWTYPE | Type mismatches | Use column/row types |
| SELECT INTO without STRICT | Unexpected NULL | Add STRICT or check FOUND |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Function returns NULL unexpectedly | Check FOUND variable | Add NOT FOUND handling |
| "query returned more than one row" | SELECT INTO returned multiple | Add LIMIT 1 or use FOR loop |
| "column does not exist" | Case sensitivity | Use double quotes for identifiers |
| Trigger not firing | Check trigger status | `ALTER TRIGGER ... ENABLE` |
| Performance issues | `EXPLAIN ANALYZE` on query | Optimize SQL, add indexes |

## Reference Documentation

- [Procedures](quick-ref/procedures.md)
- [Functions](quick-ref/functions.md)
- [Triggers](quick-ref/triggers.md)
