---
name: openapi-contract
description: |
  OpenAPI contract validation between frontend and backend.
  Covers type sync, endpoint validation, and contract-first development.

  USE WHEN: user asks about "OpenAPI validation", "API contract", "swagger sync", "frontend backend types", "API mismatch", "contract testing"

  DO NOT USE FOR: GraphQL - use `graphql-contract` skill, authentication - use `auth-flow-validation` skill
allowed-tools: Read, Grep, Glob, Bash
---
# OpenAPI Contract Validation - Quick Reference

## When NOT to Use This Skill
- **GraphQL APIs** - Use `graphql-contract` skill
- **Authentication flows** - Use `auth-flow-validation` skill
- **API versioning strategy** - Use `api-versioning` skill
- **Type generation setup** - Use `type-generation` skill

> **Deep Knowledge**: Use `mcp__api-explorer__get_api_endpoint_details` for specific endpoint validation.

## Contract Validation Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CONTRACT VALIDATION                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Frontend Code          OpenAPI Spec           Backend      │
│   ┌──────────────┐      ┌────────────┐     ┌──────────────┐ │
│   │ fetch('/api/ │ ←──→ │ paths:     │ ←──→│ @Controller  │ │
│   │   users')    │      │  /users:   │     │ @GetMapping  │ │
│   │              │      │    get:    │     │              │ │
│   │ type User {  │ ←──→ │ schemas:   │ ←──→│ class UserDto│ │
│   │   id: number │      │  User:     │     │   Long id    │ │
│   │ }            │      │    id:int  │     │              │ │
│   └──────────────┘      └────────────┘     └──────────────┘ │
│                                                              │
│        MUST MATCH          SOURCE OF           MUST MATCH   │
│                            TRUTH                             │
└─────────────────────────────────────────────────────────────┘
```

## Common Discrepancy Types

### 1. Path Mismatch

```yaml
# OpenAPI Spec
paths:
  /users/{userId}:     # Backend path
    get: ...

# Frontend Code
fetch('/api/users/${id}')  # Frontend uses different path!
```

**Detection:**
```bash
# Find API calls in frontend
grep -r "fetch\|axios\|http\." src/

# Compare with OpenAPI paths
# Use api-explorer to list paths
```

**Fix:** Update frontend to use correct path or configure base URL.

### 2. Type Mismatch

```yaml
# OpenAPI Spec
components:
  schemas:
    User:
      properties:
        age:
          type: string    # Backend uses string

# Frontend Code
interface User {
  age: number;            # Frontend expects number!
}
```

**Detection:**
```typescript
// Frontend type
interface CreateUserDto {
  age: number;  // MISMATCH
}

// Should be
interface CreateUserDto {
  age: string;  // Match OpenAPI spec
}
```

### 3. Required Field Missing

```yaml
# OpenAPI Spec
components:
  schemas:
    CreateUserRequest:
      required:
        - email
        - name
        - role          # Required!
      properties:
        email: { type: string }
        name: { type: string }
        role: { type: string }

# Frontend Code
const payload = {
  email: user.email,
  name: user.name,
  // role is missing!  <-- Will fail validation
};
```

### 4. Response Structure Mismatch

```yaml
# OpenAPI Spec - Paginated response
paths:
  /users:
    get:
      responses:
        200:
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/User'
                  meta:
                    $ref: '#/components/schemas/PaginationMeta'

# Frontend Code - Expects array directly
const users: User[] = await response.json();  // WRONG!
// Should be
const { data, meta } = await response.json();
const users: User[] = data;
```

## Validation Checklist

### Per-Endpoint Validation

| Check | Frontend | Backend (OpenAPI) | Status |
|-------|----------|-------------------|--------|
| Path | `/api/users` | `/users` | MISMATCH |
| Method | POST | POST | OK |
| Content-Type | application/json | application/json | OK |
| Request Body | matches schema | CreateUserRequest | CHECK |
| Response Type | matches schema | User | CHECK |
| Status Codes | handles 400, 401 | 200, 400, 401, 500 | PARTIAL |

### Request Body Validation

```typescript
// OpenAPI Schema
interface CreateUserRequest {
  email: string;      // required
  name: string;       // required
  age?: number;       // optional
  role: UserRole;     // required, enum
}

// Validate frontend matches
interface FrontendPayload {
  email: string;      // OK - required
  name: string;       // OK - required
  age?: number;       // OK - optional
  role: 'admin' | 'user';  // CHECK - enum values match?
}
```

### Response Handling Validation

```typescript
// OpenAPI Response
interface ApiResponse<T> {
  data: T;
  meta?: {
    page: number;
    total: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

// Frontend should handle all cases
async function fetchUsers(): Promise<User[]> {
  const response = await fetch('/api/users');

  if (!response.ok) {
    const error = await response.json();
    throw new ApiError(error.error.code, error.error.message);
  }

  const result: ApiResponse<User[]> = await response.json();
  return result.data;
}
```

## Contract-First Development

### 1. Define OpenAPI Spec First

```yaml
# openapi.yaml
openapi: 3.0.3
info:
  title: User API
  version: 1.0.0

paths:
  /users:
    post:
      operationId: createUser
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUserRequest'
      responses:
        '201':
          description: User created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'

components:
  schemas:
    CreateUserRequest:
      type: object
      required: [email, name]
      properties:
        email:
          type: string
          format: email
        name:
          type: string
          minLength: 2
          maxLength: 100

    User:
      type: object
      properties:
        id:
          type: string
          format: uuid
        email:
          type: string
        name:
          type: string
        createdAt:
          type: string
          format: date-time
```

### 2. Generate Types for Both Ends

```bash
# Frontend (TypeScript)
npx openapi-typescript openapi.yaml -o src/api/types.ts

# Backend (Java/Spring)
npx @openapitools/openapi-generator-cli generate \
  -i openapi.yaml \
  -g spring \
  -o generated/
```

### 3. Implement Against Generated Types

```typescript
// Frontend - uses generated types
import type { CreateUserRequest, User } from './api/types';

async function createUser(data: CreateUserRequest): Promise<User> {
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return response.json();
}
```

```java
// Backend - uses generated DTOs
@PostMapping("/users")
public ResponseEntity<User> createUser(
    @Valid @RequestBody CreateUserRequest request) {
    // Implementation uses generated types
}
```

## MCP api-explorer Usage

### Efficient Validation Queries

```typescript
// 1. Search for endpoint
await mcp__api_explorer__search_api({
  query: "users",
  searchIn: ["paths"],
  limit: 10
});

// 2. Get specific endpoint details
await mcp__api_explorer__get_api_endpoint_details({
  path: "/users",
  method: "POST"
});

// 3. Get request/response schemas
await mcp__api_explorer__get_api_models({
  model: "CreateUserRequest",
  compact: true
});
```

### Avoid Token Waste

```typescript
// DON'T - Loads entire spec
await mcp__api_explorer__get_api_schema({ format: "full" });

// DO - Query specific endpoints
await mcp__api_explorer__get_api_endpoint_details({
  path: "/users/{id}",
  method: "GET"
});
```

## Automated Contract Testing

### Prism (Mock Server)

```bash
# Start mock server from OpenAPI spec
npx @stoplight/prism-cli mock openapi.yaml

# Run frontend tests against mock
npm test -- --api-url=http://localhost:4010
```

### Schemathesis (API Fuzzing)

```bash
# Test backend against OpenAPI spec
schemathesis run openapi.yaml --base-url=http://localhost:8080

# Validate all endpoints
schemathesis run openapi.yaml \
  --checks all \
  --validate-schema
```

### Dredd (Contract Testing)

```bash
# Test implementation matches spec
dredd openapi.yaml http://localhost:8080
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Contract Validation
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate OpenAPI spec
        run: npx @redocly/cli lint openapi.yaml

      - name: Generate types
        run: npx openapi-typescript openapi.yaml -o src/api/types.ts

      - name: Check types unchanged
        run: git diff --exit-code src/api/types.ts

      - name: Run contract tests
        run: npm run test:contract
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Manual type sync | Drift over time | Generate from spec |
| Ignoring OpenAPI spec | No source of truth | Contract-first development |
| Hardcoded URLs | Environment issues | Configure base URL |
| No validation in CI | Breaks discovered late | Automated contract tests |
| Any types for API | No type safety | Generate proper types |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Types out of sync | Manual updates | Regenerate from spec |
| 404 errors | Path mismatch | Check OpenAPI paths |
| 400 Bad Request | Missing required field | Validate against schema |
| Unexpected response | Response structure changed | Update frontend types |
| CORS errors | Backend config | Check allowed origins |

## Related Skills
- [Type Generation](../type-generation/SKILL.md)
- [Auth Flow Validation](../auth-flow-validation/SKILL.md)
- [API Versioning](../api-versioning/SKILL.md)
- [Error Contract](../error-contract/SKILL.md)
