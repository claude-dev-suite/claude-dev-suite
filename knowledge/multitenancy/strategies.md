# Multitenancy Strategies

## Overview

Multitenancy allows a single application instance to serve multiple tenants (customers, organizations) while keeping their data logically or physically separated. Choosing the right tenancy model is one of the most consequential architecture decisions in SaaS — it affects cost, isolation guarantees, operational complexity, and how you scale.

This document covers the three canonical strategies, when each is appropriate, and how to implement them.

---

## Strategy 1: Shared Database, Shared Schema

All tenants share the same database and the same tables. A `tenant_id` discriminator column on every tenant-scoped table separates rows.

### How It Works

```sql
CREATE TABLE orders (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   UUID NOT NULL REFERENCES tenants(id),
    product     TEXT NOT NULL,
    quantity    INT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_orders_tenant ON orders(tenant_id);

-- Every query must include the tenant filter
SELECT * FROM orders WHERE tenant_id = 'acme-corp' AND created_at > '2025-01-01';
```

### Spring Boot Implementation

```java
@Entity
@Table(name = "orders")
@FilterDef(name = "tenantFilter", parameters = @ParamDef(name = "tenantId", type = String.class))
@Filter(name = "tenantFilter", condition = "tenant_id = :tenantId")
public class Order {
    @Id @GeneratedValue
    private Long id;

    @Column(name = "tenant_id", nullable = false)
    private String tenantId;

    private String product;
    private int quantity;
}

@Component
public class TenantInterceptor implements HandlerInterceptor {
    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) {
        String tenantId = req.getHeader("X-Tenant-ID");
        if (tenantId == null) throw new MissingTenantException();
        TenantContext.setCurrentTenant(tenantId);
        return true;
    }
}
```

### Node.js Implementation (Prisma Middleware)

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

prisma.$use(async (params, next) => {
  const tenantId = getTenantFromContext(); // e.g., from AsyncLocalStorage

  // Inject tenant_id on create
  if (params.action === 'create') {
    params.args.data.tenantId = tenantId;
  }

  // Inject tenant filter on reads
  if (['findMany', 'findFirst', 'findUnique', 'updateMany', 'deleteMany'].includes(params.action)) {
    params.args.where = { ...params.args.where, tenantId };
  }

  return next(params);
});
```

### Pros and Cons

| Aspect | Rating |
|--------|--------|
| Cost efficiency | Excellent — one database for all tenants |
| Operational simplicity | Good — single schema to migrate |
| Tenant isolation | Weak — bugs can leak data across tenants |
| Per-tenant scaling | Poor — noisy-neighbor risk is high |
| Compliance | May not satisfy strict regulatory requirements |

---

## Strategy 2: Shared Database, Separate Schemas

Each tenant gets a dedicated schema (namespace) within the same database. Tables are identical but physically separated.

### How It Works

```sql
-- Create a schema per tenant
CREATE SCHEMA tenant_acme;
CREATE SCHEMA tenant_globex;

-- Tables live inside each schema
CREATE TABLE tenant_acme.orders (
    id          BIGSERIAL PRIMARY KEY,
    product     TEXT NOT NULL,
    quantity    INT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Route queries by setting search_path
SET search_path TO tenant_acme, public;
SELECT * FROM orders; -- resolves to tenant_acme.orders
```

### Spring Boot / Hibernate Implementation

```java
public class SchemaMultiTenantConnectionProvider implements MultiTenantConnectionProvider {
    private final DataSource dataSource;

    @Override
    public Connection getConnection(String tenantIdentifier) throws SQLException {
        Connection conn = dataSource.getConnection();
        conn.createStatement().execute("SET search_path TO " + tenantIdentifier + ", public");
        return conn;
    }

    @Override
    public void releaseConnection(String tenantIdentifier, Connection conn) throws SQLException {
        conn.createStatement().execute("RESET search_path");
        conn.close();
    }
}

// application.yml
// spring.jpa.properties.hibernate.multiTenancy: SCHEMA
// spring.jpa.properties.hibernate.tenant_identifier_resolver: com.app.TenantResolver
// spring.jpa.properties.hibernate.multi_tenant_connection_provider: com.app.SchemaMultiTenantConnectionProvider
```

### Node.js Implementation (Knex)

```typescript
import Knex from 'knex';

function getKnexForTenant(tenantSchema: string) {
  return Knex({
    client: 'pg',
    connection: process.env.DATABASE_URL,
    searchPath: [tenantSchema, 'public'],
  });
}

// Usage
const db = getKnexForTenant('tenant_acme');
const orders = await db('orders').where('created_at', '>', '2025-01-01');
```

### Pros and Cons

| Aspect | Rating |
|--------|--------|
| Cost efficiency | Good — one database, multiple schemas |
| Operational simplicity | Moderate — must run migrations per schema |
| Tenant isolation | Good — schema-level separation |
| Per-tenant scaling | Moderate — can move hot schemas to separate DB |
| Compliance | Acceptable for most regulations |

---

## Strategy 3: Separate Databases

Each tenant gets a completely independent database. The application routes connections by tenant identifier.

### How It Works

```typescript
// Connection registry
const tenantConnections: Map<string, Pool> = new Map();

async function getConnectionForTenant(tenantId: string): Promise<Pool> {
  if (tenantConnections.has(tenantId)) {
    return tenantConnections.get(tenantId)!;
  }

  const config = await fetchTenantDbConfig(tenantId); // from control-plane DB
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: 10,
  });

  tenantConnections.set(tenantId, pool);
  return pool;
}
```

### Spring Boot Implementation

```java
@Configuration
public class TenantDataSourceConfig {

