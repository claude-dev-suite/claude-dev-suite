# PL/SQL Triggers Quick Reference

## Trigger Types

| Type | Description |
|------|-------------|
| DML Trigger | Fires on INSERT, UPDATE, DELETE |
| DDL Trigger | Fires on CREATE, ALTER, DROP |
| System Trigger | Fires on database events (LOGON, STARTUP) |
| INSTEAD OF Trigger | Replaces DML on views |
| Compound Trigger | Multiple timing points in one trigger |

## Basic DML Trigger Syntax

```sql
CREATE [OR REPLACE] TRIGGER trigger_name
{BEFORE | AFTER | INSTEAD OF}
{INSERT | UPDATE [OF column_list] | DELETE}
[OR {INSERT | UPDATE | DELETE}]
ON table_name
[REFERENCING OLD AS old NEW AS new]
[FOR EACH ROW]
[WHEN (condition)]
[DECLARE
    -- declarations]
BEGIN
    -- trigger body
[EXCEPTION
    -- exception handlers]
END;
/
```

## Timing Points

| Timing | Description |
|--------|-------------|
| BEFORE | Before DML executes |
| AFTER | After DML executes |
| INSTEAD OF | Replace DML (views only) |

## Row-Level vs Statement-Level

```sql
-- Row-level: Fires once per affected row
CREATE TRIGGER trg_row_level
AFTER INSERT ON employees
FOR EACH ROW
BEGIN
    -- :NEW and :OLD available
END;
/

-- Statement-level: Fires once per statement
CREATE TRIGGER trg_statement_level
AFTER INSERT ON employees
-- No FOR EACH ROW
BEGIN
    -- :NEW and :OLD NOT available
END;
/
```

## Trigger Variables

| Variable | INSERT | UPDATE | DELETE |
|----------|--------|--------|--------|
| `:NEW.column` | New value | New value | NULL |
| `:OLD.column` | NULL | Old value | Old value |
| `INSERTING` | TRUE | FALSE | FALSE |
| `UPDATING` | FALSE | TRUE | FALSE |
| `DELETING` | FALSE | FALSE | TRUE |

## Common Patterns

### Auto-Populate Columns

```sql
CREATE OR REPLACE TRIGGER trg_employees_bi
BEFORE INSERT ON employees
FOR EACH ROW
BEGIN
    :NEW.employee_id := emp_seq.NEXTVAL;
    :NEW.created_at := SYSDATE;
    :NEW.created_by := USER;
END;
/

CREATE OR REPLACE TRIGGER trg_employees_bu
BEFORE UPDATE ON employees
FOR EACH ROW
BEGIN
    :NEW.updated_at := SYSDATE;
    :NEW.updated_by := USER;
END;
/
```

### Audit Trail

```sql
CREATE OR REPLACE TRIGGER trg_employees_audit
AFTER INSERT OR UPDATE OR DELETE ON employees
FOR EACH ROW
DECLARE
    v_action VARCHAR2(10);
BEGIN
    IF INSERTING THEN
        v_action := 'INSERT';
    ELSIF UPDATING THEN
        v_action := 'UPDATE';
    ELSE
        v_action := 'DELETE';
    END IF;

    INSERT INTO employees_audit (
        action,
        employee_id,
        old_salary,
        new_salary,
        changed_by,
        changed_at
    ) VALUES (
        v_action,
        NVL(:NEW.employee_id, :OLD.employee_id),
        :OLD.salary,
        :NEW.salary,
        USER,
        SYSDATE
    );
END;
/
```

### Validation Trigger

```sql
CREATE OR REPLACE TRIGGER trg_validate_salary
BEFORE INSERT OR UPDATE OF salary ON employees
FOR EACH ROW
BEGIN
    IF :NEW.salary < 0 THEN
        RAISE_APPLICATION_ERROR(-20001, 'Salary cannot be negative');
    END IF;

    IF :NEW.salary > 1000000 THEN
        RAISE_APPLICATION_ERROR(-20002, 'Salary exceeds maximum allowed');
    END IF;

    -- Prevent salary decrease (except by managers)
    IF UPDATING AND :NEW.salary < :OLD.salary THEN
        IF USER NOT IN ('HR_MANAGER', 'ADMIN') THEN
            RAISE_APPLICATION_ERROR(-20003, 'Only managers can decrease salary');
        END IF;
    END IF;
END;
/
```

### Prevent Delete

```sql
CREATE OR REPLACE TRIGGER trg_prevent_delete
BEFORE DELETE ON critical_data
FOR EACH ROW
BEGIN
    RAISE_APPLICATION_ERROR(-20001, 'Deletion not allowed on this table');
END;
/
```

### Soft Delete

