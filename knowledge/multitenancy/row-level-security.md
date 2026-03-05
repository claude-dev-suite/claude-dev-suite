# Row-Level Security for Multitenancy

## Overview

Row-Level Security (RLS) is a database-enforced mechanism that restricts which rows a given user or session can access. In a multitenant system using the shared-database/shared-schema model, RLS acts as a critical safety net: even if application code forgets a `WHERE tenant_id = ?` clause, the database itself prevents cross-tenant data leakage.

PostgreSQL has the most mature RLS implementation. This document covers PostgreSQL RLS in depth, then shows how to integrate it with Spring Boot (Hibernate) and Node.js (Prisma, Knex).

---

## PostgreSQL RLS Fundamentals

### Enabling RLS on a Table

```sql
-- Step 1: Enable RLS on the table
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Step 2: Force RLS even for table owners (critical for security)
ALTER TABLE orders FORCE ROW LEVEL SECURITY;

-- Step 3: Create a policy
CREATE POLICY tenant_isolation ON orders
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

The `USING` clause filters rows on SELECT, UPDATE, and DELETE. A separate `WITH CHECK` clause controls INSERT and UPDATE (new row values).

### Separate Policies for Read and Write

```sql
-- Read policy: tenant can only see their own rows
CREATE POLICY tenant_read ON orders
    FOR SELECT
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Write policy: tenant can only insert rows for themselves
CREATE POLICY tenant_write ON orders
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Update policy: both USING (which rows) and WITH CHECK (new values)
CREATE POLICY tenant_update ON orders
    FOR UPDATE
    USING (tenant_id = current_setting('app.current_tenant')::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

-- Delete policy
CREATE POLICY tenant_delete ON orders
    FOR DELETE
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

### Setting Tenant Context

```sql
-- Set the tenant for the current transaction
SET LOCAL app.current_tenant = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

-- Or for the entire session
SET app.current_tenant = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

-- Read it back
SELECT current_setting('app.current_tenant');
```

`SET LOCAL` is preferred because it scopes the setting to the current transaction and automatically resets when the transaction completes, preventing tenant context from leaking across requests sharing a pooled connection.

### Creating a Dedicated Application Role

```sql
-- Superusers bypass RLS. Create a non-superuser role for the app.
CREATE ROLE app_user LOGIN PASSWORD 'strong_password';
GRANT CONNECT ON DATABASE myapp TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- The app connects as app_user, which respects RLS policies
-- Admin tasks use a separate superuser connection
```

### Applying RLS to All Tenant Tables

```sql
-- Helper function to enable RLS on all tables with a tenant_id column
DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN
        SELECT table_name
        FROM information_schema.columns
        WHERE column_name = 'tenant_id'
          AND table_schema = 'public'
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl.table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl.table_name);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.current_tenant'')::uuid)',
            tbl.table_name
        );
    END LOOP;
END $$;
```

---

## Spring Boot Integration

### Hibernate Filter Approach

```java
// Entity with tenant discrimination
@Entity
@Table(name = "orders")
@FilterDef(
    name = "tenantFilter",
    parameters = @ParamDef(name = "tenantId", type = String.class)
)
@Filter(name = "tenantFilter", condition = "tenant_id = :tenantId")
public class Order {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    private String product;
    private int quantity;
}
```

```java
// Aspect that enables the Hibernate filter on every session
@Aspect
@Component
public class TenantFilterAspect {

    @PersistenceContext
    private EntityManager entityManager;

    @Before("execution(* com.app.repository.*.*(..))")
    public void applyTenantFilter() {
        String tenantId = TenantContext.getCurrentTenant();
        if (tenantId != null) {
            Session session = entityManager.unwrap(Session.class);
            session.enableFilter("tenantFilter")
                   .setParameter("tenantId", tenantId);
        }
    }
}
```

### Database-Level RLS with Spring Boot

When using PostgreSQL RLS, set the session variable on each connection:

```java
@Component
public class TenantConnectionCustomizer implements ConnectionCustomizer {

    @Override
    public void customize(Connection connection) throws SQLException {
        String tenantId = TenantContext.getCurrentTenant();
        if (tenantId != null) {
            try (var stmt = connection.createStatement()) {
                // Use SET LOCAL to scope to the current transaction
                stmt.execute("SET LOCAL app.current_tenant = '" + sanitizeTenantId(tenantId) + "'");
            }
        }
    }

    private String sanitizeTenantId(String tenantId) {
        // Only allow UUID format to prevent SQL injection
        if (!tenantId.matches("^[0-9a-fA-F-]{36}$")) {
            throw new IllegalArgumentException("Invalid tenant ID format");
        }
        return tenantId;
    }
}
```

### HikariCP Connection Hook

```java
@Configuration
public class DataSourceConfig {

    @Bean
    public DataSource dataSource(DataSourceProperties props) {
        HikariDataSource ds = props.initializeDataSourceBuilder()
            .type(HikariDataSource.class)
            .build();

        // Reset tenant context when connections return to pool
        ds.setConnectionInitSql("RESET app.current_tenant");

        return ds;
    }
}
```

### Spring @Transactional with Tenant Context

```java
@Service
public class OrderService {

    @Autowired
    private OrderRepository orderRepository;

    @Transactional
    public List<Order> getOrdersForCurrentTenant() {
        // RLS automatically filters — no tenant_id in the query
        return orderRepository.findAll();
    }

    @Transactional
    public Order createOrder(CreateOrderRequest request) {
        Order order = new Order();
        order.setTenantId(UUID.fromString(TenantContext.getCurrentTenant()));
        order.setProduct(request.getProduct());
        order.setQuantity(request.getQuantity());
        // RLS WITH CHECK ensures the tenant_id matches the session context
        return orderRepository.save(order);
    }
}
```

---

## Node.js Integration

### Prisma Middleware for RLS Context

```typescript
import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

const tenantStorage = new AsyncLocalStorage<string>();

const prisma = new PrismaClient();

// Set tenant context before every query using $extends
const tenantPrisma = prisma.$extends({
  query: {
    async $allOperations({ args, query, operation, model }) {
      const tenantId = tenantStorage.getStore();
      if (!tenantId) throw new Error('No tenant context set');

      // Set RLS context via raw query within the same connection
      return prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SET LOCAL app.current_tenant = '${tenantId}'`
        );
        return query(args);
      });
    },
  },
});

