# PL/SQL Cursors Quick Reference

## Cursor Types

| Type | Description |
|------|-------------|
| Implicit | Automatically created for single-row queries |
| Explicit | Declared and controlled by programmer |
| REF CURSOR | Dynamic cursor, can be passed between programs |

## Implicit Cursors

```sql
-- SQL%ROWCOUNT, SQL%FOUND, SQL%NOTFOUND, SQL%ISOPEN
BEGIN
    UPDATE employees SET salary = salary * 1.1 WHERE department_id = 10;

    IF SQL%ROWCOUNT = 0 THEN
        DBMS_OUTPUT.PUT_LINE('No rows updated');
    ELSE
        DBMS_OUTPUT.PUT_LINE(SQL%ROWCOUNT || ' rows updated');
    END IF;

    IF SQL%FOUND THEN
        DBMS_OUTPUT.PUT_LINE('Update successful');
    END IF;
END;
/
```

## Explicit Cursors

### Basic Explicit Cursor

```sql
DECLARE
    CURSOR emp_cursor IS
        SELECT employee_id, first_name, salary
        FROM employees
        WHERE department_id = 10;

    v_emp_id   employees.employee_id%TYPE;
    v_name     employees.first_name%TYPE;
    v_salary   employees.salary%TYPE;
BEGIN
    OPEN emp_cursor;

    LOOP
        FETCH emp_cursor INTO v_emp_id, v_name, v_salary;
        EXIT WHEN emp_cursor%NOTFOUND;
        DBMS_OUTPUT.PUT_LINE(v_name || ': ' || v_salary);
    END LOOP;

    CLOSE emp_cursor;
END;
/
```

### Cursor with %ROWTYPE

```sql
DECLARE
    CURSOR emp_cursor IS
        SELECT * FROM employees WHERE department_id = 10;

    v_emp emp_cursor%ROWTYPE;  -- Matches cursor structure
BEGIN
    OPEN emp_cursor;
    LOOP
        FETCH emp_cursor INTO v_emp;
        EXIT WHEN emp_cursor%NOTFOUND;
        DBMS_OUTPUT.PUT_LINE(v_emp.first_name);
    END LOOP;
    CLOSE emp_cursor;
END;
/
```

### Cursor FOR Loop (Preferred)

```sql
-- Auto OPEN, FETCH, CLOSE
DECLARE
    CURSOR emp_cursor IS
        SELECT employee_id, first_name, salary
        FROM employees WHERE department_id = 10;
BEGIN
    FOR emp_rec IN emp_cursor LOOP
        DBMS_OUTPUT.PUT_LINE(emp_rec.first_name || ': ' || emp_rec.salary);
    END LOOP;
    -- Cursor automatically closed
END;
/

-- Inline cursor (no declaration needed)
BEGIN
    FOR emp_rec IN (SELECT * FROM employees WHERE department_id = 10) LOOP
        DBMS_OUTPUT.PUT_LINE(emp_rec.first_name);
    END LOOP;
END;
/
```

### Cursor with Parameters

```sql
DECLARE
    CURSOR emp_cursor(p_dept_id NUMBER, p_min_salary NUMBER DEFAULT 0) IS
        SELECT employee_id, first_name, salary
        FROM employees
        WHERE department_id = p_dept_id
        AND salary >= p_min_salary;
BEGIN
    -- Open with parameters
    FOR emp_rec IN emp_cursor(10, 5000) LOOP
        DBMS_OUTPUT.PUT_LINE(emp_rec.first_name);
    END LOOP;

    -- Different parameters
    FOR emp_rec IN emp_cursor(20) LOOP  -- Uses default for p_min_salary
        DBMS_OUTPUT.PUT_LINE(emp_rec.first_name);
    END LOOP;
END;
/
```

### Cursor FOR UPDATE

```sql
DECLARE
    CURSOR emp_cursor IS
        SELECT employee_id, salary
        FROM employees
        WHERE department_id = 10
        FOR UPDATE OF salary;  -- Lock rows
BEGIN
    FOR emp_rec IN emp_cursor LOOP
        UPDATE employees
        SET salary = emp_rec.salary * 1.1
        WHERE CURRENT OF emp_cursor;  -- Update current row
    END LOOP;
    COMMIT;
END;
/

-- With NOWAIT
CURSOR emp_cursor IS
    SELECT * FROM employees FOR UPDATE NOWAIT;  -- Error if locked

-- With WAIT
CURSOR emp_cursor IS
    SELECT * FROM employees FOR UPDATE WAIT 5;  -- Wait 5 seconds
```

## Cursor Attributes

| Attribute | Description |
|-----------|-------------|
| `%FOUND` | TRUE if last FETCH returned a row |
| `%NOTFOUND` | TRUE if last FETCH returned no row |
| `%ISOPEN` | TRUE if cursor is open |
| `%ROWCOUNT` | Number of rows fetched so far |

```sql
DECLARE
    CURSOR emp_cursor IS SELECT * FROM employees;
    v_emp employees%ROWTYPE;
BEGIN
    IF NOT emp_cursor%ISOPEN THEN
        OPEN emp_cursor;
    END IF;

    LOOP
        FETCH emp_cursor INTO v_emp;
        EXIT WHEN emp_cursor%NOTFOUND;
        DBMS_OUTPUT.PUT_LINE('Row ' || emp_cursor%ROWCOUNT || ': ' || v_emp.first_name);
    END LOOP;

    DBMS_OUTPUT.PUT_LINE('Total rows: ' || emp_cursor%ROWCOUNT);
    CLOSE emp_cursor;
END;
/
```