```sql
CREATE OR REPLACE TRIGGER trg_soft_delete
BEFORE DELETE ON employees
FOR EACH ROW
BEGIN
    UPDATE employees
    SET deleted_at = SYSDATE,
        status = 'DELETED'
    WHERE employee_id = :OLD.employee_id;

    -- Prevent actual delete
    RAISE_APPLICATION_ERROR(-20001, 'Row soft-deleted');
END;
/
```

### Cross-Table Validation

```sql
CREATE OR REPLACE TRIGGER trg_check_budget
BEFORE INSERT OR UPDATE ON employees
FOR EACH ROW
DECLARE
    v_budget NUMBER;
    v_total  NUMBER;
BEGIN
    SELECT budget INTO v_budget
    FROM departments WHERE department_id = :NEW.department_id;

    SELECT NVL(SUM(salary), 0) INTO v_total
    FROM employees
    WHERE department_id = :NEW.department_id
    AND employee_id != NVL(:NEW.employee_id, -1);

    IF v_total + :NEW.salary > v_budget THEN
        RAISE_APPLICATION_ERROR(-20001,
            'Salary would exceed department budget');
    END IF;
END;
/
```

## Compound Trigger (11g+)

```sql
CREATE OR REPLACE TRIGGER trg_employees_compound
FOR INSERT OR UPDATE ON employees
COMPOUND TRIGGER

    -- Declare collection for bulk processing
    TYPE emp_id_tab IS TABLE OF NUMBER INDEX BY PLS_INTEGER;
    g_emp_ids emp_id_tab;
    g_idx     PLS_INTEGER := 0;

BEFORE STATEMENT IS
BEGIN
    g_idx := 0;
END BEFORE STATEMENT;

BEFORE EACH ROW IS
BEGIN
    -- Auto-set timestamps
    IF INSERTING THEN
        :NEW.created_at := SYSDATE;
    END IF;
    :NEW.updated_at := SYSDATE;
END BEFORE EACH ROW;

AFTER EACH ROW IS
BEGIN
    -- Collect IDs for bulk processing
    g_idx := g_idx + 1;
    g_emp_ids(g_idx) := :NEW.employee_id;
END AFTER EACH ROW;

AFTER STATEMENT IS
BEGIN
    -- Bulk operation after all rows processed
    FORALL i IN 1..g_idx
        INSERT INTO employee_changes (employee_id, change_date)
        VALUES (g_emp_ids(i), SYSDATE);
END AFTER STATEMENT;

END trg_employees_compound;
/
```

## INSTEAD OF Trigger (Views)

```sql
CREATE VIEW emp_dept_view AS
    SELECT e.employee_id, e.first_name, e.salary,
           d.department_id, d.department_name
    FROM employees e
    JOIN departments d ON e.department_id = d.department_id;

CREATE OR REPLACE TRIGGER trg_emp_dept_insert
INSTEAD OF INSERT ON emp_dept_view
FOR EACH ROW
BEGIN
    INSERT INTO employees (employee_id, first_name, salary, department_id)
    VALUES (:NEW.employee_id, :NEW.first_name, :NEW.salary, :NEW.department_id);
END;
/

-- Now this works:
INSERT INTO emp_dept_view (employee_id, first_name, salary, department_id)
VALUES (999, 'John', 50000, 10);
```

## DDL Trigger

```sql
CREATE OR REPLACE TRIGGER trg_ddl_audit
AFTER DDL ON SCHEMA
BEGIN
    INSERT INTO ddl_audit (
        event_type,
        object_type,
        object_name,
        sql_text,
        username,
        event_date
    ) VALUES (
        ORA_SYSEVENT,
        ORA_DICT_OBJ_TYPE,
        ORA_DICT_OBJ_NAME,
        NULL,  -- SQL text requires additional setup
        USER,
        SYSDATE
    );
END;
/
```

## System Trigger

```sql
-- LOGON trigger
CREATE OR REPLACE TRIGGER trg_logon_audit
AFTER LOGON ON DATABASE
BEGIN
    INSERT INTO logon_audit (username, logon_time, ip_address)
    VALUES (USER, SYSDATE, SYS_CONTEXT('USERENV', 'IP_ADDRESS'));
END;
/
```

## Enable/Disable Triggers

```sql
-- Disable trigger
ALTER TRIGGER trigger_name DISABLE;

-- Enable trigger
ALTER TRIGGER trigger_name ENABLE;

-- Disable all triggers on table
ALTER TABLE table_name DISABLE ALL TRIGGERS;

-- Enable all triggers on table
ALTER TABLE table_name ENABLE ALL TRIGGERS;
```

## Drop Trigger

```sql
DROP TRIGGER trigger_name;
```

## View Trigger Information

```sql
-- All triggers
SELECT trigger_name, table_name, triggering_event, status
FROM user_triggers;

-- Trigger source code
SELECT text
FROM user_source
WHERE name = 'TRIGGER_NAME'
AND type = 'TRIGGER'
ORDER BY line;
```
