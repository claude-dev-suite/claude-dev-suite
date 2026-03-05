# Multitenancy Migration and Tenant Lifecycle

## Overview

Migrating between tenancy models, provisioning new tenants with zero downtime, and automating tenant onboarding/offboarding are operational challenges that grow with scale. This document covers practical strategies for evolving your tenancy architecture, scripting data migrations, and building reliable tenant lifecycle automation.

---

## Migrating Between Tenancy Models

### Shared Schema to Schema-Per-Tenant

This is the most common migration path: you started with a single schema and `tenant_id` columns, and now need stronger isolation.

#### Phase 1: Prepare Target Schemas

```sql
-- Create schemas for each existing tenant
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN SELECT id, slug FROM public.tenants WHERE status = 'active'
    LOOP
        EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', 'tenant_' || t.slug);

        -- Create tables (identical DDL, minus the tenant_id column)
        EXECUTE format('
            CREATE TABLE %I.orders (
                id          BIGSERIAL PRIMARY KEY,
                product     TEXT NOT NULL,
                quantity    INT NOT NULL,
                total_cents BIGINT NOT NULL,
                status      TEXT DEFAULT ''pending'',
                created_at  TIMESTAMPTZ DEFAULT now(),
                updated_at  TIMESTAMPTZ DEFAULT now()
            )', 'tenant_' || t.slug);

        EXECUTE format('
            CREATE TABLE %I.customers (
                id          BIGSERIAL PRIMARY KEY,
                email       TEXT NOT NULL,
                name        TEXT NOT NULL,
                created_at  TIMESTAMPTZ DEFAULT now()
            )', 'tenant_' || t.slug);
    END LOOP;
END $$;
```

#### Phase 2: Migrate Data

```typescript
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL });

async function migrateDataToSchemas(): Promise<void> {
  const { rows: tenants } = await pool.query(
    `SELECT id, slug FROM public.tenants WHERE status = 'active'`
  );

  const tables = ['orders', 'customers'];

  for (const tenant of tenants) {
    const schema = `tenant_${tenant.slug}`;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const table of tables) {
        // Copy data from shared table to tenant schema, excluding tenant_id
        const { rows: columns } = await client.query(`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
            AND column_name != 'tenant_id'
          ORDER BY ordinal_position
        `, [table]);

        const colList = columns.map(c => c.column_name).join(', ');

        await client.query(`
          INSERT INTO ${schema}.${table} (${colList})
          SELECT ${colList} FROM public.${table}
          WHERE tenant_id = $1
        `, [tenant.id]);

        const { rows: [{ count }] } = await client.query(
          `SELECT count(*) FROM ${schema}.${table}`
        );
        console.log(`  ${schema}.${table}: ${count} rows migrated`);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`Failed to migrate ${schema}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }
}
```

#### Phase 3: Dual-Write Period

During migration, write to both the old shared table and the new tenant schema:

```typescript
class DualWriteOrderRepository {
  constructor(
    private sharedDb: Pool,
    private tenantDb: (schema: string) => Pool
  ) {}

  async createOrder(tenantSlug: string, tenantId: string, order: OrderInput): Promise<Order> {
    // Write to shared schema (old)
    const sharedResult = await this.sharedDb.query(
      `INSERT INTO public.orders (tenant_id, product, quantity, total_cents)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [tenantId, order.product, order.quantity, order.totalCents]
    );

    // Write to tenant schema (new)
    const schema = `tenant_${tenantSlug}`;
    await this.sharedDb.query(
      `INSERT INTO ${schema}.orders (id, product, quantity, total_cents, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [sharedResult.rows[0].id, order.product, order.quantity, order.totalCents, sharedResult.rows[0].created_at]
    );

    return sharedResult.rows[0];
  }
}
```

#### Phase 4: Switch Reads, Then Drop Shared Tables

```typescript
// Feature flag to switch reads
const USE_TENANT_SCHEMA = process.env.USE_TENANT_SCHEMA === 'true';

async function getOrders(tenantSlug: string, tenantId: string): Promise<Order[]> {
  if (USE_TENANT_SCHEMA) {
    const schema = `tenant_${tenantSlug}`;
    return pool.query(`SELECT * FROM ${schema}.orders ORDER BY created_at DESC`);
  } else {
    return pool.query(`SELECT * FROM public.orders WHERE tenant_id = $1 ORDER BY created_at DESC`, [tenantId]);
  }
}
```

### Schema-Per-Tenant to Separate Databases

```python
# Python script: export each schema to a separate database
import subprocess
import psycopg2

source_conn = psycopg2.connect(dsn="postgresql://admin@localhost/myapp")
cur = source_conn.cursor()
cur.execute("SELECT slug, schema_name FROM tenants WHERE status = 'active'")
tenants = cur.fetchall()

for slug, schema in tenants:
    target_db = f"tenant_{slug}"