## REF CURSOR (Dynamic Cursor)

### Weakly Typed REF CURSOR

```sql
DECLARE
    TYPE ref_cursor_type IS REF CURSOR;  -- Can return any structure
    v_cursor ref_cursor_type;
    v_emp    employees%ROWTYPE;
    v_dept   departments%ROWTYPE;
BEGIN
    -- Open for employees
    OPEN v_cursor FOR SELECT * FROM employees WHERE department_id = 10;
    LOOP
        FETCH v_cursor INTO v_emp;
        EXIT WHEN v_cursor%NOTFOUND;
        DBMS_OUTPUT.PUT_LINE(v_emp.first_name);
    END LOOP;
    CLOSE v_cursor;

    -- Reuse for departments
    OPEN v_cursor FOR SELECT * FROM departments;
    LOOP
        FETCH v_cursor INTO v_dept;
        EXIT WHEN v_cursor%NOTFOUND;
        DBMS_OUTPUT.PUT_LINE(v_dept.department_name);
    END LOOP;
    CLOSE v_cursor;
END;
/
```

### Strongly Typed REF CURSOR

```sql
DECLARE
    TYPE emp_cursor_type IS REF CURSOR RETURN employees%ROWTYPE;
    v_cursor emp_cursor_type;
    v_emp    employees%ROWTYPE;
BEGIN
    OPEN v_cursor FOR SELECT * FROM employees WHERE department_id = 10;
    LOOP
        FETCH v_cursor INTO v_emp;
        EXIT WHEN v_cursor%NOTFOUND;
        DBMS_OUTPUT.PUT_LINE(v_emp.first_name);
    END LOOP;
    CLOSE v_cursor;
END;
/
```

### SYS_REFCURSOR

```sql
-- Predefined weak REF CURSOR type
DECLARE
    v_cursor SYS_REFCURSOR;
    v_name   VARCHAR2(100);
    v_salary NUMBER;
BEGIN
    OPEN v_cursor FOR
        SELECT first_name, salary FROM employees WHERE department_id = 10;

    LOOP
        FETCH v_cursor INTO v_name, v_salary;
        EXIT WHEN v_cursor%NOTFOUND;
        DBMS_OUTPUT.PUT_LINE(v_name || ': ' || v_salary);
    END LOOP;

    CLOSE v_cursor;
END;
/
```

### Passing REF CURSOR

```sql
-- Procedure returning REF CURSOR
CREATE OR REPLACE PROCEDURE get_employees(
    p_dept_id IN  NUMBER,
    p_cursor  OUT SYS_REFCURSOR
)
IS
BEGIN
    OPEN p_cursor FOR
        SELECT employee_id, first_name, salary
        FROM employees
        WHERE department_id = p_dept_id;
END;
/

-- Usage
DECLARE
    v_cursor  SYS_REFCURSOR;
    v_emp_id  NUMBER;
    v_name    VARCHAR2(100);
    v_salary  NUMBER;
BEGIN
    get_employees(10, v_cursor);

    LOOP
        FETCH v_cursor INTO v_emp_id, v_name, v_salary;
        EXIT WHEN v_cursor%NOTFOUND;
        DBMS_OUTPUT.PUT_LINE(v_name);
    END LOOP;

    CLOSE v_cursor;
END;
/
```

## BULK COLLECT

```sql
DECLARE
    TYPE emp_tab IS TABLE OF employees%ROWTYPE;
    v_employees emp_tab;
BEGIN
    -- Fetch all at once
    SELECT * BULK COLLECT INTO v_employees
    FROM employees WHERE department_id = 10;

    FOR i IN 1..v_employees.COUNT LOOP
        DBMS_OUTPUT.PUT_LINE(v_employees(i).first_name);
    END LOOP;
END;
/

-- With LIMIT
DECLARE
    CURSOR emp_cursor IS SELECT * FROM employees;
    TYPE emp_tab IS TABLE OF employees%ROWTYPE;
    v_employees emp_tab;
BEGIN
    OPEN emp_cursor;
    LOOP
        FETCH emp_cursor BULK COLLECT INTO v_employees LIMIT 100;
        EXIT WHEN v_employees.COUNT = 0;

        -- Process batch
        FOR i IN 1..v_employees.COUNT LOOP
            DBMS_OUTPUT.PUT_LINE(v_employees(i).first_name);
        END LOOP;
    END LOOP;
    CLOSE emp_cursor;
END;
/
```

## Cursor Variables in Packages

```sql
CREATE OR REPLACE PACKAGE cursor_pkg AS
    TYPE emp_cursor_type IS REF CURSOR RETURN employees%ROWTYPE;

    FUNCTION get_employees(p_dept_id NUMBER) RETURN emp_cursor_type;
END;
/

CREATE OR REPLACE PACKAGE BODY cursor_pkg AS
    FUNCTION get_employees(p_dept_id NUMBER) RETURN emp_cursor_type IS
        v_cursor emp_cursor_type;
    BEGIN
        OPEN v_cursor FOR
            SELECT * FROM employees WHERE department_id = p_dept_id;
        RETURN v_cursor;
    END;
END;
/
```

## Best Practices

1. **Use FOR loops** - Automatic open/fetch/close
2. **Use BULK COLLECT** - For large result sets
3. **Close cursors** - Prevent memory leaks
4. **Use %TYPE/%ROWTYPE** - Type safety
5. **Use LIMIT** - Control memory with BULK COLLECT
6. **Avoid excessive opens** - Reuse cursors when possible
