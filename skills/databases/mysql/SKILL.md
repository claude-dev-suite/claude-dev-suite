---
name: mysql
description: |
  MySQL relational database. Covers queries, indexes, and optimization.
  Use when working with MySQL databases.

  USE WHEN: user mentions "mysql", "mariadb", asks about "AUTO_INCREMENT",
  "ON DUPLICATE KEY UPDATE", "GROUP_CONCAT", "mysql specific syntax"

  DO NOT USE FOR: PostgreSQL - use `postgresql` instead, MongoDB - use `mongodb` instead,
  Oracle - use `oracle` instead, SQL Server - use `sqlserver` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# MySQL Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `mysql` for comprehensive documentation.

## Table Definition

```sql
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    INDEX idx_email (email),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## Common Queries

```sql
-- Pagination
SELECT * FROM users
WHERE is_active = TRUE
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;

-- Join
SELECT u.*, COUNT(p.id) as post_count
FROM users u
LEFT JOIN posts p ON p.user_id = u.id
GROUP BY u.id;

-- Upsert
INSERT INTO users (email, name)
VALUES (?, ?)
ON DUPLICATE KEY UPDATE name = VALUES(name);
```

## Key Differences from PostgreSQL

| Feature | MySQL | PostgreSQL |
|---------|-------|------------|
| Auto ID | `AUTO_INCREMENT` | `SERIAL` |
| Boolean | `TINYINT(1)` | `BOOLEAN` |
| Upsert | `ON DUPLICATE KEY` | `ON CONFLICT` |
| JSON | `JSON` | `JSONB` (indexed) |

## When NOT to Use This Skill

- **PostgreSQL-specific features** - Use `postgresql` skill for JSONB, arrays, window functions
- **NoSQL operations** - Use `mongodb` or `redis` skills for document/key-value stores
- **Oracle database** - Use `oracle` skill for Oracle-specific features
- **SQL Server** - Use `sqlserver` skill for T-SQL and SQL Server features
- **ORM abstractions** - Use framework-specific skills (Prisma, TypeORM, Sequelize)

## Anti-Patterns

| Anti-Pattern | Issue | Solution |
|--------------|-------|----------|
| `SELECT *` in production | Transfers unnecessary data, performance impact | Specify needed columns explicitly |
| Missing `WHERE` on UPDATE/DELETE | Modifies all rows unintentionally | Always include WHERE clause |
| Missing indexes on JOIN/WHERE columns | Full table scans, slow queries | Add indexes on frequently queried columns |
| MyISAM for transactional data | No transaction support, table-level locking | Use InnoDB engine |
| `LIKE '%pattern'` | Cannot use index, full scan | Use `LIKE 'pattern%'` or fulltext search |
| Missing `LIMIT` on large tables | Can crash application | Always paginate results |
| Using `ENUM` for frequently changing values | Requires ALTER TABLE to add values | Use lookup table instead |
| Missing foreign keys | Data integrity issues | Define proper FK constraints |
| N+1 query problem | One query per row in loop | Use JOINs or batch queries |
| Not using prepared statements | SQL injection risk, slower performance | Use parameterized queries |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Slow queries | `EXPLAIN SELECT ...` | Add indexes, rewrite query, analyze execution plan |
| High CPU usage | `SHOW PROCESSLIST` to find slow queries | Optimize top queries, add indexes |
| Connection limit reached | `SHOW STATUS LIKE 'Threads_connected'` | Increase max_connections, use connection pooling |
| Lock wait timeout | Check `SHOW ENGINE INNODB STATUS` | Reduce transaction time, optimize queries |
| Disk space full | `SELECT table_schema, SUM(data_length+index_length) FROM information_schema.tables GROUP BY 1` | Archive old data, optimize tables |
| Replication lag | `SHOW SLAVE STATUS` | Increase resources, tune binlog settings |
| Table corruption | `CHECK TABLE table_name` | Run `REPAIR TABLE` or restore from backup |
| Deadlocks | Check error log and `SHOW ENGINE INNODB STATUS` | Reduce transaction scope, access tables in same order |

## Reference Documentation
- [Indexes](quick-ref/indexes.md)
- [JSON](quick-ref/json.md)
