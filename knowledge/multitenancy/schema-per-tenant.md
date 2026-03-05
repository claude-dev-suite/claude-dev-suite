# Schema-Per-Tenant Multitenancy

## Overview

The schema-per-tenant model gives each tenant a dedicated PostgreSQL schema (namespace) within a shared database. It provides stronger isolation than row-level security while avoiding the operational burden of managing separate databases per tenant. This approach works well for B2B SaaS with hundreds to low thousands of tenants.

This document covers dynamic schema creation, routing queries to the correct schema, running migrations across all schemas, and managing connection pools.

---

## Dynamic Schema Creation

### PostgreSQL Schema Provisioning

```sql
-- Template: create a schema with all required tables
CREATE OR REPLACE FUNCTION provision_tenant_schema(p_tenant_slug TEXT)
RETURNS VOID AS $$
BEGIN
    -- Create the schema
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', 'tenant_' || p_tenant_slug);

    -- Create tables within the schema
    EXECUTE format('
        CREATE TABLE %I.orders (
            id          BIGSERIAL PRIMARY KEY,
            product     TEXT NOT NULL,
            quantity    INT NOT NULL,
            total_cents BIGINT NOT NULL,
            status      TEXT DEFAULT ''pending'',
            created_at  TIMESTAMPTZ DEFAULT now(),
            updated_at  TIMESTAMPTZ DEFAULT now()
        )', 'tenant_' || p_tenant_slug);

    EXECUTE format('
        CREATE TABLE %I.customers (
            id          BIGSERIAL PRIMARY KEY,
            email       TEXT UNIQUE NOT NULL,
            name        TEXT NOT NULL,
            created_at  TIMESTAMPTZ DEFAULT now()
        )', 'tenant_' || p_tenant_slug);

    EXECUTE format('
        CREATE TABLE %I.settings (
            key   TEXT PRIMARY KEY,
            value JSONB NOT NULL
        )', 'tenant_' || p_tenant_slug);

    -- Grant permissions to the application role
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO app_user', 'tenant_' || p_tenant_slug);
    EXECUTE format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I TO app_user', 'tenant_' || p_tenant_slug);
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO app_user', 'tenant_' || p_tenant_slug);
END;
$$ LANGUAGE plpgsql;

-- Usage
SELECT provision_tenant_schema('acme');
SELECT provision_tenant_schema('globex');
```

### Node.js Provisioning Service

```typescript
import { Pool } from 'pg';

interface TenantProvisionResult {
  schema: string;
  createdAt: Date;
}

export class TenantProvisioner {
  constructor(private adminPool: Pool) {}

  async provision(tenantSlug: string): Promise<TenantProvisionResult> {
    const schema = `tenant_${this.sanitizeSlug(tenantSlug)}`;

    const client = await this.adminPool.connect();
    try {
      await client.query('BEGIN');

      // Create schema
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);

      // Run the initial migration set against this schema
      await this.runMigrations(client, schema);

      // Record in the control-plane table
      await client.query(
        `INSERT INTO public.tenants (slug, schema_name, status, created_at)
         VALUES ($1, $2, 'active', now())
         ON CONFLICT (slug) DO NOTHING`,
        [tenantSlug, schema]
      );

      await client.query('COMMIT');

      return { schema, createdAt: new Date() };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private sanitizeSlug(slug: string): string {
    // Only allow lowercase alphanumeric and underscores
    const sanitized = slug.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (sanitized.length === 0 || sanitized.length > 63) {
      throw new Error('Invalid tenant slug');
    }
    return sanitized;
  }

  private async runMigrations(client: any, schema: string): Promise<void> {
    // Apply all migration files in order against this schema
    await client.query(`SET search_path TO ${schema}, public`);
    // ... run migration SQL files
    await client.query(`RESET search_path`);
  }
}
```

---

## Schema Routing

### Hibernate Multi-Tenancy (Spring Boot)

```java
// TenantIdentifierResolver determines the current tenant
@Component
public class TenantIdentifierResolver implements CurrentTenantIdentifierResolver {

    @Override
    public String resolveCurrentTenantIdentifier() {
        String tenant = TenantContext.getCurrentTenant();
        return tenant != null ? "tenant_" + tenant : "public";
    }

    @Override
    public boolean validateExistingCurrentSessions() {
        return true;
    }
}

// MultiTenantConnectionProvider routes to the correct schema
@Component
public class SchemaRoutingConnectionProvider implements MultiTenantConnectionProvider<String> {

    @Autowired
    private DataSource dataSource;

    @Override
    public Connection getConnection(String tenantIdentifier) throws SQLException {
        Connection conn = dataSource.getConnection();
        conn.setSchema(tenantIdentifier);
        return conn;
    }

    @Override
    public Connection getAnyConnection() throws SQLException {
        return dataSource.getConnection();
    }

    @Override
    public void releaseConnection(String tenantIdentifier, Connection conn) throws SQLException {
        conn.setSchema("public");
        conn.close();
    }

    @Override
    public void releaseAnyConnection(Connection conn) throws SQLException {
        conn.close();
    }

    @Override
    public boolean supportsAggressiveRelease() {
        return false;
    }

    @Override
    public boolean isUnwrappableAs(Class<?> aClass) {
        return false;
    }

    @Override
    public <T> T unwrap(Class<T> aClass) {
        throw new UnsupportedOperationException();
    }
}
```

