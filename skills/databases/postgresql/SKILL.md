---
name: postgresql
description: |
  PostgreSQL relational database. Covers SQL queries, indexes,
  constraints, and performance. Use when working with PostgreSQL.

  USE WHEN: user mentions "postgres", "postgresql", "pg_", asks about "JSONB queries",
  "window functions", "recursive CTE", "row level security", "full text search",
  "partitioning", "pgBouncer", "replication"

  DO NOT USE FOR: MySQL syntax - use `mysql` instead, MongoDB - use `mongodb` instead,
  Oracle PL/SQL - use `plsql` instead, SQL Server T-SQL - use `tsql` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# PostgreSQL Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `postgresql` for comprehensive documentation.

## Table Definition

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created ON users(created_at DESC);
```

## Common Queries

```sql
-- Select with pagination
SELECT * FROM users
WHERE is_active = TRUE
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;

-- Join
SELECT u.*, p.title
FROM users u
LEFT JOIN posts p ON p.user_id = u.id
WHERE u.id = $1;

-- Aggregate
SELECT
    DATE_TRUNC('day', created_at) as day,
    COUNT(*) as count
FROM users
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY day DESC;

-- Upsert
INSERT INTO users (email, name)
VALUES ($1, $2)
ON CONFLICT (email)
DO UPDATE SET name = EXCLUDED.name;
```

## Data Types

| Type | Use For |
|------|---------|
| `SERIAL` | Auto-increment IDs |
| `UUID` | Unique identifiers |
| `VARCHAR(n)` | Variable strings |
| `TEXT` | Long text |
| `JSONB` | JSON data (indexed) |
| `TIMESTAMP` | Date and time |
| `BOOLEAN` | True/false |

## Performance

- Use `EXPLAIN ANALYZE` to check queries
- Add indexes for WHERE/JOIN columns
- Use `JSONB` over `JSON` for queries
- Partial indexes for filtered queries

## When NOT to Use This Skill

- **MySQL-specific syntax** - Use `mysql` skill for MySQL databases (AUTO_INCREMENT, GROUP_CONCAT)
- **NoSQL operations** - Use `mongodb` or `redis` skills for document/key-value stores
- **Oracle PL/SQL** - Use `plsql` skill for Oracle-specific procedural code
- **SQL Server T-SQL** - Use `tsql` skill for SQL Server-specific features
- **ORM abstractions** - Use framework-specific skills (Prisma, TypeORM, Spring Data JPA)

## Anti-Patterns

| Anti-Pattern | Issue | Solution |
|--------------|-------|----------|
| `SELECT *` in production | Transfers unnecessary data, breaks when schema changes | Specify needed columns explicitly |
| Missing `WHERE` on UPDATE/DELETE | Modifies all rows unintentionally | Always include WHERE clause, use transactions |
| Missing indexes on JOIN/WHERE columns | Full table scans, slow queries | Add indexes on frequently queried columns |
| Using functions on indexed columns | Prevents index usage: `WHERE UPPER(email) = 'X'` | Use functional indexes or change query |
| `LIKE '%pattern'` | Cannot use index, full scan | Use `LIKE 'pattern%'` or full-text search |
| Missing `LIMIT` on large tables | Can crash application, memory issues | Always paginate results |
| Storing comma-separated values | Cannot query efficiently, violates normalization | Use array type or junction table |
| Missing foreign keys | Data integrity issues, orphaned records | Define proper FK constraints |
| N+1 query problem | One query per row in loop | Use JOINs or batch queries |
| Long-running transactions | Locks resources, blocks other queries | Keep transactions short, use appropriate isolation |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Slow queries | `EXPLAIN ANALYZE query` | Add indexes, rewrite query, update statistics |
| High CPU usage | `pg_stat_statements` to find slow queries | Optimize top queries, add connection pooling |
| Connection limit reached | `SELECT count(*) FROM pg_stat_activity` | Increase max_connections, use PgBouncer |
| Lock contention | `SELECT * FROM pg_locks WHERE NOT granted` | Reduce transaction time, use lower isolation |
| Disk space full | `SELECT pg_size_pretty(pg_database_size('mydb'))` | VACUUM, archive old data, increase storage |
| Replication lag | Check `pg_stat_replication` | Increase resources, tune checkpoint settings |
| Cache hit ratio < 95% | `SELECT sum(blks_hit)/sum(blks_hit+blks_read) FROM pg_stat_database` | Increase shared_buffers |
| Dead tuples accumulating | `SELECT n_dead_tup FROM pg_stat_user_tables` | Run VACUUM, tune autovacuum |

## Production Readiness

### Security Configuration

```sql
-- Create application user with limited privileges
CREATE USER app_user WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE mydb TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_tenant_isolation ON users
    USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Force SSL connections
