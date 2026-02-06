---
name: openapi
description: |
  OpenAPI/Swagger specification. Covers schema definition, paths,
  and documentation. Use for API documentation.

  USE WHEN: user mentions "OpenAPI", "Swagger", "API spec", "API documentation",
  "schema definition", "OpenAPI 3.0", "Swagger UI", asks about "how to write OpenAPI spec",
  "document REST API", "API contract", "schema validation"

  DO NOT USE FOR: GraphQL schemas - use `graphql` instead; tRPC - use `trpc` instead;
  Generating clients from OpenAPI - use `openapi-codegen` instead;
  Spring Boot OpenAPI - use `springdoc-openapi` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# OpenAPI Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `openapi` for comprehensive documentation.

## Basic Structure

```yaml
openapi: 3.1.0
info:
  title: User API
  version: 1.0.0
  description: API for managing users

servers:
  - url: https://api.example.com/v1

paths:
  /users:
    get:
      summary: List users
      operationId: listUsers
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
      responses:
        '200':
          description: List of users
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/User'
    post:
      summary: Create user
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUser'
      responses:
        '201':
          description: User created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'

  /users/{id}:
    get:
      summary: Get user by ID
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: User found
        '404':
          description: User not found

components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        email:
          type: string
          format: email
      required: [id, name, email]

    CreateUser:
      type: object
      properties:
        name:
          type: string
        email:
          type: string
          format: email
      required: [name, email]

  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

security:
  - bearerAuth: []
```

## Schema Types

```yaml
# String with validation
type: string
minLength: 1
maxLength: 100
pattern: '^[a-zA-Z]+$'
format: email | date | date-time | uri | uuid

# Number
type: integer
minimum: 0
maximum: 100

# Enum
type: string
enum: [active, inactive, pending]

# Array
type: array
items:
  type: string
minItems: 1
maxItems: 10

# Object
type: object
additionalProperties: false
```

## When NOT to Use This Skill

- GraphQL API documentation (use `graphql` skill)
- tRPC type-safe APIs (use `trpc` skill)
- Generating API clients (use `openapi-codegen` skill)
- Spring Boot API documentation (use `springdoc-openapi` skill)
- Code-first API development (consider using annotations/decorators)

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Missing response schemas | No type safety, poor docs | Define schemas for all responses |
| No examples in schemas | Hard to understand API | Add `example` or `examples` to all schemas |
| Using only `object` without properties | Loses type information | Define explicit properties with types |
| Not defining error responses | Incomplete API contract | Document 4xx and 5xx responses |
| Hardcoding server URLs | Environment-specific config in spec | Use server variables or multiple servers |
| Missing `required` fields | Ambiguous API contract | Mark all required fields explicitly |
| Duplicate schema definitions | Maintenance nightmare | Use `$ref` and components |
| No security schemes defined | Unclear authentication | Define security schemes in components |
| Missing `operationId` | Poor code generation | Add unique operationId to each endpoint |
| Using `additionalProperties: true` everywhere | Loses validation benefits | Set to `false` unless needed |

## Quick Troubleshooting

| Issue | Possible Cause | Solution |
|-------|----------------|----------|
| Validation errors in spec | Invalid YAML/JSON syntax | Use `@redocly/cli lint` or Swagger Editor |
| Code generation fails | Missing operationId or invalid refs | Add operationIds, verify all $refs resolve |
| Swagger UI not loading | CORS or invalid spec | Check browser console, validate spec |
| Type errors in generated code | Schema mismatch with implementation | Ensure schemas match actual API responses |
| Missing fields in generated types | Schema not defining all properties | Add all properties to schema definition |
| Circular reference errors | Self-referencing schemas | Use `allOf` or refactor schema structure |
| Example validation fails | Example doesn't match schema | Ensure examples conform to schema constraints |
| Missing auth in Swagger UI | Security not configured | Add securitySchemes and security requirements |

## Production Readiness

### Complete Error Responses

```yaml
components:
  schemas:
    Error:
      type: object
      properties:
        code:
          type: string
          example: 'NOT_FOUND'
        message:
          type: string
          example: 'User not found'
        details:
          type: array
          items:
            type: object
            properties:
              field:
                type: string
              message:
                type: string
      required: [code, message]

  responses:
    BadRequest:
      description: Invalid request
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          example:
            code: 'VALIDATION_ERROR'
            message: 'Invalid input'
            details:
              - field: 'email'
                message: 'Invalid email format'

    Unauthorized:
      description: Authentication required
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'

    NotFound:
      description: Resource not found
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'

    RateLimited:
      description: Too many requests
      headers:
        X-RateLimit-Limit:
          schema:
            type: integer
        X-RateLimit-Remaining:
          schema:
            type: integer
        X-RateLimit-Reset:
          schema:
            type: integer
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'

paths:
  /users:
    post:
      responses:
        '201':
          description: Created
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '429':
          $ref: '#/components/responses/RateLimited'
```

