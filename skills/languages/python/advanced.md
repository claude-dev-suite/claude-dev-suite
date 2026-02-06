# Python Advanced Patterns

> **Core Reference**: See [SKILL.md](SKILL.md) for type hints, dataclasses, async/await, and basic patterns.

## Type Safety Configuration

```toml
# pyproject.toml
[tool.mypy]
python_version = "3.11"
strict = true
warn_return_any = true
warn_unused_ignores = true
disallow_untyped_defs = true
disallow_incomplete_defs = true
check_untyped_defs = true
no_implicit_optional = true

[[tool.mypy.overrides]]
module = "tests.*"
disallow_untyped_defs = false
```

## Result Type Pattern

```python
from dataclasses import dataclass
from typing import TypeVar, Generic

T = TypeVar("T")
E = TypeVar("E", bound=Exception)


@dataclass
class Ok(Generic[T]):
    value: T

    def is_ok(self) -> bool:
        return True

    def is_err(self) -> bool:
        return False


@dataclass
class Err(Generic[E]):
    error: E

    def is_ok(self) -> bool:
        return False

    def is_err(self) -> bool:
        return True


Result = Ok[T] | Err[E]
```

## Custom Exception Hierarchy

```python
class AppError(Exception):
    def __init__(self, message: str, code: str, status_code: int = 500):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class NotFoundError(AppError):
    def __init__(self, entity: str, id: str):
        super().__init__(
            f"{entity} not found: {id}",
            code="NOT_FOUND",
            status_code=404
        )


class ValidationError(AppError):
    def __init__(self, message: str):
        super().__init__(message, code="VALIDATION_ERROR", status_code=400)


class AuthorizationError(AppError):
    def __init__(self, message: str = "Not authorized"):
        super().__init__(message, code="UNAUTHORIZED", status_code=403)


# Usage with Result type
async def get_user(user_id: str) -> Result[User, AppError]:
    try:
        user = await db.get(user_id)
        if not user:
            return Err(NotFoundError("User", user_id))
        return Ok(user)
    except Exception as e:
        return Err(AppError(str(e), "DB_ERROR"))
```

## Structured Logging

```python
import logging
import structlog
from typing import Any

# Structured logging setup
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
)

logger = structlog.get_logger()


# Request context middleware
from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar("request_id", default="")


async def logging_middleware(request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request_id_var.set(request_id)

    structlog.contextvars.bind_contextvars(
        request_id=request_id,
        path=request.url.path,
    )

    response = await call_next(request)
    structlog.contextvars.unbind_contextvars("request_id", "path")
    return response


# Service logging
async def create_user(data: CreateUserRequest) -> User:
    log = logger.bind(operation="create_user", email=data.email)

    log.info("Creating user")
    try:
        user = await repository.create(data)
        log.info("User created", user_id=user.id)
        return user
    except Exception as e:
        log.error("Failed to create user", error=str(e))
        raise
```

## Pydantic Validation

```python
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from datetime import datetime


class CreateUserRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    age: int = Field(..., ge=0, le=150)
    password: str = Field(..., min_length=8)
    password_confirm: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Name cannot be blank")
        return v.strip()

    @model_validator(mode="after")
    def passwords_match(self) -> "CreateUserRequest":
        if self.password != self.password_confirm:
            raise ValueError("Passwords do not match")
        return self


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}


# Partial update model
class UpdateUserRequest(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    email: EmailStr | None = None
    age: int | None = Field(None, ge=0, le=150)
```

## Testing Patterns

### Unit Tests with Mocks

```python
import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.fixture
def mock_repository() -> AsyncMock:
    return AsyncMock()


@pytest.mark.asyncio
async def test_create_user(mock_repository: AsyncMock) -> None:
    # Given
    request = CreateUserRequest(
        name="John",
        email="john@example.com",
        age=30,
        password="password123",
        password_confirm="password123"
    )
    expected = User(id="1", name="John", email="john@example.com")
    mock_repository.create.return_value = expected

    service = UserService(mock_repository)

    # When
    result = await service.create_user(request)

    # Then
    assert result == expected
    mock_repository.create.assert_called_once()


@pytest.mark.asyncio
async def test_create_user_duplicate_email(mock_repository: AsyncMock) -> None:
    # Given
    mock_repository.create.side_effect = DuplicateKeyError("email")
    service = UserService(mock_repository)

    # When/Then
    with pytest.raises(ValidationError, match="email already exists"):
        await service.create_user(request)
```

### Integration Tests

```python
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.fixture
async def client(app: FastAPI) -> AsyncClient:
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client


@pytest.fixture
async def db_session(engine) -> AsyncSession:
    async with AsyncSession(engine) as session:
        async with session.begin():
            yield session
            await session.rollback()


@pytest.mark.asyncio
async def test_create_user_endpoint(client: AsyncClient, db_session: AsyncSession) -> None:
    response = await client.post(
        "/api/users",
        json={
            "name": "John",
            "email": "john@example.com",
            "age": 30,
            "password": "password123",
            "password_confirm": "password123"
        }
    )

    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["name"] == "John"


@pytest.mark.asyncio
async def test_get_user_not_found(client: AsyncClient) -> None:
    response = await client.get("/api/users/nonexistent")

    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"
```

### Parametrized Tests

