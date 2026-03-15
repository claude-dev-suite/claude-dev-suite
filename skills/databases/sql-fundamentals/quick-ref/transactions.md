# Transactions Quick Reference

## ACID Properties

| Property | Description |
|----------|-------------|
| **Atomicity** | All operations succeed or all fail |
| **Consistency** | Database moves from one valid state to another |
| **Isolation** | Concurrent transactions don't interfere |
| **Durability** | Committed changes survive crashes |

## Basic Transaction Syntax

```sql
-- Start transaction
BEGIN;
-- or
BEGIN TRANSACTION;
-- or
START TRANSACTION;  -- MySQL

-- Execute operations
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;

-- Commit (save changes)
COMMIT;

-- Or rollback (discard changes)
ROLLBACK;
```

## Savepoints

```sql
BEGIN;

UPDATE accounts SET balance = balance - 100 WHERE id = 1;
SAVEPOINT after_debit;

UPDATE accounts SET balance = balance + 100 WHERE id = 2;
-- Oops, wrong account!

ROLLBACK TO SAVEPOINT after_debit;

-- Correct operation
UPDATE accounts SET balance = balance + 100 WHERE id = 3;

COMMIT;

-- Release savepoint (optional)
RELEASE SAVEPOINT after_debit;
```

## Isolation Levels

### Overview

| Level | Dirty Read | Non-Repeatable Read | Phantom Read | Performance |
|-------|------------|---------------------|--------------|-------------|
| READ UNCOMMITTED | Yes | Yes | Yes | Fastest |
| READ COMMITTED | No | Yes | Yes | Fast |
| REPEATABLE READ | No | No | Yes* | Medium |
| SERIALIZABLE | No | No | No | Slowest |

*PostgreSQL's REPEATABLE READ prevents phantom reads too.

### Setting Isolation Level

```sql
-- Per transaction
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
BEGIN;
-- operations
COMMIT;

-- PostgreSQL: Session level
SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL READ COMMITTED;

-- MySQL: Session level
SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;

-- SQL Server
SET TRANSACTION ISOLATION LEVEL SNAPSHOT;
```

### Isolation Level Details

#### READ UNCOMMITTED
```sql
-- Can see uncommitted changes from other transactions (dirty reads)
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
BEGIN;
SELECT balance FROM accounts WHERE id = 1;
-- Might read value that gets rolled back!
COMMIT;
```

#### READ COMMITTED (Default for PostgreSQL, SQL Server, Oracle)
```sql
-- Only sees committed data, but same query may return different results
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
BEGIN;
SELECT balance FROM accounts WHERE id = 1;  -- Returns 100
-- Another transaction commits, changing balance to 200
SELECT balance FROM accounts WHERE id = 1;  -- Returns 200 (non-repeatable read)
COMMIT;
```

#### REPEATABLE READ (Default for MySQL)
```sql
-- Same query returns same results within transaction
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
BEGIN;
SELECT balance FROM accounts WHERE id = 1;  -- Returns 100
-- Another transaction commits, changing balance to 200
SELECT balance FROM accounts WHERE id = 1;  -- Still returns 100
COMMIT;
```

#### SERIALIZABLE
```sql
-- Transactions execute as if serial (one after another)
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
BEGIN;
SELECT SUM(balance) FROM accounts;
-- Any concurrent modification would cause serialization failure
UPDATE accounts SET balance = balance + 100 WHERE id = 1;
COMMIT;
```

## Locking

### Lock Types

| Lock | Description |
|------|-------------|
| Shared (S) | Read lock, multiple transactions can hold |
| Exclusive (X) | Write lock, only one transaction can hold |
| Row-level | Lock individual rows |
| Table-level | Lock entire table |

### Explicit Locking

```sql
-- PostgreSQL: Row-level lock
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;  -- Exclusive lock
SELECT * FROM accounts WHERE id = 1 FOR SHARE;   -- Shared lock
SELECT * FROM accounts WHERE id = 1 FOR UPDATE NOWAIT;  -- Fail immediately if locked
SELECT * FROM accounts WHERE id = 1 FOR UPDATE SKIP LOCKED;  -- Skip locked rows

-- MySQL: Same syntax
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;
SELECT * FROM accounts WHERE id = 1 LOCK IN SHARE MODE;

-- SQL Server
SELECT * FROM accounts WITH (UPDLOCK) WHERE id = 1;
SELECT * FROM accounts WITH (HOLDLOCK) WHERE id = 1;
SELECT * FROM accounts WITH (NOLOCK) WHERE id = 1;  -- Dirty read

-- Table lock
LOCK TABLE accounts IN EXCLUSIVE MODE;  -- PostgreSQL
LOCK TABLES accounts WRITE;  -- MySQL
```

