---
name: fastapi-testing
description: |
  FastAPI integration testing specialist. Covers synchronous TestClient, async
  httpx AsyncClient, dependency injection overrides, auth testing (JWT, OAuth2,
  API keys), WebSocket testing, file uploads, background tasks, middleware testing,
  and HTTP mocking with respx, responses, and pytest-httpserver.

  USE WHEN: user mentions "FastAPI test", "TestClient", "httpx async test",
  "dependency override test", "respx mock", asks about testing FastAPI endpoints,
  authentication in tests, or HTTP client mocking.

  DO NOT USE FOR: Django - use `pytest-django`; pytest internals - use `pytest`;
  Container infrastructure - use `testcontainers-python`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# FastAPI Testing

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `fastapi-testing`
> for comprehensive documentation on TestClient, async testing, auth, and HTTP mocking.

## Synchronous TestClient

```python
from fastapi.testclient import TestClient
from myapp.main import app

client = TestClient(app)

def test_read_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Hello World"}

def test_post_item():
    response = client.post(
        "/items/",
        json={"name": "Widget", "price": 9.99},
    )
    assert response.status_code == 201
```

## Lifespan Events

```python
def test_with_lifespan():
    with TestClient(app) as client:  # triggers startup/shutdown
        response = client.get("/items/")
        assert response.status_code == 200
```

## Async TestClient (httpx)

```python
import pytest
from httpx import ASGITransport, AsyncClient
from myapp.main import app

@pytest.mark.anyio
async def test_async():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        response = await ac.get("/")
    assert response.status_code == 200

# Shared fixture
@pytest.fixture(scope="module")
async def async_client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
```

## Dependency Overrides

```python
# Production dependency
async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session

# Test: override with test session
@pytest.fixture
def client(db_session):
    def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

# Override user authentication
async def override_current_user():
    return User(id=1, username="testuser", is_active=True)

app.dependency_overrides[get_current_user] = override_current_user
```

## Auth Testing — JWT

```python
from datetime import timedelta
from myapp.auth import create_access_token

def get_test_token(username="testuser") -> str:
    return create_access_token(
        data={"sub": username},
        expires_delta=timedelta(minutes=30),
    )

def test_protected_endpoint():
    token = get_test_token()
    response = client.get(
        "/users/me/",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200

def test_no_token():
    response = client.get("/users/me/")
    assert response.status_code == 401
```

## WebSocket Testing

```python
def test_websocket():
    with client.websocket_connect("/ws") as ws:
        ws.send_text("hello")
        data = ws.receive_text()
        assert data == "Echo: hello"
```

## File Upload Testing

```python
def test_upload_file():
    response = client.post(
        "/uploadfile/",
        files={"file": ("test.txt", b"hello world", "text/plain")},
    )
    assert response.status_code == 200
    assert response.json() == {"filename": "test.txt", "size": 11}
```

## Background Tasks Testing

```python
from unittest.mock import patch

def test_task_called():
    with patch("fastapi.BackgroundTasks.add_task") as mock:
        response = client.post("/send-notification/user@example.com")
    assert response.status_code == 200
    mock.assert_called_once()
```

## HTTP Mocking — respx

```python
import httpx
import respx

@respx.mock
def test_external_api():
    respx.get("https://api.example.com/users").mock(
        return_value=httpx.Response(200, json=[{"id": 1, "name": "Alice"}])
    )
    response = client.get("/proxy/users")
    assert response.status_code == 200

# With side effects
@respx.mock
async def test_async_mock():
    respx.post("https://api.example.com/data").mock(
        side_effect=httpx.ConnectError
    )
    with pytest.raises(httpx.ConnectError):
        async with httpx.AsyncClient() as ac:
            await ac.post("https://api.example.com/data")
```

## HTTP Mocking — responses (requests library)

```python
import responses
import requests

@responses.activate
def test_with_responses():
    responses.get(
        "https://api.example.com/users",
        json=[{"id": 1}],
        status=200,
    )
    result = my_service.get_users()
    assert len(result) == 1
```

## HTTP Mocking — pytest-httpserver

```python
def test_real_server(httpserver):
    httpserver.expect_request("/data").respond_with_json({"key": "value"})
    response = requests.get(httpserver.url_for("/data"))
    assert response.json() == {"key": "value"}
```

## Anti-Patterns

| Anti-Pattern | Solution |
|---|---|
| `app.dependency_overrides` not cleared | Use `yield` + `app.dependency_overrides.clear()` in fixture |
| Creating `TestClient` per test | Module or session scope `TestClient` |
| Testing with real external APIs | Use respx/responses to mock |
| Not using `ASGITransport` for async | Required for httpx with ASGI apps |

**Official docs:** https://fastapi.tiangolo.com/tutorial/testing/
