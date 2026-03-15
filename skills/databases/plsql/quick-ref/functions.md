# PL/SQL Functions Quick Reference

## Basic Syntax

```sql
CREATE [OR REPLACE] FUNCTION function_name
    [(parameter1 [IN] datatype [DEFAULT value], ...)]
RETURN return_datatype
[DETERMINISTIC]
[PARALLEL_ENABLE]
[PIPELINED]
[RESULT_CACHE]
IS | AS
    -- Declaration section
BEGIN
    -- Executable section
    RETURN value;
[EXCEPTION
    -- Exception handling]
END [function_name];
/
```

## Scalar Function

```sql
CREATE OR REPLACE FUNCTION get_full_name(
    p_first_name IN VARCHAR2,
    p_last_name  IN VARCHAR2
)
RETURN VARCHAR2
DETERMINISTIC
IS
BEGIN
    RETURN p_first_name || ' ' || p_last_name;
END;
/

-- Usage in SQL
SELECT get_full_name(first_name, last_name) AS full_name FROM employees;

-- Usage in PL/SQL
DECLARE
    v_name VARCHAR2(100);
BEGIN
    v_name := get_full_name('John', 'Doe');
END;
/
```

## Function Properties

| Property | Description |
|----------|-------------|
| `DETERMINISTIC` | Same inputs always return same output |
| `PARALLEL_ENABLE` | Can run in parallel query |
| `PIPELINED` | Returns rows one at a time |
| `RESULT_CACHE` | Cache results (11g+) |

```sql
CREATE OR REPLACE FUNCTION calc_tax(p_amount NUMBER)
RETURN NUMBER
DETERMINISTIC
PARALLEL_ENABLE
RESULT_CACHE
IS
BEGIN
    RETURN p_amount * 0.21;
END;
/
```

## Table Function

```sql
-- Create types first
CREATE OR REPLACE TYPE emp_obj AS OBJECT (
    emp_id   NUMBER,
    emp_name VARCHAR2(100),
    salary   NUMBER
);
/

CREATE OR REPLACE TYPE emp_tab AS TABLE OF emp_obj;
/

-- Standard table function
CREATE OR REPLACE FUNCTION get_dept_employees(p_dept_id NUMBER)
RETURN emp_tab
IS
    v_result emp_tab := emp_tab();
BEGIN
    FOR rec IN (SELECT employee_id, first_name || ' ' || last_name, salary
                FROM employees WHERE department_id = p_dept_id)
    LOOP
        v_result.EXTEND;
        v_result(v_result.COUNT) := emp_obj(rec.employee_id, rec.first_name, rec.salary);
    END LOOP;
    RETURN v_result;
END;
/

-- Usage
SELECT * FROM TABLE(get_dept_employees(10));
```

## Pipelined Table Function

```sql
CREATE OR REPLACE FUNCTION get_employees_piped(p_dept_id NUMBER)
RETURN emp_tab
PIPELINED
IS
BEGIN
    FOR rec IN (SELECT employee_id, first_name || ' ' || last_name AS name, salary
                FROM employees WHERE department_id = p_dept_id)
    LOOP
        PIPE ROW(emp_obj(rec.employee_id, rec.name, rec.salary));
    END LOOP;
    RETURN;  -- No value returned
END;
/

-- Usage (same as regular table function)
SELECT * FROM TABLE(get_employees_piped(10));
```

## Function with REF CURSOR

```sql
CREATE OR REPLACE FUNCTION get_employee_cursor(p_dept_id NUMBER)
RETURN SYS_REFCURSOR
IS
    v_cursor SYS_REFCURSOR;
BEGIN
    OPEN v_cursor FOR
        SELECT * FROM employees WHERE department_id = p_dept_id;
    RETURN v_cursor;
END;
/

-- Usage
DECLARE
    v_cursor SYS_REFCURSOR;
    v_emp    employees%ROWTYPE;
BEGIN
    v_cursor := get_employee_cursor(10);
    LOOP
        FETCH v_cursor INTO v_emp;
        EXIT WHEN v_cursor%NOTFOUND;
        DBMS_OUTPUT.PUT_LINE(v_emp.first_name);
    END LOOP;
    CLOSE v_cursor;
END;
/
```