-- In postgresql.conf:
-- ssl = on
-- ssl_cert_file = '/path/to/server.crt'
-- ssl_key_file = '/path/to/server.key'
```

```sql
-- Connection with SSL
psql "postgresql://user:pass@host:5432/db?sslmode=require"
```

### Connection Pooling (PgBouncer)

```ini
# pgbouncer.ini
[databases]
mydb = host=127.0.0.1 port=5432 dbname=mydb

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20
min_pool_size = 5
reserve_pool_size = 5
```

### Backup & Recovery

```bash
# Continuous archiving (WAL)
# postgresql.conf:
archive_mode = on
archive_command = 'cp %p /backup/wal/%f'
wal_level = replica

# Full backup with pg_basebackup
pg_basebackup -D /backup/base -Ft -Xs -P -U replication

# Point-in-time recovery (recovery.signal)
restore_command = 'cp /backup/wal/%f %p'
recovery_target_time = '2024-01-15 10:00:00'
```

### Performance Tuning

```sql
-- postgresql.conf recommendations (for 16GB RAM server)
shared_buffers = 4GB                # 25% of RAM
effective_cache_size = 12GB         # 75% of RAM
maintenance_work_mem = 1GB
work_mem = 64MB
wal_buffers = 64MB
max_connections = 200
checkpoint_completion_target = 0.9
random_page_cost = 1.1              # SSD

-- Query optimization
SET log_min_duration_statement = 1000;  -- Log queries > 1s
ANALYZE;  -- Update statistics
```

### Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Connection count | > 80% max_connections |
| Cache hit ratio | < 95% |
| Replication lag | > 1MB or > 10s |
| Dead tuples ratio | > 10% |
| Long-running transactions | > 5 minutes |
| Lock wait events | > 10/min |

### Monitoring Queries

```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

-- Cache hit ratio
SELECT
    round(100 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2) as cache_hit_ratio
FROM pg_stat_database;

-- Table bloat (dead tuples)
SELECT schemaname, relname, n_dead_tup, n_live_tup,
       round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 2) as dead_ratio
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;

-- Long-running queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - pg_stat_activity.query_start > interval '5 minutes';

-- Replication lag
SELECT client_addr, state,
       pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn) AS send_lag,
       pg_wal_lsn_diff(sent_lsn, replay_lsn) AS replay_lag
FROM pg_stat_replication;
```

### High Availability

```yaml
# Patroni configuration for HA
scope: postgres-cluster
name: node1

restapi:
  listen: 0.0.0.0:8008

etcd:
  hosts: etcd1:2379,etcd2:2379,etcd3:2379

postgresql:
  listen: 0.0.0.0:5432
  data_dir: /data/postgres
  parameters:
    max_connections: 200
    shared_buffers: 4GB
```

### Checklist

- [ ] SSL/TLS encryption enabled
- [ ] Least-privilege user accounts
- [ ] Connection pooling (PgBouncer)
- [ ] WAL archiving configured
- [ ] Regular pg_dump backups
- [ ] Point-in-time recovery tested
- [ ] Monitoring queries in place
- [ ] Slow query logging enabled
- [ ] VACUUM/ANALYZE scheduled
- [ ] Replication configured (if HA)
- [ ] Connection limits set
- [ ] Row Level Security (if multi-tenant)

## Reference Documentation
- [Indexes](quick-ref/indexes.md)
- [JSON Queries](quick-ref/json.md)
