# T-SQL Error Handling Quick Reference

## TRY...CATCH Basics

```sql
BEGIN TRY
    -- Code that might fail
    SELECT 1/0;  -- Causes divide by zero
END TRY
BEGIN CATCH
    -- Handle error
    SELECT
        ERROR_NUMBER() AS ErrorNumber,
        ERROR_MESSAGE() AS ErrorMessage,
        ERROR_SEVERITY() AS ErrorSeverity,
        ERROR_STATE() AS ErrorState,
        ERROR_LINE() AS ErrorLine,
        ERROR_PROCEDURE() AS ErrorProcedure;
END CATCH;
```

## Error Functions

| Function | Description |
|----------|-------------|
| `ERROR_NUMBER()` | Error number (INT) |
| `ERROR_MESSAGE()` | Complete error message text |
| `ERROR_SEVERITY()` | Severity level (0-25) |
| `ERROR_STATE()` | Error state number |
| `ERROR_LINE()` | Line number where error occurred |
| `ERROR_PROCEDURE()` | Stored procedure/trigger name |

## THROW vs RAISERROR

### THROW (SQL Server 2012+, Preferred)

```sql
-- Throw new error
THROW 50001, 'Custom error message', 1;

-- Re-throw in CATCH block
BEGIN CATCH
    -- Log error first
    INSERT INTO error_log (message) VALUES (ERROR_MESSAGE());

    -- Re-throw original error
    THROW;
END CATCH;

-- THROW with formatted message
DECLARE @msg NVARCHAR(2048) = CONCAT('Order ', @OrderId, ' not found');
THROW 50001, @msg, 1;
```

### RAISERROR (Legacy)

```sql
-- Basic usage
RAISERROR('Error occurred', 16, 1);

-- With parameters (printf-style)
RAISERROR('Error: %s, ID: %d', 16, 1, @ErrorMsg, @Id);

-- Without waiting (NOW)
RAISERROR('Warning message', 10, 1) WITH NOWAIT;

-- Using message from sys.messages
EXEC sp_addmessage 50001, 16, 'Order %d not found';
RAISERROR(50001, 16, 1, @OrderId);
```

### Differences

| Feature | THROW | RAISERROR |
|---------|-------|-----------|
| Re-throw original | Yes (THROW;) | No |
| Requires severity | No (always 16) | Yes |
| Message formatting | No | Yes (printf) |
| Statement terminator | Always | Optional |
| Custom error numbers | 50000+ | 13-49999 or 50000+ |

## Severity Levels

| Severity | Description | Action |
|----------|-------------|--------|
| 0-10 | Informational | Not caught by CATCH |
| 11-16 | User errors | Caught by CATCH |
| 17-19 | Resource/software errors | Caught by CATCH |
| 20-25 | Fatal errors | Connection terminated |

## Error Handling with Transactions

```sql
CREATE PROCEDURE usp_ProcessOrder
    @OrderId INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;  -- Auto-rollback on error

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Process order
        UPDATE orders SET status = 'PROCESSING' WHERE order_id = @OrderId;

        -- Update inventory
        UPDATE inventory SET quantity = quantity - 1
        WHERE product_id IN (SELECT product_id FROM order_items WHERE order_id = @OrderId);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        -- Rollback if in transaction
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        -- Re-throw error
        THROW;
    END CATCH;
END;
GO
```

## XACT_ABORT

```sql
-- When ON: Any error automatically rolls back transaction
SET XACT_ABORT ON;

BEGIN TRANSACTION;
    INSERT INTO table1 VALUES (1);
    INSERT INTO table1 VALUES (1);  -- Duplicate - rolls back everything
COMMIT;  -- Never reached

-- Check state
SELECT XACT_STATE();  -- -1: uncommittable, 0: no transaction, 1: active
```

## XACT_STATE()

```sql
BEGIN TRY
    BEGIN TRANSACTION;
    -- Operations...
    COMMIT;
END TRY
BEGIN CATCH
    IF XACT_STATE() = -1
    BEGIN
        -- Transaction is uncommittable, must rollback
        ROLLBACK;
    END
    ELSE IF XACT_STATE() = 1
    BEGIN
        -- Transaction is committable (partial work possible)
        -- Usually still want to rollback
        ROLLBACK;
    END

    THROW;
END CATCH;
```

