# Alembic Migration Testing with pytest

## Strategy Overview

| Strategy | Speed | Isolation | Use When |
|----------|-------|-----------|----------|
| `pytest-alembic` default tests | Fast | Shared DB | Validate migration history consistency |
| `alembic_runner` custom tests | Medium | Shared DB | Test data migrations |
| Migrate up/down per test | Slow | Strong | Verify schema matches models exactly |
| Testcontainers + migrate once | Medium | Strong | CI integration suite |

---

## pytest-alembic: Built-In Migration Tests

```bash
pip install pytest-alembic pytest-mock-resources
```

### alembic/env.py adjustment

```python
# alembic/env.py — allow pytest-alembic to inject the connection
connectable = context.config.attributes.get("connection", None)

if connectable is None:
    connectable = engine_from_config(
        context.config.get_section(context.config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

if isinstance(connectable, Connection):
    with connectable as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()
else:
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()
```

### conftest.py fixtures

```python
# tests/conftest.py
import pytest
from pytest_alembic.config import Config
from sqlalchemy import create_engine

@pytest.fixture
def alembic_config():
    return Config()

# Option A: plain engine pointing at test DB
@pytest.fixture
def alembic_engine():
    engine = create_engine("postgresql://test:test@localhost/testdb_alembic")
    yield engine
    engine.dispose()

# Option B: Testcontainers (recommended for CI)
from testcontainers.postgres import PostgresContainer

@pytest.fixture(scope="session")
def pg():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg

@pytest.fixture
def alembic_engine(pg):
    return create_engine(pg.get_connection_url())
```

### Built-in test suite

```python
# tests/test_migrations.py
# No test functions needed — pytest-alembic injects these automatically:
# - test_single_head_revision
# - test_upgrade
# - test_model_definitions_match_ddl
# - test_up_down_consistency

# Run:
#   pytest tests/test_migrations.py --test-alembic
```

Or opt-in via `pyproject.toml`:
```toml
[tool.pytest-alembic]
tests = [
    "test_single_head_revision",
    "test_upgrade",
    "test_model_definitions_match_ddl",
    "test_up_down_consistency",
]
```

---

## Custom Data Migration Tests with alembic_runner

```python
# tests/test_data_migrations.py
import pytest

def test_backfill_user_slugs(alembic_runner):
    """Verify the 0042_backfill_user_slugs migration sets slugs correctly."""
    # Migrate to the revision just before our target
    alembic_runner.migrate_up_before("0042_backfill_user_slugs")

    # Insert data that the migration should transform
    alembic_runner.engine.execute(
        "INSERT INTO users (id, name, slug) VALUES (1, 'Alice Smith', NULL)"
    )

    # Run our migration
    alembic_runner.migrate_up_one()

    # Verify the result
    row = alembic_runner.engine.execute(
        "SELECT slug FROM users WHERE id = 1"
    ).fetchone()
    assert row["slug"] == "alice-smith"

def test_migration_is_reversible(alembic_runner):
    """Verify down() works without error."""
    alembic_runner.migrate_up_to("0042_backfill_user_slugs")
    alembic_runner.migrate_down_one()
    # Should not raise
```

---

## Manual Pattern: Migrate Per Test Function (Full Isolation)

Best for testing complex migrations where you need complete isolation. Slower due to DDL round-trips.

```python
# tests/conftest.py
import os
import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

TEST_DB_NAME = "myapp_test"

@pytest.fixture(scope="session")
def test_db_url():
    base = os.environ["DATABASE_URL"]  # e.g., postgresql+asyncpg://user:pass@host/myapp
    return base.rsplit("/", 1)[0] + f"/{TEST_DB_NAME}"

@pytest_asyncio.fixture(scope="session")
async def create_test_database(test_db_url):
    admin_url = test_db_url.rsplit("/", 1)[0] + "/postgres"
    engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
    async with engine.connect() as conn:
        await conn.execute(text(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}"'))
        await conn.execute(text(f'CREATE DATABASE "{TEST_DB_NAME}"'))
    await engine.dispose()
    yield
    engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
    async with engine.connect() as conn:
        await conn.execute(text(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}"'))
    await engine.dispose()

@pytest.fixture
def run_migrations(create_test_database, test_db_url):
    """Upgrade to head before test, downgrade to base after."""
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", test_db_url)
    command.upgrade(cfg, "head")
    yield
    command.downgrade(cfg, "base")
```

```python
# tests/test_orders.py
@pytest.mark.asyncio
async def test_order_insert_respects_schema(run_migrations, db):
    """Schema is always fresh — built from migrations, not create_all."""
    async with db.session() as session:
        order = Order(user_id=1, total=99.00)
        session.add(order)
        await session.commit()
        await session.refresh(order)
    assert order.id is not None
```

---

## Testing that Models Match Migrations

```python
# tests/test_schema_sync.py
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import create_engine
from myapp.database import Base

def test_no_pending_migrations():
    """Fail if there are model changes not yet in a migration."""
    engine = create_engine("postgresql://test:test@localhost/testdb")
    with engine.connect() as conn:
        ctx = MigrationContext.configure(conn)
        diff = compare_metadata(ctx, Base.metadata)
    assert diff == [], f"Pending schema changes: {diff}"
```

---

## Alembic + Testcontainers: Recommended CI Setup

```python
# tests/conftest.py
import pytest
from testcontainers.postgres import PostgresContainer
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine

@pytest.fixture(scope="session")
def pg():
    with PostgresContainer("postgres:16-alpine") as container:
        yield container

@pytest.fixture(scope="session")
def migrated_engine(pg):
    """Run all migrations once against the container."""
    url = pg.get_connection_url()
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")
    engine = create_engine(url)
    yield engine
    engine.dispose()

@pytest.fixture
def db_session(migrated_engine):
    """Fast per-test isolation — savepoint rollback, no re-migration."""
    conn = migrated_engine.connect()
    trans = conn.begin()
    from sqlalchemy.orm import Session
    session = Session(bind=conn, join_transaction_mode="create_savepoint")
    yield session
    session.close()
    trans.rollback()
    conn.close()
```
