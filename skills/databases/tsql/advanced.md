# T-SQL Advanced Patterns

## Multi-Statement Table-Valued Functions

```sql
CREATE OR ALTER FUNCTION dbo.fn_GetEmployeeHierarchy(
    @ManagerId INT
)
RETURNS @result TABLE (
    employee_id INT,
    name VARCHAR(200),
    level INT
)
AS
BEGIN
    ;WITH hierarchy AS (
        SELECT employee_id, first_name + ' ' + last_name AS name, 0 AS level
        FROM employees WHERE employee_id = @ManagerId

        UNION ALL

        SELECT e.employee_id, e.first_name + ' ' + e.last_name, h.level + 1
        FROM employees e
        INNER JOIN hierarchy h ON e.manager_id = h.employee_id
    )
    INSERT INTO @result
    SELECT employee_id, name, level FROM hierarchy;

    RETURN;
END;
GO
```

---

## Advanced Error Handling

### Custom Error Messages

```sql
-- Add message to sys.messages
EXEC sp_addmessage
    @msgnum = 50001,
    @severity = 16,
    @msgtext = 'Employee %d not found in department %s';

-- Use message
RAISERROR(50001, 16, 1, @EmployeeId, @DeptName);

-- Remove message
EXEC sp_dropmessage @msgnum = 50001;
```

### THROW vs RAISERROR

```sql
-- THROW (SQL Server 2012+, preferred)
THROW 50001, 'Custom error message', 1;

-- THROW without parameters re-throws current error
BEGIN CATCH
    -- Log error
    INSERT INTO error_log (message, error_time)
    VALUES (ERROR_MESSAGE(), GETDATE());

    THROW;  -- Re-throw original error
END CATCH;

-- RAISERROR (legacy)
RAISERROR('Error: %s', 16, 1, @ErrorMessage);
```

---

## Advanced Triggers

### INSTEAD OF Trigger

```sql
CREATE OR ALTER TRIGGER tr_employees_view_insert
ON v_employees
INSTEAD OF INSERT
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO employees (first_name, last_name, email, department_id)
    SELECT first_name, last_name, email, department_id
    FROM inserted;
END;
GO
```

### Trigger with UPDATE()

```sql
CREATE OR ALTER TRIGGER tr_employees_salary_check
ON employees
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF UPDATE(salary)  -- Check if salary column was updated
    BEGIN
        IF EXISTS (
            SELECT 1 FROM inserted i
            INNER JOIN deleted d ON i.employee_id = d.employee_id
            WHERE i.salary > d.salary * 2
        )
        BEGIN
            RAISERROR('Salary increase cannot exceed 100%%', 16, 1);
            ROLLBACK TRANSACTION;
        END
    END
END;
GO
```

---

## Transaction Isolation Levels

```sql
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;  -- Default
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET TRANSACTION ISOLATION LEVEL SNAPSHOT;  -- Requires DB option
```

---

## Cursors

```sql
DECLARE @emp_id INT, @name VARCHAR(100), @salary DECIMAL(10,2);

DECLARE emp_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT employee_id, first_name, salary
    FROM employees
    WHERE department_id = 10;

OPEN emp_cursor;

FETCH NEXT FROM emp_cursor INTO @emp_id, @name, @salary;

WHILE @@FETCH_STATUS = 0
BEGIN
    PRINT @name + ': ' + CAST(@salary AS VARCHAR);
    FETCH NEXT FROM emp_cursor INTO @emp_id, @name, @salary;
END;

CLOSE emp_cursor;
DEALLOCATE emp_cursor;
```

### Cursor Options

| Option | Description |
|--------|-------------|
| `LOCAL` | Scope limited to batch/procedure |
| `GLOBAL` | Available to any batch in connection |
| `FORWARD_ONLY` | Can only FETCH NEXT |
| `SCROLL` | Can fetch in any direction |
| `STATIC` | Creates temp copy of data |
| `KEYSET` | Keys are fixed, data can change |
| `DYNAMIC` | Reflects all changes |
| `FAST_FORWARD` | FORWARD_ONLY + READ_ONLY (fastest) |

---

## Dynamic SQL

```sql
-- EXEC with string (SQL injection risk!)
DECLARE @sql NVARCHAR(MAX);
SET @sql = N'SELECT * FROM employees WHERE department_id = ' + CAST(@DeptId AS NVARCHAR);
EXEC(@sql);

-- sp_executesql (preferred, parameterized)
DECLARE @sql NVARCHAR(MAX);
DECLARE @params NVARCHAR(MAX);

SET @sql = N'SELECT * FROM employees WHERE department_id = @DeptId AND salary > @MinSalary';
SET @params = N'@DeptId INT, @MinSalary DECIMAL(10,2)';

EXEC sp_executesql @sql, @params, @DeptId = 10, @MinSalary = 50000;

-- With OUTPUT
DECLARE @count INT;
SET @sql = N'SELECT @cnt = COUNT(*) FROM employees WHERE department_id = @DeptId';
SET @params = N'@DeptId INT, @cnt INT OUTPUT';

EXEC sp_executesql @sql, @params, @DeptId = 10, @cnt = @count OUTPUT;
PRINT @count;
```

---

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

### Recursive CTE

```sql
;WITH hierarchy AS (
    SELECT employee_id, first_name, manager_id, 0 AS level
    FROM employees WHERE manager_id IS NULL

    UNION ALL

    SELECT e.employee_id, e.first_name, e.manager_id, h.level + 1
    FROM employees e
    INNER JOIN hierarchy h ON e.manager_id = h.employee_id
)
SELECT * FROM hierarchy;
```

---

## Transactions with Savepoints

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

---

## Control Flow

### GOTO

```sql
DECLARE @value INT = 5;

IF @value < 0
    GOTO NegativeValue;

PRINT 'Value is positive';
GOTO EndBlock;

NegativeValue:
PRINT 'Value is negative';

EndBlock:
PRINT 'Done';
```

### WHILE with BREAK/CONTINUE

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