    # Create the target database
    subprocess.run(["createdb", target_db], check=True)

    # Export the schema
    subprocess.run([
        "pg_dump", "-d", "myapp",
        "--schema", schema,
        "--no-owner",
        "-f", f"/tmp/{schema}.sql"
    ], check=True)

    # Rewrite schema references to public
    with open(f"/tmp/{schema}.sql", "r") as f:
        sql = f.read().replace(f"{schema}.", "public.").replace(f"CREATE SCHEMA {schema}", "")

    with open(f"/tmp/{schema}_fixed.sql", "w") as f:
        f.write(sql)

    # Import into the target database
    subprocess.run([
        "psql", "-d", target_db, "-f", f"/tmp/{schema}_fixed.sql"
    ], check=True)

    print(f"Migrated {schema} -> {target_db}")
```

---

## Zero-Downtime Tenant Provisioning

### Provisioning Pipeline

```typescript
import { Pool } from 'pg';
import { EventEmitter } from 'events';

interface TenantConfig {
  slug: string;
  plan: 'starter' | 'professional' | 'enterprise';
  region: string;
  adminEmail: string;
}

export class TenantProvisioningService extends EventEmitter {
  constructor(
    private adminPool: Pool,
    private migrationRunner: MigrationRunner,
    private notificationService: NotificationService,
  ) {
    super();
  }

  async provision(config: TenantConfig): Promise<ProvisionResult> {
    const provisionId = crypto.randomUUID();
    const schema = `tenant_${this.sanitizeSlug(config.slug)}`;

    this.emit('provision:start', { provisionId, slug: config.slug });

    const client = await this.adminPool.connect();
    try {
      // Step 1: Register tenant in control plane (public schema)
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO public.tenants (slug, schema_name, plan, region, status, provision_id)
        VALUES ($1, $2, $3, $4, 'provisioning', $5)
      `, [config.slug, schema, config.plan, config.region, provisionId]);
      await client.query('COMMIT');

      // Step 2: Create schema and run migrations (outside main transaction)
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
      await this.migrationRunner.runAll(schema);

      // Step 3: Seed default data
      await this.seedDefaults(client, schema, config);

      // Step 4: Mark active
      await client.query(
        `UPDATE public.tenants SET status = 'active', provisioned_at = now() WHERE slug = $1`,
        [config.slug]
      );

      // Step 5: Send welcome notification
      await this.notificationService.sendWelcome(config.adminEmail, config.slug);

      this.emit('provision:complete', { provisionId, slug: config.slug });

      return { provisionId, schema, status: 'active' };
    } catch (error) {
      // Cleanup on failure
      await client.query(
        `UPDATE public.tenants SET status = 'failed', error = $2 WHERE slug = $1`,
        [config.slug, (error as Error).message]
      );
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      this.emit('provision:failed', { provisionId, slug: config.slug, error });
      throw error;
    } finally {
      client.release();
    }
  }

  private async seedDefaults(client: any, schema: string, config: TenantConfig): Promise<void> {
    await client.query(`SET search_path TO ${schema}, public`);

    // Default settings based on plan
    const defaults: Record<string, any> = {
      plan: config.plan,
      maxUsers: config.plan === 'enterprise' ? -1 : config.plan === 'professional' ? 50 : 5,
      features: config.plan === 'starter' ? ['core'] : ['core', 'analytics', 'api'],
    };

    for (const [key, value] of Object.entries(defaults)) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)`,
        [key, JSON.stringify(value)]
      );
    }

    await client.query('RESET search_path');
  }

  private sanitizeSlug(slug: string): string {
    const sanitized = slug.toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (sanitized.length === 0 || sanitized.length > 50) {
      throw new Error('Invalid tenant slug');
    }
    return sanitized;
  }
}
```

### Spring Boot Tenant Provisioning

```java
@Service
public class TenantProvisioningService {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private FlywayMigrationService migrationService;

