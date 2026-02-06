---
name: api-versioning
description: |
  API versioning strategies for frontend-backend compatibility.
  Covers URL versioning, header versioning, and migration patterns.

  USE WHEN: user asks about "API versioning", "v1 v2 API", "API migration", "breaking changes", "backward compatibility"

  DO NOT USE FOR: schema versioning - use database skills, feature flags - use deployment skills
allowed-tools: Read, Grep, Glob, Bash
---
# API Versioning - Quick Reference

## When NOT to Use This Skill
- **Database schema versioning** - Use migration skills
- **Feature flags** - Use deployment skills
- **Contract validation** - Use `openapi-contract` skill

## Versioning Strategies

| Strategy | Example | Pros | Cons |
|----------|---------|------|------|
| URL Path | `/api/v1/users` | Clear, cacheable | URL changes |
| Query Param | `/api/users?version=1` | Easy to implement | Not RESTful |
| Header | `Accept: application/vnd.api.v1+json` | Clean URLs | Less visible |
| Content Negotiation | `Accept: application/json; version=1` | Flexible | Complex |

### Recommendation: URL Path Versioning

Most common, easiest to understand, best tooling support.

## URL Path Versioning

### Backend Implementation (NestJS)

```typescript
// Version 1 controller
@Controller('api/v1/users')
export class UsersControllerV1 {
  @Get()
  findAll(): UserV1[] {
    return this.usersService.findAllV1();
  }
}

// Version 2 controller
@Controller('api/v2/users')
export class UsersControllerV2 {
  @Get()
  findAll(): UserV2[] {
    return this.usersService.findAllV2();
  }
}

// Or using NestJS built-in versioning
@Controller('users')
@Version('1')
export class UsersControllerV1 { ... }

@Controller('users')
@Version('2')
export class UsersControllerV2 { ... }
```

### Backend Implementation (Spring Boot)

```java
// Version 1 controller
@RestController
@RequestMapping("/api/v1/users")
public class UserControllerV1 {
    @GetMapping
    public List<UserDtoV1> getUsers() {
        return userService.getUsersV1();
    }
}

// Version 2 controller
@RestController
@RequestMapping("/api/v2/users")
public class UserControllerV2 {
    @GetMapping
    public List<UserDtoV2> getUsers() {
        return userService.getUsersV2();
    }
}
```

### Frontend Configuration

```typescript
// api/config.ts
const API_VERSION = process.env.NEXT_PUBLIC_API_VERSION || 'v1';

export const API_BASE_URL = `/api/${API_VERSION}`;

// api/client.ts
import createClient from 'openapi-fetch';
import type { paths } from './types';

const client = createClient<paths>({
  baseUrl: API_BASE_URL,
});

// Usage
const users = await client.GET('/users');  // Calls /api/v1/users
```

## Header Versioning

### Backend Implementation

```typescript
// NestJS with header versioning
app.enableVersioning({
  type: VersioningType.HEADER,
  header: 'X-API-Version',
});

@Controller('users')
@Version('1')
export class UsersControllerV1 { ... }
```

### Frontend Implementation

```typescript
const api = axios.create({
  baseURL: '/api',
  headers: {
    'X-API-Version': '1',
  },
});

// Or per-request
const response = await fetch('/api/users', {
  headers: {
    'X-API-Version': '2',
  },
});
```

## Version Coexistence

### OpenAPI Spec per Version

```yaml
# openapi-v1.yaml
openapi: 3.0.3
info:
  title: My API
  version: 1.0.0
servers:
  - url: /api/v1

paths:
  /users:
    get:
      responses:
        200:
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/UserV1'

components:
  schemas:
    UserV1:
      type: object
      properties:
        id:
          type: integer
        name:
          type: string
        email:
          type: string
```

```yaml
# openapi-v2.yaml
openapi: 3.0.3
info:
  title: My API
  version: 2.0.0
servers:
  - url: /api/v2

paths:
  /users:
    get:
      responses:
        200:
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/UserV2'

components:
  schemas:
    UserV2:
      type: object
      properties:
        id:
          type: string  # Changed to string!
        firstName:      # Split from name
          type: string
        lastName:       # Split from name
          type: string
        email:
          type: string
        createdAt:      # New field
          type: string
          format: date-time
```

### Generate Types for Both

```bash
# Generate v1 types
npx openapi-typescript openapi-v1.yaml -o src/api/v1/types.ts

# Generate v2 types
npx openapi-typescript openapi-v2.yaml -o src/api/v2/types.ts
```

### Frontend Version Support

