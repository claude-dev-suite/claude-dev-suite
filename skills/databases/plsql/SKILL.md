---
name: plsql
description: |
  Oracle PL/SQL procedural language. Covers stored procedures, functions,
  packages, triggers, cursors, collections, and exception handling.
  Use for Oracle database server-side programming.

  USE WHEN: user mentions "plsql", "Oracle procedures", "Oracle packages",
  "Oracle triggers", "BULK COLLECT", "FORALL", "DBMS_OUTPUT", "Oracle functions"

  DO NOT USE FOR: basic Oracle SQL - use `oracle` instead,
  PostgreSQL - use `plpgsql` instead, T-SQL - use `tsql` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Oracle PL/SQL Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for pipelined table functions, packages, collections, BULK COLLECT/FORALL, compound triggers, and advanced cursors.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `oracle` for comprehensive documentation.

## Basic Structure

```sql
DECLARE
    -- Variable declarations
    v_count NUMBER := 0;
BEGIN
    -- Executable statements
    DBMS_OUTPUT.PUT_LINE('Hello World');
EXCEPTION
    WHEN OTHERS THEN
        -- Exception handling
        DBMS_OUTPUT.PUT_LINE('Error: ' || SQLERRM);
END;
/
```

## Procedures

### Basic Procedure

```sql
CREATE OR REPLACE PROCEDURE update_salary(
    p_employee_id IN NUMBER,
    p_percentage  IN NUMBER
)
IS
    v_current_salary NUMBER;
BEGIN
    SELECT salary INTO v_current_salary
    FROM employees
    WHERE employee_id = p_employee_id;

    UPDATE employees
    SET salary = salary * (1 + p_percentage / 100)
    WHERE employee_id = p_employee_id;

    COMMIT;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RAISE_APPLICATION_ERROR(-20001, 'Employee not found: ' || p_employee_id);
END update_salary;
/

-- Execute
EXEC update_salary(100, 10);
-- or
BEGIN
    update_salary(100, 10);
END;
/
```

### Procedure with OUT Parameters

```sql
CREATE OR REPLACE PROCEDURE get_employee_info(
    p_employee_id IN  NUMBER,
    p_name        OUT VARCHAR2,
    p_salary      OUT NUMBER,
    p_dept_name   OUT VARCHAR2
)
IS
BEGIN
    SELECT e.first_name || ' ' || e.last_name,
           e.salary,
           d.department_name
    INTO p_name, p_salary, p_dept_name
    FROM employees e
    JOIN departments d ON e.department_id = d.department_id
    WHERE e.employee_id = p_employee_id;
END;
/

-- Call with OUT parameters
DECLARE
    v_name VARCHAR2(100);
    v_salary NUMBER;
    v_dept VARCHAR2(100);
BEGIN
    get_employee_info(100, v_name, v_salary, v_dept);
    DBMS_OUTPUT.PUT_LINE(v_name || ': ' || v_salary);
END;
/
```

## Functions

### Scalar Function

```sql
CREATE OR REPLACE FUNCTION calculate_bonus(
    p_salary IN NUMBER,
    p_years  IN NUMBER
)
RETURN NUMBER
DETERMINISTIC  -- Same inputs always return same output
IS
    v_bonus NUMBER;
BEGIN
    IF p_years >= 10 THEN
        v_bonus := p_salary * 0.15;
    ELSIF p_years >= 5 THEN
        v_bonus := p_salary * 0.10;
    ELSE
        v_bonus := p_salary * 0.05;
    END IF;

    RETURN v_bonus;
END;
/

-- Usage in SQL
SELECT employee_id, salary, calculate_bonus(salary, years_of_service) as bonus
FROM employees;
```

## Cursors

### Implicit Cursor

```sql
BEGIN
    UPDATE employees SET salary = salary * 1.1 WHERE department_id = 10;
    DBMS_OUTPUT.PUT_LINE('Rows updated: ' || SQL%ROWCOUNT);

    IF SQL%NOTFOUND THEN
        DBMS_OUTPUT.PUT_LINE('No rows found');
    END IF;
END;
/
```

### Explicit Cursor

```sql
DECLARE
    CURSOR emp_cursor IS
        SELECT employee_id, first_name, salary
        FROM employees
        WHERE department_id = 10;

    v_emp emp_cursor%ROWTYPE;
BEGIN
    OPEN emp_cursor;
    LOOP
        FETCH emp_cursor INTO v_emp;
        EXIT WHEN emp_cursor%NOTFOUND;
        DBMS_OUTPUT.PUT_LINE(v_emp.first_name || ': ' || v_emp.salary);
    END LOOP;
    CLOSE emp_cursor;
END;
/
```

### Cursor FOR Loop (Preferred)

