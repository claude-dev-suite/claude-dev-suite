---
name: tsql
description: |
  Microsoft SQL Server T-SQL procedural language. Covers stored procedures,
  functions, triggers, error handling, and SQL Server-specific features.
  Use for SQL Server database server-side programming.

  USE WHEN: user mentions "tsql", "T-SQL", "SQL Server procedures",
  "SQL Server functions", "TRY...CATCH", "THROW", "sp_executesql", "SSMS"

  DO NOT USE FOR: basic SQL Server SQL - use `sqlserver` instead,
  PostgreSQL - use `plpgsql` instead, Oracle - use `plsql` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---

# T-SQL Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for multi-statement TVFs, custom error messages, INSTEAD OF triggers, transaction isolation levels, cursors, dynamic SQL, and recursive CTEs.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `sqlserver` for comprehensive documentation.

## Basic Structure

```sql
-- Anonymous block
BEGIN
    DECLARE @count INT = 0;
    SET @count = @count + 1;
    PRINT 'Count: ' + CAST(@count AS VARCHAR);
END;
GO
```

## Variables

```sql
DECLARE @name VARCHAR(100) = 'John';
DECLARE @age INT;
DECLARE @salary DECIMAL(10,2), @bonus DECIMAL(10,2);

SET @age = 25;
SELECT @salary = salary FROM employees WHERE id = 1;

-- Multiple assignments
SELECT @salary = salary, @bonus = bonus
FROM employees WHERE id = 1;

-- Table variable
DECLARE @employees TABLE (
    id INT,
    name VARCHAR(100),
    salary DECIMAL(10,2)
);

INSERT INTO @employees SELECT id, name, salary FROM employees;
```

## Stored Procedures

### Basic Procedure

```sql
CREATE OR ALTER PROCEDURE usp_GetEmployee
    @EmployeeId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT employee_id, first_name, last_name, salary
    FROM employees
    WHERE employee_id = @EmployeeId;
END;
GO

-- Execute
EXEC usp_GetEmployee @EmployeeId = 100;
-- or
EXEC usp_GetEmployee 100;
```

### Procedure with OUTPUT Parameters

```sql
CREATE OR ALTER PROCEDURE usp_GetEmployeeStats
    @DeptId INT,
    @EmployeeCount INT OUTPUT,
    @TotalSalary DECIMAL(15,2) OUTPUT,
    @AvgSalary DECIMAL(15,2) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        @EmployeeCount = COUNT(*),
        @TotalSalary = SUM(salary),
        @AvgSalary = AVG(salary)
    FROM employees
    WHERE department_id = @DeptId;
END;
GO

-- Call with OUTPUT
DECLARE @Count INT, @Total DECIMAL(15,2), @Avg DECIMAL(15,2);
EXEC usp_GetEmployeeStats
    @DeptId = 10,
    @EmployeeCount = @Count OUTPUT,
    @TotalSalary = @Total OUTPUT,
    @AvgSalary = @Avg OUTPUT;

PRINT 'Count: ' + CAST(@Count AS VARCHAR);
```

### Procedure with Return Value

```sql
CREATE OR ALTER PROCEDURE usp_ValidateEmployee
    @EmployeeId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM employees WHERE employee_id = @EmployeeId)
        RETURN -1;  -- Not found

    IF EXISTS (SELECT 1 FROM employees WHERE employee_id = @EmployeeId AND status = 'INACTIVE')
        RETURN -2;  -- Inactive

    RETURN 0;  -- Success
END;
GO

-- Check return value
DECLARE @result INT;
EXEC @result = usp_ValidateEmployee @EmployeeId = 100;

IF @result = 0
    PRINT 'Valid';
ELSE IF @result = -1
    PRINT 'Employee not found';
```

## Functions

### Scalar Function

