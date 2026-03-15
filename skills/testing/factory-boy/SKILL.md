---
name: factory-boy
description: |
  factory_boy test data generation specialist. Covers Factory, DjangoModelFactory,
  SQLAlchemyModelFactory, all field declarations (Faker, LazyAttribute, Sequence,
  SubFactory, RelatedFactory, post_generation, Trait, Maybe, Dict, List),
  batch creation, pytest integration, and Celery task testing patterns.

  USE WHEN: user mentions "factory_boy", "test factory", "DjangoModelFactory",
  "SQLAlchemyModelFactory", asks about "test data generation", "factory traits",
  "SubFactory", "factory fixtures".

  DO NOT USE FOR: pytest internals - use `pytest`; Django setup - use `pytest-django`;
  Hypothesis property testing - use `pytest` with Hypothesis
allowed-tools: Read, Grep, Glob, Write, Edit
---
# factory_boy

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `factory-boy`
> for comprehensive documentation on all declarations, ORM integrations, and patterns.

## Installation

```bash
pip install factory_boy faker
```

## Basic Factory

```python
import factory
from myapp.models import User

class UserFactory(factory.Factory):
    class Meta:
        model = User

    first_name = factory.Faker("first_name")
    last_name  = factory.Faker("last_name")
    email      = factory.LazyAttribute(
        lambda o: f"{o.first_name}.{o.last_name}@example.com".lower()
    )
    username   = factory.Sequence(lambda n: f"user{n}")
    is_active  = True

user  = UserFactory()            # creates (or builds, see Meta.strategy)
user  = UserFactory.build()      # in-memory, no DB
users = UserFactory.create_batch(5)
stub  = UserFactory.stub()       # StubObject, no model.__init__()
```

## DjangoModelFactory

```python
from factory.django import DjangoModelFactory

class UserFactory(DjangoModelFactory):
    class Meta:
        model = "auth.User"                       # 'app.Model' string OK
        django_get_or_create = ("username",)       # get-or-create on username

    username = factory.Sequence(lambda n: f"user{n}")
    email    = factory.LazyAttribute(lambda o: f"{o.username}@example.com")
    password = factory.django.Password("testpass123")  # hashed via make_password

    class Params:
        staff = factory.Trait(is_staff=True)
        admin = factory.Trait(is_staff=True, is_superuser=True)
```

## SQLAlchemyModelFactory

```python
from sqlalchemy.orm import scoped_session, sessionmaker
from factory.alchemy import SQLAlchemyModelFactory

Session = scoped_session(sessionmaker())

class UserFactory(SQLAlchemyModelFactory):
    class Meta:
        model = User
        sqlalchemy_session = Session
        sqlalchemy_session_persistence = "commit"  # None | "flush" | "commit"

    username = factory.Sequence(lambda n: f"user{n}")
    email    = factory.LazyAttribute(lambda o: f"{o.username}@example.com")

# In pytest: inject session
@pytest.fixture
def user(db_session):
    UserFactory._meta.sqlalchemy_session = db_session
    return UserFactory()
```

## All Key Declarations

```python
class ArticleFactory(factory.Factory):
    class Meta:
        model = Article

    # Static value
    status = "draft"

    # Faker provider
    title      = factory.Faker("sentence", nb_words=6)
    body       = factory.Faker("paragraph")
    uuid       = factory.Faker("uuid4")

    # Sequence (unique per factory call)
    slug       = factory.Sequence(lambda n: f"article-{n}")

    # LazyAttribute (computed from other fields)
    summary    = factory.LazyAttribute(lambda o: o.body[:100])

    # LazyFunction (zero-arg callable)
    created_at = factory.LazyFunction(datetime.utcnow)

    # SubFactory (FK)
    author     = factory.SubFactory(UserFactory)

    # SelfAttribute (access parent or sibling fields)
    author_email = factory.SelfAttribute("author.email")

    # Iterator (cycles through values)
    category   = factory.Iterator(["tech", "culture", "science"])

    # Dict field
    metadata   = factory.Dict({"source": "web", "version": factory.Sequence(lambda n: n)})

    # Maybe (conditional)
    published_at = factory.Maybe(
        "is_published",
        yes_declaration=factory.LazyFunction(datetime.utcnow),
        no_declaration=None,
    )
    is_published = True
```

## SubFactory with Overrides

```python
# Override sub-factory fields via __ separator
post = PostFactory(author__username="alice", author__email="alice@test.com")

# Override nested sub-factory
company = CompanyFactory(owner__address__city="Rome")
```

## RelatedFactory (Reverse FK)

```python
class UserFactory(DjangoModelFactory):
    class Meta:
        model = User

    profile = factory.RelatedFactory(
        ProfileFactory,
        factory_related_name="user",  # Profile.user
        bio="Default bio",
    )
```

## post_generation (M2M, Side Effects)

```python
class ArticleFactory(DjangoModelFactory):
    class Meta:
        model = Article
        skip_postgeneration_save = True

    @factory.post_generation
    def tags(self, create, extracted, **kwargs):
        if not create or not extracted:
            return
        self.tags.set(extracted)

# Usage
article = ArticleFactory(tags=[tag1, tag2])
```

## Traits

```python
class OrderFactory(factory.Factory):
    class Meta:
        model = Order

    status = "pending"

    class Params:
        shipped = factory.Trait(
            status="shipped",
            shipped_at=factory.LazyFunction(datetime.utcnow),
        )
        paid = factory.Trait(
            status="paid",
            paid_at=factory.LazyFunction(datetime.utcnow),
        )

# Usage
pending = OrderFactory()
shipped = OrderFactory(shipped=True)
paid    = OrderFactory(paid=True)
```

## pytest Integration

```python
# conftest.py
import pytest
from myapp.tests.factories import UserFactory, ArticleFactory

@pytest.fixture
def user(db):                          # for Django
    return UserFactory()

@pytest.fixture
def user(db_session):                  # for SQLAlchemy
    UserFactory._meta.sqlalchemy_session = db_session
    return UserFactory()

@pytest.fixture
def articles(db):
    return ArticleFactory.create_batch(5)

@pytest.fixture(autouse=True)
def reset_sequences():
    UserFactory.reset_sequence(0)
    ArticleFactory.reset_sequence(0)
    yield
```

## Anti-Patterns

| Anti-Pattern | Solution |
|---|---|
| `UserFactory(email="test@example.com")` in every test | Override in fixture or use `Sequence` |
| SubFactory without `django_get_or_create` | Can cause unique constraint violations |
| Not resetting sequences | Use `autouse` fixture to reset_sequence(0) |
| Creating M2M before object exists | Use `post_generation` / `skip_postgeneration_save` |

**Official docs:** https://factoryboy.readthedocs.io/
