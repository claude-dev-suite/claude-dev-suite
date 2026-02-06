# PL/SQL Advanced Patterns

## Table Functions (Pipelined)

```sql
-- Define return type
CREATE OR REPLACE TYPE emp_record AS OBJECT (
    emp_id NUMBER,
    emp_name VARCHAR2(100),
    salary NUMBER
);
/

CREATE OR REPLACE TYPE emp_table AS TABLE OF emp_record;
/

-- Pipelined function
CREATE OR REPLACE FUNCTION get_employees_by_dept(p_dept_id NUMBER)
RETURN emp_table PIPELINED
IS
BEGIN
    FOR rec IN (SELECT employee_id, first_name || ' ' || last_name as name, salary
                FROM employees WHERE department_id = p_dept_id)
    LOOP
        PIPE ROW(emp_record(rec.employee_id, rec.name, rec.salary));
    END LOOP;
    RETURN;
END;
/

-- Usage
SELECT * FROM TABLE(get_employees_by_dept(10));
```

---

## Packages

### Package Specification

```sql
CREATE OR REPLACE PACKAGE employee_pkg AS
    -- Constants
    c_max_salary CONSTANT NUMBER := 100000;

    -- Types
    TYPE emp_rec IS RECORD (
        emp_id   NUMBER,
        emp_name VARCHAR2(100),
        salary   NUMBER
    );

    TYPE emp_tab IS TABLE OF emp_rec INDEX BY PLS_INTEGER;

    -- Public procedures/functions
    PROCEDURE hire_employee(
        p_name       IN VARCHAR2,
        p_salary     IN NUMBER,
        p_dept_id    IN NUMBER
    );

    FUNCTION get_employee_count(p_dept_id IN NUMBER) RETURN NUMBER;

    PROCEDURE give_raise(
        p_employee_id IN NUMBER,
        p_percentage  IN NUMBER
    );
END employee_pkg;
/
```

### Package Body

```sql
CREATE OR REPLACE PACKAGE BODY employee_pkg AS
    -- Private variables
    g_last_emp_id NUMBER;

    -- Private procedure
    PROCEDURE log_action(p_action VARCHAR2) IS
    BEGIN
        INSERT INTO audit_log (action, created_at)
        VALUES (p_action, SYSDATE);
    END;

    -- Public implementations
    PROCEDURE hire_employee(
        p_name    IN VARCHAR2,
        p_salary  IN NUMBER,
        p_dept_id IN NUMBER
    ) IS
    BEGIN
        INSERT INTO employees (employee_id, first_name, salary, department_id)
        VALUES (emp_seq.NEXTVAL, p_name, p_salary, p_dept_id)
        RETURNING employee_id INTO g_last_emp_id;

        log_action('Hired: ' || p_name);
        COMMIT;
    END;

    FUNCTION get_employee_count(p_dept_id IN NUMBER) RETURN NUMBER IS
        v_count NUMBER;
    BEGIN
        SELECT COUNT(*) INTO v_count
        FROM employees
        WHERE department_id = p_dept_id;
        RETURN v_count;
    END;

    PROCEDURE give_raise(
        p_employee_id IN NUMBER,
        p_percentage  IN NUMBER
    ) IS
    BEGIN
        UPDATE employees
        SET salary = salary * (1 + p_percentage / 100)
        WHERE employee_id = p_employee_id;

        log_action('Raise for: ' || p_employee_id);
        COMMIT;
    END;

-- Package initialization
BEGIN
    g_last_emp_id := 0;
END employee_pkg;
/

-- Usage
BEGIN
    employee_pkg.hire_employee('John Doe', 50000, 10);
    employee_pkg.give_raise(100, 5);
END;
/

SELECT employee_pkg.get_employee_count(10) FROM DUAL;
```

---

## Advanced Cursors

### Cursor FOR UPDATE

```sql
DECLARE
    CURSOR emp_cursor IS
        SELECT * FROM employees
        WHERE department_id = 10
        FOR UPDATE OF salary;
BEGIN
    FOR emp_rec IN emp_cursor LOOP
        UPDATE employees
        SET salary = salary * 1.1
        WHERE CURRENT OF emp_cursor;
    END LOOP;
    COMMIT;
END;
/
```

### Cursor with Parameters

