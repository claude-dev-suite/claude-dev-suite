---
name: sql-server
description: |
  SQL Server and Azure SQL Database with T-SQL, indexes, stored procedures,
  and performance optimization patterns.

  USE WHEN: user mentions "SQL Server", "T-SQL", "MSSQL", "Azure SQL",
  "SQL Server indexes", "stored procedures", "SQL Server performance"

  DO NOT USE FOR: PostgreSQL - use `postgresql`, MySQL - use `mysql`,
  MongoDB - use `mongodb`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# SQL Server - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `aspnet-core` for EF Core + SQL Server patterns.

## Common T-SQL Patterns

```sql
-- Table creation
CREATE TABLE Users (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL,
    Email NVARCHAR(255) NOT NULL UNIQUE,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 NULL,
    IsActive BIT DEFAULT 1
);

-- Pagination (SQL Server 2012+)
SELECT * FROM Users
ORDER BY Name
OFFSET @Skip ROWS
FETCH NEXT @Take ROWS ONLY;

-- MERGE (upsert)
MERGE INTO Users AS target
USING (SELECT @Email AS Email, @Name AS Name) AS source
ON target.Email = source.Email
WHEN MATCHED THEN
    UPDATE SET Name = source.Name, UpdatedAt = GETUTCDATE()
WHEN NOT MATCHED THEN
    INSERT (Name, Email) VALUES (source.Name, source.Email);

-- CTE (Common Table Expression)
WITH ActiveUsers AS (
    SELECT Id, Name, ROW_NUMBER() OVER (ORDER BY CreatedAt DESC) AS RowNum
    FROM Users WHERE IsActive = 1
)
SELECT * FROM ActiveUsers WHERE RowNum BETWEEN 1 AND 10;
```

## Indexes

```sql
-- Clustered (one per table, usually PK)
CREATE CLUSTERED INDEX IX_Users_Id ON Users(Id);

-- Non-clustered
CREATE NONCLUSTERED INDEX IX_Users_Email ON Users(Email);

-- Covering index (includes extra columns)
CREATE NONCLUSTERED INDEX IX_Users_Email_Include
ON Users(Email) INCLUDE (Name, CreatedAt);

-- Filtered index
CREATE NONCLUSTERED INDEX IX_Users_Active
ON Users(Email) WHERE IsActive = 1;

-- Check missing indexes
SELECT * FROM sys.dm_db_missing_index_details;
```

## Stored Procedures

```sql
CREATE PROCEDURE sp_GetUsersByStatus
    @IsActive BIT,
    @PageSize INT = 10,
    @PageNumber INT = 1
AS
BEGIN
    SET NOCOUNT ON;

    SELECT Id, Name, Email, CreatedAt
    FROM Users
    WHERE IsActive = @IsActive
    ORDER BY Name
    OFFSET (@PageNumber - 1) * @PageSize ROWS
    FETCH NEXT @PageSize ROWS ONLY;
END;
```

## Performance Tips

| Tip | Why |
|-----|-----|
| Use `NVARCHAR` over `VARCHAR` for Unicode | Avoid encoding issues |
| Add indexes on WHERE/JOIN columns | Speed up queries |
| Use `SET NOCOUNT ON` in procedures | Reduce network traffic |
| Avoid `SELECT *` | Only fetch needed columns |
| Use parameterized queries | Prevent SQL injection, plan reuse |
| Use `DATETIME2` over `DATETIME` | Better precision, smaller storage |

## Query Performance Analysis

```sql
-- Execution plan
SET STATISTICS IO ON;
SET STATISTICS TIME ON;
-- Run your query
SET STATISTICS IO OFF;
SET STATISTICS TIME OFF;

-- Expensive queries
SELECT TOP 10
    qs.total_elapsed_time / qs.execution_count AS avg_elapsed,
    qs.execution_count,
    SUBSTRING(qt.text, 1, 200) AS query_text
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) qt
ORDER BY avg_elapsed DESC;
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| `SELECT *` | Wastes I/O, breaks on schema change | List specific columns |
| Cursors for row-by-row | Very slow | Use set-based operations |
| No indexes on FKs | Slow JOINs | Add non-clustered indexes |
| `NOLOCK` everywhere | Dirty reads | Use proper isolation levels |
| String concatenation in SQL | SQL injection | Use parameterized queries |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Slow query | Missing index | Check execution plan |
| Deadlocks | Conflicting locks | Check `sys.dm_tran_locks` |
| Timeout | Long-running query | Optimize or increase timeout |
| Truncation error | Column too small | Check `NVARCHAR` length |
