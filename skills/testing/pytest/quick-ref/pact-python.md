# Pact Python: Consumer-Driven Contract Testing

## Concept

```
Consumer (e.g., frontend, downstream service)
  → defines expected HTTP interactions
  → generates a pact file (JSON contract)
  → uploads to Pact Broker

Provider (e.g., API service)
  → fetches pact file from broker
  → replays interactions against real running provider
  → verifies responses match the contract
```

---

## Installation

```bash
pip install pact-python
```

pact-python v2+ wraps the Pact FFI (Rust core) and supports Pact specification V4.

---

## Consumer Test

### Minimal Example

```python
# tests/contract/test_user_consumer.py
from pathlib import Path
import pytest
from pact import Pact, match

PACT_DIR = Path(__file__).parent / "pacts"

@pytest.fixture(scope="module")
def pact() -> Pact:
    p = Pact("user-consumer", "user-provider").with_specification("V4")
    yield p
    p.write_file(PACT_DIR)          # writes user-consumer-user-provider.json

def test_get_user(pact):
    expected_body = {
        "id": match.int(123),
        "name": match.str("Alice"),
        "email": match.regex(r".+@.+\..+", "alice@example.com"),
    }

    (
        pact.upon_receiving("a request for user 123")
        .given("user 123 exists")
        .with_request("GET", "/users/123")
        .will_respond_with(200)
        .with_body(expected_body, content_type="application/json")
    )

    with pact.serve() as srv:
        from myapp.clients import UserClient
        client = UserClient(str(srv.url))
        user = client.get_user(123)

    assert user["id"] == 123
    assert user["name"] == "Alice"
```

### Full Consumer conftest.py

```python
# tests/contract/conftest.py
import pytest
import pact_ffi
from pathlib import Path
from pact import Pact

PACT_DIR = Path(__file__).parent / "pacts"

@pytest.fixture(autouse=True, scope="session")
def pact_logging():
    pact_ffi.log_to_stderr("WARN")    # or "INFO", "DEBUG"

@pytest.fixture(scope="module")
def pact(request):
    """One Pact object per consumer/provider pair per test module."""
    consumer = request.param.get("consumer", "my-consumer")
    provider = request.param.get("provider", "my-provider")
    p = Pact(consumer, provider).with_specification("V4")
    yield p
    p.write_file(PACT_DIR)

# Or a simpler dedicated fixture per integration:
@pytest.fixture(scope="module")
def user_pact():
    p = Pact("frontend", "user-service").with_specification("V4")
    yield p
    p.write_file(PACT_DIR)
```

### Pattern Matchers Reference

```python
from pact import match, generate

# Type matchers (value used as example only, type is asserted)
match.int(42)                           # any integer
match.float(3.14)                       # any float
match.str("hello")                      # any string
match.bool(True)                        # any boolean

# Format matchers
match.datetime()                        # ISO 8601 datetime
match.date()                            # ISO 8601 date
match.time()                            # ISO 8601 time
match.uuid("550e8400-e29b-41d4-a716-446655440000")
match.regex(r"\d{4}-\d{2}-\d{2}", "2024-01-15")

# Collection matchers
match.each_like({"id": match.int(1), "name": match.str("a")})  # array where each element matches
match.at_least_like({"id": match.int(1)}, minimum=2)           # array with at least 2 items

# Data generators (for test data, not assertions)
generate.int(min=1, max=999999)
generate.uuid()
generate.datetime("%Y-%m-%dT%H:%M:%SZ")
generate.str(size=10)
```

### Multiple Interactions in One Test Module

```python
def test_get_user_not_found(pact):
    (
        pact.upon_receiving("a request for non-existent user")
        .given("user 999 does not exist")
        .with_request("GET", "/users/999")
        .will_respond_with(404)
        .with_body({"error": match.str("Not found")})
    )
    with pact.serve() as srv:
        client = UserClient(str(srv.url))
        with pytest.raises(UserNotFoundError):
            client.get_user(999)

def test_create_user(pact):
    request_body = {"name": "Bob", "email": "bob@example.com"}
    (
        pact.upon_receiving("a request to create a user")
        .given("no user with email bob@example.com exists")
        .with_request("POST", "/users")
        .with_body(request_body, content_type="application/json")
        .will_respond_with(201)
        .with_body({"id": match.int(1), **request_body})
    )
    with pact.serve() as srv:
        client = UserClient(str(srv.url))
        user = client.create_user("Bob", "bob@example.com")
    assert user["email"] == "bob@example.com"
```

---

## Provider Verification

### Minimal Verifier

