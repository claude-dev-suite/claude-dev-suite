---
name: dto-sync-patterns
description: |
  Patterns for synchronizing DTOs between frontend and backend.
  Covers shared types, code generation, and validation sync.

  USE WHEN: user asks about "DTO sync", "shared types", "frontend backend types", "type consistency", "API models"

  DO NOT USE FOR: type generation tools - use `type-generation` skill, validation rules - use validation skills
allowed-tools: Read, Grep, Glob, Bash
---
# DTO Sync Patterns - Quick Reference

## When NOT to Use This Skill
- **Type generation setup** - Use `type-generation` skill
- **Validation implementation** - Use language-specific validation skills
- **API contract validation** - Use `openapi-contract` skill

## Sync Strategy Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DTO SYNC STRATEGIES                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Schema-First (Recommended)                                       │
│     ┌──────────────┐                                                │
│     │ OpenAPI Spec │───→ Generate Backend DTOs                      │
│     │ (Source)     │───→ Generate Frontend Types                    │
│     └──────────────┘                                                │
│                                                                      │
│  2. Backend-First                                                    │
│     ┌──────────────┐      ┌──────────────┐                         │
│     │ Backend DTOs │───→  │ OpenAPI Spec │───→ Frontend Types      │
│     │ (Source)     │      │ (Generated)  │                         │
│     └──────────────┘      └──────────────┘                         │
│                                                                      │
│  3. Shared Package (Monorepo)                                        │
│     ┌──────────────┐                                                │
│     │ @shared/types│───→ Backend imports                            │
│     │ (TypeScript) │───→ Frontend imports                           │
│     └──────────────┘                                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Pattern 1: Schema-First

### OpenAPI as Source of Truth

```yaml
# openapi.yaml - Single source of truth
components:
  schemas:
    CreateUserRequest:
      type: object
      required:
        - email
        - name
      properties:
        email:
          type: string
          format: email
          maxLength: 255
        name:
          type: string
          minLength: 2
          maxLength: 100
        age:
          type: integer
          minimum: 0
          maximum: 150

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
        age:
          type: integer
        createdAt:
          type: string
          format: date-time
```

### Generate for Backend (Java)

```bash
# Generate Java DTOs from OpenAPI
npx @openapitools/openapi-generator-cli generate \
  -i openapi.yaml \
  -g spring \
  -o generated/java \
  --additional-properties=useJakartaEe=true
```

```java
// Generated: CreateUserRequest.java
@Generated
public class CreateUserRequest {
    @NotNull
    @Email
    @Size(max = 255)
    private String email;

    @NotNull
    @Size(min = 2, max = 100)
    private String name;

    @Min(0)
    @Max(150)
    private Integer age;

    // getters, setters...
}
```

### Generate for Frontend (TypeScript)

```bash
# Generate TypeScript types from OpenAPI
npx openapi-typescript openapi.yaml -o src/api/types.ts
```

```typescript
// Generated: types.ts
export interface components {
  schemas: {
    CreateUserRequest: {
      email: string;
      name: string;
      age?: number;
    };
    User: {
      id?: string;
      email?: string;
      name?: string;
      age?: number;
      createdAt?: string;
    };
  };
}
```

## Pattern 2: Backend-First

### Backend Generates OpenAPI

```java
// Spring Boot with springdoc-openapi
@Schema(description = "Request to create a new user")
public record CreateUserRequest(
    @Schema(description = "User email", example = "john@example.com")
    @NotNull
    @Email
    @Size(max = 255)
    String email,

    @Schema(description = "User name", example = "John Doe")
    @NotNull
    @Size(min = 2, max = 100)
    String name,

    @Schema(description = "User age", minimum = "0", maximum = "150")
    @Min(0)
    @Max(150)
    Integer age
) {}
```

```bash
# Export OpenAPI spec from running backend
curl http://localhost:8080/v3/api-docs > openapi.json

# Generate frontend types
npx openapi-typescript openapi.json -o src/api/types.ts
```

### NestJS with Swagger

```typescript
// NestJS DTO with decorators
@Schema({ description: 'Request to create a new user' })
export class CreateUserDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @Length(2, 100)
  name: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 150 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(150)
  age?: number;
}
```

```bash
# Export from NestJS
# (requires @nestjs/swagger setup)
curl http://localhost:3000/api-json > openapi.json
```

## Pattern 3: Shared Package (Monorepo)

### Project Structure

```
monorepo/
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   └── src/
│   │       ├── types/
│   │       │   ├── user.ts
│   │       │   └── index.ts
│   │       └── validation/
│   │           ├── user.ts
│   │           └── index.ts
│   ├── frontend/
│   │   └── package.json  # depends on @shared
│   └── backend/
│       └── package.json  # depends on @shared
└── package.json
```

### Shared Types

```typescript
// packages/shared/src/types/user.ts
export interface User {
  id: string;
  email: string;
  name: string;
  age?: number;
  createdAt: Date;
}

export interface CreateUserRequest {
  email: string;
  name: string;
  age?: number;
}

export interface UpdateUserRequest {
  name?: string;
  age?: number;
}

// Type guards
export function isUser(obj: unknown): obj is User {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'email' in obj
  );
}
```