```typescript
// api/v1/client.ts
import createClient from 'openapi-fetch';
import type { paths } from './types';

export const clientV1 = createClient<paths>({
  baseUrl: '/api/v1',
});

// api/v2/client.ts
import createClient from 'openapi-fetch';
import type { paths } from './types';

export const clientV2 = createClient<paths>({
  baseUrl: '/api/v2',
});

// Use the appropriate version
import { clientV1 } from './api/v1/client';
import { clientV2 } from './api/v2/client';

// Migrating gradually
const users = await clientV2.GET('/users');  // Use v2 for users
const orders = await clientV1.GET('/orders'); // Still on v1 for orders
```

## Migration Patterns

### Adapter Pattern

```typescript
// Adapt v1 response to v2 format
function adaptUserV1toV2(userV1: UserV1): UserV2 {
  const [firstName, ...lastParts] = userV1.name.split(' ');
  return {
    id: String(userV1.id),  // Convert number to string
    firstName,
    lastName: lastParts.join(' '),
    email: userV1.email,
    createdAt: new Date().toISOString(),  // Default value
  };
}

// Use during migration
async function getUsers(): Promise<UserV2[]> {
  if (USE_V2_API) {
    const { data } = await clientV2.GET('/users');
    return data;
  } else {
    const { data } = await clientV1.GET('/users');
    return data.map(adaptUserV1toV2);
  }
}
```

### Feature Flag Migration

```typescript
// Gradual rollout with feature flag
async function getUsers(): Promise<User[]> {
  const useV2 = await featureFlags.isEnabled('api-v2-users');

  if (useV2) {
    return fetchUsersV2();
  }
  return fetchUsersV1();
}
```

### Backend Deprecation Headers

```typescript
// NestJS - Add deprecation warning
@Controller('api/v1/users')
@Header('Deprecation', 'true')
@Header('Sunset', 'Sat, 01 Jan 2025 00:00:00 GMT')
@Header('Link', '</api/v2/users>; rel="successor-version"')
export class UsersControllerV1 { ... }
```

### Frontend Deprecation Handling

```typescript
axios.interceptors.response.use((response) => {
  if (response.headers['deprecation'] === 'true') {
    const sunset = response.headers['sunset'];
    console.warn(
      `API endpoint ${response.config.url} is deprecated. ` +
      `Will be removed on ${sunset}`
    );
    // Track in analytics
    analytics.track('deprecated_api_used', {
      endpoint: response.config.url,
      sunset,
    });
  }
  return response;
});
```

## Breaking vs Non-Breaking Changes

### Non-Breaking (Safe)

| Change | Example | Action |
|--------|---------|--------|
| Add optional field | `createdAt?: string` | No version bump |
| Add new endpoint | `GET /users/search` | No version bump |
| Add optional param | `?include=profile` | No version bump |
| Widen response type | `id: number \| string` | No version bump |

### Breaking (Requires New Version)

| Change | Example | Action |
|--------|---------|--------|
| Remove field | Remove `name` | New version |
| Rename field | `name` → `fullName` | New version |
| Change type | `id: number` → `id: string` | New version |
| Change URL | `/users` → `/members` | New version |
| Add required field | `role: string` (required) | New version |

## Validation Checklist

### Per-Endpoint Check

| Check | V1 | V2 | Frontend Uses | Status |
|-------|----|----|---------------|--------|
| Base URL | /api/v1 | /api/v2 | /api/v1 | OK |
| User.id type | number | string | number | MISMATCH |
| User.name | present | split | uses name | MISMATCH |
| Response structure | same | same | OK | OK |

### Migration Readiness

```markdown
## Migration Readiness Report

### Endpoints Using V1
- GET /api/v1/users (10 components)
- POST /api/v1/users (3 components)
- GET /api/v1/orders (5 components)

### Breaking Changes in V2
1. User.id: number → string
   - Affected: UserCard, UserList, UserProfile
   - Action: Update type definitions

2. User.name → User.firstName + User.lastName
   - Affected: UserCard, UserForm
   - Action: Update display logic

### Migration Plan
1. [ ] Generate V2 types
2. [ ] Create adapter functions
3. [ ] Update components gradually
4. [ ] Switch API client to V2
5. [ ] Remove V1 code
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Breaking changes without version | Breaks clients | Create new version |
| Mixing v1/v2 in same client | Confusion | Separate clients per version |
| No deprecation notice | Surprise breakage | Add sunset headers |
| Removing old version immediately | Breaks clients | Sunset period |
| Version in domain name | Hard to manage | Use URL path |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Wrong response format | Using wrong version | Check API_VERSION config |
| 404 on new endpoint | Still using old version | Update base URL |
| Type errors | Types don't match version | Regenerate types |
| Deprecation warnings | Using old version | Plan migration |
| Mixed responses | Inconsistent version use | Audit all API calls |

## Related Skills
- [OpenAPI Contract](../openapi-contract/SKILL.md)
- [Type Generation](../type-generation/SKILL.md)
- [Error Contract](../error-contract/SKILL.md)
