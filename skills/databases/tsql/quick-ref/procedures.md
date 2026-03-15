# T-SQL Procedures Quick Reference

## Basic Syntax

```sql
CREATE [OR ALTER] PROCEDURE [schema.]procedure_name
    @param1 datatype [= default] [OUTPUT | OUT],
    @param2 datatype [= default] [OUTPUT | OUT]
AS
BEGIN
    SET NOCOUNT ON;
    -- Procedure body
END;
GO
```

## Parameter Types

```sql
CREATE PROCEDURE usp_Example
    @InputParam INT,                    -- Input (default)
    @OptionalParam INT = 10,            -- With default value
    @OutputParam INT OUTPUT,            -- Output parameter
    @InOutParam INT OUTPUT              -- Can be both input and output
AS
BEGIN
    SET NOCOUNT ON;

    SET @OutputParam = @InputParam * 2;
    SET @InOutParam = @InOutParam + 1;
END;
GO

-- Calling
DECLARE @out INT, @inout INT = 5;
EXEC usp_Example
    @InputParam = 10,
    @OutputParam = @out OUTPUT,
    @InOutParam = @inout OUTPUT;

SELECT @out AS OutputValue, @inout AS InOutValue;
```

## Table-Valued Parameters

```sql
-- Create type first
CREATE TYPE dbo.EmployeeTableType AS TABLE (
    EmployeeId INT,
    Name NVARCHAR(100),
    Salary DECIMAL(10,2)
);
GO

-- Procedure using TVP
CREATE PROCEDURE usp_InsertEmployees
    @Employees dbo.EmployeeTableType READONLY
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO employees (employee_id, name, salary)
    SELECT EmployeeId, Name, Salary FROM @Employees;
END;
GO

-- Calling with TVP
DECLARE @emps dbo.EmployeeTableType;
INSERT INTO @emps VALUES (1, 'John', 50000), (2, 'Jane', 60000);
EXEC usp_InsertEmployees @Employees = @emps;
```

## Return Values

```sql
CREATE PROCEDURE usp_ProcessOrder
    @OrderId INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM orders WHERE order_id = @OrderId)
        RETURN -1;  -- Not found

    IF EXISTS (SELECT 1 FROM orders WHERE order_id = @OrderId AND status = 'PROCESSED')
        RETURN -2;  -- Already processed

    UPDATE orders SET status = 'PROCESSED' WHERE order_id = @OrderId;
    RETURN 0;  -- Success
END;
GO

-- Check return value
DECLARE @result INT;
EXEC @result = usp_ProcessOrder @OrderId = 100;

IF @result = 0 PRINT 'Success';
ELSE IF @result = -1 PRINT 'Order not found';
ELSE IF @result = -2 PRINT 'Already processed';
```

## Temporary Procedures

```sql
-- Local temp procedure (current session only)
CREATE PROCEDURE #usp_TempProc
AS
BEGIN
    SELECT 'Temporary procedure';
END;
GO

-- Global temp procedure (all sessions)
CREATE PROCEDURE ##usp_GlobalTempProc
AS
BEGIN
    SELECT 'Global temporary procedure';
END;
GO
```

## Procedure with Transactions

```sql
CREATE PROCEDURE usp_TransferFunds
    @FromAccount INT,
    @ToAccount INT,
    @Amount DECIMAL(10,2)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;  -- Auto-rollback on error

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Deduct from source
        UPDATE accounts SET balance = balance - @Amount
        WHERE account_id = @FromAccount;

        IF @@ROWCOUNT = 0
            THROW 50001, 'Source account not found', 1;

        -- Add to destination
        UPDATE accounts SET balance = balance + @Amount
        WHERE account_id = @ToAccount;

        IF @@ROWCOUNT = 0
            THROW 50002, 'Destination account not found', 1;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        THROW;  -- Re-throw error
    END CATCH;
END;
GO
```

## Procedure with Result Sets

```sql
CREATE PROCEDURE usp_GetDashboardData
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Result set 1: User info
    SELECT user_id, username, email FROM users WHERE user_id = @UserId;

    -- Result set 2: Recent orders
    SELECT TOP 10 order_id, total, order_date
    FROM orders WHERE user_id = @UserId ORDER BY order_date DESC;

    -- Result set 3: Notifications
    SELECT notification_id, message, created_at
    FROM notifications WHERE user_id = @UserId AND is_read = 0;
END;
GO
```

