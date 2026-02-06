# T-SQL Functions Quick Reference

## Function Types

| Type | Description | Usage |
|------|-------------|-------|
| Scalar | Returns single value | SELECT, WHERE, etc. |
| Inline Table-Valued (iTVF) | Returns table, single SELECT | Like a view with parameters |
| Multi-Statement TVF (mTVF) | Returns table, complex logic | Multiple statements |

## Scalar Function

```sql
CREATE OR ALTER FUNCTION dbo.fn_FormatName(
    @FirstName NVARCHAR(50),
    @LastName NVARCHAR(50)
)
RETURNS NVARCHAR(101)
AS
BEGIN
    RETURN CONCAT(@FirstName, ' ', @LastName);
END;
GO

-- Usage
SELECT dbo.fn_FormatName(first_name, last_name) AS full_name
FROM employees;

-- In WHERE clause
SELECT * FROM employees
WHERE dbo.fn_CalculateAge(birth_date) >= 18;
```

## Inline Table-Valued Function

```sql
CREATE OR ALTER FUNCTION dbo.fn_GetEmployeesByDept(
    @DeptId INT
)
RETURNS TABLE
AS
RETURN (
    SELECT
        employee_id,
        first_name,
        last_name,
        salary,
        hire_date
    FROM employees
    WHERE department_id = @DeptId
);
GO

-- Usage (behaves like a table)
SELECT * FROM dbo.fn_GetEmployeesByDept(10);

-- Join with other tables
SELECT e.*, d.department_name
FROM dbo.fn_GetEmployeesByDept(10) e
INNER JOIN departments d ON e.department_id = d.department_id;

-- With CROSS APPLY
SELECT d.department_name, e.*
FROM departments d
CROSS APPLY dbo.fn_GetEmployeesByDept(d.department_id) e;
```

## Multi-Statement Table-Valued Function

```sql
CREATE OR ALTER FUNCTION dbo.fn_GetEmployeeHierarchy(
    @ManagerId INT
)
RETURNS @Result TABLE (
    employee_id INT,
    full_name NVARCHAR(200),
    manager_id INT,
    level INT
)
AS
BEGIN
    ;WITH hierarchy AS (
        SELECT
            employee_id,
            first_name + ' ' + last_name AS full_name,
            manager_id,
            0 AS level
        FROM employees
        WHERE employee_id = @ManagerId

        UNION ALL

        SELECT
            e.employee_id,
            e.first_name + ' ' + e.last_name,
            e.manager_id,
            h.level + 1
        FROM employees e
        INNER JOIN hierarchy h ON e.manager_id = h.employee_id
    )
    INSERT INTO @Result
    SELECT * FROM hierarchy;

    RETURN;
END;
GO

-- Usage
SELECT * FROM dbo.fn_GetEmployeeHierarchy(1);
```

## Function Options

### SCHEMABINDING

```sql
-- Prevents changes to underlying objects
CREATE FUNCTION dbo.fn_GetCount()
RETURNS INT
WITH SCHEMABINDING
AS
BEGIN
    DECLARE @count INT;
    SELECT @count = COUNT(*) FROM dbo.employees;  -- Must use schema prefix
    RETURN @count;
END;
GO
```

### RETURNS NULL ON NULL INPUT

```sql
-- Automatically returns NULL if any input is NULL
CREATE FUNCTION dbo.fn_Multiply(
    @a INT,
    @b INT
)
RETURNS INT
WITH RETURNS NULL ON NULL INPUT
AS
BEGIN
    RETURN @a * @b;  -- Never executes if either is NULL
END;
GO
```

### EXECUTE AS

```sql
CREATE FUNCTION dbo.fn_GetSensitiveData(
    @UserId INT
)
RETURNS NVARCHAR(MAX)
WITH EXECUTE AS OWNER
AS
BEGIN
    DECLARE @data NVARCHAR(MAX);
    SELECT @data = sensitive_info FROM users WHERE user_id = @UserId;
    RETURN @data;
END;
GO
```

## Deterministic vs Non-Deterministic

```sql
-- Deterministic: Same input = same output
CREATE FUNCTION dbo.fn_AddTax(@Amount DECIMAL(10,2))
RETURNS DECIMAL(10,2)
AS
BEGIN
    RETURN @Amount * 1.21;
END;
GO

-- Non-deterministic: Can return different results
-- (Cannot be used in indexed views, computed columns with indexes)
CREATE FUNCTION dbo.fn_GetCurrentUser()
RETURNS NVARCHAR(128)
AS
BEGIN
    RETURN SYSTEM_USER;  -- Non-deterministic
END;
GO
```

