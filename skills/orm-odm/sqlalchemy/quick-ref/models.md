# SQLAlchemy Models Quick Reference

> **Knowledge Base:** Read `knowledge/sqlalchemy/models.md` for complete documentation.

## Setup (SQLAlchemy 2.0)

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

engine = create_engine("postgresql://user:pass@localhost/db")
SessionLocal = sessionmaker(bind=engine)

class Base(DeclarativeBase):
    pass
```

## Basic Model

```python
from sqlalchemy import String, Integer, Boolean, DateTime, Text, Enum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from datetime import datetime
import enum

class Role(enum.Enum):
    USER = "user"
    ADMIN = "admin"

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str | None] = mapped_column(String(100))
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.USER)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        onupdate=func.now()
    )
```

## Column Types

```python
from sqlalchemy import (
    Integer, BigInteger, SmallInteger,
    String, Text, Unicode,
    Float, Numeric,
    Boolean,
    Date, DateTime, Time, Interval,
    LargeBinary, JSON, ARRAY
)

# Numbers
id: Mapped[int] = mapped_column(Integer, primary_key=True)
big_num: Mapped[int] = mapped_column(BigInteger)
price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
rating: Mapped[float] = mapped_column(Float)

# Strings
email: Mapped[str] = mapped_column(String(255))
bio: Mapped[str] = mapped_column(Text)

# JSON (PostgreSQL)
metadata: Mapped[dict] = mapped_column(JSON)

# Array (PostgreSQL)
tags: Mapped[list[str]] = mapped_column(ARRAY(String))

# Optional (nullable)
name: Mapped[str | None] = mapped_column(String(100), nullable=True)
```

## Relations

```python
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship, Mapped, mapped_column

# One-to-Many
class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    posts: Mapped[list["Post"]] = relationship(back_populates="author")

class Post(Base):
    __tablename__ = "posts"
    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    author: Mapped["User"] = relationship(back_populates="posts")

# One-to-One
class User(Base):
    profile: Mapped["Profile"] = relationship(back_populates="user", uselist=False)

class Profile(Base):
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    user: Mapped["User"] = relationship(back_populates="profile")

# Many-to-Many
from sqlalchemy import Table, Column

posts_tags = Table(
    "posts_tags",
    Base.metadata,
    Column("post_id", ForeignKey("posts.id"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id"), primary_key=True)
)

class Post(Base):
    tags: Mapped[list["Tag"]] = relationship(secondary=posts_tags, back_populates="posts")

class Tag(Base):
    posts: Mapped[list["Post"]] = relationship(secondary=posts_tags, back_populates="tags")
```

## Indexes & Constraints

```python
from sqlalchemy import Index, UniqueConstraint, CheckConstraint

class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index("idx_user_email", "email"),
        Index("idx_user_name_email", "name", "email"),
        UniqueConstraint("email", name="uq_user_email"),
        CheckConstraint("age >= 0", name="ck_user_age_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), index=True)  # Simple index
    name: Mapped[str] = mapped_column(String(100))
    age: Mapped[int] = mapped_column(Integer)
```

## Mixins & Abstract Base

```python
from sqlalchemy.orm import declared_attr

class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(),
        onupdate=func.now()
    )

class SoftDeleteMixin:
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    @declared_attr
    def is_deleted(cls):
        return column_property(cls.deleted_at.isnot(None))

class User(TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255))
```

## Migrations (Alembic)

```bash
# Initialize
alembic init alembic

# Create migration
alembic revision --autogenerate -m "create users table"

# Run migrations
alembic upgrade head

# Rollback
alembic downgrade -1
```

**Official docs:** https://docs.sqlalchemy.org/en/20/orm/mapping_styles.html