## WITH RECOMPILE

```sql
-- Recompile every execution (for varying parameters)
CREATE PROCEDURE usp_SearchProducts
    @Category NVARCHAR(50) = NULL,
    @MinPrice DECIMAL(10,2) = NULL,
    @MaxPrice DECIMAL(10,2) = NULL
WITH RECOMPILE
AS
BEGIN
    SET NOCOUNT ON;

    SELECT product_id, name, price
    FROM products
    WHERE (@Category IS NULL OR category = @Category)
    AND (@MinPrice IS NULL OR price >= @MinPrice)
    AND (@MaxPrice IS NULL OR price <= @MaxPrice);
END;
GO

-- Or recompile specific execution
EXEC usp_SearchProducts @Category = 'Electronics' WITH RECOMPILE;
```

## EXECUTE AS

```sql
-- Execute with different security context
CREATE PROCEDURE usp_AdminTask
WITH EXECUTE AS OWNER  -- or 'dbo', 'SELF', 'CALLER', 'user_name'
AS
BEGIN
    SET NOCOUNT ON;
    -- Runs with owner's permissions
    DELETE FROM audit_log WHERE log_date < DATEADD(DAY, -90, GETDATE());
END;
GO
```

## Common Patterns

### Batch Processing

```sql
CREATE PROCEDURE usp_BatchProcess
    @BatchSize INT = 1000
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RowsAffected INT = 1;

    WHILE @RowsAffected > 0
    BEGIN
        UPDATE TOP (@BatchSize) orders
        SET processed = 1
        WHERE processed = 0;

        SET @RowsAffected = @@ROWCOUNT;

        -- Optional: Add delay to reduce load
        IF @RowsAffected > 0
            WAITFOR DELAY '00:00:01';
    END;
END;
GO
```

### Pagination

```sql
CREATE PROCEDURE usp_GetOrdersPaged
    @PageNumber INT = 1,
    @PageSize INT = 20,
    @TotalCount INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    -- Get total count
    SELECT @TotalCount = COUNT(*) FROM orders;

    -- Get page
    SELECT order_id, customer_id, total, order_date
    FROM orders
    ORDER BY order_date DESC
    OFFSET (@PageNumber - 1) * @PageSize ROWS
    FETCH NEXT @PageSize ROWS ONLY;
END;
GO
```

### Upsert Pattern

```sql
CREATE PROCEDURE usp_UpsertCustomer
    @CustomerId INT,
    @Name NVARCHAR(100),
    @Email NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    MERGE INTO customers AS target
    USING (SELECT @CustomerId, @Name, @Email) AS source (id, name, email)
    ON target.customer_id = source.id
    WHEN MATCHED THEN
        UPDATE SET name = source.name, email = source.email, updated_at = GETDATE()
    WHEN NOT MATCHED THEN
        INSERT (customer_id, name, email, created_at)
        VALUES (source.id, source.name, source.email, GETDATE());
END;
GO
```

### Error Logging

```sql
CREATE PROCEDURE usp_LogError
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO error_log (
        error_number,
        error_message,
        error_severity,
        error_state,
        error_line,
        error_procedure,
        logged_at
    )
    VALUES (
        ERROR_NUMBER(),
        ERROR_MESSAGE(),
        ERROR_SEVERITY(),
        ERROR_STATE(),
        ERROR_LINE(),
        ERROR_PROCEDURE(),
        GETDATE()
    );
END;
GO

-- Usage
BEGIN CATCH
    EXEC usp_LogError;
    THROW;
END CATCH;
```

## Metadata

```sql
-- View procedure definition
EXEC sp_helptext 'usp_MyProcedure';

-- Or
SELECT OBJECT_DEFINITION(OBJECT_ID('usp_MyProcedure'));

-- View parameters
SELECT * FROM sys.parameters
WHERE object_id = OBJECT_ID('usp_MyProcedure');

-- View all procedures
SELECT name, create_date, modify_date
FROM sys.procedures
WHERE schema_id = SCHEMA_ID('dbo');
```

## Drop Procedure

```sql
DROP PROCEDURE IF EXISTS usp_MyProcedure;
-- Pre-2016:
IF OBJECT_ID('usp_MyProcedure', 'P') IS NOT NULL
    DROP PROCEDURE usp_MyProcedure;
```
