# SQLAlchemy Queries Quick Reference

> **Knowledge Base:** Read `knowledge/sqlalchemy/queries.md` for complete documentation.

## Session Setup

```python
from sqlalchemy.orm import Session
from sqlalchemy import select, insert, update, delete

# Using context manager
with Session(engine) as session:
    result = session.execute(select(User))
    users = result.scalars().all()

# Dependency injection (FastAPI)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

## Basic CRUD

```python
# Create
user = User(email="john@example.com", name="John")
session.add(user)
session.commit()
session.refresh(user)  # Get generated ID

# Create many
session.add_all([
    User(email="jane@example.com"),
    User(email="bob@example.com")
])
session.commit()

# Read
user = session.get(User, 1)  # By primary key
users = session.execute(select(User)).scalars().all()

# Update
user.name = "Updated"
session.commit()

# Bulk update
session.execute(
    update(User)
    .where(User.role == "user")
    .values(is_active=False)
)
session.commit()

# Delete
session.delete(user)
session.commit()

# Bulk delete
session.execute(delete(User).where(User.is_active == False))
session.commit()
```

## Select Queries

```python
from sqlalchemy import select, and_, or_, not_

# Basic select
stmt = select(User)
users = session.execute(stmt).scalars().all()

# Select columns
stmt = select(User.id, User.email)
results = session.execute(stmt).all()  # Returns tuples

# Single result
stmt = select(User).where(User.id == 1)
user = session.execute(stmt).scalar_one_or_none()

# First result
user = session.execute(select(User)).scalars().first()
```

## Filtering

```python
# Comparison
select(User).where(User.age == 25)
select(User).where(User.age != 25)
select(User).where(User.age > 18)
select(User).where(User.age >= 18)
select(User).where(User.age < 65)
select(User).where(User.age <= 65)

# In / Not In
select(User).where(User.id.in_([1, 2, 3]))
select(User).where(User.role.not_in(["banned", "suspended"]))

# Like / ILike
select(User).where(User.email.like("%@gmail.com"))
select(User).where(User.name.ilike("%john%"))  # Case-insensitive

# Null
select(User).where(User.deleted_at.is_(None))
select(User).where(User.verified_at.is_not(None))

# Between
select(User).where(User.age.between(18, 65))

# Logical operators
select(User).where(and_(User.role == "admin", User.is_active == True))
select(User).where(or_(User.role == "admin", User.role == "mod"))
select(User).where(not_(User.is_active))

# Method chaining
select(User).where(User.role == "admin").where(User.is_active == True)
```

## Relations & Joins

```python
from sqlalchemy.orm import joinedload, selectinload, contains_eager

# Eager loading - joined (single query)
stmt = select(User).options(joinedload(User.posts))
users = session.execute(stmt).unique().scalars().all()

# Eager loading - selectin (separate query)
stmt = select(User).options(selectinload(User.posts))
users = session.execute(stmt).scalars().all()

# Nested eager loading
stmt = select(User).options(
    selectinload(User.posts).selectinload(Post.tags)
)

# Explicit join
stmt = (
    select(User, Post)
    .join(Post, User.id == Post.author_id)
    .where(Post.published == True)
)

# Left outer join
stmt = select(User).outerjoin(User.posts)

# Join with filter and eager load
stmt = (
    select(User)
    .join(User.posts)
    .where(Post.published == True)
    .options(contains_eager(User.posts))
)
```

## Ordering & Pagination

```python
from sqlalchemy import desc, asc

# Ordering
select(User).order_by(User.created_at.desc())
select(User).order_by(desc(User.created_at))
select(User).order_by(User.last_name.asc(), User.first_name.asc())

# Pagination
select(User).offset(20).limit(10)

# With count
from sqlalchemy import func

total = session.execute(select(func.count()).select_from(User)).scalar()
users = session.execute(
    select(User).offset(page * size).limit(size)
).scalars().all()
```

## Aggregations

```python
from sqlalchemy import func

# Count
count = session.execute(select(func.count(User.id))).scalar()

# Aggregates
stmt = select(
    func.sum(Order.amount).label("total"),
    func.avg(Order.amount).label("average"),
    func.min(Order.amount).label("minimum"),
    func.max(Order.amount).label("maximum")
)
result = session.execute(stmt).one()

# Group by
stmt = (
    select(Order.status, func.count(), func.sum(Order.amount))
    .group_by(Order.status)
)
results = session.execute(stmt).all()

# Having
stmt = (
    select(Order.user_id, func.sum(Order.amount).label("total"))
    .group_by(Order.user_id)
    .having(func.sum(Order.amount) > 1000)
)
```

## Transactions

```python
# Auto-commit with context manager
with Session(engine) as session:
    with session.begin():
        user = User(email="a@b.com")
        session.add(user)
    # Auto-commits on exit

# Manual transaction
try:
    session.begin()
    session.add(user)
    session.add(post)
    session.commit()
except Exception:
    session.rollback()
    raise

# Nested transactions (savepoints)
with session.begin_nested():
    session.add(user)
    # Can rollback just this savepoint
```

**Official docs:** https://docs.sqlalchemy.org/en/20/orm/queryguide/