// Express middleware
function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  const tenantId = req.headers['x-tenant-id'] as string;
  if (!tenantId || !isValidUUID(tenantId)) {
    return res.status(400).json({ error: 'Missing or invalid tenant ID' });
  }
  tenantStorage.run(tenantId, () => next());
}
```

### Knex Integration

```typescript
import Knex from 'knex';

const knex = Knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: {
    min: 2,
    max: 20,
    afterCreate: (conn: any, done: Function) => {
      // Reset tenant on new connections
      conn.query('RESET app.current_tenant', (err: Error) => done(err, conn));
    },
  },
});

// Wrapper that sets tenant context per query
async function withTenant<T>(tenantId: string, fn: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
  return knex.transaction(async (trx) => {
    await trx.raw(`SET LOCAL app.current_tenant = ?`, [tenantId]);
    return fn(trx);
  });
}

// Usage
const orders = await withTenant('acme-tenant-id', async (trx) => {
  return trx('orders').select('*').where('status', 'active');
  // RLS filters to only acme's rows automatically
});
```

### Drizzle ORM Integration

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function withTenantContext<T>(
  tenantId: string,
  fn: (db: typeof db) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.current_tenant = ${tenantId}`);
    return fn(tx as any);
  });
}
```

---

## Performance Impact of RLS

### Benchmarks (Typical Results)

| Query Type | Without RLS | With RLS | Overhead |
|-----------|-------------|----------|----------|
| Simple SELECT (indexed tenant_id) | 0.8ms | 0.9ms | ~12% |
| JOIN across 3 tables | 2.1ms | 2.4ms | ~14% |
| Aggregation (COUNT/SUM) | 5.3ms | 6.1ms | ~15% |
| Bulk INSERT (1000 rows) | 12ms | 14ms | ~17% |

### Optimization Strategies

```sql
-- 1. Composite index with tenant_id first
CREATE INDEX idx_orders_tenant_created
    ON orders(tenant_id, created_at DESC);

-- 2. Partition by tenant_id for large tables
CREATE TABLE orders (
    id          BIGSERIAL,
    tenant_id   UUID NOT NULL,
    product     TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
) PARTITION BY HASH (tenant_id);

