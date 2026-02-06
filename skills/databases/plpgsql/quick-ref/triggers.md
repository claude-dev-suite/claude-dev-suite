# PL/pgSQL Triggers Quick Reference

## Trigger Structure

```sql
-- 1. Create trigger function
CREATE OR REPLACE FUNCTION trigger_function_name()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Trigger logic
    RETURN NEW;  -- or OLD, or NULL
END;
$$;

-- 2. Attach trigger to table
CREATE TRIGGER trigger_name
    {BEFORE | AFTER | INSTEAD OF} {INSERT | UPDATE | DELETE | TRUNCATE}
    ON table_name
    [FOR EACH {ROW | STATEMENT}]
    [WHEN (condition)]
    EXECUTE FUNCTION trigger_function_name();
```

## Trigger Types

| Type | Description | Use Case |
|------|-------------|----------|
| BEFORE ROW | Before each row is modified | Validation, modification |
| AFTER ROW | After each row is modified | Auditing, cascading |
| BEFORE STATEMENT | Before statement executes | Bulk validation |
| AFTER STATEMENT | After statement completes | Summary logging |
| INSTEAD OF | Replace operation (views only) | Updatable views |

## Trigger Variables

| Variable | Description |
|----------|-------------|
| `NEW` | New row data (INSERT/UPDATE) |
| `OLD` | Old row data (UPDATE/DELETE) |
| `TG_OP` | Operation: INSERT, UPDATE, DELETE, TRUNCATE |
| `TG_NAME` | Trigger name |
| `TG_TABLE_NAME` | Table name |
| `TG_TABLE_SCHEMA` | Schema name |
| `TG_WHEN` | BEFORE, AFTER, or INSTEAD OF |
| `TG_LEVEL` | ROW or STATEMENT |
| `TG_ARGV` | Arguments passed to trigger |
| `TG_NARGS` | Number of arguments |

## Common Patterns

### Auto-Update Timestamp

```sql
CREATE OR REPLACE FUNCTION update_modified_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_timestamp();
```

### Auto-Generate UUID

```sql
CREATE OR REPLACE FUNCTION set_uuid()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.id IS NULL THEN
        NEW.id = gen_random_uuid();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_uuid
    BEFORE INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_uuid();
```

### Audit Trail

```sql
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    table_name TEXT,
    operation TEXT,
    old_data JSONB,
    new_data JSONB,
    changed_by TEXT DEFAULT current_user,
    changed_at TIMESTAMP DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (table_name, operation, new_data)
        VALUES (TG_TABLE_NAME, 'INSERT', row_to_json(NEW)::JSONB);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log (table_name, operation, old_data, new_data)
        VALUES (TG_TABLE_NAME, 'UPDATE', row_to_json(OLD)::JSONB, row_to_json(NEW)::JSONB);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (table_name, operation, old_data)
        VALUES (TG_TABLE_NAME, 'DELETE', row_to_json(OLD)::JSONB);
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_audit
    AFTER INSERT OR UPDATE OR DELETE ON users
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger();
```

### Validation Trigger

```sql
CREATE OR REPLACE FUNCTION validate_order()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate total
    IF NEW.total <= 0 THEN
        RAISE EXCEPTION 'Order total must be positive: %', NEW.total;
    END IF;

    -- Validate status transition
    IF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'shipped' AND NEW.status = 'pending' THEN
            RAISE EXCEPTION 'Cannot change status from shipped to pending';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_order
    BEFORE INSERT OR UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION validate_order();
```

### Soft Delete

```sql
CREATE OR REPLACE FUNCTION soft_delete()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE users SET
        deleted_at = NOW(),
        status = 'deleted'
    WHERE id = OLD.id;

    RETURN NULL;  -- Prevent actual DELETE
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_soft_delete
    BEFORE DELETE ON users
    FOR EACH ROW
    EXECUTE FUNCTION soft_delete();
```

### Denormalization / Counter Cache

```sql
CREATE OR REPLACE FUNCTION update_order_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE users SET order_count = order_count + 1
        WHERE id = NEW.user_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE users SET order_count = order_count - 1
        WHERE id = OLD.user_id;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' AND OLD.user_id != NEW.user_id THEN
        UPDATE users SET order_count = order_count - 1
        WHERE id = OLD.user_id;
        UPDATE users SET order_count = order_count + 1
        WHERE id = NEW.user_id;
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_count
    AFTER INSERT OR UPDATE OR DELETE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_order_count();
```

### Notify on Change

```sql
CREATE OR REPLACE FUNCTION notify_order_change()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'order_changes',
        json_build_object(
            'operation', TG_OP,
            'order_id', COALESCE(NEW.id, OLD.id),
            'user_id', COALESCE(NEW.user_id, OLD.user_id)
        )::TEXT
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_order
    AFTER INSERT OR UPDATE OR DELETE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION notify_order_change();
```

### Prevent Update of Specific Columns

```sql
CREATE OR REPLACE FUNCTION prevent_id_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.id != OLD.id THEN
        RAISE EXCEPTION 'Cannot change ID field';
    END IF;
    IF NEW.created_at != OLD.created_at THEN
        NEW.created_at = OLD.created_at;  -- Silently restore
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Conditional Triggers

```sql
-- Only trigger when specific column changes
CREATE TRIGGER trg_status_change
    AFTER UPDATE OF status ON orders
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION log_status_change();

-- Only trigger for specific values
CREATE TRIGGER trg_high_value_order
    AFTER INSERT ON orders
    FOR EACH ROW
    WHEN (NEW.total > 10000)
    EXECUTE FUNCTION notify_high_value();
```

## INSTEAD OF Triggers (Views)

```sql
CREATE VIEW active_users AS
    SELECT id, name, email FROM users WHERE status = 'active';

CREATE OR REPLACE FUNCTION active_users_insert()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO users (name, email, status)
    VALUES (NEW.name, NEW.email, 'active');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_active_users_insert
    INSTEAD OF INSERT ON active_users
    FOR EACH ROW
    EXECUTE FUNCTION active_users_insert();
```

## Statement-Level Triggers

```sql
CREATE OR REPLACE FUNCTION log_bulk_operation()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO operation_log (operation, table_name, executed_at)
    VALUES (TG_OP, TG_TABLE_NAME, NOW());
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_bulk
    AFTER INSERT OR UPDATE OR DELETE ON orders
    FOR EACH STATEMENT
    EXECUTE FUNCTION log_bulk_operation();
```

## Trigger Ordering

```sql
-- Triggers fire in alphabetical order by name
-- Use naming convention: 01_first, 02_second, etc.

CREATE TRIGGER trg_01_validate
    BEFORE INSERT ON orders FOR EACH ROW
    EXECUTE FUNCTION validate_order();

CREATE TRIGGER trg_02_set_defaults
    BEFORE INSERT ON orders FOR EACH ROW
    EXECUTE FUNCTION set_order_defaults();
```

## Enable/Disable Triggers

```sql
-- Disable single trigger
ALTER TABLE users DISABLE TRIGGER trg_users_audit;

-- Enable single trigger
ALTER TABLE users ENABLE TRIGGER trg_users_audit;

-- Disable all triggers on table
ALTER TABLE users DISABLE TRIGGER ALL;

-- Enable all triggers
ALTER TABLE users ENABLE TRIGGER ALL;
```

## Drop Trigger

```sql
DROP TRIGGER trigger_name ON table_name;
DROP TRIGGER IF EXISTS trigger_name ON table_name;
```