## Common Patterns

### Date Calculation

```sql
CREATE FUNCTION dbo.fn_GetAge(
    @BirthDate DATE
)
RETURNS INT
AS
BEGIN
    RETURN DATEDIFF(YEAR, @BirthDate, GETDATE()) -
        CASE WHEN DATEADD(YEAR, DATEDIFF(YEAR, @BirthDate, GETDATE()), @BirthDate) > GETDATE()
             THEN 1 ELSE 0 END;
END;
GO
```

### String Formatting

```sql
CREATE FUNCTION dbo.fn_FormatCurrency(
    @Amount DECIMAL(18,2),
    @CurrencySymbol NVARCHAR(3) = '$'
)
RETURNS NVARCHAR(50)
AS
BEGIN
    RETURN @CurrencySymbol + FORMAT(@Amount, 'N2');
END;
GO
```

### Validation

```sql
CREATE FUNCTION dbo.fn_IsValidEmail(
    @Email NVARCHAR(255)
)
RETURNS BIT
AS
BEGIN
    IF @Email LIKE '%_@_%.__%'
       AND @Email NOT LIKE '%[^a-zA-Z0-9.@_-]%'
        RETURN 1;
    RETURN 0;
END;
GO
```

### Split String (Pre-2016)

```sql
CREATE FUNCTION dbo.fn_SplitString(
    @String NVARCHAR(MAX),
    @Delimiter NVARCHAR(10)
)
RETURNS @Result TABLE (value NVARCHAR(MAX))
AS
BEGIN
    DECLARE @start INT = 1, @end INT;

    WHILE @start <= LEN(@String) + 1
    BEGIN
        SET @end = CHARINDEX(@Delimiter, @String + @Delimiter, @start);
        INSERT INTO @Result VALUES (SUBSTRING(@String, @start, @end - @start));
        SET @start = @end + LEN(@Delimiter);
    END;

    RETURN;
END;
GO

-- SQL Server 2016+ use STRING_SPLIT instead
SELECT value FROM STRING_SPLIT('a,b,c', ',');
```

### Lookup Function

```sql
CREATE FUNCTION dbo.fn_GetDepartmentName(
    @DeptId INT
)
RETURNS NVARCHAR(100)
AS
BEGIN
    DECLARE @name NVARCHAR(100);
    SELECT @name = department_name FROM departments WHERE department_id = @DeptId;
    RETURN ISNULL(@name, 'Unknown');
END;
GO
```

## iTVF vs mTVF Performance

```sql
-- iTVF (better performance - optimizer can inline)
CREATE FUNCTION dbo.fn_GetOrders_Inline(@CustomerId INT)
RETURNS TABLE AS RETURN (
    SELECT order_id, total, order_date
    FROM orders WHERE customer_id = @CustomerId
);

-- mTVF (worse performance - optimizer can't see inside)
CREATE FUNCTION dbo.fn_GetOrders_Multi(@CustomerId INT)
RETURNS @Result TABLE (order_id INT, total DECIMAL, order_date DATE)
AS BEGIN
    INSERT INTO @Result
    SELECT order_id, total, order_date
    FROM orders WHERE customer_id = @CustomerId;
    RETURN;
END;

-- Prefer iTVF when possible!
```

## Function Restrictions

Functions CANNOT:
- Modify database state (INSERT, UPDATE, DELETE on permanent tables)
- Use PRINT, RAISERROR
- Call stored procedures
- Use dynamic SQL
- Create/alter database objects
- Use transactions

## Metadata

```sql
-- View function definition
SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.fn_MyFunction'));

-- View all functions
SELECT name, type_desc, create_date
FROM sys.objects
WHERE type IN ('FN', 'IF', 'TF')  -- Scalar, Inline TVF, Multi-statement TVF
AND schema_id = SCHEMA_ID('dbo');

-- Check if deterministic
SELECT OBJECTPROPERTYEX(OBJECT_ID('dbo.fn_MyFunction'), 'IsDeterministic');
```

## Drop Function

```sql
DROP FUNCTION IF EXISTS dbo.fn_MyFunction;
```
