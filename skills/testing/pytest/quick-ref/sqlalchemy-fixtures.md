# SQLAlchemy 2.0 Testing Patterns

## The Three-Level Fixture Stack

```
┌─────────────────────────────────────────────────────┐
│  engine  (session scope)  — created once, shared     │
│    └── connection + outer transaction (per test)     │
│          └── Session with create_savepoint (per test)│
└─────────────────────────────────────────────────────┘
```

---

## Core Sync Pattern: Savepoint Isolation (SQLAlchemy 2.0)

The `join_transaction_mode="create_savepoint"` parameter (new in 2.0) tells the Session to use SAVEPOINTs instead of real transactions. The outer transaction is never committed, so all data is discarded when `trans.rollback()` is called in teardown.

```python
# tests/conftest.py
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session

from myapp.database import Base  # your declarative base
from myapp.config import DATABASE_URL

# --- Session-scoped engine: tables created once ---
@pytest.fixture(scope="session")
def engine():
    eng = create_engine(DATABASE_URL, echo=False)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()

# --- Function-scoped isolated session via savepoint ---
@pytest.fixture
def db_session(engine):
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(
        bind=connection,
        join_transaction_mode="create_savepoint",
    )
    yield session
    session.close()
    transaction.rollback()     # undoes everything the test did
    connection.close()

# --- FastAPI / Flask dependency override ---
@pytest.fixture
def client(db_session):
    from myapp.main import app, get_db
    app.dependency_overrides[get_db] = lambda: db_session
    from fastapi.testclient import TestClient
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

```python
# tests/test_user_repo.py
def test_create_user(db_session):
    user = User(name="Alice", email="alice@example.com")
    db_session.add(user)
    db_session.commit()          # issues SAVEPOINT, not real COMMIT
    assert user.id is not None

def test_no_leftover_users(db_session):
    # Previous test's data is gone — rolled back
    count = db_session.execute(text("SELECT count(*) FROM users")).scalar()
    assert count == 0
```

---

## Engine Fixture Patterns

### In-Memory SQLite (fast, no Docker)

```python
@pytest.fixture(scope="session")
def engine():
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()
```

### PostgreSQL via Testcontainers (realistic)

```python
from testcontainers.postgres import PostgresContainer

@pytest.fixture(scope="session")
def pg_container():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg

@pytest.fixture(scope="session")
def engine(pg_container):
    eng = create_engine(pg_container.get_connection_url())
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()
```

### PostgreSQL via environment variable

```python
import os

@pytest.fixture(scope="session")
def engine():
    url = os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg2://test:test@localhost/testdb")
    eng = create_engine(url, pool_pre_ping=True)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()
```

---

## Async SQLAlchemy 2.0 Testing

### Setup

```bash
pip install sqlalchemy[asyncio] asyncpg aiosqlite pytest-asyncio
```

```python
# pyproject.toml
[tool.pytest.ini_options]
asyncio_mode = "auto"   # or "strict" with explicit @pytest.mark.asyncio
```

### Async Fixtures

```python
# tests/conftest.py
import pytest_asyncio
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    AsyncEngine,
    create_async_engine,
    async_sessionmaker,
)
from myapp.database import Base

@pytest_asyncio.fixture(scope="session")
async def async_engine():
    engine = create_async_engine(
        "postgresql+asyncpg://test:test@localhost/testdb",
        echo=False,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest_asyncio.fixture
async def async_session(async_engine: AsyncEngine):
    """Isolated async session via nested transaction (savepoint)."""
    async with async_engine.connect() as connection:
        await connection.begin()
        # Create a savepoint so the session's commit() doesn't hit the DB
        async_session_factory = async_sessionmaker(
            bind=connection,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        async with async_session_factory() as session:
            yield session
        await connection.rollback()
```

### Async Test Examples

```python
# tests/test_async_repo.py
import pytest
from sqlalchemy import select

@pytest.mark.asyncio
async def test_create_product(async_session: AsyncSession):
    product = Product(name="Widget", price=9.99)
    async_session.add(product)
    await async_session.commit()
    await async_session.refresh(product)
    assert product.id is not None

@pytest.mark.asyncio
async def test_list_products(async_session: AsyncSession):
    async_session.add_all([
        Product(name="A", price=1.0),
        Product(name="B", price=2.0),
    ])
    await async_session.commit()
    result = await async_session.execute(select(Product))
    products = result.scalars().all()
    assert len(products) == 2
```

### Async Testcontainers

```python
from testcontainers.postgres import PostgresContainer

@pytest_asyncio.fixture(scope="session")
async def async_engine():
    with PostgresContainer("postgres:16-alpine") as pg:
        # Switch scheme from postgresql to postgresql+asyncpg
        url = pg.get_connection_url().replace("psycopg2", "asyncpg")
        engine = create_async_engine(url)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        yield engine
        await engine.dispose()
```

---

## ORM Session Fixtures Cheat Sheet

```python
# Reusable sessionmaker (module-level)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
```

```python
# Context-manager style (no fixture needed for simple tests)
with Session(engine) as session, session.begin():
    session.add(User(name="test"))
    # auto-commits if no exception, auto-rolls back on exception
```

**Key flags:**

| Flag | Default | Test recommendation |
|------|---------|---------------------|
| `expire_on_commit` | True | Set False to access attributes after commit in tests |
| `autoflush` | True | Keep True to catch constraint violations early |
| `join_transaction_mode` | "conditional_savepoint" | Use "create_savepoint" for perfect isolation |

---

## Table Creation Patterns

```python
# Minimal: create only the tables you need
Base.metadata.create_all(engine, tables=[User.__table__, Order.__table__])

# Full schema
Base.metadata.create_all(engine)

# Teardown
Base.metadata.drop_all(engine)

# Recreate between test modules
@pytest.fixture(scope="module", autouse=True)
def reset_schema(engine):
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
```

---

## Factory Boy Integration

```python
# tests/factories.py
import factory
from myapp.models import User, Order

class UserFactory(factory.alchemy.SQLAlchemyModelFactory):
    class Meta:
        model = User
        sqlalchemy_session_persistence = "commit"

    name = factory.Faker("name")
    email = factory.Faker("email")

class OrderFactory(factory.alchemy.SQLAlchemyModelFactory):
    class Meta:
        model = Order
        sqlalchemy_session_persistence = "commit"

    user = factory.SubFactory(UserFactory)
    total = factory.Faker("pydecimal", left_digits=4, right_digits=2, positive=True)

# In tests
def test_order_summary(db_session):
    UserFactory._meta.sqlalchemy_session = db_session
    OrderFactory._meta.sqlalchemy_session = db_session
    user = UserFactory()
    orders = OrderFactory.create_batch(3, user=user)
    assert len(orders) == 3
```
