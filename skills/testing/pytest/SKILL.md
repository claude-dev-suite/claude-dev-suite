---
name: pytest
description: |
  pytest Python testing framework. Covers fixtures, parametrize,
  and mocking. Use for Python testing.

  USE WHEN: user mentions "pytest", "python test", "fixture", asks about "@pytest.fixture", "@pytest.mark.parametrize", "conftest.py", "pytest coverage", "python unit test"

  DO NOT USE FOR: JavaScript/TypeScript - use `vitest` or `jest`; Java - use `junit`; E2E web tests - use `playwright`; Load testing - use locust
allowed-tools: Read, Grep, Glob, Write, Edit
---
# pytest Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `pytest` for comprehensive documentation.

## When NOT to Use This Skill

- **JavaScript/TypeScript Testing** - Use `vitest` or `jest` for JS/TS projects
- **Java Testing** - Use `junit` for Java/Spring projects
- **E2E Web Testing** - Use `playwright` for browser automation
- **Load Testing** - Use locust or pytest-benchmark for performance
- **API Contract Testing** - Use dedicated tools like Pact

## Basic Tests

```python
def test_addition():
    assert 1 + 1 == 2

def test_list_contains():
    items = [1, 2, 3]
    assert 2 in items

def test_raises_exception():
    with pytest.raises(ValueError):
        int("not a number")

class TestUserService:
    def test_create_user(self):
        user = create_user(name="John")
        assert user.name == "John"
```

## Fixtures

```python
import pytest

@pytest.fixture
def user():
    return User(name="John", email="john@example.com")

@pytest.fixture
def db():
    connection = create_db_connection()
    yield connection
    connection.close()

def test_user_name(user):
    assert user.name == "John"

def test_user_in_db(db, user):
    db.save(user)
    assert db.find(user.id) is not None
```

## Parametrize

```python
@pytest.mark.parametrize("input,expected", [
    (1, 2),
    (2, 4),
    (3, 6),
])
def test_double(input, expected):
    assert double(input) == expected

@pytest.mark.parametrize("email,valid", [
    ("test@example.com", True),
    ("invalid", False),
    ("", False),
])
def test_validate_email(email, valid):
    assert validate_email(email) == valid
```

## Mocking

```python
from unittest.mock import Mock, patch

def test_with_mock():
    mock_api = Mock()
    mock_api.get_users.return_value = [{"name": "John"}]

    result = process_users(mock_api)

    mock_api.get_users.assert_called_once()

@patch('myapp.api.requests.get')
def test_api_call(mock_get):
    mock_get.return_value.json.return_value = {"data": []}

    result = fetch_data()

    assert result == {"data": []}
```

## Async Tests

```python
import pytest

@pytest.mark.asyncio
async def test_async_function():
    result = await async_fetch_data()
    assert result is not None

# With pytest-asyncio 0.23+
@pytest.mark.asyncio(loop_scope="module")
async def test_shared_loop():
    pass
```

## Property-Based Testing (Hypothesis)

```python
from hypothesis import given, strategies as st

@given(st.integers(), st.integers())
def test_addition_commutative(a: int, b: int):
    assert a + b == b + a

@given(st.lists(st.integers()))
def test_sort_idempotent(items: list[int]):
    assert sorted(sorted(items)) == sorted(items)

@given(st.text(min_size=1))
def test_string_nonempty(s: str):
    assert len(s) >= 1

# Custom strategies
@given(st.builds(User, name=st.text(min_size=1), age=st.integers(0, 150)))
def test_user_creation(user: User):
    assert user.name
    assert 0 <= user.age <= 150

# Stateful testing
from hypothesis.stateful import RuleBasedStateMachine, rule

class SetMachine(RuleBasedStateMachine):
    def __init__(self):
        self.model = set()
        self.impl = MySet()

    @rule(value=st.integers())
    def add(self, value):
        self.model.add(value)
        self.impl.add(value)
        assert self.impl.contains(value)
```

## Configuration

```ini
# pytest.ini
[pytest]
testpaths = tests
python_files = test_*.py
python_functions = test_*
addopts = -v --cov=src --cov-report=html
```

## Production Readiness

### Test Organization

```python
# tests/conftest.py - Shared fixtures
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

@pytest.fixture(scope="session")
def engine():
    """Database engine for all tests."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()

@pytest.fixture(scope="function")
def db_session(engine):
    """Fresh database session for each test."""
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.rollback()
    session.close()

@pytest.fixture
def client(db_session):
    """Test client with database session."""
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
```

### Coverage Configuration

```ini
# pyproject.toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
addopts = "-v --cov=src --cov-report=term-missing --cov-report=xml --cov-fail-under=80"
markers = [
    "slow: marks tests as slow",
    "integration: integration tests",
]

[tool.coverage.run]
source = ["src"]
omit = ["*/tests/*", "*/__init__.py"]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "if TYPE_CHECKING:",
    "raise NotImplementedError",
]
```

### CI Configuration

```yaml
# GitHub Actions
- name: Run tests
  run: |
    pytest --junitxml=test-results.xml --cov-report=xml

- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage.xml
```

### Factory Pattern

```python
# tests/factories.py
import factory
from faker import Faker

fake = Faker()

class UserFactory(factory.Factory):
    class Meta:
        model = User

    name = factory.LazyAttribute(lambda _: fake.name())
    email = factory.LazyAttribute(lambda _: fake.email())
    is_active = True

# Usage
def test_user_creation(db_session):
    user = UserFactory()
    db_session.add(user)
    db_session.commit()
    assert user.id is not None
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Line coverage | > 80% |
| Branch coverage | > 75% |
| Test execution time | < 60s |
| Flaky test rate | 0% |

### Checklist

- [ ] Fixtures in conftest.py
- [ ] Database isolation per test
- [ ] Coverage thresholds enforced
- [ ] CI/CD integration
- [ ] Factory pattern for test data
- [ ] Proper test markers
- [ ] Async tests with pytest-asyncio
- [ ] Mocking external services
- [ ] Parametrized edge cases
- [ ] Error paths tested

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Sharing mutable fixtures | Tests affect each other | Use function-scoped fixtures |
| Not using parametrize | Duplicate test code | Use @pytest.mark.parametrize |
| Testing implementation details | Brittle tests | Test public API behavior |
| Fixtures with side effects | Hard to debug | Keep fixtures pure, use yield for cleanup |
| No conftest.py organization | Scattered fixtures | Centralize in conftest.py |
| Ignoring warnings | Hidden issues | Treat warnings as errors in CI |
| Not mocking external services | Slow, flaky tests | Mock HTTP, database, file system |

## Quick Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| "fixture not found" | Fixture not in scope | Move to conftest.py or same file |
| Test hangs | Missing await or infinite loop | Check async operations, add timeout |
| "Database is locked" | Shared DB connection | Use function-scoped DB fixtures |
| Flaky test | Shared state or timing | Isolate setup, check for race conditions |
| Import error | PYTHONPATH not set | Add src to path or use pytest.ini |
| Coverage not accurate | Missing source paths | Configure [tool.coverage.run] in pyproject.toml |

## Hypothesis Configuration

```toml
# pyproject.toml
[tool.hypothesis]
deadline = 500  # ms
max_examples = 100
database = ".hypothesis"

[tool.pytest.ini_options]
addopts = "--hypothesis-show-statistics"
```

## Reference Documentation
- [Fixtures](quick-ref/fixtures.md)
- [Mocking](quick-ref/mocking.md)

**Official docs:**
- pytest: https://docs.pytest.org/
- hypothesis: https://hypothesis.readthedocs.io/