### Advisory Locks (PostgreSQL)

```sql
-- Session-level advisory lock
SELECT pg_advisory_lock(12345);
-- Do work
SELECT pg_advisory_unlock(12345);

-- Transaction-level (auto-released on commit/rollback)
SELECT pg_advisory_xact_lock(12345);

-- Try lock (non-blocking)
SELECT pg_try_advisory_lock(12345);  -- Returns true/false
```

## Deadlock Prevention

### Consistent Ordering
```sql
-- Always lock resources in same order
BEGIN;
-- Lock account with lower ID first
UPDATE accounts SET balance = balance - 100 WHERE id = 1;  -- Lock 1
UPDATE accounts SET balance = balance + 100 WHERE id = 2;  -- Lock 2
COMMIT;
```

### Lock Timeout
```sql
-- PostgreSQL
SET lock_timeout = '5s';

-- MySQL
SET innodb_lock_wait_timeout = 5;

-- SQL Server
SET LOCK_TIMEOUT 5000;  -- milliseconds
```

### Deadlock Detection
```sql
-- PostgreSQL: View blocked queries
SELECT * FROM pg_stat_activity WHERE wait_event_type = 'Lock';

-- View locks
SELECT * FROM pg_locks WHERE NOT granted;

-- MySQL
SHOW ENGINE INNODB STATUS;

-- SQL Server
SELECT * FROM sys.dm_tran_locks WHERE request_status = 'WAIT';
```

## Common Patterns

### Transfer Money
```sql
BEGIN;

-- Lock both accounts (consistent order by ID)
SELECT * FROM accounts WHERE id IN (1, 2) ORDER BY id FOR UPDATE;

-- Check sufficient balance
DO $$
BEGIN
    IF (SELECT balance FROM accounts WHERE id = 1) < 100 THEN
        RAISE EXCEPTION 'Insufficient funds';
    END IF;
END $$;

-- Perform transfer
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;

COMMIT;
```

### Optimistic Locking (Version-based)
```sql
-- Add version column
ALTER TABLE products ADD COLUMN version INT DEFAULT 0;

-- Update with version check
UPDATE products
SET name = 'New Name', version = version + 1
WHERE id = 1 AND version = 5;

-- Check if update succeeded
-- If 0 rows affected, another transaction modified the row
```

### Pessimistic Locking with Timeout
```sql
BEGIN;
SET LOCAL lock_timeout = '5s';

SELECT * FROM orders WHERE id = 123 FOR UPDATE;
-- Process order
UPDATE orders SET status = 'processed' WHERE id = 123;

COMMIT;
```

### Read-Only Transaction
```sql
-- PostgreSQL
BEGIN READ ONLY;
SELECT * FROM accounts;
COMMIT;

-- MySQL
SET TRANSACTION READ ONLY;
START TRANSACTION;
SELECT * FROM accounts;
COMMIT;
```

## Error Handling in Transactions

### PostgreSQL (PL/pgSQL)
```sql
BEGIN;
    -- operations
EXCEPTION
    WHEN unique_violation THEN
        ROLLBACK;
        RAISE NOTICE 'Duplicate key';
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;
```

### Application Level
```sql
-- Pseudo-code pattern
try {
    BEGIN;
    -- operations
    COMMIT;
} catch (e) {
    ROLLBACK;
    throw e;
}
```

## Best Practices

### DO
- Keep transactions short
- Lock in consistent order to prevent deadlocks
- Use appropriate isolation level for use case
- Handle deadlock exceptions with retry logic
- Use savepoints for partial rollback

### DON'T
- Hold locks while waiting for user input
- Use SERIALIZABLE unless necessary
- Mix DDL and DML in same transaction (DDL often auto-commits)
- Ignore deadlock exceptions
