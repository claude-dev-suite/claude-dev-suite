# Python Integration Testing Patterns

## The Test Pyramid for Python Projects

```
          /\
         /E2E\          Few, slow, full-stack (Playwright, Selenium)
        /------\
       /  Integ  \      Some, medium speed (pytest + real services)
      /------------\
     /    Unit      \   Many, fast (pytest + mocks/fakes)
    /-----------------\
```

**Rule of thumb:** 70% unit / 20% integration / 10% E2E.
Integration tests hit real databases, message queues, caches, or external services — no mocks.

---

## conftest.py Architecture for Large Projects

```
tests/
├── conftest.py             # Session-wide: engine, containers, env setup
├── unit/
│   ├── conftest.py         # Unit-specific fixtures (all mocked)
│   └── test_*.py
├── integration/
│   ├── conftest.py         # Integration fixtures (real DB, real Redis)
│   ├── test_repositories.py
│   ├── test_services.py
│   └── test_api.py
└── e2e/
    ├── conftest.py         # Full-app fixtures (TestClient, browser)
    └── test_flows.py
```

```python
# tests/conftest.py  — top-level, session-scoped infrastructure
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from testcontainers.postgres import PostgresContainer

# ---- containers (session scope = start once, share across all workers) ----
@pytest.fixture(scope="session")
def pg_container():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg

@pytest.fixture(scope="session")
def engine(pg_container):
    eng = create_engine(pg_container.get_connection_url())
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()

# tests/integration/conftest.py  — integration-specific
@pytest.fixture
def db_session(engine):
    """Isolated session per test via savepoint rollback."""
    connection = engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection, join_transaction_mode="create_savepoint")
    session = Session()
    yield session
    session.close()
    transaction.rollback()
    connection.close()
```

---

## pytest Markers for Integration Tests

```python
# pyproject.toml
[tool.pytest.ini_options]
markers = [
    "integration: marks tests as integration tests (requires live services)",
    "unit: fast unit tests with no external dependencies",
    "e2e: end-to-end tests, slowest tier",
    "slow: any test taking > 5 seconds",
    "kafka: requires a running Kafka broker",
    "redis: requires a running Redis instance",
]
```

```python
# Usage on individual tests
import pytest

@pytest.mark.integration
def test_user_repository_saves_to_db(db_session):
    ...

@pytest.mark.integration
@pytest.mark.kafka
def test_order_event_published(kafka_producer, db_session):
    ...
```

```bash
# Run only integration tests
pytest -m integration

# Skip integration tests (fast CI run)
pytest -m "not integration"

# Run integration + unit, skip e2e
pytest -m "not e2e"
```

---

## Environment-Based Test Selection

```python
# conftest.py
import os
import pytest

def pytest_collection_modifyitems(config, items):
    """Auto-skip integration tests when RUN_INTEGRATION=0."""
    if os.getenv("RUN_INTEGRATION", "1") == "0":
        skip = pytest.mark.skip(reason="RUN_INTEGRATION=0")
        for item in items:
            if "integration" in item.keywords:
                item.add_marker(skip)
```

```bash
# Local: run everything
pytest

# CI fast lane: unit only
RUN_INTEGRATION=0 pytest

# CI slow lane: integration only
pytest -m integration --timeout=120
```

---

## CI/CD: GitHub Actions with Docker Services vs Testcontainers

### Option A — GitHub Actions Service Containers (simpler, no Docker-in-Docker needed)

```yaml
# .github/workflows/integration-tests.yml
name: integration-tests

on: [push, pull_request]

jobs:
  integration:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U test"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

    env:
      DATABASE_URL: postgresql://test:test@localhost:5432/testdb
      REDIS_URL: redis://localhost:6379/0

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: "pip"
      - run: pip install -r requirements-test.txt
      - run: pytest -m integration --tb=short -q
```

### Option B — Testcontainers (portable, no service config per CI provider)

```yaml
# .github/workflows/integration-tests.yml
name: integration-tests

on: [push, pull_request]

jobs:
  integration:
    runs-on: ubuntu-latest   # Docker engine pre-installed

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: "pip"
      - run: pip install -r requirements-test.txt
      - run: pytest -m integration --tb=short -q
      # Testcontainers starts/stops containers automatically inside tests
```

**Trade-offs:**

| Approach | Startup | Portability | Complexity |
|----------|---------|-------------|------------|
| Service containers | Fast (pre-started) | GitHub Actions only | Low |
| Testcontainers | Slower (starts per session) | Any CI/local | Medium |
| docker-compose + pytest-docker | Medium | Any CI | Medium |

---

## Parallel Integration Testing with pytest-xdist

```bash
pip install pytest-xdist
pytest -n auto -m integration          # auto-detect CPU count
pytest -n 4 -m integration            # 4 workers
```

### Database-Per-Worker Pattern (SQLite/PostgreSQL)

```python
# conftest.py
import pytest
from sqlalchemy import create_engine

@pytest.fixture(scope="session")
def worker_db_url(worker_id, tmp_path_factory):
    """Give each xdist worker its own database."""
    if worker_id == "master":
        # Not running in parallel
        return "postgresql://test:test@localhost/testdb"

    # worker_id is "gw0", "gw1", ...
    db_name = f"testdb_{worker_id}"
    admin_engine = create_engine(
        "postgresql://test:test@localhost/postgres",
        isolation_level="AUTOCOMMIT"
    )
    with admin_engine.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{db_name}"'))
    yield f"postgresql://test:test@localhost/{db_name}"
    with admin_engine.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{db_name}"'))

@pytest.fixture(scope="session")
def engine(worker_db_url):
    eng = create_engine(worker_db_url)
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()
```

### Schema-Per-Worker Pattern (single PostgreSQL instance)

```python
# conftest.py
@pytest.fixture(scope="session", autouse=True)
def worker_schema(worker_id, engine):
    """Isolate workers using PostgreSQL schemas."""
    schema = "public" if worker_id == "master" else f"worker_{worker_id}"
    with engine.connect() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))
        conn.execute(text(f"SET search_path TO {schema}"))
    Base.metadata.create_all(engine)
    yield
    with engine.connect() as conn:
        conn.execute(text(f"DROP SCHEMA IF EXISTS {schema} CASCADE"))
```

### Redis-Per-Worker Pattern

```python
@pytest.fixture(scope="session", autouse=True)
def configure_redis_db(worker_id):
    """Map each worker to a distinct Redis DB index (0-15)."""
    db_index = 0 if worker_id == "master" else int(worker_id.replace("gw", "")) + 1
    os.environ["REDIS_DB"] = str(db_index)
```

---

## Test Isolation Strategies

### Strategy 1: Transaction Rollback (fastest)

Every test runs inside a savepoint; teardown rolls it back. No DDL cost.

```python
@pytest.fixture
def db_session(engine):
    conn = engine.connect()
    trans = conn.begin()
    session = Session(bind=conn, join_transaction_mode="create_savepoint")
    yield session
    session.close()
    trans.rollback()
    conn.close()
```

### Strategy 2: Truncate Tables (reliable, slightly slower)

```python
@pytest.fixture(autouse=True)
def clean_tables(engine):
    yield
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
```

### Strategy 3: Migrate Up/Down Per Test (strongest isolation)

Runs full Alembic migration before each test and downgrades after. Slow but guarantees schema integrity.

```python
@pytest.fixture
def migrate_db(db_url):
    from alembic import command
    from alembic.config import Config
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", db_url)
    command.upgrade(cfg, "head")
    yield
    command.downgrade(cfg, "base")
```
