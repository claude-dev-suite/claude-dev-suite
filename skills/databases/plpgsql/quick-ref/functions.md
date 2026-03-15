# PL/pgSQL Functions Quick Reference

## Function Types

### Scalar Function (Returns Single Value)

```sql
CREATE OR REPLACE FUNCTION calculate_tax(amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE  -- Same input always produces same output
AS $$
BEGIN
    RETURN amount * 0.21;
END;
$$;

-- Usage
SELECT calculate_tax(100.00);  -- Returns 21.00
SELECT price, calculate_tax(price) as tax FROM products;
```

### Table Function (Returns Multiple Rows)

```sql
CREATE OR REPLACE FUNCTION get_user_orders(p_user_id INT)
RETURNS TABLE(
    order_id INT,
    total NUMERIC,
    created_at TIMESTAMP
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT id, total, created_at
    FROM orders
    WHERE user_id = p_user_id
    ORDER BY created_at DESC;
END;
$$;

-- Usage
SELECT * FROM get_user_orders(1);
```

### SETOF Function (Returns Rows of Existing Type)

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

### Function with OUT Parameters

```sql
CREATE OR REPLACE FUNCTION get_stats(
    IN p_user_id INT,
    OUT o_order_count INT,
    OUT o_total_spent NUMERIC,
    OUT o_avg_order NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
    SELECT
        COUNT(*),
        COALESCE(SUM(total), 0),
        COALESCE(AVG(total), 0)
    INTO o_order_count, o_total_spent, o_avg_order
    FROM orders
    WHERE user_id = p_user_id;
END;
$$;

-- Usage
SELECT * FROM get_stats(1);
SELECT (get_stats(1)).*;
```

## Function Volatility

| Volatility | Description | Use Case |
|------------|-------------|----------|
| `IMMUTABLE` | Same input = same output, no side effects | Math, string manipulation |
| `STABLE` | Same output within single query | Table lookups |
| `VOLATILE` | Can return different results (default) | Random, current time, modifications |

```sql
-- IMMUTABLE: Can be inlined/cached
CREATE FUNCTION add_tax(amount NUMERIC)
RETURNS NUMERIC IMMUTABLE
AS $$ SELECT amount * 1.21; $$ LANGUAGE SQL;

-- STABLE: Safe to cache within query
CREATE FUNCTION get_config(key TEXT)
RETURNS TEXT STABLE
AS $$ SELECT value FROM config WHERE name = key; $$ LANGUAGE SQL;

-- VOLATILE: Cannot optimize (default)
CREATE FUNCTION next_order_number()
RETURNS INT VOLATILE
AS $$ SELECT nextval('order_seq')::INT; $$ LANGUAGE SQL;
```

## Function Security

```sql
-- SECURITY INVOKER (default): Runs with caller's privileges
CREATE FUNCTION get_my_data()
RETURNS TABLE(id INT, data TEXT)
SECURITY INVOKER
AS $$ SELECT id, data FROM sensitive_table WHERE owner = current_user; $$
LANGUAGE SQL;

-- SECURITY DEFINER: Runs with function owner's privileges
CREATE FUNCTION admin_only_function()
RETURNS VOID
SECURITY DEFINER
AS $$ DELETE FROM audit_log WHERE age > 90; $$
LANGUAGE SQL;

-- Set search_path for security
CREATE FUNCTION secure_function()
RETURNS VOID
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ ... $$ LANGUAGE plpgsql;
```

## Return Patterns

### RETURN QUERY

```sql
CREATE FUNCTION search_products(p_term TEXT)
RETURNS TABLE(id INT, name TEXT, price NUMERIC)
AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.name, p.price
    FROM products p
    WHERE p.name ILIKE '%' || p_term || '%';
END;
$$ LANGUAGE plpgsql;
```

### RETURN NEXT (Row by Row)