## Result Cache (11g+)

```sql
CREATE OR REPLACE FUNCTION get_tax_rate(p_region VARCHAR2)
RETURN NUMBER
RESULT_CACHE RELIES_ON (tax_rates)
IS
    v_rate NUMBER;
BEGIN
    SELECT rate INTO v_rate FROM tax_rates WHERE region = p_region;
    RETURN v_rate;
END;
/

-- Cache is automatically invalidated when tax_rates changes
```

## Function in SQL Restrictions

Functions used in SQL cannot:
- Modify database state (INSERT, UPDATE, DELETE)
- Use COMMIT or ROLLBACK
- Call other functions that violate these rules
- Use session variables

```sql
-- This function CAN be used in SQL
CREATE OR REPLACE FUNCTION safe_function(p_value NUMBER)
RETURN NUMBER
DETERMINISTIC
IS
BEGIN
    RETURN p_value * 2;
END;
/

-- This function CANNOT be used in SQL
CREATE OR REPLACE FUNCTION unsafe_function(p_value NUMBER)
RETURN NUMBER
IS
BEGIN
    INSERT INTO log_table VALUES (p_value, SYSDATE);
    RETURN p_value * 2;
END;
/
```

## Function Overloading (in Packages)

```sql
CREATE OR REPLACE PACKAGE format_pkg AS
    FUNCTION format_value(p_value NUMBER) RETURN VARCHAR2;
    FUNCTION format_value(p_value DATE) RETURN VARCHAR2;
    FUNCTION format_value(p_value VARCHAR2) RETURN VARCHAR2;
END;
/

CREATE OR REPLACE PACKAGE BODY format_pkg AS
    FUNCTION format_value(p_value NUMBER) RETURN VARCHAR2 IS
    BEGIN
        RETURN TO_CHAR(p_value, 'FM999,999.00');
    END;

    FUNCTION format_value(p_value DATE) RETURN VARCHAR2 IS
    BEGIN
        RETURN TO_CHAR(p_value, 'YYYY-MM-DD');
    END;

    FUNCTION format_value(p_value VARCHAR2) RETURN VARCHAR2 IS
    BEGIN
        RETURN UPPER(TRIM(p_value));
    END;
END;
/
```

## Common Patterns

### Validation Function

```sql
CREATE OR REPLACE FUNCTION is_valid_email(p_email VARCHAR2)
RETURN BOOLEAN
DETERMINISTIC
IS
BEGIN
    RETURN REGEXP_LIKE(p_email, '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
END;
/
```

### Lookup Function

```sql
CREATE OR REPLACE FUNCTION get_department_name(p_dept_id NUMBER)
RETURN VARCHAR2
RESULT_CACHE RELIES_ON (departments)
IS
    v_name VARCHAR2(100);
BEGIN
    SELECT department_name INTO v_name
    FROM departments WHERE department_id = p_dept_id;
    RETURN v_name;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RETURN NULL;
END;
/
```

### Aggregation Function

```sql
CREATE OR REPLACE FUNCTION get_dept_stats(p_dept_id NUMBER)
RETURN VARCHAR2
IS
    v_count  NUMBER;
    v_total  NUMBER;
    v_avg    NUMBER;
BEGIN
    SELECT COUNT(*), SUM(salary), AVG(salary)
    INTO v_count, v_total, v_avg
    FROM employees WHERE department_id = p_dept_id;

    RETURN 'Count: ' || v_count ||
           ', Total: ' || TO_CHAR(v_total, 'FM$999,999') ||
           ', Avg: ' || TO_CHAR(v_avg, 'FM$999,999');
END;
/
```

## Drop Function

```sql
DROP FUNCTION function_name;
```

## View Function Code

```sql
SELECT text
FROM user_source
WHERE name = 'FUNCTION_NAME'
AND type = 'FUNCTION'
ORDER BY line;
```
