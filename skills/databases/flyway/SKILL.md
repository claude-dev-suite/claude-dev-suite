---
name: flyway
description: |
  Flyway database migrations for Spring Boot applications. Covers migration
  scripts, versioning, callbacks, and rollback strategies. Based on production
  patterns from castellino and gestionale-presenze projects.

  USE WHEN: user mentions "flyway", "database versioning", "Java migrations",
  "Spring Boot migrations", "V1__", "migration checksum"

  DO NOT USE FOR: general migration strategies - use `migrations` instead,
  Liquibase - use specific tool skill, Prisma/TypeORM - use respective skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Flyway Database Migrations

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `flyway` for comprehensive documentation.

## Maven Configuration

```xml
<dependency>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-core</artifactId>
</dependency>

<dependency>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-database-postgresql</artifactId>
</dependency>

<plugin>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-maven-plugin</artifactId>
    <version>${flyway.version}</version>
    <configuration>
        <url>jdbc:postgresql://localhost:5432/mydb</url>
        <user>myuser</user>
        <password>mypass</password>
    </configuration>
</plugin>
```

## Application Configuration

```yaml
spring:
  flyway:
    enabled: true
    baseline-on-migrate: true
    locations: classpath:db/migration
    validate-on-migrate: true
    out-of-order: false
    clean-disabled: true  # Prevent clean in production!
```

## Migration Naming Convention

```
V{version}__{description}.sql   # Versioned migrations
U{version}__{description}.sql   # Undo migrations (Teams/Enterprise)
R__{description}.sql            # Repeatable migrations
```

Examples:
- `V1__create_users_table.sql`
- `V1.1__add_email_index.sql`
- `V2__create_departments_table.sql`
- `R__create_views.sql`

## Initial Schema Migration

```sql
-- V1__init_schema.sql

-- Users table
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'USER',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP,
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_role ON users(role);

-- Roles table
CREATE TABLE roles (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(255)
);

-- Insert default roles
INSERT INTO roles (name, description) VALUES
    ('ADMIN', 'System administrator'),
    ('MANAGER', 'Department manager'),
    ('USER', 'Regular user');
```

## Add Column Migration

```sql
-- V2__add_phone_to_users.sql

ALTER TABLE users
ADD COLUMN phone VARCHAR(20);

CREATE INDEX idx_users_phone ON users(phone);
```

## Add Foreign Key Migration

```sql
-- V3__create_departments.sql

CREATE TABLE departments (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(10) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users
ADD COLUMN department_id BIGINT;

ALTER TABLE users
ADD CONSTRAINT fk_users_department
FOREIGN KEY (department_id) REFERENCES departments(id);

CREATE INDEX idx_users_department ON users(department_id);
```

## Data Migration

```sql
-- V4__migrate_legacy_data.sql

-- Update existing data
UPDATE users
SET role = 'USER'
WHERE role IS NULL;

-- Migrate data from legacy format
INSERT INTO departments (name, code)
SELECT DISTINCT department_name, UPPER(SUBSTRING(department_name, 1, 3))
FROM legacy_employees
WHERE department_name IS NOT NULL;
```

## Repeatable Migration (Views)

```sql
-- R__create_user_summary_view.sql

DROP VIEW IF EXISTS user_summary;

CREATE VIEW user_summary AS
SELECT
    u.id,
    u.name,
    u.email,
    u.role,
    u.status,
    d.name AS department_name,
    u.created_at
FROM users u
LEFT JOIN departments d ON u.department_id = d.id;
```

## Java-based Migration

```java
@Component
public class V5__ComplexDataMigration implements JavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        try (Statement stmt = context.getConnection().createStatement()) {
            // Complex migration logic
            ResultSet rs = stmt.executeQuery("SELECT id, data FROM legacy_table");
            while (rs.next()) {
                // Process and migrate data
            }
        }
    }

    @Override
    public Integer getChecksum() { return null; }

    @Override
    public MigrationVersion getVersion() {
        return MigrationVersion.fromVersion("5");
    }

    @Override
    public String getDescription() {
        return "Complex data migration";
    }
}
```

## Callback for Logging

```java
@Component
public class FlywayCallback implements Callback {

    private static final Logger log = LoggerFactory.getLogger(FlywayCallback.class);

    @Override
    public boolean supports(Event event, Context context) {
        return event == Event.AFTER_EACH_MIGRATE ||
               event == Event.AFTER_MIGRATE_ERROR;
    }

    @Override
    public boolean canHandleInTransaction(Event event, Context context) {
        return true;
    }

    @Override
    public void handle(Event event, Context context) {
        if (event == Event.AFTER_EACH_MIGRATE) {
            MigrationInfo info = context.getMigrationInfo();
            log.info("Migrated: {} - {} ({}ms)",
                info.getVersion(),
                info.getDescription(),
                info.getExecutionTime());
        } else if (event == Event.AFTER_MIGRATE_ERROR) {
            log.error("Migration failed!");
        }
    }

    @Override
    public String getCallbackName() {
        return "LoggingCallback";
    }
}
```

## Maven Commands

```bash
# Run migrations
mvn flyway:migrate

# Show migration info
mvn flyway:info

# Validate migrations
mvn flyway:validate

# Repair checksum mismatches
mvn flyway:repair

# Clean database (careful!)
mvn flyway:clean

# Baseline existing database
mvn flyway:baseline
```

## Best Practices

| Practice | Description |
|----------|-------------|
| Never edit applied migrations | Create new migration instead |
| Test migrations | Use H2 in tests |
| Backup before migrate | Especially in production |
| Use transactions | Wrap DDL in transactions |
| Version control | Keep migrations in Git |
| Naming convention | Descriptive names |

## When NOT to Use This Skill

- **General migration strategies** - Use `migrations` skill for concepts
- **Liquibase** - Use Liquibase-specific documentation
- **Prisma migrations** - Use `prisma` skill
- **TypeORM migrations** - Use `typeorm` skill

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Modifying applied migrations | Checksum validation fails | Create new migration instead |
| No baseline on existing DB | Fails on migrate | Use baseline-on-migrate: true |
| Complex logic in SQL migrations | Hard to test, debug | Use Java-based migrations |
| Ignoring validation | Inconsistencies between envs | Always validate before deploy |
| clean-disabled: false in prod | Risk of data loss | Always disable clean in production |
| Out-of-order migrations | Version conflicts | Use sequential versioning |

## Quick Troubleshooting

| Problem | Diagnostic | Fix |
|---------|------------|-----|
| Checksum mismatch | Compare file with flyway_schema_history | `flyway repair` or create new |
| Out of order error | Check version numbers | Fix versioning or set out-of-order: true |
| Failed migration | Check flyway_schema_history.success | Repair, fix issue, retry |
| Missing migration | Check locations config | Verify classpath:db/migration path |
| Baseline conflict | Check baseline-version | Set correct baseline version |

## Reference Documentation
- [Flyway Documentation](https://documentation.red-gate.com/fd)
- [Migrations](https://documentation.red-gate.com/fd/migrations-184127470.html)
- [Callbacks](https://documentation.red-gate.com/fd/callbacks-184127474.html)
- [Spring Boot Integration](https://documentation.red-gate.com/fd/spring-boot-184127505.html)
