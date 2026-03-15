# Pytest Basics Quick Reference

> **Knowledge Base:** Read `knowledge/pytest/basics.md` for complete documentation.

## Test Structure

```python
# test_example.py

# Simple test function
def test_addition():
    assert 1 + 2 == 3

# Test class
class TestCalculator:
    def test_add(self):
        assert add(1, 2) == 3

    def test_subtract(self):
        assert subtract(5, 3) == 2

# Descriptive test
def test_user_can_login_with_valid_credentials():
    user = User("test@example.com", "password123")
    assert user.login() is True
```

## Assertions

```python
# Basic assertions
assert value == expected
assert value != other
assert value is None
assert value is not None
assert value  # truthy
assert not value  # falsy

# Collections
assert item in collection
assert item not in collection
assert len(collection) == 5

# Comparisons
assert value > 0
assert value >= minimum
assert value < maximum

# Approximate equality (floats)
assert value == pytest.approx(0.3, rel=1e-3)
assert value == pytest.approx(0.3, abs=0.01)

# String containment
assert "substring" in string_value
assert string_value.startswith("prefix")

# Type checking
assert isinstance(obj, MyClass)
```

## Fixtures

```python
import pytest

# Basic fixture
@pytest.fixture
def user():
    return User("test@example.com")

def test_user_name(user):
    assert user.email == "test@example.com"

# Fixture with setup/teardown
@pytest.fixture
def database():
    db = connect_database()
    yield db  # Test runs here
    db.close()

# Fixture scope
@pytest.fixture(scope="module")  # function, class, module, session
def expensive_resource():
    return create_resource()

# Autouse fixture
@pytest.fixture(autouse=True)
def reset_state():
    yield
    State.reset()

# Parametrized fixture
@pytest.fixture(params=["mysql", "postgresql", "sqlite"])
def db_connection(request):
    return connect(request.param)
```

## Parametrization

```python
import pytest

# Basic parametrize
@pytest.mark.parametrize("input,expected", [
    (1, 2),
    (2, 4),
    (3, 6),
])
def test_double(input, expected):
    assert double(input) == expected

# Multiple parameters
@pytest.mark.parametrize("a,b,expected", [
    (1, 2, 3),
    (0, 0, 0),
    (-1, 1, 0),
])
def test_add(a, b, expected):
    assert add(a, b) == expected

# IDs for test cases
@pytest.mark.parametrize("value,expected", [
    pytest.param(1, True, id="positive"),
    pytest.param(0, False, id="zero"),
    pytest.param(-1, False, id="negative"),
])
def test_is_positive(value, expected):
    assert is_positive(value) == expected

# Combining parametrize
@pytest.mark.parametrize("x", [1, 2])
@pytest.mark.parametrize("y", [3, 4])
def test_combinations(x, y):
    # Tests: (1,3), (1,4), (2,3), (2,4)
    pass
```

## Exception Testing

```python
import pytest

# Test exception is raised
def test_raises_value_error():
    with pytest.raises(ValueError):
        raise ValueError("invalid")

# Check exception message
def test_raises_with_message():
    with pytest.raises(ValueError, match="invalid"):
        raise ValueError("invalid value")

# Access exception info
def test_exception_details():
    with pytest.raises(ValueError) as exc_info:
        raise ValueError("test error")

    assert "test" in str(exc_info.value)
    assert exc_info.type is ValueError
```

## Markers

```python
import pytest

# Skip test
@pytest.mark.skip(reason="Not implemented yet")
def test_future_feature():
    pass

# Conditional skip
@pytest.mark.skipif(sys.platform == "win32", reason="Unix only")
def test_unix_feature():
    pass

# Expected failure
@pytest.mark.xfail(reason="Known bug")
def test_known_bug():
    assert broken_function()

# Custom markers
@pytest.mark.slow
def test_slow_operation():
    pass

# Run: pytest -m slow
# Run: pytest -m "not slow"
```

## Setup/Teardown

```python
# Module level
def setup_module(module):
    """Runs once at start of module"""
    pass

def teardown_module(module):
    """Runs once at end of module"""
    pass

# Class level
class TestClass:
    @classmethod
    def setup_class(cls):
        """Runs once per class"""
        pass

    def setup_method(self, method):
        """Runs before each test method"""
        pass

    def teardown_method(self, method):
        """Runs after each test method"""
        pass
```

## CLI Commands

```bash
# Run all tests
pytest

# Verbose output
pytest -v

# Run specific file/test
pytest test_file.py
pytest test_file.py::test_function
pytest test_file.py::TestClass::test_method

# Run by marker
pytest -m slow
pytest -m "not slow"

# Run by keyword
pytest -k "login"
pytest -k "login and not admin"

# Stop on first failure
pytest -x

# Run last failed
pytest --lf

# Show print output
pytest -s

# Parallel execution (pytest-xdist)
pytest -n 4
```

**Official docs:** https://docs.pytest.org/en/stable/