```yaml
# application.yml
spring:
  jpa:
    properties:
      hibernate:
        multiTenancy: SCHEMA
        tenant_identifier_resolver: com.app.tenancy.TenantIdentifierResolver
        multi_tenant_connection_provider: com.app.tenancy.SchemaRoutingConnectionProvider
```

### Prisma Schema Switching (Node.js)

Prisma does not natively support schema-per-tenant, but you can use the `$queryRawUnsafe` approach or manage multiple Prisma clients:

```typescript
import { PrismaClient } from '@prisma/client';

// Approach 1: search_path switching via $extends
function createTenantClient(tenantSchema: string): PrismaClient {
  const prisma = new PrismaClient();

  return prisma.$extends({
    query: {
      async $allOperations({ args, query }) {
        return prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET search_path TO "${tenantSchema}", public`);
          const result = await query(args);
          return result;
        });
      },
    },
  }) as unknown as PrismaClient;
}

// Approach 2: Client pool with LRU eviction
import { LRUCache } from 'lru-cache';

const clientCache = new LRUCache<string, PrismaClient>({
  max: 100,
  dispose: async (client) => {
    await client.$disconnect();
  },
});

function getTenantClient(tenantSchema: string): PrismaClient {
  let client = clientCache.get(tenantSchema);
  if (!client) {
    client = createTenantClient(tenantSchema);
    clientCache.set(tenantSchema, client);
  }
  return client;
}
```

### Knex Schema Routing

```typescript
import Knex, { Knex as KnexType } from 'knex';

const baseConfig: KnexType.Config = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
};

// Per-request schema routing
async function withSchema<T>(
  schema: string,
  fn: (knex: KnexType) => Promise<T>
): Promise<T> {
  const knex = Knex({
    ...baseConfig,
    searchPath: [schema, 'public'],
  });

  try {
    return await fn(knex);
  } finally {
    await knex.destroy();
  }
}

// Express middleware example
async function tenantSchemaMiddleware(req: Request, res: Response, next: NextFunction) {
  const tenantSlug = req.headers['x-tenant-id'] as string;
  const schemaName = `tenant_${tenantSlug}`;

  // Verify schema exists
  const result = await adminKnex.raw(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name = ?`,
    [schemaName]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  req.tenantSchema = schemaName;
  next();
}
```

---

## Migration Management Across Schemas

### Flyway Multi-Schema Migrations

```properties
# flyway.conf
flyway.url=jdbc:postgresql://localhost:5432/myapp
flyway.user=admin
flyway.schemas=public
flyway.placeholders.schema=public
```

```java
// Custom Flyway runner that migrates every tenant schema
@Component
public class TenantMigrationRunner implements CommandLineRunner {

    @Autowired
    private DataSource dataSource;

    @Autowired
    private TenantRepository tenantRepository;

    @Override
    public void run(String... args) {
        // Migrate the public schema first (control plane)
        migrateSchema("public", "db/migration/public");

        // Migrate each tenant schema
        List<Tenant> tenants = tenantRepository.findAllActive();
        for (Tenant tenant : tenants) {
            try {
                migrateSchema(tenant.getSchemaName(), "db/migration/tenant");
                log.info("Migrated schema: {}", tenant.getSchemaName());
            } catch (Exception e) {
                log.error("Failed to migrate schema: {}", tenant.getSchemaName(), e);
                // Continue with other tenants — do not fail the entire deployment
            }
        }
    }

    private void migrateSchema(String schema, String location) {
        Flyway flyway = Flyway.configure()
            .dataSource(dataSource)
            .schemas(schema)
            .locations(location)
            .baselineOnMigrate(true)
            .load();
        flyway.migrate();
    }
}
```

### Liquibase Multi-Schema Migrations

```yaml
# changelog-master.yaml
databaseChangeLog:
  - changeSet:
      id: 001-create-orders
      author: dev
      changes:
        - createTable:
            schemaName: ${schema}
            tableName: orders
            columns:
              - column:
                  name: id
                  type: bigserial
                  constraints:
                    primaryKey: true
              - column:
                  name: product
                  type: varchar(255)
                  constraints:
                    nullable: false
              - column:
                  name: quantity
                  type: int
              - column:
                  name: created_at
                  type: timestamptz
                  defaultValueComputed: now()
```

```java
// Run Liquibase per tenant
public void migrateTenantSchema(String schemaName) {
    try (Connection conn = dataSource.getConnection()) {
        conn.createStatement().execute("SET search_path TO " + schemaName);

        Liquibase liquibase = new Liquibase(
            "db/changelog/tenant-changelog.yaml",
            new ClassLoaderResourceAccessor(),
            new JdbcConnection(conn)
        );
        liquibase.getChangeLogParameters().set("schema", schemaName);
        liquibase.update("");
    }
}
```

### Node.js Migration Script

```typescript
import { readdir, readFile } from 'fs/promises';
import { Pool } from 'pg';
import path from 'path';

const adminPool = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL });

async function migrateAllTenants(): Promise<void> {
  // Get all tenant schemas
  const { rows: tenants } = await adminPool.query(
    `SELECT schema_name FROM public.tenants WHERE status = 'active'`
  );

  // Load migration files
  const migrationDir = path.resolve(__dirname, '../migrations/tenant');
  const files = (await readdir(migrationDir)).filter(f => f.endsWith('.sql')).sort();

  for (const tenant of tenants) {
    const client = await adminPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET search_path TO ${tenant.schema_name}, public`);

      // Track applied migrations in each schema
      await client.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          name TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ DEFAULT now()
        )
      `);

      const { rows: applied } = await client.query('SELECT name FROM _migrations');
      const appliedSet = new Set(applied.map(r => r.name));

      for (const file of files) {
        if (appliedSet.has(file)) continue;

        const sql = await readFile(path.join(migrationDir, file), 'utf-8');
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        console.log(`  Applied ${file} to ${tenant.schema_name}`);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`Failed to migrate ${tenant.schema_name}:`, error);
    } finally {
      client.release();
    }
  }
}

migrateAllTenants().then(() => process.exit(0));
```