CREATE TABLE orders_p0 PARTITION OF orders FOR VALUES WITH (MODULUS 16, REMAINDER 0);
CREATE TABLE orders_p1 PARTITION OF orders FOR VALUES WITH (MODULUS 16, REMAINDER 1);
-- ... up to p15

-- 3. Ensure the planner sees RLS as a simple equality filter
-- Use current_setting() with a second argument to avoid errors when unset
CREATE POLICY tenant_isolation ON orders
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);
```

### Analyzing RLS Query Plans

```sql
SET app.current_tenant = 'some-uuid';
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE created_at > '2025-01-01';

-- Look for:
--   Filter: (tenant_id = 'some-uuid'::uuid)  <-- RLS applied
--   Index Scan using idx_orders_tenant_created  <-- index used
```

---

## Testing RLS Policies

```sql
-- Test 1: Verify isolation
SET app.current_tenant = 'tenant-a-uuid';
INSERT INTO orders (tenant_id, product, quantity) VALUES ('tenant-a-uuid', 'Widget', 5);
INSERT INTO orders (tenant_id, product, quantity) VALUES ('tenant-b-uuid', 'Gadget', 3);
-- Second insert should FAIL due to WITH CHECK policy

-- Test 2: Verify read isolation
SET app.current_tenant = 'tenant-a-uuid';
SELECT count(*) FROM orders; -- Should only see tenant A's rows

SET app.current_tenant = 'tenant-b-uuid';
SELECT count(*) FROM orders; -- Should only see tenant B's rows

-- Test 3: Verify no bypass without context
RESET app.current_tenant;
SELECT count(*) FROM orders; -- Should return 0 rows or error
```

```typescript
// Automated test (Vitest/Jest)
describe('RLS tenant isolation', () => {
  it('prevents cross-tenant reads', async () => {
    // Insert as tenant A
    await withTenant('tenant-a', async (trx) => {
      await trx('orders').insert({ tenant_id: 'tenant-a', product: 'Widget', quantity: 5 });
    });

    // Read as tenant B should return nothing
    const orders = await withTenant('tenant-b', async (trx) => {
      return trx('orders').select('*');
    });

    expect(orders).toHaveLength(0);
  });

  it('prevents cross-tenant inserts', async () => {
    await expect(
      withTenant('tenant-a', async (trx) => {
        await trx('orders').insert({ tenant_id: 'tenant-b', product: 'Hack', quantity: 1 });
      })
    ).rejects.toThrow(); // WITH CHECK violation
  });
});
```

---

## Anti-Patterns

1. **Connecting as a superuser.** Superusers bypass RLS entirely. Always use a dedicated non-superuser role for the application.
2. **Using `SET` instead of `SET LOCAL`.** Without `LOCAL`, the tenant context persists across transactions on a pooled connection, potentially leaking data to the next request.
3. **Forgetting `FORCE ROW LEVEL SECURITY`.** Without `FORCE`, table owners bypass RLS. Always use both `ENABLE` and `FORCE`.
4. **Not indexing `tenant_id`.** RLS adds an implicit filter; without an index, every query becomes a sequential scan.
5. **Trusting client-supplied tenant IDs without validation.** Always validate the tenant ID against the authentication token, never trust a raw header value.
6. **Skipping RLS in migrations or background jobs.** Use a superuser connection explicitly for admin operations, and document why RLS is bypassed.

---

## Production Checklist

- [ ] RLS is enabled and forced on every table containing tenant data
- [ ] Application connects as a non-superuser role
- [ ] `SET LOCAL` is used (not `SET`) to scope tenant context to the transaction
- [ ] `tenant_id` is the leading column in composite indexes on tenant-scoped tables
- [ ] Connection pool resets tenant context when connections are returned
- [ ] RLS policies are tested with automated cross-tenant isolation tests
- [ ] Background jobs and migrations use an explicit admin connection when RLS bypass is needed
- [ ] Tenant ID is validated against the authentication token, not just a request header
- [ ] Query plans are analyzed to confirm RLS does not cause sequential scans
- [ ] Monitoring alerts on queries that take longer than expected (RLS regression detection)
- [ ] `current_setting('app.current_tenant', true)` is used with the silent-missing flag
