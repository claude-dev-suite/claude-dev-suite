---
name: sqlalchemy
description: |
  SQLAlchemy Python ORM. Covers models, sessions, and queries.
  Use for Python database applications.

  USE WHEN: user mentions "sqlalchemy", "declarative_base", "DeclarativeBase", "Session",
  "Query", "relationship()", "alembic", asks about "python orm", "sqlalchemy models",
  "sqlalchemy async", "sqlalchemy relationships", "python database"

  DO NOT USE FOR: Node.js/TypeScript ORMs - use `prisma`, `drizzle`, or `typeorm` skills;
  Django ORM - use Django-specific resources; raw SQL - use `database-query` MCP;
  NoSQL - use `mongodb` skill; other Python ORMs (Peewee, Pony) - not supported
allowed-tools: Read, Grep, Glob, Write, Edit
---
# SQLAlchemy Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `sqlalchemy` for comprehensive documentation.

## When NOT to Use This Skill

- **TypeScript/Node.js Projects**: Use `prisma`, `drizzle`, or `typeorm` skills
- **Django Applications**: Use Django ORM documentation (not covered here)
- **Raw SQL Queries**: Use `database-query` MCP server for direct SQL execution
- **NoSQL Databases**: Use `mongodb` skill for MongoDB operations
- **FastAPI Specific**: May need `fastapi-expert` for integration patterns
- **Database Design**: Consult `sql-expert` or `architect-expert` for schema architecture
- **Other Python ORMs**: Peewee, Pony ORM, Tortoise not supported by this skill

## Model Definition

```python
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship, DeclarativeBase
from datetime import datetime

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    posts = relationship('Post', back_populates='author')

class Post(Base):
    __tablename__ = 'posts'

    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False)
    content = Column(String)
    author_id = Column(Integer, ForeignKey('users.id'))

    author = relationship('User', back_populates='posts')
```

## Session Operations

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

engine = create_engine('postgresql://user:pass@localhost/db')
Session = sessionmaker(bind=engine)

# Create
with Session() as session:
    user = User(name='John', email='john@example.com')
    session.add(user)
    session.commit()

# Read
with Session() as session:
    users = session.query(User).all()
    user = session.query(User).filter_by(id=1).first()
    active_users = session.query(User).filter(User.is_active == True).all()

# Update
with Session() as session:
    user = session.query(User).filter_by(id=1).first()
    user.name = 'Jane'
    session.commit()

# Delete
with Session() as session:
    session.query(User).filter_by(id=1).delete()
    session.commit()
```

## Async Support

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

engine = create_async_engine('postgresql+asyncpg://user:pass@localhost/db')
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_users():
    async with async_session() as session:
        result = await session.execute(select(User))
        return result.scalars().all()
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Better Approach |
|-------------|--------------|------------------|
| Not closing sessions | Connection leaks, pool exhaustion | Use context managers (`with Session()`) |
| Using `session.query()` in SQLAlchemy 2.0+ | Deprecated, legacy API | Use `select()` with `session.execute()` |
| No eager loading for relations | N+1 query problem | Use `selectinload()` or `joinedload()` |
| Hardcoded connection strings | Security risk | Use environment variables |
| Not configuring connection pool | Connection issues, performance | Set `pool_size`, `max_overflow`, `pool_recycle` |
| Using `session.flush()` without understanding | Partial commits, confusion | Use `commit()` for transactions |
| No `pool_pre_ping` in production | Stale connections after DB restart | Enable `pool_pre_ping=True` |
| Missing indexes on foreign keys | Slow joins | Add `Index()` to frequently joined columns |
| Using ORM for bulk operations | Very slow for large datasets | Use `bulk_insert_mappings()` or Core |
| Not handling `IntegrityError` | Cryptic errors to users | Catch and provide meaningful messages |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| "No module named 'sqlalchemy'" | SQLAlchemy not installed | Run `pip install sqlalchemy` |
| "Can't connect to server" | Wrong DATABASE_URL or DB down | Verify connection string, check DB status |
| "Table doesn't exist" | Migrations not run | Execute `alembic upgrade head` |
| "DetachedInstanceError" | Accessing relation outside session | Use `joinedload()` or keep session open |
| "IntegrityError: duplicate key" | Unique constraint violation | Check for existing record, handle error |
| "InvalidRequestError: SQL expression" | Missing `select()` in 2.0 style | Use `select(Model)` not `session.query()` |
| Slow queries | N+1 problem, missing indexes | Add eager loading, create indexes |
| Pool timeout | Too many connections | Increase `pool_size`, fix connection leaks |
| "Stale data" | Session caching old data | Call `session.expire_all()` or refresh objects |
| Alembic conflict | Multiple migration heads | Merge branches with `alembic merge` |

## Production Readiness

### Engine Configuration

```python
# database.py
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, scoped_session
from sqlalchemy.pool import QueuePool
import os

