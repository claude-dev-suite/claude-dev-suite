---
name: python-integration
description: |
  Python integration testing orchestration skill. Covers test pyramid strategy,
  conftest.py architecture, pytest markers for integration tests, GitHub Actions
  CI/CD integration, parallel execution with pytest-xdist, and test isolation patterns.

  USE WHEN: user mentions "python integration test", "integration test strategy",
  "conftest architecture", "CI integration tests", asks about test pyramid,
  or needs to set up integration testing infrastructure in Python.

  DO NOT USE FOR: Unit tests - use `pytest`; Django-specific - use `pytest-django`;
  FastAPI-specific - use `fastapi-testing`; Container setup - use `testcontainers-python`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Python Integration Testing — Core Patterns

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `python-integration-testing`
> for comprehensive documentation on patterns, SQLAlchemy fixtures, Alembic, and CI/CD.

## Test Pyramid (70/20/10 Rule)

```
         ╔══════════╗
         ║   E2E    ║  10% — Playwright, Selenium, full stack
         ╠══════════╣
         ║Integration║  20% — Real DB, real services, API flows
         ╠══════════╣
         ║   Unit   ║  70% — Fast, isolated, no I/O
         ╚══════════╝
```

**Integration tests touch at least 2 real components:**
- Application code + real database
- API endpoint + real dependency
- Message producer + real broker

## conftest.py Architecture

```
tests/
├── conftest.py              # Session: containers, engines
├── unit/
│   ├── conftest.py          # Unit-only fixtures
│   └── test_services.py
├── integration/
│   ├── conftest.py          # DB sessions, HTTP clients
│   ├── test_api.py
│   └── test_repositories.py
└── e2e/
    ├── conftest.py
    └── test_flows.py
```

```python
# tests/conftest.py — session-level infrastructure
import pytest
from testcontainers.postgres import PostgresContainer
from testcontainers.redis import RedisContainer

@pytest.fixture(scope="session")
def postgres_container():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg

@pytest.fixture(scope="session")
def redis_container():
    with RedisContainer("redis:7-alpine") as redis:
        yield redis
```

```python
# tests/integration/conftest.py — per-test isolation
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

@pytest.fixture(scope="module")
def engine(postgres_container):
    url = postgres_container.get_connection_url()
    eng = create_engine(url)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)

@pytest.fixture
def db_session(engine):
    """Savepoint rollback — fast and safe."""
    conn = engine.connect()
    trans = conn.begin()
    session = sessionmaker(bind=conn)()
    nested = conn.begin_nested()
    yield session
    session.close()
    nested.rollback()
    trans.rollback()
    conn.close()
```

## pytest Markers

```python
# pyproject.toml
[tool.pytest.ini_options]
markers = [
    "integration: integration tests (require Docker)",
    "slow: slow tests (> 5 seconds)",
    "e2e: end-to-end tests",
]
```

```python
# Mark tests
@pytest.mark.integration
def test_user_persisted(db_session):
    ...

# Skip if no Docker
import shutil
requires_docker = pytest.mark.skipif(
    not shutil.which("docker"),
    reason="Docker not available"
)

@pytest.mark.integration
@requires_docker
def test_with_container():
    ...
```

```bash
# Run only integration tests
pytest -m integration

# Exclude slow tests
pytest -m "integration and not slow"

# Run everything except e2e
pytest -m "not e2e"
```

## GitHub Actions — Testcontainers vs Service Containers

**Testcontainers (recommended):** containers managed by the test code itself.
```yaml
# .github/workflows/integration-tests.yml
name: Integration Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -e ".[test]"
      - run: pytest -m integration -v
        env:
          DOCKER_HOST: unix:///var/run/docker.sock
```

**Service containers (simpler for single-service tests):**
```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: testdb
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports: ["5432:5432"]
    steps:
      - run: pytest -m integration
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/testdb
```

| | Testcontainers | Service Containers |
|---|---|---|
| Control | Full (image, config, wait) | Limited |
| Multiple services | Easy | Possible but verbose |
| Reuse across jobs | No | No |
| Local dev parity | Yes | No |

## Parallel Execution — pytest-xdist

```bash
pip install pytest-xdist

pytest -n 4        # 4 workers
pytest -n auto     # one per CPU core
```

**Database isolation strategies with xdist:**

```python
# 1. Database per worker (most isolated)
@pytest.fixture(scope="session")
def db_url(worker_id, tmp_path_factory):
    if worker_id == "master":
        return create_db("test_db")
    return create_db(f"test_db_{worker_id}")

# 2. PostgreSQL schema per worker
@pytest.fixture(scope="session")
def db_session(worker_id, engine):
    schema = f"test_{worker_id}"
    with engine.connect() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))
    yield ...

# 3. Transaction rollback (works without worker isolation)
@pytest.fixture
def db_session(engine):
    conn = engine.connect()
    conn.begin()
    conn.begin_nested()  # SAVEPOINT
    yield sessionmaker(bind=conn)()
    conn.rollback()
    conn.close()
```

## Test Isolation Comparison

| Pattern | Mechanism | Speed | Transactional |
|---------|-----------|-------|---------------|
| Savepoint rollback | BEGIN + SAVEPOINT + ROLLBACK | ★★★★★ | No |
| Truncate tables | DELETE FROM / TRUNCATE | ★★★★☆ | Yes |
| Drop/recreate DB | DROP + CREATE DATABASE | ★★☆☆☆ | Yes |
| Container per test | New container | ★☆☆☆☆ | Yes |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|---|---|---|
| Integration tests in unit test suite | False CI confidence | Separate by marker/directory |
| Creating container per test | 10–30s overhead per test | Session-scoped containers |
| Hardcoded connection strings | CI failures | Use container.get_connection_url() |
| No test isolation | Tests interfere | Savepoint rollback or truncate |
| Missing `--reuse-db` in dev | Slow iteration | Add `--reuse-db` to dev addopts |

## Reference Documentation
- [Integration Patterns](quick-ref/integration-patterns.md)
- [SQLAlchemy Fixtures](quick-ref/sqlalchemy-fixtures.md)
- [Alembic Testing](quick-ref/alembic-testing.md)

**Official docs:**
- pytest: https://docs.pytest.org/
- pytest-xdist: https://pytest-xdist.readthedocs.io/
