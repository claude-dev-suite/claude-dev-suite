# Testing gRPC Services in Python

## Overview of Approaches

| Approach | What it tests | Speed | Requires network |
|---|---|---|---|
| `pytest-grpc` fake server | Servicer logic in-process | Fast | No |
| `pytest-grpc` real server | Full gRPC stack (thread) | Medium | Loopback only |
| `grpc_testing` module | Client or server isolation | Fast | No |
| `grpc.experimental.aio` test server | Async servicer | Medium | Loopback only |

---

## Setup: Proto and Generated Code

```proto
// protos/user.proto
syntax = "proto3";

package user;

service UserService {
  rpc GetUser (GetUserRequest) returns (User);
  rpc CreateUser (CreateUserRequest) returns (User);
  rpc ListUsers (ListUsersRequest) returns (stream User);
}

message GetUserRequest { int32 id = 1; }
message CreateUserRequest { string name = 1; string email = 2; }
message ListUsersRequest { int32 limit = 1; }
message User { int32 id = 1; string name = 2; string email = 3; }
```

```bash
# Generate Python stubs
python -m grpc_tools.protoc \
  -I ./protos \
  --python_out=./src/protos \
  --grpc_python_out=./src/protos \
  ./protos/user.proto
```

---

## pytest-grpc: Recommended Approach

```bash
pip install pytest-grpc grpcio grpcio-tools
```

### Servicer Implementation

```python
# src/services/user_service.py
from src.protos.user_pb2 import User
from src.protos.user_pb2_grpc import UserServiceServicer

class UserServiceImpl(UserServiceServicer):
    def __init__(self, db_session=None):
        self.db = db_session or {}

    def GetUser(self, request, context):
        user = self.db.get(request.id)
        if not user:
            context.set_code(grpc.StatusCode.NOT_FOUND)
            context.set_details(f"User {request.id} not found")
            return User()
        return User(id=user["id"], name=user["name"], email=user["email"])

    def CreateUser(self, request, context):
        user_id = len(self.db) + 1
        self.db[user_id] = {"id": user_id, "name": request.name, "email": request.email}
        return User(id=user_id, name=request.name, email=request.email)

    def ListUsers(self, request, context):
        for user in list(self.db.values())[:request.limit]:
            yield User(**user)
```

### Test Fixtures (conftest.py)

```python
# tests/conftest.py
import pytest
from src.services.user_service import UserServiceImpl
from src.protos.user_pb2_grpc import (
    add_UserServiceServicer_to_server,
    UserServiceStub,
)

@pytest.fixture(scope="module")
def grpc_add_to_server():
    return add_UserServiceServicer_to_server

@pytest.fixture(scope="module")
def grpc_servicer():
    return UserServiceImpl()

@pytest.fixture(scope="module")
def grpc_stub_cls(grpc_channel):
    return UserServiceStub
```

### Tests

```python
# tests/test_user_service.py
import grpc
import pytest
from src.protos.user_pb2 import GetUserRequest, CreateUserRequest, ListUsersRequest

def test_create_user(grpc_stub):
    req = CreateUserRequest(name="Alice", email="alice@example.com")
    user = grpc_stub.CreateUser(req)
    assert user.id > 0
    assert user.name == "Alice"
    assert user.email == "alice@example.com"

def test_get_user(grpc_stub):
    # Create first
    created = grpc_stub.CreateUser(CreateUserRequest(name="Bob", email="bob@example.com"))
    # Then fetch
    fetched = grpc_stub.GetUser(GetUserRequest(id=created.id))
    assert fetched.name == "Bob"

def test_get_user_not_found(grpc_stub):
    with pytest.raises(grpc.RpcError) as exc_info:
        grpc_stub.GetUser(GetUserRequest(id=99999))
    assert exc_info.value.code() == grpc.StatusCode.NOT_FOUND

def test_list_users_streaming(grpc_stub):
    for i in range(3):
        grpc_stub.CreateUser(CreateUserRequest(name=f"User{i}", email=f"u{i}@example.com"))
    users = list(grpc_stub.ListUsers(ListUsersRequest(limit=3)))
    assert len(users) == 3
```

```bash
# Run with fake server (no network, direct call):
pytest tests/ --grpc-fake-server

# Run with real gRPC server in a thread:
pytest tests/
```

---

## grpc_testing Module (Official, Low-Level)

Use when you need precise control over message timing or want to test client-side logic without a real server.

```python
# Testing the SERVER side (servicer logic)
import grpc_testing
from src.protos import user_pb2
from src.protos.user_pb2_grpc import add_UserServiceServicer_to_server
from src.services.user_service import UserServiceImpl

def test_get_user_via_grpc_testing():
    servicers = {
        user_pb2.DESCRIPTOR.services_by_name["UserService"]: UserServiceImpl(
            db={1: {"id": 1, "name": "Alice", "email": "alice@example.com"}}
        )
    }
    test_server = grpc_testing.server_from_dictionary(
        servicers,
        grpc_testing.strict_real_time(),
    )
    method = user_pb2.DESCRIPTOR.services_by_name["UserService"].methods_by_name["GetUser"]
    rpc = test_server.invoke_unary_unary(
        method_descriptor=method,
        invocation_metadata={},
        request=user_pb2.GetUserRequest(id=1),
        timeout=5,
    )
    response, metadata, code, details = rpc.termination()
    assert response.name == "Alice"
    assert code == grpc.StatusCode.OK
```

