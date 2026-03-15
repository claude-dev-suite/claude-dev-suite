# Pytest Fixtures Quick Reference

> **Knowledge Base:** Read `knowledge/pytest/fixtures.md` for complete documentation.

## Fixture Basics

```python
import pytest

# Simple fixture
@pytest.fixture
def sample_user():
    return {"name": "John", "email": "john@example.com"}

# Using fixture
def test_user_name(sample_user):
    assert sample_user["name"] == "John"

# Fixture with dependencies
@pytest.fixture
def authenticated_user(sample_user, auth_service):
    return auth_service.login(sample_user)
```

## Fixture Scopes

```python
# Function scope (default) - runs for each test
@pytest.fixture(scope="function")
def fresh_data():
    return generate_data()

# Class scope - runs once per test class
@pytest.fixture(scope="class")
def class_resource():
    return create_resource()

# Module scope - runs once per module
@pytest.fixture(scope="module")
def database_connection():
    conn = connect()
    yield conn
    conn.close()

# Session scope - runs once per test session
@pytest.fixture(scope="session")
def expensive_setup():
    return setup_test_environment()
```

## Setup and Teardown

```python
# Using yield for teardown
@pytest.fixture
def database():
    # Setup
    db = Database()
    db.connect()
    db.create_tables()

    yield db  # Test runs here

    # Teardown
    db.drop_tables()
    db.disconnect()

# Using finalizer
@pytest.fixture
def temp_file(request):
    file = create_temp_file()

    def cleanup():
        file.delete()

    request.addfinalizer(cleanup)
    return file

# Multiple teardown steps
@pytest.fixture
def complex_resource(request):
    resource = acquire_resource()

    request.addfinalizer(lambda: release_resource(resource))
    request.addfinalizer(lambda: log_cleanup())

    return resource
```

## Parametrized Fixtures

```python
# Fixture with parameters
@pytest.fixture(params=["chrome", "firefox", "safari"])
def browser(request):
    driver = create_driver(request.param)
    yield driver
    driver.quit()

def test_page_loads(browser):
    # Runs 3 times, once for each browser
    browser.get("https://example.com")
    assert browser.title == "Example"

# With IDs
@pytest.fixture(params=[
    pytest.param({"host": "localhost"}, id="local"),
    pytest.param({"host": "remote.server"}, id="remote"),
])
def config(request):
    return request.param

# Combining params
@pytest.fixture(params=[1, 2])
def number(request):
    return request.param

@pytest.fixture(params=["a", "b"])
def letter(request):
    return request.param

def test_combinations(number, letter):
    # Runs 4 times: (1,a), (1,b), (2,a), (2,b)
    pass
```

## Autouse Fixtures

```python
# Automatically used by all tests in scope
@pytest.fixture(autouse=True)
def reset_singleton():
    yield
    Singleton.reset()

# Autouse in class
class TestDatabase:
    @pytest.fixture(autouse=True)
    def setup_db(self, database):
        database.begin_transaction()
        yield
        database.rollback()

    def test_insert(self, database):
        database.insert(...)

    def test_select(self, database):
        database.select(...)
```

## conftest.py

```python
# conftest.py - shared fixtures

import pytest

@pytest.fixture(scope="session")
def app():
    """Create application instance"""
    from myapp import create_app
    app = create_app(testing=True)
    return app

@pytest.fixture(scope="session")
def client(app):
    """Test client for the application"""
    return app.test_client()

@pytest.fixture
def auth_headers(client):
    """Authentication headers"""
    response = client.post("/auth/login", json={
        "email": "test@example.com",
        "password": "password"
    })
    token = response.json["token"]
    return {"Authorization": f"Bearer {token}"}

# Directory structure:
# tests/
#   conftest.py          <- Session/module fixtures
#   test_api.py
#   unit/
#     conftest.py        <- Unit test fixtures
#     test_models.py
#   integration/
#     conftest.py        <- Integration test fixtures
#     test_db.py
```

## Factory Fixtures

```python
@pytest.fixture
def user_factory():
    """Factory to create users with custom attributes"""
    created_users = []

    def create_user(name="John", email=None, **kwargs):
        email = email or f"{name.lower()}@example.com"
        user = User(name=name, email=email, **kwargs)
        user.save()
        created_users.append(user)
        return user

    yield create_user

    # Cleanup
    for user in created_users:
        user.delete()

def test_multiple_users(user_factory):
    admin = user_factory(name="Admin", role="admin")
    user = user_factory(name="User", role="user")

    assert admin.role == "admin"
    assert user.role == "user"
```

## Request Object

```python
@pytest.fixture
def dynamic_fixture(request):
    # Access test function/class
    test_name = request.node.name
    test_class = request.cls

    # Access fixture parameters
    if hasattr(request, "param"):
        param = request.param

    # Access markers
    marker = request.node.get_closest_marker("slow")

    # Access other fixtures
    other = request.getfixturevalue("other_fixture")

    return {"test": test_name}
```

## Built-in Fixtures

```python
# tmp_path - temporary directory (pathlib.Path)
def test_with_temp(tmp_path):
    file = tmp_path / "test.txt"
    file.write_text("hello")
    assert file.read_text() == "hello"

# tmp_path_factory - create multiple temp dirs
@pytest.fixture(scope="session")
def session_temp(tmp_path_factory):
    return tmp_path_factory.mktemp("data")

# capsys - capture stdout/stderr
def test_output(capsys):
    print("hello")
    captured = capsys.readouterr()
    assert captured.out == "hello\n"

# monkeypatch - modify objects/env
def test_env(monkeypatch):
    monkeypatch.setenv("API_KEY", "test-key")
    monkeypatch.setattr(module, "function", mock_function)
```

**Official docs:** https://docs.pytest.org/en/stable/how-to/fixtures.html
