# PL/pgSQL Procedures Quick Reference

## Basic Procedure (PostgreSQL 11+)

```sql
CREATE OR REPLACE PROCEDURE procedure_name(
    param1 type,
    param2 type DEFAULT default_value
)
LANGUAGE plpgsql
AS $$
DECLARE
    -- Variables
BEGIN
    -- Body
END;
$$;

-- Call procedure
CALL procedure_name(value1, value2);
```

## Procedures vs Functions

| Feature | Procedure | Function |
|---------|-----------|----------|
| Return value | No RETURN | Must RETURN |
| Transaction control | Yes (COMMIT/ROLLBACK) | No |
| Called with | CALL | SELECT / in expressions |
| Use in queries | No | Yes |

## Transaction Control

```sql
CREATE OR REPLACE PROCEDURE batch_process()
LANGUAGE plpgsql
AS $$
DECLARE
    v_batch_size INT := 1000;
    v_processed INT := 0;
BEGIN
    LOOP
        -- Process batch
        UPDATE orders
        SET status = 'processed'
        WHERE id IN (
            SELECT id FROM orders
            WHERE status = 'pending'
            LIMIT v_batch_size
        );

        GET DIAGNOSTICS v_processed = ROW_COUNT;

        -- Commit each batch
        COMMIT;

        -- Exit when no more rows
        EXIT WHEN v_processed < v_batch_size;
    END LOOP;
END;
$$;
```

## IN/OUT/INOUT Parameters

```sql
CREATE OR REPLACE PROCEDURE calculate_discount(
    IN p_user_id INT,
    IN p_order_total NUMERIC,
    OUT p_discount NUMERIC,
    INOUT p_final_total NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_tier VARCHAR;
BEGIN
    -- Get user tier
    SELECT tier INTO v_user_tier FROM users WHERE id = p_user_id;

    -- Calculate discount
    p_discount := CASE v_user_tier
        WHEN 'gold' THEN p_order_total * 0.15
        WHEN 'silver' THEN p_order_total * 0.10
        ELSE p_order_total * 0.05
    END;

    -- Calculate final total
    p_final_total := p_final_total - p_discount;
END;
$$;

-- Call and get results
DO $$
DECLARE
    v_discount NUMERIC;
    v_total NUMERIC := 100.00;
BEGIN
    CALL calculate_discount(1, 100.00, v_discount, v_total);
    RAISE NOTICE 'Discount: %, Final: %', v_discount, v_total;
END;
$$;
```

## Error Handling in Procedures

```sql
CREATE OR REPLACE PROCEDURE transfer_money(
    p_from_account INT,
    p_to_account INT,
    p_amount NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_balance NUMERIC;
BEGIN
    -- Check balance
    SELECT balance INTO v_balance
    FROM accounts WHERE id = p_from_account FOR UPDATE;

    IF v_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient funds: % < %', v_balance, p_amount;
    END IF;

    -- Transfer
    UPDATE accounts SET balance = balance - p_amount WHERE id = p_from_account;
    UPDATE accounts SET balance = balance + p_amount WHERE id = p_to_account;

    -- Log transaction
    INSERT INTO transactions (from_account, to_account, amount)
    VALUES (p_from_account, p_to_account, p_amount);

    COMMIT;

EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;
$$;
```

## Procedure with Cursor

```sql
CREATE OR REPLACE PROCEDURE archive_old_orders(p_days INT DEFAULT 365)
LANGUAGE plpgsql
AS $$
DECLARE
    v_cursor CURSOR FOR
        SELECT * FROM orders
        WHERE created_at < NOW() - (p_days || ' days')::INTERVAL
        FOR UPDATE;
    v_order orders%ROWTYPE;
    v_count INT := 0;
BEGIN
    FOR v_order IN v_cursor LOOP
        -- Archive
        INSERT INTO orders_archive SELECT v_order.*;

        -- Delete original
        DELETE FROM orders WHERE CURRENT OF v_cursor;

        v_count := v_count + 1;

        -- Commit every 1000 rows
        IF v_count % 1000 = 0 THEN
            COMMIT;
            RAISE NOTICE 'Archived % orders', v_count;
        END IF;
    END LOOP;

    COMMIT;
    RAISE NOTICE 'Total archived: %', v_count;
END;
$$;
```

## Common Patterns

### Batch Processing with Progress

```sql
CREATE OR REPLACE PROCEDURE process_large_dataset()
LANGUAGE plpgsql
AS $$
DECLARE
    v_batch_size INT := 5000;
    v_offset INT := 0;
    v_processed INT;
    v_total INT;
BEGIN
    SELECT COUNT(*) INTO v_total FROM source_data WHERE processed = false;
    RAISE NOTICE 'Total to process: %', v_total;

    LOOP
        WITH batch AS (
            UPDATE source_data
            SET processed = true
            WHERE id IN (
                SELECT id FROM source_data
                WHERE processed = false
                ORDER BY id
                LIMIT v_batch_size
            )
            RETURNING *
        )
        INSERT INTO target_data SELECT * FROM batch;

        GET DIAGNOSTICS v_processed = ROW_COUNT;

        COMMIT;

        v_offset := v_offset + v_processed;
        RAISE NOTICE 'Progress: % / %', v_offset, v_total;

        EXIT WHEN v_processed < v_batch_size;
    END LOOP;
END;
$$;
```

### Retry Logic

```sql
CREATE OR REPLACE PROCEDURE reliable_insert(p_data JSONB)
LANGUAGE plpgsql
AS $$
DECLARE
    v_retry_count INT := 0;
    v_max_retries INT := 3;
BEGIN
    LOOP
        BEGIN
            INSERT INTO target_table (data) VALUES (p_data);
            COMMIT;
            EXIT;  -- Success, exit loop
        EXCEPTION
            WHEN lock_not_available OR deadlock_detected THEN
                v_retry_count := v_retry_count + 1;
                IF v_retry_count >= v_max_retries THEN
                    RAISE;
                END IF;
                ROLLBACK;
                PERFORM pg_sleep(0.1 * v_retry_count);  -- Exponential backoff
        END;
    END LOOP;
END;
$$;
```

### Maintenance Procedure

```sql
CREATE OR REPLACE PROCEDURE maintenance_vacuum_analyze()
LANGUAGE plpgsql
AS $$
DECLARE
    v_table RECORD;
BEGIN
    FOR v_table IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('VACUUM ANALYZE %I.%I', v_table.schemaname, v_table.tablename);
        RAISE NOTICE 'Vacuumed: %.%', v_table.schemaname, v_table.tablename;
        COMMIT;
    END LOOP;
END;
$$;
```

## Drop Procedure

```sql
DROP PROCEDURE procedure_name;
DROP PROCEDURE procedure_name(INT, INT);  -- If overloaded
DROP PROCEDURE IF EXISTS procedure_name;
```