```python
# Testing the CLIENT side (verifying your client makes the right calls)
def test_client_calls_correct_rpc():
    test_channel = grpc_testing.channel(
        [user_pb2.DESCRIPTOR.services_by_name["UserService"]],
        grpc_testing.strict_real_time(),
    )
    # Start the client call in background
    import threading
    from myapp.clients import fetch_user
    result_holder = {}
    def run_client():
        result_holder["user"] = fetch_user(test_channel, user_id=1)
    t = threading.Thread(target=run_client)
    t.start()

    # Act as the server: receive the call, send a response
    method = user_pb2.DESCRIPTOR.services_by_name["UserService"].methods_by_name["GetUser"]
    invocation, rpc = test_channel.take_unary_unary(method)
    assert invocation.request.id == 1
    rpc.terminate(
        response=user_pb2.User(id=1, name="Alice", email="alice@example.com"),
        trailing_metadata=(),
        code=grpc.StatusCode.OK,
        details="",
    )
    t.join(timeout=5)
    assert result_holder["user"]["name"] == "Alice"
```

---

## Async gRPC Testing (grpcio.aio)

```bash
pip install grpcio pytest-asyncio
```

```python
# tests/test_async_user_service.py
import pytest
import grpc
import grpc.aio
from src.protos.user_pb2 import CreateUserRequest, GetUserRequest
from src.protos.user_pb2_grpc import UserServiceStub, add_UserServiceServicer_to_server
from src.services.user_service import UserServiceImpl

@pytest.fixture(scope="module")
async def grpc_server():
    server = grpc.aio.server()
    add_UserServiceServicer_to_server(UserServiceImpl(), server)
    port = server.add_insecure_port("[::]:0")   # random port
    await server.start()
    yield f"localhost:{port}"
    await server.stop(grace=0)

@pytest.mark.asyncio
async def test_async_create_user(grpc_server):
    async with grpc.aio.insecure_channel(grpc_server) as channel:
        stub = UserServiceStub(channel)
        user = await stub.CreateUser(
            CreateUserRequest(name="Alice", email="alice@example.com")
        )
    assert user.id > 0
    assert user.name == "Alice"

@pytest.mark.asyncio
async def test_async_streaming(grpc_server):
    async with grpc.aio.insecure_channel(grpc_server) as channel:
        stub = UserServiceStub(channel)
        from src.protos.user_pb2 import ListUsersRequest
        users = []
        async for user in stub.ListUsers(ListUsersRequest(limit=10)):
            users.append(user)
    # Depends on seeded data in servicer
```

---

## Integration Test: gRPC + Real Database

```python
# tests/integration/conftest.py
import pytest
import grpc
from concurrent import futures
from testcontainers.postgres import PostgresContainer
from sqlalchemy import create_engine
from src.services.user_service import UserServiceImpl

@pytest.fixture(scope="session")
def pg():
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg

@pytest.fixture(scope="session")
def grpc_server_with_db(pg):
    engine = create_engine(pg.get_connection_url())
    servicer = UserServiceImpl(db_engine=engine)
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    add_UserServiceServicer_to_server(servicer, server)
    port = server.add_insecure_port("[::]:0")
    server.start()
    yield f"localhost:{port}"
    server.stop(grace=None)

@pytest.fixture
def user_stub(grpc_server_with_db):
    channel = grpc.insecure_channel(grpc_server_with_db)
    yield UserServiceStub(channel)
    channel.close()
```

---

## Error Handling in Tests

```python
import grpc

def test_unauthenticated_call(grpc_stub):
    with pytest.raises(grpc.RpcError) as exc:
        grpc_stub.GetUser(GetUserRequest(id=1))
    assert exc.value.code() == grpc.StatusCode.UNAUTHENTICATED

def test_deadline_exceeded(grpc_stub):
    with pytest.raises(grpc.RpcError) as exc:
        grpc_stub.GetUser(GetUserRequest(id=1), timeout=0.000001)
    assert exc.value.code() == grpc.StatusCode.DEADLINE_EXCEEDED

# Check specific error details
def test_invalid_argument(grpc_stub):
    with pytest.raises(grpc.RpcError) as exc:
        grpc_stub.GetUser(GetUserRequest(id=-1))
    error = exc.value
    assert error.code() == grpc.StatusCode.INVALID_ARGUMENT
    assert "id must be positive" in error.details()
```

---

## Required Dependencies

```toml
# pyproject.toml
[project.optional-dependencies]
test = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
    "pytest-grpc>=0.8",
    "grpcio>=1.60",
    "grpcio-tools>=1.60",
    "grpcio-testing>=1.60",
]
```
