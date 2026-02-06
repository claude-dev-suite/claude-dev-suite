# PL/SQL Packages Quick Reference

## Package Structure

```
Package = Specification (public interface) + Body (implementation)
```

## Package Specification

```sql
CREATE [OR REPLACE] PACKAGE package_name
AS | IS
    -- Public type declarations
    TYPE type_name IS ...;

    -- Public constant declarations
    constant_name CONSTANT datatype := value;

    -- Public variable declarations
    variable_name datatype;

    -- Public cursor declarations
    CURSOR cursor_name IS SELECT ...;

    -- Public exception declarations
    exception_name EXCEPTION;

    -- Public procedure declarations
    PROCEDURE procedure_name(parameters);

    -- Public function declarations
    FUNCTION function_name(parameters) RETURN datatype;

END [package_name];
/
```

## Package Body

```sql
CREATE [OR REPLACE] PACKAGE BODY package_name
AS | IS
    -- Private type declarations
    -- Private constants
    -- Private variables
    -- Private cursors
    -- Private procedures/functions

    -- Public procedure implementations
    PROCEDURE procedure_name(parameters)
    IS
    BEGIN
        -- implementation
    END procedure_name;

    -- Public function implementations
    FUNCTION function_name(parameters) RETURN datatype
    IS
    BEGIN
        RETURN value;
    END function_name;

-- Package initialization (optional)
BEGIN
    -- Runs once when package first loaded
END [package_name];
/
```

## Complete Example

```sql
-- Specification
CREATE OR REPLACE PACKAGE employee_api AS
    -- Types
    TYPE emp_rec IS RECORD (
        id        NUMBER,
        full_name VARCHAR2(200),
        salary    NUMBER,
        dept_name VARCHAR2(100)
    );
    TYPE emp_tab IS TABLE OF emp_rec;

    -- Constants
    c_max_salary CONSTANT NUMBER := 500000;
    c_min_salary CONSTANT NUMBER := 30000;

    -- Exceptions
    e_invalid_salary EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_invalid_salary, -20001);

    -- Procedures
    PROCEDURE hire_employee(
        p_first_name  IN VARCHAR2,
        p_last_name   IN VARCHAR2,
        p_email       IN VARCHAR2,
        p_salary      IN NUMBER,
        p_dept_id     IN NUMBER,
        p_employee_id OUT NUMBER
    );

    PROCEDURE terminate_employee(p_employee_id IN NUMBER);

    PROCEDURE give_raise(
        p_employee_id IN NUMBER,
        p_percentage  IN NUMBER
    );

    -- Functions
    FUNCTION get_employee(p_employee_id NUMBER) RETURN emp_rec;
    FUNCTION get_dept_employees(p_dept_id NUMBER) RETURN emp_tab PIPELINED;
    FUNCTION get_total_salary(p_dept_id NUMBER) RETURN NUMBER;

END employee_api;
/

-- Body
CREATE OR REPLACE PACKAGE BODY employee_api AS

    -- Private variables
    g_last_employee_id NUMBER;

    -- Private procedures
    PROCEDURE log_action(p_action VARCHAR2, p_employee_id NUMBER) IS
        PRAGMA AUTONOMOUS_TRANSACTION;
    BEGIN
        INSERT INTO audit_log (action, employee_id, action_date, action_by)
        VALUES (p_action, p_employee_id, SYSDATE, USER);
        COMMIT;
    END log_action;

    PROCEDURE validate_salary(p_salary NUMBER) IS
    BEGIN
        IF p_salary < c_min_salary OR p_salary > c_max_salary THEN
            RAISE e_invalid_salary;
        END IF;
    END validate_salary;

    -- Public implementations
    PROCEDURE hire_employee(
        p_first_name  IN VARCHAR2,
        p_last_name   IN VARCHAR2,
        p_email       IN VARCHAR2,
        p_salary      IN NUMBER,
        p_dept_id     IN NUMBER,
        p_employee_id OUT NUMBER
    ) IS
    BEGIN
        validate_salary(p_salary);

        INSERT INTO employees (
            employee_id, first_name, last_name, email,
            salary, department_id, hire_date
        ) VALUES (
            emp_seq.NEXTVAL, p_first_name, p_last_name, p_email,
            p_salary, p_dept_id, SYSDATE
        ) RETURNING employee_id INTO p_employee_id;

        g_last_employee_id := p_employee_id;
        log_action('HIRE', p_employee_id);
        COMMIT;
    EXCEPTION
        WHEN e_invalid_salary THEN
            RAISE_APPLICATION_ERROR(-20001,
                'Salary must be between ' || c_min_salary || ' and ' || c_max_salary);
    END hire_employee;

    PROCEDURE terminate_employee(p_employee_id IN NUMBER) IS
    BEGIN
        UPDATE employees
        SET termination_date = SYSDATE,
            status = 'TERMINATED'
        WHERE employee_id = p_employee_id;

        IF SQL%ROWCOUNT = 0 THEN
            RAISE_APPLICATION_ERROR(-20002, 'Employee not found');
        END IF;

        log_action('TERMINATE', p_employee_id);
        COMMIT;
    END terminate_employee;

    PROCEDURE give_raise(
        p_employee_id IN NUMBER,
        p_percentage  IN NUMBER
    ) IS
        v_new_salary NUMBER;
    BEGIN
        SELECT salary * (1 + p_percentage / 100)
        INTO v_new_salary
        FROM employees WHERE employee_id = p_employee_id;

        validate_salary(v_new_salary);

        UPDATE employees
        SET salary = v_new_salary
        WHERE employee_id = p_employee_id;

        log_action('RAISE', p_employee_id);
        COMMIT;
    END give_raise;

    FUNCTION get_employee(p_employee_id NUMBER) RETURN emp_rec IS
        v_result emp_rec;
    BEGIN
        SELECT e.employee_id,
               e.first_name || ' ' || e.last_name,
               e.salary,
               d.department_name
        INTO v_result.id, v_result.full_name, v_result.salary, v_result.dept_name
        FROM employees e
        JOIN departments d ON e.department_id = d.department_id
        WHERE e.employee_id = p_employee_id;

        RETURN v_result;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            RETURN NULL;
    END get_employee;

    FUNCTION get_dept_employees(p_dept_id NUMBER) RETURN emp_tab PIPELINED IS
    BEGIN
        FOR rec IN (
            SELECT e.employee_id,
                   e.first_name || ' ' || e.last_name AS full_name,
                   e.salary,
                   d.department_name
            FROM employees e
            JOIN departments d ON e.department_id = d.department_id
            WHERE e.department_id = p_dept_id
        ) LOOP
            PIPE ROW(rec);
        END LOOP;
        RETURN;
    END get_dept_employees;

    FUNCTION get_total_salary(p_dept_id NUMBER) RETURN NUMBER IS
        v_total NUMBER;
    BEGIN
        SELECT NVL(SUM(salary), 0) INTO v_total
        FROM employees WHERE department_id = p_dept_id;
        RETURN v_total;
    END get_total_salary;

-- Package initialization
BEGIN
    g_last_employee_id := 0;
END employee_api;
/
```