### Pagination

```yaml
components:
  schemas:
    PaginatedResponse:
      type: object
      properties:
        data:
          type: array
          items: {}
        pagination:
          type: object
          properties:
            page:
              type: integer
            limit:
              type: integer
            total:
              type: integer
            totalPages:
              type: integer

  parameters:
    PageParam:
      name: page
      in: query
      schema:
        type: integer
        minimum: 1
        default: 1
    LimitParam:
      name: limit
      in: query
      schema:
        type: integer
        minimum: 1
        maximum: 100
        default: 20

paths:
  /users:
    get:
      parameters:
        - $ref: '#/components/parameters/PageParam'
        - $ref: '#/components/parameters/LimitParam'
      responses:
        '200':
          content:
            application/json:
              schema:
                allOf:
                  - $ref: '#/components/schemas/PaginatedResponse'
                  - type: object
                    properties:
                      data:
                        items:
                          $ref: '#/components/schemas/User'
```

### Code Generation

```bash
# Generate TypeScript types
npx openapi-typescript ./openapi.yaml -o ./src/types/api.ts

# Generate client SDK
npx @openapitools/openapi-generator-cli generate \
  -i openapi.yaml \
  -g typescript-fetch \
  -o ./src/api-client

# Validate spec
npx @redocly/cli lint openapi.yaml
```

```typescript
// Generated type usage
import type { paths, components } from './types/api';

type User = components['schemas']['User'];
type CreateUserRequest = paths['/users']['post']['requestBody']['content']['application/json'];
type UserListResponse = paths['/users']['get']['responses']['200']['content']['application/json'];
```

### Testing

```typescript
// Contract testing with OpenAPI
import SwaggerParser from '@apidevtools/swagger-parser';
import { expect, test } from 'vitest';

test('OpenAPI spec is valid', async () => {
  const api = await SwaggerParser.validate('./openapi.yaml');
  expect(api.info.title).toBeDefined();
});

// API response validation
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ strict: false });
addFormats(ajv);

test('GET /users returns valid response', async () => {
  const response = await fetch('/api/users');
  const data = await response.json();

  const validate = ajv.compile(userListSchema);
  expect(validate(data)).toBe(true);
});
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Spec validation errors | 0 |
| Breaking changes | 0 (semver) |
| Documentation coverage | 100% |
| Example coverage | > 80% |

### Checklist

- [ ] Standard error response schema
- [ ] Pagination parameters defined
- [ ] All responses documented
- [ ] Security schemes defined
- [ ] Request/response examples
- [ ] Reusable components
- [ ] Code generation configured
- [ ] Spec validation in CI
- [ ] Contract tests
- [ ] Versioning strategy

## Frontend Integration

OpenAPI specs can be consumed by frontend applications to generate type-safe clients.

### Workflow

```
OpenAPI Spec → Code Generation → Type-Safe Client → Frontend App
```

### Related Skills

| Skill | Purpose |
|-------|---------|
| [HTTP Clients](../../api-integration/http-clients/SKILL.md) | Axios, Fetch, ky, ofetch patterns |
| [OpenAPI Codegen](../../api-integration/openapi-codegen/SKILL.md) | Generate clients from specs |
| [Type-Safe API](../../api-integration/type-safe-api/SKILL.md) | End-to-end type safety |

### Quick Client Generation

```bash
# Generate TypeScript types only
npx openapi-typescript ./openapi.yaml -o ./src/types/api.ts

# Generate full client
npx @openapitools/openapi-generator-cli generate \
  -i openapi.yaml \
  -g typescript-fetch \
  -o ./src/api-client

# swagger-typescript-api (simpler)
npx swagger-typescript-api -p ./openapi.yaml -o ./src/api --axios
```

### Type Usage in Frontend

```typescript
import type { paths, components } from './types/api';
import { createApiClient } from './api-client';

// Type-safe request/response
type User = components['schemas']['User'];
type CreateUserBody = paths['/users']['post']['requestBody']['content']['application/json'];
type UsersResponse = paths['/users']['get']['responses']['200']['content']['application/json'];

// With generated client
const api = createApiClient({ baseUrl: '/api' });
const users = await api.users.list(); // Fully typed
```

## Reference Documentation
- [Parameters](quick-ref/parameters.md)
- [Security](quick-ref/security.md)
- [Frontend Integration](quick-ref/frontend-integration.md)
