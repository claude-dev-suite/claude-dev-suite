# PL/SQL Procedures Quick Reference

## Basic Syntax

```sql
CREATE [OR REPLACE] PROCEDURE procedure_name
    [(parameter1 [IN | OUT | IN OUT] datatype [DEFAULT value],
      parameter2 [IN | OUT | IN OUT] datatype [DEFAULT value], ...)]
IS | AS
    -- Declaration section
BEGIN
    -- Executable section
[EXCEPTION
    -- Exception handling section]
END [procedure_name];
/
```

## Parameter Modes

| Mode | Description | Default |
|------|-------------|---------|
| `IN` | Read-only, passed by value | Yes |
| `OUT` | Write-only, returns value | No |
| `IN OUT` | Read-write | No |

```sql
CREATE OR REPLACE PROCEDURE example_proc(
    p_input    IN  VARCHAR2,           -- Input only
    p_output   OUT NUMBER,             -- Output only
    p_inout    IN OUT VARCHAR2,        -- Both
    p_default  IN VARCHAR2 DEFAULT 'X' -- With default
)
IS
BEGIN
    p_output := LENGTH(p_input);
    p_inout := p_inout || '-modified';
END;
/
```

## Calling Procedures

```sql
-- Positional notation
EXEC my_procedure(100, 'test', v_result);

-- Named notation
EXEC my_procedure(p_id => 100, p_name => 'test', p_result => v_result);

-- Mixed notation
EXEC my_procedure(100, p_name => 'test', p_result => v_result);

-- From PL/SQL block
BEGIN
    my_procedure(100, 'test', v_result);
END;
/
```

## NOCOPY Hint (Performance)

```sql
CREATE OR REPLACE PROCEDURE process_large_data(
    p_data IN OUT NOCOPY large_collection_type
)
IS
BEGIN
    -- NOCOPY passes by reference instead of value
    -- Faster for large parameters but no rollback on exception
    NULL;
END;
/
```

## Autonomous Transactions

```sql
CREATE OR REPLACE PROCEDURE log_error(
    p_error_msg IN VARCHAR2
)
IS
    PRAGMA AUTONOMOUS_TRANSACTION;
BEGIN
    INSERT INTO error_log (message, created_at)
    VALUES (p_error_msg, SYSDATE);
    COMMIT;  -- Commits only this transaction
END;
/

-- Usage: Log persists even if main transaction rolls back
BEGIN
    -- Some operation
    UPDATE accounts SET balance = balance - 100 WHERE id = 1;

    IF some_error THEN
        log_error('Error occurred');  -- This commits independently
        ROLLBACK;  -- Main transaction rolls back
    END IF;
END;
/
```

## Procedure with REF CURSOR

```sql
CREATE OR REPLACE PROCEDURE get_employees(
    p_dept_id    IN  NUMBER,
    p_cursor     OUT SYS_REFCURSOR
)
IS
BEGIN
    OPEN p_cursor FOR
        SELECT employee_id, first_name, last_name, salary
        FROM employees
        WHERE department_id = p_dept_id;
END;
/

-- Usage
DECLARE
    v_cursor SYS_REFCURSOR;
    v_emp_id NUMBER;
    v_name   VARCHAR2(100);
BEGIN
    get_employees(10, v_cursor);
    LOOP
        FETCH v_cursor INTO v_emp_id, v_name;
        EXIT WHEN v_cursor%NOTFOUND;
        DBMS_OUTPUT.PUT_LINE(v_name);
    END LOOP;
    CLOSE v_cursor;
END;
/
```

## Overloading

```sql
CREATE OR REPLACE PACKAGE calc_pkg AS
    PROCEDURE calculate(p_value NUMBER);
    PROCEDURE calculate(p_value VARCHAR2);
    PROCEDURE calculate(p_value DATE);
END;
/

CREATE OR REPLACE PACKAGE BODY calc_pkg AS
    PROCEDURE calculate(p_value NUMBER) IS
    BEGIN
        DBMS_OUTPUT.PUT_LINE('Number: ' || p_value);
    END;

    PROCEDURE calculate(p_value VARCHAR2) IS
    BEGIN
        DBMS_OUTPUT.PUT_LINE('String: ' || p_value);
    END;

    PROCEDURE calculate(p_value DATE) IS
    BEGIN
        DBMS_OUTPUT.PUT_LINE('Date: ' || TO_CHAR(p_value));
    END;
END;
/
```

## Recursive Procedure

```sql
CREATE OR REPLACE PROCEDURE print_hierarchy(
    p_parent_id IN NUMBER,
    p_level     IN NUMBER DEFAULT 0
)
IS
BEGIN
    FOR rec IN (SELECT employee_id, first_name
                FROM employees
                WHERE manager_id = p_parent_id
                   OR (p_parent_id IS NULL AND manager_id IS NULL))
    LOOP
        DBMS_OUTPUT.PUT_LINE(LPAD(' ', p_level * 2) || rec.first_name);
        print_hierarchy(rec.employee_id, p_level + 1);
    END LOOP;
END;
/
```

## Common Patterns

### Error Logging Pattern

```sql
CREATE OR REPLACE PROCEDURE process_data(p_id NUMBER)
IS
    v_step VARCHAR2(100);
BEGIN
    v_step := 'Fetching data';
    -- ... fetch logic

    v_step := 'Processing data';
    -- ... process logic

    v_step := 'Saving results';
    -- ... save logic

    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        log_error(v_step || ': ' || SQLERRM);
        RAISE;
END;
/
```

### Batch Processing

```sql
CREATE OR REPLACE PROCEDURE batch_update(p_batch_size NUMBER DEFAULT 1000)
IS
    TYPE id_tab IS TABLE OF NUMBER;
    v_ids id_tab;

    CURSOR c_pending IS
        SELECT id FROM orders WHERE status = 'PENDING';
BEGIN
    OPEN c_pending;
    LOOP
        FETCH c_pending BULK COLLECT INTO v_ids LIMIT p_batch_size;
        EXIT WHEN v_ids.COUNT = 0;

        FORALL i IN 1..v_ids.COUNT
            UPDATE orders SET status = 'PROCESSING'
            WHERE id = v_ids(i);

        COMMIT;
    END LOOP;
    CLOSE c_pending;
END;
/
```

### Validation Procedure

```sql
CREATE OR REPLACE PROCEDURE validate_order(
    p_order_id  IN  NUMBER,
    p_is_valid  OUT BOOLEAN,
    p_message   OUT VARCHAR2
)
IS
    v_order orders%ROWTYPE;
BEGIN
    p_is_valid := TRUE;
    p_message := NULL;

    SELECT * INTO v_order FROM orders WHERE id = p_order_id;

    IF v_order.total <= 0 THEN
        p_is_valid := FALSE;
        p_message := 'Order total must be positive';
        RETURN;
    END IF;

    IF v_order.customer_id IS NULL THEN
        p_is_valid := FALSE;
        p_message := 'Customer is required';
        RETURN;
    END IF;

EXCEPTION
    WHEN NO_DATA_FOUND THEN
        p_is_valid := FALSE;
        p_message := 'Order not found';
END;
/
```

## Drop Procedure

```sql
DROP PROCEDURE procedure_name;
```

## View Procedure Code

```sql
SELECT text
FROM user_source
WHERE name = 'PROCEDURE_NAME'
AND type = 'PROCEDURE'
ORDER BY line;
```
