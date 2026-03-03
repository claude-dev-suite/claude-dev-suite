# HTTP Testing with api-tester MCP

> **Knowledge Base:** Read `knowledge/api-testing/http-verification.md` for complete documentation.

## http_request

Single HTTP request with full control over method, headers, and body.

```
mcp__api-tester__http_request(
  method="POST",
  url="http://localhost:8080/api/users",
  headers={"Authorization": "Bearer eyJ...", "Content-Type": "application/json"},
  body={"name": "smoke-test-user", "email": "smoke-test@example.com"}
)
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `method` | Yes | GET, POST, PUT, PATCH, DELETE |
| `url` | Yes | Full URL with protocol and port |
| `headers` | No | Object of header key-value pairs |
| `body` | No | Request body (auto-serialized to JSON) |
| `timeout` | No | Request timeout in ms (default: 30000) |

## health_check

Poll an endpoint until it returns 200, with configurable retry logic.

```
mcp__api-tester__health_check(
  url="http://localhost:8080/actuator/health",
  interval=3000,
  maxRetries=20
)
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `url` | Yes | Health endpoint URL |
| `interval` | No | Ms between retries (default: 3000) |
| `maxRetries` | No | Max attempts before failure (default: 10) |

## batch_request

Execute multiple requests sequentially, useful for CRUD flow verification.

```
mcp__api-tester__batch_request(
  requests=[
    {"method": "POST", "url": "http://localhost:8080/api/users", "body": {"name": "smoke-test-user"}},
    {"method": "GET", "url": "http://localhost:8080/api/users/1"},
    {"method": "PUT", "url": "http://localhost:8080/api/users/1", "body": {"name": "updated"}},
    {"method": "DELETE", "url": "http://localhost:8080/api/users/1"}
  ]
)
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `requests` | Yes | Array of request objects (same schema as http_request) |

## Common Patterns

### Auth + Protected Endpoint

```
# Step 1: Login
mcp__api-tester__http_request(
  method="POST",
  url="http://localhost:8080/api/auth/login",
  body={"email": "test@test.com", "password": "password"}
)
→ Extract token from response

# Step 2: Authenticated request
mcp__api-tester__http_request(
  method="GET",
  url="http://localhost:8080/api/users",
  headers={"Authorization": "Bearer {token}"}
)
```

### Negative Test (401 Expected)

```
mcp__api-tester__http_request(
  method="GET",
  url="http://localhost:8080/api/users"
  # No Authorization header → expect 401
)
```

### Negative Test (404 Expected)

```
mcp__api-tester__http_request(
  method="GET",
  url="http://localhost:8080/api/users/999999",
  headers={"Authorization": "Bearer {token}"}
  # Non-existent ID → expect 404
)
```

**Official docs:** https://github.com/claude-dev-suite/dev-suite