```python
# tests/contract/test_user_provider.py
import pytest
from pact import Verifier

# Assumes your FastAPI/Flask/Django app is running on :8000
# (e.g., via conftest.py fixture that starts the app in a thread)

def test_verify_user_contracts():
    verifier = (
        Verifier("user-service")
        .add_source("./tests/contract/pacts/")   # local pact files
        .add_transport(url="http://localhost:8000")
    )
    verifier.verify()                             # raises on failure
```

### With Provider States

Provider states tell the verifier how to seed the database before each interaction.

```python
# tests/contract/test_user_provider.py
from pact import Verifier

def setup_state(action: str, parameters: dict):
    """Called before/after each interaction."""
    if action == "setup":
        state = parameters.get("state_name", "")
        if state == "user 123 exists":
            db.users.insert({"id": 123, "name": "Alice", "email": "alice@example.com"})
        elif state == "user 999 does not exist":
            db.users.delete_where(id=999)
    elif action == "teardown":
        db.users.truncate()

def test_verify_contracts():
    verifier = (
        Verifier("user-service")
        .add_source("./tests/contract/pacts/")
        .add_transport(url="http://localhost:8000")
        .state_handler(setup_state, teardown=True)
    )
    verifier.verify()
```

### Broker-Based Verification

```python
import os

def test_verify_from_broker():
    verifier = (
        Verifier("user-service")
        .add_transport(url="http://localhost:8000")
        .broker_source(
            os.environ["PACT_BROKER_URL"],
            token=os.environ["PACT_BROKER_TOKEN"],
        )
        .consumer_version(branch="main")     # only verify contracts from main
        .include_pending()                   # include pacts not yet verified
    )
    verifier.set_publish_options(
        version=os.environ.get("GIT_SHA", "dev"),
        branch=os.environ.get("GIT_BRANCH", "main"),
    )
    verifier.verify()
```

---

## Pact Broker Workflow

### Publish Pacts (Consumer CI)

```bash
# After consumer tests pass, publish the generated pact files
pact-broker publish ./tests/contract/pacts \
  --consumer-app-version "$(git rev-parse HEAD)" \
  --branch "$(git rev-parse --abbrev-ref HEAD)" \
  --broker-base-url "$PACT_BROKER_BASE_URL" \
  --broker-token "$PACT_BROKER_TOKEN"
```

### Can I Deploy? (both sides)

```bash
# Before deploying consumer:
pact-broker can-i-deploy \
  --pacticipant "user-consumer" \
  --version "$(git rev-parse HEAD)" \
  --to-environment production \
  --broker-base-url "$PACT_BROKER_BASE_URL"

# Before deploying provider:
pact-broker can-i-deploy \
  --pacticipant "user-service" \
  --version "$(git rev-parse HEAD)" \
  --to-environment production \
  --broker-base-url "$PACT_BROKER_BASE_URL"
```

### Record Deployment

```bash
pact-broker record-deployment \
  --pacticipant "user-service" \
  --version "$(git rev-parse HEAD)" \
  --environment production
```

---

## GitHub Actions Integration

```yaml
# .github/workflows/contract-tests.yml
name: contract-tests

on: [push, pull_request]

jobs:
  consumer:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r requirements-test.txt
      - run: pytest tests/contract/ -m consumer
      - name: Publish pacts
        run: |
          pact-broker publish ./tests/contract/pacts \
            --consumer-app-version ${{ github.sha }} \
            --branch ${{ github.ref_name }} \
            --broker-base-url ${{ secrets.PACT_BROKER_URL }} \
            --broker-token ${{ secrets.PACT_BROKER_TOKEN }}

  provider:
    runs-on: ubuntu-latest
    needs: consumer
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_PASSWORD: test }
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -r requirements-test.txt
      - name: Start provider
        run: uvicorn myapp.main:app --port 8000 &
      - run: pytest tests/contract/ -m provider
        env:
          PACT_BROKER_URL: ${{ secrets.PACT_BROKER_URL }}
          PACT_BROKER_TOKEN: ${{ secrets.PACT_BROKER_TOKEN }}
          GIT_SHA: ${{ github.sha }}
```

---

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Testing implementation details in contract | Use type matchers, not exact values |
| One giant pact file for all consumers | One pact per consumer/provider pair |
| No provider states | Define states for all data-dependent interactions |
| Skipping `can-i-deploy` | Run it as a deployment gate |
| Sharing pacts via filesystem in mono-repo | Use a Pact Broker even if self-hosted |
| Over-specifying response schema | Assert only what the consumer actually uses |