```sql
DECLARE
    CURSOR emp_cursor(p_dept_id NUMBER, p_min_salary NUMBER) IS
        SELECT * FROM employees
        WHERE department_id = p_dept_id AND salary >= p_min_salary;
BEGIN
    FOR emp_rec IN emp_cursor(10, 5000) LOOP
        DBMS_OUTPUT.PUT_LINE(emp_rec.first_name);
    END LOOP;
END;
/
```

---

## Collections

### Nested Table

```sql
CREATE OR REPLACE TYPE number_tab AS TABLE OF NUMBER;
/

DECLARE
    v_numbers number_tab := number_tab(10, 20, 30, 40, 50);
BEGIN
    v_numbers.EXTEND;
    v_numbers(6) := 60;

    FOR i IN 1..v_numbers.COUNT LOOP
        DBMS_OUTPUT.PUT_LINE(v_numbers(i));
    END LOOP;
END;
/
```

### VARRAY

```sql
CREATE OR REPLACE TYPE phone_array AS VARRAY(5) OF VARCHAR2(20);
/

DECLARE
    v_phones phone_array := phone_array('555-1234', '555-5678');
BEGIN
    v_phones.EXTEND;
    v_phones(3) := '555-9999';

    FOR i IN 1..v_phones.COUNT LOOP
        DBMS_OUTPUT.PUT_LINE(v_phones(i));
    END LOOP;
END;
/
```

### BULK COLLECT

```sql
DECLARE
    TYPE emp_tab IS TABLE OF employees%ROWTYPE;
    v_employees emp_tab;
BEGIN
    SELECT * BULK COLLECT INTO v_employees
    FROM employees
    WHERE department_id = 10;

    FOR i IN 1..v_employees.COUNT LOOP
        DBMS_OUTPUT.PUT_LINE(v_employees(i).first_name);
    END LOOP;
END;
/
```

### FORALL (Bulk DML)

```sql
DECLARE
    TYPE id_tab IS TABLE OF NUMBER;
    v_ids id_tab := id_tab(100, 101, 102, 103);
BEGIN
    FORALL i IN 1..v_ids.COUNT
        UPDATE employees
        SET salary = salary * 1.1
        WHERE employee_id = v_ids(i);

    DBMS_OUTPUT.PUT_LINE('Rows updated: ' || SQL%ROWCOUNT);
    COMMIT;
END;
/
```

---

## User-Defined Exceptions

```sql
DECLARE
    e_salary_too_high EXCEPTION;
    PRAGMA EXCEPTION_INIT(e_salary_too_high, -20001);
    v_salary NUMBER;
BEGIN
    SELECT salary INTO v_salary FROM employees WHERE employee_id = 100;

    IF v_salary > 100000 THEN
        RAISE e_salary_too_high;
    END IF;
EXCEPTION
    WHEN e_salary_too_high THEN
        DBMS_OUTPUT.PUT_LINE('Salary exceeds maximum');
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

---

## Compound Triggers (11g+)

```sql
CREATE OR REPLACE TRIGGER trg_emp_compound
FOR INSERT OR UPDATE ON employees
COMPOUND TRIGGER
    TYPE emp_tab IS TABLE OF employees%ROWTYPE INDEX BY PLS_INTEGER;
    g_employees emp_tab;
    g_index PLS_INTEGER := 0;

BEFORE STATEMENT IS
BEGIN
    g_index := 0;
END BEFORE STATEMENT;

BEFORE EACH ROW IS
BEGIN
    IF :NEW.salary > 100000 THEN
        :NEW.salary := 100000;
    END IF;
END BEFORE EACH ROW;

AFTER EACH ROW IS
BEGIN
    g_index := g_index + 1;
    g_employees(g_index) := :NEW;
END AFTER EACH ROW;

AFTER STATEMENT IS
BEGIN
    FOR i IN 1..g_index LOOP
        -- Process collected rows
        NULL;
    END LOOP;
END AFTER STATEMENT;

END trg_emp_compound;
/
```

---

## Audit Trigger

```sql
CREATE OR REPLACE TRIGGER trg_emp_audit
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

    INSERT INTO employee_audit (
        employee_id, action, old_salary, new_salary, changed_by, changed_at
    ) VALUES (
        NVL(:NEW.employee_id, :OLD.employee_id),
        v_action,
        :OLD.salary,
        :NEW.salary,
        USER,
        SYSDATE
    );
END;
/
```