## Nested TRY...CATCH

```sql
BEGIN TRY
    BEGIN TRY
        -- Inner operation
        SELECT 1/0;
    END TRY
    BEGIN CATCH
        -- Handle or re-throw
        THROW;
    END CATCH
END TRY
BEGIN CATCH
    -- Outer handler
    PRINT 'Outer catch: ' + ERROR_MESSAGE();
END CATCH;
```

## Error Logging Table

```sql
CREATE TABLE dbo.ErrorLog (
    ErrorId INT IDENTITY(1,1) PRIMARY KEY,
    ErrorNumber INT,
    ErrorSeverity INT,
    ErrorState INT,
    ErrorProcedure NVARCHAR(200),
    ErrorLine INT,
    ErrorMessage NVARCHAR(4000),
    UserName NVARCHAR(128) DEFAULT SYSTEM_USER,
    ErrorDateTime DATETIME2 DEFAULT SYSDATETIME()
);

-- Logging procedure
CREATE PROCEDURE dbo.usp_LogError
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.ErrorLog (
        ErrorNumber, ErrorSeverity, ErrorState,
        ErrorProcedure, ErrorLine, ErrorMessage
    )
    VALUES (
        ERROR_NUMBER(), ERROR_SEVERITY(), ERROR_STATE(),
        ERROR_PROCEDURE(), ERROR_LINE(), ERROR_MESSAGE()
    );
END;
GO

-- Usage in CATCH
BEGIN CATCH
    EXEC dbo.usp_LogError;
    THROW;
END CATCH;
```

## Retry Logic

```sql
CREATE PROCEDURE usp_RetryOperation
    @MaxRetries INT = 3
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @RetryCount INT = 0;
    DECLARE @Success BIT = 0;

    WHILE @RetryCount < @MaxRetries AND @Success = 0
    BEGIN
        BEGIN TRY
            -- Attempt operation
            BEGIN TRANSACTION;

            UPDATE accounts SET balance = balance - 100 WHERE id = 1;
            UPDATE accounts SET balance = balance + 100 WHERE id = 2;

            COMMIT;
            SET @Success = 1;
        END TRY
        BEGIN CATCH
            IF @@TRANCOUNT > 0
                ROLLBACK;

            SET @RetryCount = @RetryCount + 1;

            -- Check if retryable error (deadlock, lock timeout)
            IF ERROR_NUMBER() IN (1205, 1222) AND @RetryCount < @MaxRetries
            BEGIN
                WAITFOR DELAY '00:00:01';  -- Wait 1 second
                CONTINUE;
            END

            -- Non-retryable or max retries reached
            THROW;
        END CATCH;
    END;
END;
GO
```

## Common Error Numbers

| Error | Description |
|-------|-------------|
| 208 | Invalid object name |
| 515 | Cannot insert NULL |
| 547 | FK constraint violation |
| 1205 | Deadlock victim |
| 1222 | Lock timeout |
| 2627 | PK/Unique constraint violation |
| 2628 | String truncation |
| 8152 | String data truncated |

## Custom Error Messages

```sql
-- Add to sys.messages
EXEC sp_addmessage
    @msgnum = 50001,
    @severity = 16,
    @msgtext = N'Order %d cannot be processed: %s',
    @lang = 'us_english';

-- Use message
RAISERROR(50001, 16, 1, @OrderId, @Reason);

-- View messages
SELECT * FROM sys.messages WHERE message_id >= 50000;

-- Remove message
EXEC sp_dropmessage @msgnum = 50001;
```

## Best Practices

1. **Always use TRY...CATCH** in stored procedures
2. **Use SET XACT_ABORT ON** for transaction safety
3. **Check @@TRANCOUNT** before ROLLBACK
4. **Log errors** before re-throwing
5. **Use THROW** over RAISERROR (SQL 2012+)
6. **Use THROW;** without parameters to re-throw
7. **Consider retry logic** for deadlocks
8. **Return meaningful error codes** from procedures