```sql
CREATE OR ALTER FUNCTION dbo.fn_CalculateBonus(
    @Salary DECIMAL(10,2),
    @YearsOfService INT
)
RETURNS DECIMAL(10,2)
AS
BEGIN
    DECLARE @Bonus DECIMAL(10,2);

    SET @Bonus = CASE
        WHEN @YearsOfService >= 10 THEN @Salary * 0.15
        WHEN @YearsOfService >= 5 THEN @Salary * 0.10
        ELSE @Salary * 0.05
    END;

    RETURN @Bonus;
END;
GO

-- Usage
SELECT employee_id, salary,
    dbo.fn_CalculateBonus(salary, years_of_service) AS bonus
FROM employees;
```

### Inline Table-Valued Function

```sql
CREATE OR ALTER FUNCTION dbo.fn_GetDeptEmployees(
    @DeptId INT
)
RETURNS TABLE
AS
RETURN (
    SELECT employee_id, first_name, last_name, salary
    FROM employees
    WHERE department_id = @DeptId
);
GO

-- Usage
SELECT * FROM dbo.fn_GetDeptEmployees(10);
```

## Control Flow

### IF...ELSE

```sql
DECLARE @status VARCHAR(20);

IF @status = 'ACTIVE'
BEGIN
    PRINT 'User is active';
    -- Multiple statements in BEGIN...END
END
ELSE IF @status = 'PENDING'
    PRINT 'User is pending';  -- Single statement, no BEGIN needed
ELSE
BEGIN
    PRINT 'User is inactive';
END;
```

### CASE Expression

```sql
SELECT
    employee_id,
    salary,
    CASE
        WHEN salary >= 100000 THEN 'Executive'
        WHEN salary >= 50000 THEN 'Senior'
        WHEN salary >= 30000 THEN 'Mid'
        ELSE 'Junior'
    END AS level
FROM employees;

-- Simple CASE
SELECT
    employee_id,
    CASE status
        WHEN 'A' THEN 'Active'
        WHEN 'I' THEN 'Inactive'
        ELSE 'Unknown'
    END AS status_name
FROM employees;
```

### WHILE Loop

```sql
DECLARE @counter INT = 1;

WHILE @counter <= 10
BEGIN
    PRINT 'Counter: ' + CAST(@counter AS VARCHAR);
    SET @counter = @counter + 1;

    IF @counter = 5
        CONTINUE;  -- Skip to next iteration

    IF @counter = 8
        BREAK;  -- Exit loop
END;
```

## Error Handling

### TRY...CATCH

```sql
BEGIN TRY
    BEGIN TRANSACTION;

    UPDATE accounts SET balance = balance - 100 WHERE id = 1;
    UPDATE accounts SET balance = balance + 100 WHERE id = 2;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    -- Error information
    DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
    DECLARE @ErrorState INT = ERROR_STATE();

    -- Re-throw or log
    RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
END CATCH;
```

### Error Functions

| Function | Description |
|----------|-------------|
| `ERROR_NUMBER()` | Error number |
| `ERROR_MESSAGE()` | Error message |
| `ERROR_SEVERITY()` | Error severity (0-25) |
| `ERROR_STATE()` | Error state |
| `ERROR_LINE()` | Line number where error occurred |
| `ERROR_PROCEDURE()` | Stored procedure name |

### THROW vs RAISERROR

```sql
-- THROW (SQL Server 2012+, preferred)
THROW 50001, 'Custom error message', 1;

-- THROW without parameters re-throws current error
BEGIN CATCH
    INSERT INTO error_log (message, error_time)
    VALUES (ERROR_MESSAGE(), GETDATE());

    THROW;  -- Re-throw original error
END CATCH;

-- RAISERROR (legacy)
RAISERROR('Error: %s', 16, 1, @ErrorMessage);
```

## Triggers

### DML Trigger

