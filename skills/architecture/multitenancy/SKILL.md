---
name: multitenancy
description: |
  Multi-tenant architecture patterns. Database-per-tenant, schema-per-tenant,
  shared-schema with tenant ID, row-level security, tenant resolution,
  and data isolation.

  USE WHEN: user mentions "multi-tenant", "multitenancy", "SaaS architecture",
  "tenant isolation", "row-level security", "tenant ID", "subdomain routing"

  DO NOT USE FOR: general database design - use database skills;
  authentication - use auth skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Multi-Tenant Architecture

## Isolation Strategies

| Strategy | Isolation | Complexity | Cost |
|----------|-----------|------------|------|
| Database per tenant | Highest | High | High |
| Schema per tenant | High | Medium | Medium |
| Shared schema (tenant_id column) | Medium | Low | Low |
| Row-level security (RLS) | Medium-High | Medium | Low |

## Shared Schema with Tenant ID (most common)

```typescript
// Middleware: resolve tenant from subdomain or header
function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  const host = req.hostname; // acme.myapp.com
  const subdomain = host.split('.')[0];
  const tenant = await tenantRepo.findBySubdomain(subdomain);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  req.tenantId = tenant.id;
  next();
}

// Always filter by tenant
app.get('/api/products', async (req, res) => {
  const products = await db.product.findMany({
    where: { tenantId: req.tenantId },
  });
  res.json(products);
});
```

### Prisma with Tenant Scoping

```typescript
// Extension to auto-apply tenant filter
const prisma = new PrismaClient().$extends({
  query: {
    $allOperations({ args, query, operation }) {
      if (['findMany', 'findFirst', 'count', 'updateMany', 'deleteMany'].includes(operation)) {
        args.where = { ...args.where, tenantId: getCurrentTenantId() };
      }
      if (['create', 'createMany'].includes(operation)) {
        args.data = { ...args.data, tenantId: getCurrentTenantId() };
      }
      return query(args);
    },
  },
});
```

## PostgreSQL Row-Level Security

```sql
-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Policy: users see only their tenant's data
CREATE POLICY tenant_isolation ON products
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Set tenant context per request
SET app.tenant_id = 'tenant-uuid-here';
SELECT * FROM products; -- auto-filtered
```

```typescript
// Set tenant context on each request
pool.on('connect', async (client) => {
  // Set after getting connection from pool
});

async function withTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SET app.tenant_id = $1`, [tenantId]);
    return await fn();
  } finally {
    await client.query('RESET app.tenant_id');
    client.release();
  }
}
```

## Schema-Per-Tenant

```typescript
// Dynamic schema selection
function getTenantSchema(tenantId: string): string {
  return `tenant_${tenantId.replace(/-/g, '_')}`;
}

async function createTenantSchema(tenantId: string) {
  const schema = getTenantSchema(tenantId);
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await db.query(`SET search_path TO ${schema}`);
  await runMigrations(); // Apply schema migrations
}
```

## Tenant Resolution Strategies

| Strategy | Example | Best For |
|----------|---------|----------|
| Subdomain | `acme.myapp.com` | B2B SaaS |
| Path prefix | `myapp.com/acme/...` | Simpler setup |
| Custom header | `X-Tenant-ID: acme` | API-first |
| JWT claim | `{ tenantId: "acme" }` | Authenticated APIs |

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| No tenant filter on queries | Use middleware or ORM extension to auto-apply |
| Tenant ID from client without validation | Derive from auth token or subdomain |
| No tenant data isolation testing | Write tests that verify cross-tenant isolation |
| Shared cache without tenant prefix | Prefix all cache keys with tenant ID |
| No tenant-aware rate limiting | Rate limit per tenant, not globally |

## Production Checklist

- [ ] Tenant resolution middleware on all routes
- [ ] Data isolation verified with automated tests
- [ ] Cache keys prefixed with tenant ID
- [ ] Rate limiting per tenant
- [ ] Tenant-scoped background jobs
- [ ] Tenant provisioning and deprovisioning flow
- [ ] Cross-tenant query prevention (RLS or ORM enforcement)