DATABASE_URL = os.environ['DATABASE_URL']

engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=20,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,  # Recycle connections after 30 minutes
    pool_pre_ping=True,  # Check connection validity
    echo=os.environ.get('DEBUG') == 'true',
    connect_args={
        'sslmode': 'require' if os.environ.get('ENV') == 'production' else 'prefer',
        'connect_timeout': 10,
    }
)

# Event listeners for monitoring
@event.listens_for(engine, 'before_cursor_execute')
def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    conn.info.setdefault('query_start_time', []).append(time.time())

@event.listens_for(engine, 'after_cursor_execute')
def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    total = time.time() - conn.info['query_start_time'].pop()
    if total > 0.5:  # Log slow queries
        logger.warning(f'Slow query ({total:.2f}s): {statement[:100]}')

SessionLocal = sessionmaker(bind=engine)
ScopedSession = scoped_session(SessionLocal)
```

### Context Manager Pattern

```python
from contextlib import contextmanager
from typing import Generator

@contextmanager
def get_db() -> Generator[Session, None, None]:
    """Database session context manager with automatic cleanup."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

# Usage
def create_user(name: str, email: str) -> User:
    with get_db() as db:
        user = User(name=name, email=email)
        db.add(user)
        db.flush()  # Get ID without committing
        return user
```

### Async Configuration

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

async_engine = create_async_engine(
    DATABASE_URL.replace('postgresql://', 'postgresql+asyncpg://'),
    pool_size=20,
    max_overflow=10,
    pool_recycle=1800,
    echo=False,
)

async_session = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

### Query Optimization

```python
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy import select

# Eager loading to avoid N+1
async def get_users_with_posts(db: AsyncSession):
    stmt = (
        select(User)
        .options(selectinload(User.posts))
        .where(User.is_active == True)
    )
    result = await db.execute(stmt)
    return result.scalars().all()

# Pagination
async def paginate(
    db: AsyncSession,
    page: int,
    per_page: int
) -> dict:
    offset = (page - 1) * per_page

    # Count
    count_stmt = select(func.count(User.id))
    total = await db.scalar(count_stmt)

    # Data
    stmt = (
        select(User)
        .order_by(User.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    result = await db.execute(stmt)

    return {
        'data': result.scalars().all(),
        'total': total,
        'page': page,
        'pages': math.ceil(total / per_page),
    }

# Bulk insert
def bulk_insert_users(db: Session, users_data: list[dict]):
    db.execute(insert(User), users_data)
    db.commit()
```

### Alembic Migrations

```python
# alembic/env.py
from sqlalchemy import engine_from_config, pool
from alembic import context
from models import Base

target_metadata = Base.metadata

def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix='sqlalchemy.',
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()

# CLI commands
# alembic revision --autogenerate -m "Add users table"
# alembic upgrade head
# alembic downgrade -1
```

### Testing

```python
# conftest.py
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

@pytest.fixture(scope='session')
def engine():
    return create_engine(os.environ['TEST_DATABASE_URL'])

@pytest.fixture(scope='session')
def tables(engine):
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)

@pytest.fixture
def db(engine, tables):
    connection = engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()

    yield session

    session.close()
    transaction.rollback()
    connection.close()

# tests/test_user.py
def test_create_user(db):
    user = User(name='Test', email='test@example.com')
    db.add(user)
    db.flush()
    assert user.id is not None
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Query time (p99) | < 100ms |
| Pool connections | < max_size |
| Slow queries | 0 (> 500ms) |
| Connection errors | 0 |

### Checklist

- [ ] Connection pooling configured
- [ ] SSL in production
- [ ] pool_pre_ping enabled
- [ ] pool_recycle for long-running apps
- [ ] Context manager for sessions
- [ ] Eager loading to prevent N+1
- [ ] Pagination for list queries
- [ ] Alembic migrations
- [ ] Slow query logging
- [ ] Test isolation with rollback

## Reference Documentation
- [Relationships](quick-ref/relationships.md)
- [Async](quick-ref/async.md)