```sql
CREATE OR ALTER TRIGGER tr_employees_audit
ON employees
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- Handle INSERT
    IF EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted)
    BEGIN
        INSERT INTO employees_audit (action, employee_id, new_salary, changed_by, changed_at)
        SELECT 'INSERT', employee_id, salary, SYSTEM_USER, GETDATE()
        FROM inserted;
    END

    -- Handle UPDATE
    IF EXISTS (SELECT 1 FROM inserted) AND EXISTS (SELECT 1 FROM deleted)
    BEGIN
        INSERT INTO employees_audit (action, employee_id, old_salary, new_salary, changed_by, changed_at)
        SELECT 'UPDATE', i.employee_id, d.salary, i.salary, SYSTEM_USER, GETDATE()
        FROM inserted i
        INNER JOIN deleted d ON i.employee_id = d.employee_id;
    END

    -- Handle DELETE
    IF NOT EXISTS (SELECT 1 FROM inserted) AND EXISTS (SELECT 1 FROM deleted)
    BEGIN
        INSERT INTO employees_audit (action, employee_id, old_salary, changed_by, changed_at)
        SELECT 'DELETE', employee_id, salary, SYSTEM_USER, GETDATE()
        FROM deleted;
    END
END;
GO
```

## Transactions

```sql
BEGIN TRANSACTION;
-- or
BEGIN TRAN;

SAVE TRANSACTION SavePoint1;

-- Rollback to savepoint
ROLLBACK TRANSACTION SavePoint1;

COMMIT TRANSACTION;
-- or
COMMIT;

-- Check transaction count
SELECT @@TRANCOUNT;

-- Named transaction
BEGIN TRANSACTION MyTransaction;
COMMIT TRANSACTION MyTransaction;
```

## Common Table Expressions (CTE)

```sql
;WITH dept_stats AS (
    SELECT
        department_id,
        COUNT(*) AS emp_count,
        AVG(salary) AS avg_salary
    FROM employees
    GROUP BY department_id
)
SELECT d.department_name, ds.emp_count, ds.avg_salary
FROM departments d
INNER JOIN dept_stats ds ON d.department_id = ds.department_id;
```

## Best Practices

### DO
- Use SET NOCOUNT ON in procedures
- Use TRY...CATCH for error handling
- Use sp_executesql for dynamic SQL
- Use FAST_FORWARD cursors when possible
- Use table-valued parameters for batch operations
- Always qualify object names with schema

### DON'T
- Use SELECT * in production code
- Build dynamic SQL with string concatenation
- Use cursors when set-based operations work
- Ignore error handling
- Use deprecated features (GROUP BY ALL, etc.)

## When NOT to Use This Skill

- **Basic SQL Server SQL** - Use `sqlserver` skill for data types, indexes, temporal tables
- **PL/pgSQL (PostgreSQL)** - Use `plpgsql` skill for PostgreSQL procedures
- **PL/SQL (Oracle)** - Use `plsql` skill for Oracle procedures
- **Basic SQL** - Use `sql-fundamentals` for ANSI SQL basics

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Not using TRY...CATCH | Silent errors | Add error handling blocks |
| Using RAISERROR | Deprecated pattern | Use THROW (SQL 2012+) |
| Missing SET NOCOUNT ON | Performance overhead | Add to all procedures |
| String concatenation for dynamic SQL | SQL injection | Use sp_executesql with parameters |
| Using SELECT without ORDER BY for TOP | Non-deterministic results | Always specify ORDER BY |
| Cursors when set-based works | Poor performance | Rewrite as set operations |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Transaction uncommitted | `SELECT @@TRANCOUNT` | Add COMMIT or ROLLBACK |
| Procedure slow | Execution plan in SSMS | Add indexes, rewrite queries |
| Error swallowed | Check CATCH block | Ensure THROW or logging |
| Deadlock victim | Extended Events | Consistent access order |
| Parameter sniffing | Compare plans | Use OPTION (RECOMPILE) or local variables |

## Reference Documentation

- [Procedures](quick-ref/procedures.md)
- [Functions](quick-ref/functions.md)
- [Error Handling](quick-ref/error-handling.md)