    @Bean
    public DataSource dataSource(TenantRegistry registry) {
        AbstractRoutingDataSource routingDs = new AbstractRoutingDataSource() {
            @Override
            protected Object determineCurrentLookupKey() {
                return TenantContext.getCurrentTenant();
            }
        };

        Map<Object, Object> targetDataSources = new HashMap<>();
        for (TenantInfo tenant : registry.getAllTenants()) {
            targetDataSources.put(tenant.getId(), createDataSource(tenant));
        }

        routingDs.setTargetDataSources(targetDataSources);
        routingDs.setDefaultTargetDataSource(targetDataSources.values().iterator().next());
        return routingDs;
    }

    private DataSource createDataSource(TenantInfo tenant) {
        HikariDataSource ds = new HikariDataSource();
        ds.setJdbcUrl(tenant.getJdbcUrl());
        ds.setUsername(tenant.getUsername());
        ds.setPassword(tenant.getPassword());
        ds.setMaximumPoolSize(10);
        return ds;
    }
}
```

### Pros and Cons

| Aspect | Rating |
|--------|--------|
| Cost efficiency | Expensive — one database per tenant |
| Operational simplicity | Complex — manage N databases |
| Tenant isolation | Excellent — full physical separation |
| Per-tenant scaling | Excellent — independent scaling |
| Compliance | Best — meets strictest regulatory needs |

---

## Comparison Table

| Factor | Shared Schema | Separate Schema | Separate Database |
|--------|--------------|----------------|-------------------|
| **Data isolation** | Logical (row-level) | Namespace-level | Physical |
| **Cost per tenant** | Lowest | Low-medium | Highest |
| **Onboarding speed** | Instant | Seconds (create schema) | Minutes (provision DB) |
| **Migration complexity** | Single migration | Per-schema migration | Per-database migration |
| **Noisy neighbor risk** | High | Medium | None |
| **Backup granularity** | Whole DB only | Schema-level possible | Per-tenant native |
| **Cross-tenant queries** | Trivial | Possible (schema prefix) | Requires federation |
| **Max tenants** | 100,000+ | 1,000-10,000 | 100-1,000 |
| **Compliance ceiling** | SOC2 | SOC2, HIPAA | SOC2, HIPAA, FedRAMP |

---

## Decision Matrix

Use this flowchart to pick your strategy:

1. **Do tenants require physical data isolation?** (e.g., government, healthcare with strict HIPAA)
   - Yes -> **Separate Database**
2. **Will you have more than 5,000 tenants?**
   - Yes -> **Shared Schema** (schemas do not scale past thousands)
3. **Do tenants need independent backup/restore?**
   - Yes -> **Separate Schema** or **Separate Database**
4. **Is cost the primary constraint (startup/early stage)?**
   - Yes -> **Shared Schema**
5. **Do tenants have wildly different load profiles?**
   - Yes -> **Separate Database**
6. **Default choice for mid-market SaaS:**
   - **Separate Schema** — balances isolation, cost, and operational complexity

---

## Anti-Patterns

1. **No tenant filter on shared-schema queries.** A single missed `WHERE tenant_id = ?` leaks data. Use Row-Level Security as a safety net even in the shared-schema model.
2. **Storing tenant connection strings in application code.** Use a control-plane database or secrets manager.
3. **One connection pool for all separate-database tenants.** Each database needs its own bounded pool; a single shared pool creates contention.
4. **Ignoring the migration path.** Starting with shared schema is fine, but design your data access layer so you can migrate to separate schemas later without rewriting queries.
5. **Mixing tenant data in caches.** Every cache key must be tenant-scoped: `cache.get(\`tenant:\${tenantId}:orders:\${orderId}\`)`.

---

## Production Checklist

- [ ] Tenant identifier is extracted and validated on every request before any database access
- [ ] Default deny: queries without a tenant context fail rather than returning all data
- [ ] Connection pools are bounded per tenant (separate DB) or globally with fair scheduling
- [ ] Migrations are tested against all tenancy models in CI
- [ ] Monitoring includes per-tenant query latency and error rates
- [ ] Tenant onboarding is automated (schema creation, DB provisioning, seed data)
- [ ] Tenant offboarding includes data export, grace period, and permanent deletion
- [ ] Cross-tenant analytics uses a read replica or data warehouse, never production tenant databases
- [ ] Cache keys are tenant-scoped
- [ ] Audit logs include tenant_id on every entry