### Shared Validation (Zod)

```typescript
// packages/shared/src/validation/user.ts
import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(2).max(100),
  age: z.number().int().min(0).max(150).optional(),
});

export const UpdateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  age: z.number().int().min(0).max(150).optional(),
});

// Infer types from schemas
export type CreateUserRequest = z.infer<typeof CreateUserSchema>;
export type UpdateUserRequest = z.infer<typeof UpdateUserSchema>;
```

### Frontend Usage

```typescript
// packages/frontend/src/api/users.ts
import type { User, CreateUserRequest } from '@shared/types';
import { CreateUserSchema } from '@shared/validation';

async function createUser(data: CreateUserRequest): Promise<User> {
  // Validate before sending
  const validated = CreateUserSchema.parse(data);

  const response = await fetch('/api/users', {
    method: 'POST',
    body: JSON.stringify(validated),
  });

  return response.json();
}
```

### Backend Usage (Node.js)

```typescript
// packages/backend/src/routes/users.ts
import type { CreateUserRequest } from '@shared/types';
import { CreateUserSchema } from '@shared/validation';

app.post('/api/users', async (req, res) => {
  // Same validation as frontend
  const result = CreateUserSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      details: result.error.issues,
    });
  }

  const user = await userService.create(result.data);
  res.json(user);
});
```

## Validation Sync

### Zod (TypeScript Both Ends)

```typescript
// Shared schema
const UserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
});

// Frontend: Form validation
const form = useForm({
  resolver: zodResolver(UserSchema),
});

// Backend: Request validation
app.post('/users', (req, res) => {
  const result = UserSchema.safeParse(req.body);
});
```

### class-validator (NestJS) ↔ Zod (Frontend)

```typescript
// Backend: class-validator
class CreateUserDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @Length(2, 100)
  name: string;
}

// Frontend: Equivalent Zod schema
const CreateUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(2).max(100),
});
```

### Java Bean Validation ↔ Zod (Frontend)

```java
// Backend: Jakarta validation
public record CreateUserRequest(
    @NotNull @Email @Size(max = 255) String email,
    @NotNull @Size(min = 2, max = 100) String name
) {}
```

```typescript
// Frontend: Equivalent Zod
const CreateUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(2).max(100),
});
```

## Transformation Patterns

### Request Transformation

```typescript
// Frontend form data → API request
interface FormData {
  firstName: string;
  lastName: string;
  birthDate: Date;
}

interface CreateUserRequest {
  name: string;  // Concatenated
  age: number;   // Calculated
}

function toCreateUserRequest(form: FormData): CreateUserRequest {
  const age = calculateAge(form.birthDate);
  return {
    name: `${form.firstName} ${form.lastName}`,
    age,
  };
}
```

### Response Transformation

```typescript
// API response → Frontend model
interface UserResponse {
  id: string;
  created_at: string;  // snake_case
  full_name: string;
}

interface User {
  id: string;
  createdAt: Date;     // camelCase
  fullName: string;
}

function toUser(response: UserResponse): User {
  return {
    id: response.id,
    createdAt: new Date(response.created_at),
    fullName: response.full_name,
  };
}
```

### Automatic Case Conversion

```typescript
import camelcaseKeys from 'camelcase-keys';
import snakecaseKeys from 'snakecase-keys';

// Axios interceptor
axios.interceptors.request.use((config) => {
  if (config.data) {
    config.data = snakecaseKeys(config.data, { deep: true });
  }
  return config;
});

axios.interceptors.response.use((response) => {
  if (response.data) {
    response.data = camelcaseKeys(response.data, { deep: true });
  }
  return response;
});
```

## Validation Sync Report

```markdown
## DTO Sync Validation Report

### CreateUserRequest
| Field | Backend | Frontend | Status |
|-------|---------|----------|--------|
| email | @Email @Size(max=255) | z.string().email().max(255) | OK |
| name | @Size(min=2, max=100) | z.string().min(2).max(100) | OK |
| age | @Min(0) @Max(150) | z.number().min(0).max(150) | OK |

### User Response
| Field | Backend | Frontend | Status |
|-------|---------|----------|--------|
| id | UUID | string | OK |
| createdAt | Instant | Date | OK (transformed) |
| name | String | string | OK |

### Recommendations
1. All validations are in sync
2. Date transformation handled in response interceptor
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Manual type copying | Drift over time | Generate from schema |
| Different validation rules | Inconsistent errors | Share validation logic |
| No transformation layer | Tight coupling | Add DTOs for each layer |
| Ignoring optionality | Runtime errors | Match required/optional exactly |
| snake_case/camelCase mismatch | Confusion | Auto-transform consistently |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Type mismatch | Manual sync drift | Regenerate from schema |
| Validation passes frontend, fails backend | Different rules | Align validation schemas |
| Missing required field | Optionality mismatch | Check OpenAPI required array |
| Date parsing error | String vs Date | Add transformation |
| Case mismatch | snake_case vs camelCase | Add case conversion |

## Related Skills
- [OpenAPI Contract](../openapi-contract/SKILL.md)
- [Type Generation](../type-generation/SKILL.md)
- [Error Contract](../error-contract/SKILL.md)
