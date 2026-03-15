---
name: pytest-django
description: |
  pytest-django integration testing specialist. Covers all fixtures (db,
  transactional_db, client, rf, settings, mailoutbox, django_user_model),
  @pytest.mark.django_db options, DRF APIClient, factory_boy integration,
  async views, signals, management commands, and multi-database testing.

  USE WHEN: user mentions "pytest-django", "django test", "@pytest.mark.django_db",
  asks about "django client fixture", "DRF APIClient", "django signals test",
  "management command test", "django async view test".

  DO NOT USE FOR: Non-Django Python tests - use `pytest` or `python-integration`;
  FastAPI - use `fastapi-testing`; Pure container setup - use `testcontainers-python`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# pytest-django

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `pytest-django`
> for comprehensive documentation on all fixtures, markers, and advanced patterns.

## Setup

```toml
# pyproject.toml
[tool.pytest.ini_options]
DJANGO_SETTINGS_MODULE = "myproject.settings.test"
python_files = ["tests.py", "test_*.py", "*_tests.py"]
```

## @pytest.mark.django_db Options

```python
@pytest.mark.django_db                               # basic DB access, rollback
@pytest.mark.django_db(transaction=True)             # real commits (TransactionTestCase)
@pytest.mark.django_db(transaction=True, reset_sequences=True)  # reset auto-increment
@pytest.mark.django_db(databases=["default", "analytics"])      # multiple DBs
@pytest.mark.django_db(databases="__all__")          # all databases
@pytest.mark.django_db(serialized_rollback=True)     # for data migration tests
```

## Core Fixtures

```python
def test_basic(db):               # DB access fixture (use in other fixtures)
    pass

def test_client(client):          # django.test.Client
    response = client.get("/")
    assert response.status_code == 200

def test_admin(admin_client):     # pre-logged-in superuser client
    response = admin_client.get("/admin/")
    assert response.status_code == 200

def test_rf(rf, admin_user):      # RequestFactory (bypasses middleware)
    request = rf.get("/items/")
    request.user = admin_user
    response = my_view(request)

def test_settings(settings):      # modify settings, auto-reverted
    settings.DEBUG = True
    settings.CACHES = {"default": {"BACKEND": "...DummyCache"}}

def test_mail(mailoutbox):        # access sent emails
    send_mail("Subject", "Body", "from@x.com", ["to@x.com"])
    assert len(mailoutbox) == 1
    assert mailoutbox[0].subject == "Subject"

def test_user(django_user_model): # AUTH_USER_MODEL
    user = django_user_model.objects.create_user("alice", password="pass")
    assert user.check_password("pass")
```

## Authentication Patterns

```python
def test_force_login(client, django_user_model):
    user = django_user_model.objects.create_user("alice", password="pass")
    client.force_login(user)            # fastest, no password check
    response = client.get("/private/")
    assert response.status_code == 200

def test_client_login(client, django_user_model):
    django_user_model.objects.create_user("alice", password="pass")
    client.login(username="alice", password="pass")
    response = client.get("/private/")
    assert response.status_code == 200
```

## DRF APIClient

```python
import pytest
from rest_framework.test import APIClient
from rest_framework import status

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def auth_client(api_client, django_user_model, db):
    user = django_user_model.objects.create_user("alice", password="pass")
    api_client.force_authenticate(user=user)
    return api_client

@pytest.mark.django_db
def test_create(auth_client):
    resp = auth_client.post("/api/items/", {"name": "Widget"}, format="json")
    assert resp.status_code == status.HTTP_201_CREATED
    assert resp.data["name"] == "Widget"

@pytest.mark.django_db
def test_token_auth(api_client, django_user_model):
    from rest_framework.authtoken.models import Token
    user = django_user_model.objects.create_user("alice", password="pass")
    token = Token.objects.create(user=user)
    api_client.credentials(HTTP_AUTHORIZATION="Token " + token.key)
    resp = api_client.get("/api/me/")
    assert resp.status_code == status.HTTP_200_OK
```

## factory_boy Integration

```python
# factories.py
from factory.django import DjangoModelFactory
import factory

class UserFactory(DjangoModelFactory):
    class Meta:
        model = "auth.User"
        django_get_or_create = ("username",)

    username = factory.Sequence(lambda n: f"user{n}")
    email    = factory.LazyAttribute(lambda o: f"{o.username}@example.com")
    password = factory.django.Password("testpass123")

class ArticleFactory(DjangoModelFactory):
    class Meta:
        model = "myapp.Article"

    title  = factory.Sequence(lambda n: f"Article {n}")
    author = factory.SubFactory(UserFactory)
    body   = factory.Faker("paragraph")

# conftest.py
@pytest.fixture
def user(db):
    return UserFactory()

@pytest.fixture
def article(db):
    return ArticleFactory()
```

## Testing Signals

```python
from unittest.mock import MagicMock
from django.db.models.signals import post_save

@pytest.mark.django_db
def test_signal_fires(db):
    handler = MagicMock()
    post_save.connect(handler, sender=Article)
    try:
        Article.objects.create(title="Test", body="Content")
        assert handler.called
        assert handler.call_args[1]["created"] is True
    finally:
        post_save.disconnect(handler, sender=Article)
```

## Testing Management Commands

```python
from io import StringIO
from django.core.management import call_command

@pytest.mark.django_db
def test_command_output():
    out = StringIO()
    call_command("my_command", stdout=out, verbosity=2)
    assert "Success" in out.getvalue()
```

## Async Views (Django 4.1+)

```python
@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
async def test_async_view(async_client):
    response = await async_client.get("/async-endpoint/")
    assert response.status_code == 200
```

## Query Count Assertions

```python
def test_no_n_plus_one(client, django_assert_max_num_queries):
    with django_assert_max_num_queries(5):
        response = client.get("/api/articles/")
    assert response.status_code == 200

def test_exact_queries(django_assert_num_queries):
    with django_assert_num_queries(1):
        Article.objects.get(pk=1)
```

## on_commit Callbacks

```python
def test_email_on_commit(client, mailoutbox, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        client.post("/orders/", {"item_id": 1})
    assert len(mailoutbox) == 1
```

## Recommended conftest.py

```python
# conftest.py
import pytest

@pytest.fixture(autouse=True)
def fast_password_hasher(settings):
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

@pytest.fixture(autouse=True)
def dummy_cache(settings):
    settings.CACHES = {"default": {"BACKEND": "django.core.cache.backends.dummy.DummyCache"}}

@pytest.fixture(autouse=True)
def email_backend(settings):
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
```

## Anti-Patterns

| Anti-Pattern | Solution |
|---|---|
| `transaction=True` for everything | Use default (rollback) unless you need real commits |
| `db` in session fixture | Use `django_db_blocker` for session scope |
| Not resetting factory sequences | `UserFactory.reset_sequence(0)` in fixtures |
| Not using `force_login` | Prefer `force_login` over `login` for speed |

**Official docs:** https://pytest-django.readthedocs.io/