---

## Connection Pooling Per Tenant

### The Pooling Challenge

With N tenants sharing one database, you cannot afford N independent pools each with 10+ connections — that would exhaust PostgreSQL's `max_connections`. You need either:

1. **A shared pool with schema switching** (simpler, lower isolation)
2. **A connection pool per tenant with strict limits** (stronger isolation, more complex)
3. **PgBouncer in front** (production recommendation)

### Shared Pool with Schema Switching

```typescript
import { Pool } from 'pg';

// Single pool, switch schema per request
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 50, // Shared across all tenants
});

async function withTenantConnection<T>(
  tenantSchema: string,
  fn: (client: any) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO ${tenantSchema}, public`);
    const result = await fn(client);
    return result;
  } finally {
    await client.query('RESET search_path');
    client.release();
  }
}
```

### PgBouncer Configuration

```ini
; pgbouncer.ini
[databases]
myapp = host=127.0.0.1 port=5432 dbname=myapp

[pgbouncer]
listen_port = 6432
listen_addr = 0.0.0.0
auth_type = scram-sha-256
pool_mode = transaction          ; CRITICAL: transaction mode allows search_path per tx
max_client_conn = 1000
default_pool_size = 50
min_pool_size = 10
reserve_pool_size = 10
server_reset_query = RESET ALL   ; Clear session state between uses
```

With transaction-mode PgBouncer, `SET LOCAL` scopes to the transaction and is safe with pooled connections:

```typescript
await pool.query('BEGIN');
await pool.query(`SET LOCAL search_path TO ${tenantSchema}, public`);
// ... queries
await pool.query('COMMIT');
// Connection returns to PgBouncer with search_path reset
```

---

## Tenant Schema Cleanup

```sql
-- Offboarding: export data, then drop schema
-- Step 1: Export (use pg_dump with --schema flag)
-- pg_dump -d myapp --schema=tenant_acme > acme_backup.sql

-- Step 2: Mark inactive
UPDATE public.tenants SET status = 'inactive', deactivated_at = now()
WHERE slug = 'acme';

-- Step 3: After retention period, drop
DROP SCHEMA tenant_acme CASCADE;
DELETE FROM public.tenants WHERE slug = 'acme';
```

---

## Anti-Patterns

1. **Not sanitizing schema names.** Schema names derived from user input must be strictly validated (alphanumeric + underscore only) to prevent SQL injection via `SET search_path`.
2. **Running migrations synchronously during deployment.** With hundreds of schemas, sequential migration blocks deploys for too long. Parallelize with a worker pool and per-schema error isolation.
3. **Forgetting to reset `search_path` on connection release.** Pooled connections that retain a tenant schema will route the next request's queries to the wrong tenant.
4. **One Prisma Client per tenant without eviction.** Each client holds a connection pool. Without LRU eviction, you exhaust database connections.
5. **Naming schemas with raw user input.** Always prefix (`tenant_`) and sanitize to prevent collisions with PostgreSQL system schemas (`pg_catalog`, `information_schema`).

---

## Production Checklist

- [ ] Schema creation is transactional and idempotent (uses `IF NOT EXISTS`)
- [ ] Tenant slug is sanitized before schema name construction
- [ ] `search_path` is reset when connections return to the pool
- [ ] Migrations run per-schema with error isolation (one failure does not block others)
- [ ] Migration state is tracked per schema (e.g., `_migrations` table or Flyway/Liquibase metadata)
- [ ] PgBouncer or equivalent is in front of PostgreSQL for connection multiplexing
- [ ] `max_connections` is calculated: (app pool size * app instances) + admin + monitoring headroom
- [ ] Schema list is discoverable from a control-plane table, not hardcoded
- [ ] Tenant offboarding includes data export, grace period, and cascading schema drop
- [ ] Monitoring tracks per-schema table sizes, query latency, and migration version
- [ ] Load testing validates that schema switching does not degrade under concurrent tenants