```sql
CREATE FUNCTION generate_report()
RETURNS TABLE(category TEXT, total NUMERIC)
AS $$
DECLARE
    v_category RECORD;
BEGIN
    FOR v_category IN SELECT DISTINCT category FROM products LOOP
        category := v_category.category;
        SELECT SUM(price) INTO total
        FROM products WHERE category = v_category.category;

        RETURN NEXT;  -- Return current row
    END LOOP;
END;
$$ LANGUAGE plpgsql;
```

### Early RETURN

```sql
CREATE FUNCTION validate_email(p_email TEXT)
RETURNS BOOLEAN
AS $$
BEGIN
    IF p_email IS NULL THEN
        RETURN FALSE;
    END IF;

    IF p_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

## Default Parameters

```sql
CREATE FUNCTION get_orders(
    p_user_id INT,
    p_status TEXT DEFAULT 'all',
    p_limit INT DEFAULT 100
)
RETURNS SETOF orders
AS $$
BEGIN
    IF p_status = 'all' THEN
        RETURN QUERY SELECT * FROM orders
            WHERE user_id = p_user_id
            LIMIT p_limit;
    ELSE
        RETURN QUERY SELECT * FROM orders
            WHERE user_id = p_user_id AND status = p_status
            LIMIT p_limit;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Call with defaults
SELECT * FROM get_orders(1);
SELECT * FROM get_orders(1, 'pending');
SELECT * FROM get_orders(1, p_limit := 10);
```

## Variadic Parameters

```sql
CREATE FUNCTION concat_all(VARIADIC arr TEXT[])
RETURNS TEXT
AS $$
BEGIN
    RETURN array_to_string(arr, ', ');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Usage
SELECT concat_all('a', 'b', 'c');  -- Returns 'a, b, c'
SELECT concat_all(VARIADIC ARRAY['x', 'y']);  -- Expand array
```

## Overloaded Functions

```sql
-- Same name, different parameter types
CREATE FUNCTION format_value(val INT) RETURNS TEXT
AS $$ SELECT val::TEXT; $$ LANGUAGE SQL;

CREATE FUNCTION format_value(val NUMERIC) RETURNS TEXT
AS $$ SELECT to_char(val, 'FM999,999.00'); $$ LANGUAGE SQL;

CREATE FUNCTION format_value(val TIMESTAMP) RETURNS TEXT
AS $$ SELECT to_char(val, 'YYYY-MM-DD HH24:MI'); $$ LANGUAGE SQL;
```

## Aggregate Functions

```sql
-- Custom aggregate: string concatenation
CREATE FUNCTION string_agg_state(state TEXT, val TEXT)
RETURNS TEXT
AS $$ SELECT COALESCE(state || ', ', '') || val; $$
LANGUAGE SQL;

CREATE AGGREGATE string_concat(TEXT) (
    SFUNC = string_agg_state,
    STYPE = TEXT,
    INITCOND = ''
);
```

## Performance Tips

```sql
-- Use STRICT to return NULL on NULL input
CREATE FUNCTION safe_divide(a NUMERIC, b NUMERIC)
RETURNS NUMERIC
STRICT  -- Returns NULL if any input is NULL
AS $$ SELECT a / b; $$ LANGUAGE SQL;

-- Use PARALLEL SAFE for parallel queries
CREATE FUNCTION expensive_calc(x INT)
RETURNS INT
PARALLEL SAFE
AS $$ ... $$ LANGUAGE plpgsql;

-- Inline simple SQL functions
CREATE FUNCTION double_it(x INT)
RETURNS INT
LANGUAGE SQL
IMMUTABLE
AS $$ SELECT x * 2; $$;
```

## Drop Function

```sql
DROP FUNCTION function_name;
DROP FUNCTION function_name(INT, TEXT);  -- If overloaded
DROP FUNCTION IF EXISTS function_name;
DROP FUNCTION function_name CASCADE;  -- Drop dependents
```