## Using Packages

```sql
-- Call procedure
BEGIN
    employee_api.give_raise(100, 10);
END;
/

-- Call function in SQL
SELECT employee_api.get_total_salary(10) FROM DUAL;

-- Use type
DECLARE
    v_emp employee_api.emp_rec;
BEGIN
    v_emp := employee_api.get_employee(100);
    DBMS_OUTPUT.PUT_LINE(v_emp.full_name);
END;
/

-- Use pipelined function
SELECT * FROM TABLE(employee_api.get_dept_employees(10));

-- Access constant
DECLARE
    v_max NUMBER := employee_api.c_max_salary;
BEGIN
    NULL;
END;
/
```

## Package State

```sql
-- Package variables persist for session duration
CREATE OR REPLACE PACKAGE counter_pkg AS
    PROCEDURE increment;
    FUNCTION get_count RETURN NUMBER;
END;
/

CREATE OR REPLACE PACKAGE BODY counter_pkg AS
    g_count NUMBER := 0;  -- Session-level state

    PROCEDURE increment IS
    BEGIN
        g_count := g_count + 1;
    END;

    FUNCTION get_count RETURN NUMBER IS
    BEGIN
        RETURN g_count;
    END;
END;
/

-- Different sessions have independent state
```

## SERIALLY_REUSABLE

```sql
-- Reset package state after each call
CREATE OR REPLACE PACKAGE stateless_pkg AS
    PRAGMA SERIALLY_REUSABLE;
    g_counter NUMBER := 0;
    PROCEDURE do_something;
END;
/
```

## Package Dependencies

```sql
-- Check dependencies
SELECT * FROM user_dependencies
WHERE name = 'PACKAGE_NAME';

-- Recompile package
ALTER PACKAGE package_name COMPILE;
ALTER PACKAGE package_name COMPILE BODY;
ALTER PACKAGE package_name COMPILE SPECIFICATION;
```

## Drop Package

```sql
-- Drop entire package
DROP PACKAGE package_name;

-- Drop only body (keep specification)
DROP PACKAGE BODY package_name;
```

## View Package Code

```sql
-- Specification
SELECT text FROM user_source
WHERE name = 'PACKAGE_NAME' AND type = 'PACKAGE'
ORDER BY line;

-- Body
SELECT text FROM user_source
WHERE name = 'PACKAGE_NAME' AND type = 'PACKAGE BODY'
ORDER BY line;
```

## Best Practices

1. **One package per business domain** - Group related functionality
2. **Keep specification minimal** - Only expose what's necessary
3. **Use private procedures** - Hide implementation details
4. **Initialize in body** - Use package initialization block
5. **Document public interface** - Add comments in specification
6. **Use constants** - Define magic numbers as package constants
7. **Handle exceptions** - Wrap exceptions with meaningful messages