```python
@pytest.mark.parametrize("email,valid", [
    ("test@example.com", True),
    ("user.name@domain.co.uk", True),
    ("invalid-email", False),
    ("@nodomain.com", False),
    ("", False),
])
def test_email_validation(email: str, valid: bool) -> None:
    if valid:
        request = CreateUserRequest(
            name="Test",
            email=email,
            age=25,
            password="password123",
            password_confirm="password123"
        )
        assert request.email == email
    else:
        with pytest.raises(ValueError):
            CreateUserRequest(
                name="Test",
                email=email,
                age=25,
                password="password123",
                password_confirm="password123"
            )


@pytest.mark.parametrize("age,expected_error", [
    (-1, "greater than or equal to 0"),
    (151, "less than or equal to 150"),
])
def test_age_validation(age: int, expected_error: str) -> None:
    with pytest.raises(ValueError, match=expected_error):
        CreateUserRequest(
            name="Test",
            email="test@example.com",
            age=age,
            password="password123",
            password_confirm="password123"
        )
```

## Performance Patterns

### Memoization and Caching

```python
from functools import lru_cache
from cachetools import TTLCache
import asyncio


# Memoization for pure functions
@lru_cache(maxsize=1000)
def expensive_computation(n: int) -> int:
    return sum(range(n))


# Async TTL caching
cache: TTLCache[str, User] = TTLCache(maxsize=1000, ttl=300)


async def get_user_cached(user_id: str) -> User:
    if user_id in cache:
        return cache[user_id]

    user = await repository.get(user_id)
    cache[user_id] = user
    return user


# Cache decorator for async functions
def async_cache(ttl: int = 300, maxsize: int = 100):
    cache: TTLCache = TTLCache(maxsize=maxsize, ttl=ttl)

    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            key = (args, tuple(sorted(kwargs.items())))
            if key in cache:
                return cache[key]
            result = await func(*args, **kwargs)
            cache[key] = result
            return result
        return wrapper
    return decorator


@async_cache(ttl=60)
async def get_user_profile(user_id: str) -> UserProfile:
    return await api.fetch_profile(user_id)
```

### Connection Pooling

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

engine = create_async_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_recycle=3600,
    pool_pre_ping=True,
)

async_session = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


# Dependency injection
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

### Batch Processing

```python
import asyncio
from itertools import islice


async def process_batch(items: list[Item]) -> list[Result]:
    """Process items in batches to avoid overwhelming resources."""
    BATCH_SIZE = 100
    results = []

    for i in range(0, len(items), BATCH_SIZE):
        batch = items[i:i + BATCH_SIZE]
        batch_results = await asyncio.gather(
            *[process_item(item) for item in batch]
        )
        results.extend(batch_results)

        # Rate limiting between batches
        await asyncio.sleep(0.1)

    return results


# Semaphore for concurrent limit
async def process_with_limit(items: list[Item], max_concurrent: int = 10) -> list[Result]:
    semaphore = asyncio.Semaphore(max_concurrent)

    async def limited_process(item: Item) -> Result:
        async with semaphore:
            return await process_item(item)

    return await asyncio.gather(*[limited_process(item) for item in items])
```

## Dependency Injection

```python
from typing import Protocol
from dataclasses import dataclass


# Define interfaces
class UserRepository(Protocol):
    async def get(self, user_id: str) -> User | None: ...
    async def create(self, user: User) -> User: ...
    async def update(self, user: User) -> User: ...


class EmailService(Protocol):
    async def send(self, to: str, subject: str, body: str) -> None: ...


# Service with injected dependencies
@dataclass
class UserService:
    repository: UserRepository
    email_service: EmailService

    async def create_user(self, request: CreateUserRequest) -> User:
        user = User.from_request(request)
        created = await self.repository.create(user)

        await self.email_service.send(
            to=user.email,
            subject="Welcome!",
            body=f"Hello {user.name}, welcome to our platform!"
        )

        return created


# Factory for wiring dependencies
def create_user_service(
    db: AsyncSession,
    email_config: EmailConfig,
) -> UserService:
    return UserService(
        repository=PostgresUserRepository(db),
        email_service=SMTPEmailService(email_config),
    )
```

## Production Checklist

| Area | Item | Status |
|------|------|--------|
| **Type Safety** | mypy strict mode enabled | ☐ |
| | 100% type coverage | ☐ |
| | No `# type: ignore` without reason | ☐ |
| **Linting** | Ruff with security rules | ☐ |
| | Zero violations | ☐ |
| **Error Handling** | Custom exception hierarchy | ☐ |
| | Result type for operations | ☐ |
| **Logging** | Structured logging (structlog) | ☐ |
| | Request ID correlation | ☐ |
| **Validation** | Pydantic for all DTOs | ☐ |
| | Input validation on boundaries | ☐ |
| **Testing** | pytest with asyncio | ☐ |
| | Parametrized tests | ☐ |
| | > 90% coverage | ☐ |
| **Performance** | Connection pooling | ☐ |
| | Async caching strategy | ☐ |
| | Batch processing for bulk ops | ☐ |

## Monitoring Metrics

| Metric | Target |
|--------|--------|
| Type coverage | 100% (strict) |
| Test coverage | > 90% |
| Ruff violations | 0 |
| Mypy errors | 0 |
| Response time p99 | < 500ms |
| Error rate | < 0.1% |