    @Transactional
    public TenantProvisionResult provision(TenantRequest request) {
        String schema = "tenant_" + sanitize(request.getSlug());

        // Register in control plane
        jdbcTemplate.update(
            "INSERT INTO tenants (slug, schema_name, plan, status) VALUES (?, ?, ?, 'provisioning')",
            request.getSlug(), schema, request.getPlan()
        );

        // Create schema (DDL cannot be transactional, handled separately)
        jdbcTemplate.execute("CREATE SCHEMA IF NOT EXISTS " + schema);

        // Run Flyway migrations for the new schema
        migrationService.migrateSchema(schema);

        // Activate
        jdbcTemplate.update(
            "UPDATE tenants SET status = 'active', provisioned_at = now() WHERE slug = ?",
            request.getSlug()
        );

        return new TenantProvisionResult(schema, "active");
    }

    private String sanitize(String slug) {
        return slug.replaceAll("[^a-z0-9]", "_").toLowerCase();
    }
}
```

---

## Data Migration Scripts

### Bulk Data Migration with Batching

```typescript
async function migrateTenantData(
  sourcePool: Pool,
  targetPool: Pool,
  tenantId: string,
  targetSchema: string
): Promise<MigrationReport> {
  const BATCH_SIZE = 5000;
  const report: MigrationReport = { tables: {}, totalRows: 0, durationMs: 0 };
  const start = Date.now();

  const tables = ['customers', 'orders', 'invoices', 'products'];

  for (const table of tables) {
    let offset = 0;
    let migratedRows = 0;

    while (true) {
      const { rows } = await sourcePool.query(
        `SELECT * FROM public.${table}
         WHERE tenant_id = $1
         ORDER BY id
         LIMIT $2 OFFSET $3`,
        [tenantId, BATCH_SIZE, offset]
      );

      if (rows.length === 0) break;

      // Build batch insert
      const columns = Object.keys(rows[0]).filter(c => c !== 'tenant_id');
      const values = rows.map(row => columns.map(c => row[c]));

      const placeholders = values.map((row, i) =>
        `(${row.map((_, j) => `$${i * row.length + j + 1}`).join(', ')})`
      ).join(', ');

      await targetPool.query(
        `INSERT INTO ${targetSchema}.${table} (${columns.join(', ')}) VALUES ${placeholders}
         ON CONFLICT (id) DO NOTHING`,
        values.flat()
      );

      migratedRows += rows.length;
      offset += BATCH_SIZE;

      if (rows.length < BATCH_SIZE) break;
    }

    report.tables[table] = migratedRows;
    report.totalRows += migratedRows;
  }

  report.durationMs = Date.now() - start;
  return report;
}
```

### Data Integrity Verification

```typescript
async function verifyMigration(
  sourcePool: Pool,
  targetPool: Pool,
  tenantId: string,
  targetSchema: string
): Promise<VerificationResult> {
  const tables = ['customers', 'orders', 'invoices', 'products'];
  const issues: string[] = [];

  for (const table of tables) {
    // Compare row counts
    const { rows: [source] } = await sourcePool.query(
      `SELECT count(*) as cnt FROM public.${table} WHERE tenant_id = $1`,
      [tenantId]
    );

    const { rows: [target] } = await targetPool.query(
      `SELECT count(*) as cnt FROM ${targetSchema}.${table}`
    );

    if (source.cnt !== target.cnt) {
      issues.push(`${table}: source=${source.cnt} target=${target.cnt} (diff=${source.cnt - target.cnt})`);
    }

    // Compare checksums on critical columns
    const { rows: [sourceHash] } = await sourcePool.query(
      `SELECT md5(string_agg(id::text || '|' || created_at::text, ',' ORDER BY id)) as hash
       FROM public.${table} WHERE tenant_id = $1`,
      [tenantId]
    );

    const { rows: [targetHash] } = await targetPool.query(
      `SELECT md5(string_agg(id::text || '|' || created_at::text, ',' ORDER BY id)) as hash
       FROM ${targetSchema}.${table}`
    );

    if (sourceHash.hash !== targetHash.hash) {
      issues.push(`${table}: checksum mismatch`);
    }
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}
```

---

## Tenant Onboarding/Offboarding Automation

### Onboarding Pipeline

```typescript
interface OnboardingStep {
  name: string;
  execute: (ctx: OnboardingContext) => Promise<void>;
  rollback?: (ctx: OnboardingContext) => Promise<void>;
}

const onboardingPipeline: OnboardingStep[] = [
  {
    name: 'validate-input',
    execute: async (ctx) => {
      if (await tenantExists(ctx.slug)) throw new Error('Tenant slug already taken');
      if (!isValidPlan(ctx.plan)) throw new Error('Invalid plan');
    },
  },
  {
    name: 'create-schema',
    execute: async (ctx) => {
      ctx.schema = `tenant_${ctx.slug}`;
      await ctx.db.query(`CREATE SCHEMA ${ctx.schema}`);
    },
    rollback: async (ctx) => {
      await ctx.db.query(`DROP SCHEMA IF EXISTS ${ctx.schema} CASCADE`);
    },
  },
  {
    name: 'run-migrations',
    execute: async (ctx) => {
      await migrationRunner.runAll(ctx.schema);
    },
  },
  {
    name: 'seed-data',
    execute: async (ctx) => {
      await seedDefaults(ctx.schema, ctx.plan);
    },
  },
  {
    name: 'create-admin-user',
    execute: async (ctx) => {
      ctx.adminUserId = await createUser(ctx.schema, {
        email: ctx.adminEmail,
        role: 'admin',
      });
    },
  },
  {
    name: 'configure-integrations',
    execute: async (ctx) => {
      await setupWebhookEndpoints(ctx.slug);
      await configureEmailDomain(ctx.slug);
    },
    rollback: async (ctx) => {
      await removeWebhookEndpoints(ctx.slug);
    },
  },
  {
    name: 'activate-tenant',
    execute: async (ctx) => {
      await ctx.db.query(
        `UPDATE tenants SET status = 'active', provisioned_at = now() WHERE slug = $1`,
        [ctx.slug]
      );
    },
  },
];

async function runOnboarding(config: TenantConfig): Promise<void> {
  const ctx: OnboardingContext = { ...config, db: pool };
  const completed: OnboardingStep[] = [];

  for (const step of onboardingPipeline) {
    try {
      await step.execute(ctx);
      completed.push(step);
      console.log(`Completed: ${step.name}`);
    } catch (error) {
      console.error(`Failed at: ${step.name}`, error);

      // Rollback in reverse order
      for (const completedStep of completed.reverse()) {
        if (completedStep.rollback) {
          try {
            await completedStep.rollback(ctx);
            console.log(`Rolled back: ${completedStep.name}`);
          } catch (rollbackError) {
            console.error(`Rollback failed: ${completedStep.name}`, rollbackError);
          }
        }
      }

      throw error;
    }
  }
}
```

### Offboarding with Data Retention

```typescript
interface OffboardingConfig {
  slug: string;
  retentionDays: number;        // Grace period before permanent deletion
  exportData: boolean;           // Whether to export data before deletion
  notifyAdmin: boolean;
}

async function offboardTenant(config: OffboardingConfig): Promise<void> {
  const schema = `tenant_${config.slug}`;

  // Step 1: Mark tenant as deactivating (stops new requests)
  await pool.query(
    `UPDATE tenants SET status = 'deactivating', deactivated_at = now() WHERE slug = $1`,
    [config.slug]
  );

  // Step 2: Export data if requested
  if (config.exportData) {
    const exportPath = await exportTenantData(schema, config.slug);
    console.log(`Data exported to: ${exportPath}`);

    // Upload to cold storage
    await uploadToS3(`tenant-exports/${config.slug}`, exportPath);
  }

  // Step 3: Schedule permanent deletion after retention period
  await pool.query(
    `INSERT INTO deletion_schedule (tenant_slug, schema_name, scheduled_for, created_at)
     VALUES ($1, $2, now() + interval '${config.retentionDays} days', now())`,
    [config.slug, schema]
  );

  // Step 4: Revoke access immediately
  await pool.query(`REVOKE ALL ON SCHEMA ${schema} FROM app_user`);

  // Step 5: Update status
  await pool.query(
    `UPDATE tenants SET status = 'deactivated' WHERE slug = $1`,
    [config.slug]
  );

  if (config.notifyAdmin) {
    await sendOffboardingNotification(config.slug);
  }
}

// Scheduled job: permanently delete expired tenants
async function purgeExpiredTenants(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT tenant_slug, schema_name FROM deletion_schedule
     WHERE scheduled_for <= now() AND purged_at IS NULL`
  );

  for (const row of rows) {
    await pool.query(`DROP SCHEMA IF EXISTS ${row.schema_name} CASCADE`);
    await pool.query(
      `UPDATE deletion_schedule SET purged_at = now() WHERE tenant_slug = $1`,
      [row.tenant_slug]
    );
    await pool.query(
      `UPDATE tenants SET status = 'purged' WHERE slug = $1`,
      [row.tenant_slug]
    );
    console.log(`Purged: ${row.tenant_slug}`);
  }
}
```

---

## Backup Strategies Per Tenant

### Schema-Level Backups (PostgreSQL)

```bash
#!/bin/bash
# backup-tenant.sh — Backup a single tenant schema
TENANT_SLUG=$1
SCHEMA="tenant_${TENANT_SLUG}"
BACKUP_DIR="/backups/tenants/${TENANT_SLUG}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "${BACKUP_DIR}"

# Dump the schema with data
pg_dump -d myapp \
  --schema="${SCHEMA}" \
  --no-owner \
  --no-privileges \
  --format=custom \
  --file="${BACKUP_DIR}/${SCHEMA}_${TIMESTAMP}.dump"

# Compress and upload to S3
aws s3 cp "${BACKUP_DIR}/${SCHEMA}_${TIMESTAMP}.dump" \
  "s3://backups/tenants/${TENANT_SLUG}/${TIMESTAMP}.dump" \
  --storage-class STANDARD_IA

# Retain last 30 local backups
ls -t "${BACKUP_DIR}"/*.dump | tail -n +31 | xargs -r rm

echo "Backup complete: ${SCHEMA}_${TIMESTAMP}.dump"
```

### Tenant Restore

```bash
#!/bin/bash
# restore-tenant.sh — Restore a tenant schema from backup
TENANT_SLUG=$1
BACKUP_FILE=$2
SCHEMA="tenant_${TENANT_SLUG}"

# Drop existing schema
psql -d myapp -c "DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;"

# Restore from dump
pg_restore -d myapp \
  --schema="${SCHEMA}" \
  --no-owner \
  --no-privileges \
  "${BACKUP_FILE}"

# Re-grant permissions
psql -d myapp -c "GRANT USAGE ON SCHEMA ${SCHEMA} TO app_user;"
psql -d myapp -c "GRANT ALL ON ALL TABLES IN SCHEMA ${SCHEMA} TO app_user;"
psql -d myapp -c "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${SCHEMA} TO app_user;"

echo "Restore complete: ${SCHEMA}"
```

### Automated Backup Scheduling

```typescript
import cron from 'node-cron';

// Daily backups for all active tenants
cron.schedule('0 2 * * *', async () => {
  const { rows: tenants } = await pool.query(
    `SELECT slug, plan FROM tenants WHERE status = 'active'`
  );

  for (const tenant of tenants) {
    try {
      await execAsync(
        `bash /scripts/backup-tenant.sh ${tenant.slug}`
      );

      // Enterprise tenants get point-in-time recovery
      if (tenant.plan === 'enterprise') {
        await enableWALArchiving(tenant.slug);
      }
    } catch (error) {
      console.error(`Backup failed for ${tenant.slug}:`, error);
      await alertOps(`Tenant backup failed: ${tenant.slug}`);
    }
  }
});
```

---

## Anti-Patterns

1. **Big-bang migration without dual-write.** Switching the tenancy model in a single deployment causes downtime and data loss risk. Always use a gradual migration with dual-write and feature flags.
2. **No rollback plan for provisioning.** If any step fails, partially created resources leak. Implement explicit rollback for each step.
3. **Tenant deletion without retention period.** Accidental deletions cannot be recovered. Always enforce a grace period.
4. **Synchronous provisioning in the request path.** Schema creation and migration should run asynchronously; return a provisioning status endpoint.
5. **Skipping data verification after migration.** Always run row count and checksum comparisons before switching traffic.
6. **Backing up only the shared database.** Per-tenant backup granularity is essential for tenant-specific restore operations.

---

## Production Checklist

- [ ] Migration path has been tested on a staging environment with production-like data volumes
- [ ] Dual-write period is implemented and verified before switching reads
- [ ] Feature flags control the read path (old model vs. new model) with instant rollback
- [ ] Data integrity verification runs after every migration batch
- [ ] Provisioning pipeline has explicit rollback for each step
- [ ] Provisioning is asynchronous with status polling or webhook notification
- [ ] Offboarding enforces a configurable retention period before permanent deletion
- [ ] Tenant data exports are stored in durable, encrypted storage
- [ ] Per-tenant backups run on a schedule and are tested with restore drills
- [ ] Monitoring tracks provisioning success rate, duration, and failure reasons
- [ ] Runbook exists for manual tenant recovery from backup
- [ ] Load testing validates that N concurrent provisioning operations do not degrade existing tenants