```sql
BEGIN
    FOR emp_rec IN (SELECT employee_id, first_name, salary
                    FROM employees WHERE department_id = 10)
    LOOP
        DBMS_OUTPUT.PUT_LINE(emp_rec.first_name || ': ' || emp_rec.salary);
    END LOOP;
END;
/
```

## Collections

### Associative Array (INDEX BY)

```sql
DECLARE
    TYPE salary_tab IS TABLE OF NUMBER INDEX BY PLS_INTEGER;
    TYPE name_tab IS TABLE OF VARCHAR2(100) INDEX BY VARCHAR2(20);

    salaries salary_tab;
    names    name_tab;
BEGIN
    salaries(1) := 50000;
    salaries(2) := 60000;

    names('EMP001') := 'John Doe';
    names('EMP002') := 'Jane Smith';

    DBMS_OUTPUT.PUT_LINE(salaries(1));
    DBMS_OUTPUT.PUT_LINE(names('EMP001'));
END;
/
```

## Exception Handling

### Predefined Exceptions

| Exception | Description |
|-----------|-------------|
| `NO_DATA_FOUND` | SELECT INTO returned no rows |
| `TOO_MANY_ROWS` | SELECT INTO returned multiple rows |
| `ZERO_DIVIDE` | Division by zero |
| `VALUE_ERROR` | Numeric or value error |
| `INVALID_CURSOR` | Invalid cursor operation |
| `DUP_VAL_ON_INDEX` | Duplicate value on unique index |

### Exception Handling

```sql
DECLARE
    v_salary NUMBER;
BEGIN
    SELECT salary INTO v_salary FROM employees WHERE employee_id = 9999;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        DBMS_OUTPUT.PUT_LINE('Employee not found');
    WHEN TOO_MANY_ROWS THEN
        DBMS_OUTPUT.PUT_LINE('Multiple employees found');
    WHEN OTHERS THEN
        DBMS_OUTPUT.PUT_LINE('Error: ' || SQLCODE || ' - ' || SQLERRM);
        RAISE;
END;
/
```

### RAISE_APPLICATION_ERROR

```sql
BEGIN
    IF some_condition THEN
        RAISE_APPLICATION_ERROR(-20001, 'Custom error message');
    END IF;
END;
/
```

## Triggers

### Row-Level Trigger

```sql
CREATE OR REPLACE TRIGGER trg_emp_salary_check
BEFORE INSERT OR UPDATE OF salary ON employees
FOR EACH ROW
BEGIN
    IF :NEW.salary < 0 THEN
        RAISE_APPLICATION_ERROR(-20001, 'Salary cannot be negative');
    END IF;

    IF :NEW.salary > 1000000 THEN
        RAISE_APPLICATION_ERROR(-20002, 'Salary exceeds maximum');
    END IF;
END;
/
```

## Best Practices

### DO
- Use packages to organize related code
- Use BULK COLLECT and FORALL for large datasets
- Use cursor FOR loops (auto open/close)
- Define exceptions at package level
- Use %TYPE and %ROWTYPE for type safety
- Use bind variables to prevent SQL injection

### DON'T
- Use implicit commits in triggers
- Ignore exceptions
- Use SELECT INTO without handling NO_DATA_FOUND
- Create excessive triggers (performance impact)

## When NOT to Use This Skill

- **Basic Oracle SQL** - Use `oracle` skill for queries, data types, partitioning
- **PL/pgSQL (PostgreSQL)** - Use `plpgsql` skill for PostgreSQL procedures
- **T-SQL (SQL Server)** - Use `tsql` skill for SQL Server procedures
- **Basic SQL** - Use `sql-fundamentals` for ANSI SQL basics

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Not using BULK COLLECT | Row-by-row processing | Use BULK COLLECT for large datasets |
| SELECT INTO without exception | Runtime errors | Handle NO_DATA_FOUND |
| Not using packages | Code disorganization | Organize related code in packages |
| Excessive triggers | Performance issues | Minimize trigger logic |
| WHEN OTHERS without RAISE | Silent failures | Re-raise or log exceptions |
| Implicit cursors for large sets | Memory issues | Use explicit cursors with LIMIT |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| NO_DATA_FOUND | SELECT INTO with no rows | Add exception handler |
| TOO_MANY_ROWS | SELECT INTO with multiple rows | Add WHERE or use cursor |
| ORA-06502 numeric error | Type conversion failure | Check data types, use TO_NUMBER |
| Slow procedure | DBMS_PROFILER | Use BULK operations |
| Package state lost | Session reset | Use PRAGMA SERIALLY_REUSABLE or re-initialize |

## Reference Documentation

- [Procedures](quick-ref/procedures.md)
- [Functions](quick-ref/functions.md)
- [Triggers](quick-ref/triggers.md)
- [Packages](quick-ref/packages.md)
- [Cursors](quick-ref/cursors.md)
