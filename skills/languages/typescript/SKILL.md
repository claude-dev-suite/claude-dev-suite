---
name: typescript
description: |
  TypeScript language. Covers types, generics, and advanced patterns.
  Use when writing type-safe JavaScript code.

  USE WHEN: user mentions "typescript", "types", "generics", asks about "type safety",
  "type errors", "tsconfig", "utility types", "type guards", "branded types"

  DO NOT USE FOR: Plain JavaScript without types - use `javascript` skill instead
  DO NOT USE FOR: Node.js runtime - use `nodejs` skill instead
  DO NOT USE FOR: Framework-specific typing - use framework skills (React, Vue, etc.)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# TypeScript Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `typescript` for comprehensive documentation.

## Basic Types

```typescript
// Primitives
const str: string = 'hello';
const num: number = 42;
const bool: boolean = true;
const arr: number[] = [1, 2, 3];
const tuple: [string, number] = ['hello', 42];

// Objects
interface User {
  id: number;
  name: string;
  email?: string;  // Optional
  readonly createdAt: Date;
}

type Status = 'active' | 'inactive' | 'pending';  // Union
```

## Generics

```typescript
// Generic function
function identity<T>(arg: T): T {
  return arg;
}

// Generic interface
interface Repository<T> {
  find(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  create(data: Omit<T, 'id'>): Promise<T>;
}

// Generic constraint
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
```

## Utility Types

```typescript
Partial<T>      // All properties optional
Required<T>     // All properties required
Pick<T, K>      // Select properties
Omit<T, K>      // Remove properties
Record<K, V>    // Key-value map
Readonly<T>     // All properties readonly
ReturnType<F>   // Function return type
Parameters<F>   // Function parameters
Awaited<T>      // Unwrap Promise
```

## Advanced Patterns

```typescript
// Discriminated unions
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: Error };

// Type guards
function isUser(obj: unknown): obj is User {
  return typeof obj === 'object' && obj !== null && 'id' in obj;
}

// Mapped types
type Nullable<T> = { [K in keyof T]: T[K] | null };

// Template literals
type EventName = `on${Capitalize<string>}`;
```

## Config (tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "bundler"
  }
}
```

---

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Plain JavaScript project | `javascript` skill |
| Node.js runtime internals | `nodejs` skill |
| React-specific types | `frontend-react` skill |
| Testing type assertions | `testing-vitest` or `testing-jest` skills |
| Type generation from schema | `api-design-openapi` or framework-specific skills |

---

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using `any` everywhere | Defeats type safety | Use `unknown` or proper types |
| `as` type assertions | Runtime errors possible | Type guards or proper typing |
| Large union types | Hard to maintain | Discriminated unions or branded types |
| Mixing `interface` and `type` | Inconsistent codebase | Choose one convention |
| Ignoring strictNullChecks | Hidden null/undefined bugs | Enable strict mode |
| Index signatures without bounds | Unsafe access | Use Record or Map with validation |
| Deep nesting in generics | Unreadable types | Extract intermediate types |

---

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Type 'X' is not assignable to type 'Y'" | Type mismatch | Check type definitions, use type guards |
| "Property 'x' does not exist on type" | Missing or wrong type | Add property or fix interface |
| "Cannot find module" | Missing types or path | Install @types or configure paths |
| "Object is possibly 'null'" | strictNullChecks enabled | Use optional chaining or null checks |
| "Type instantiation is excessively deep" | Complex generic recursion | Simplify types or add type bounds |
| "Index signature is missing" | Accessing dynamic keys | Use Record or add index signature |
| Build takes too long | Too many files, no incremental | Enable incremental, use project references |

---

## Static Analysis & Linting

### Official Rules References

| Tool | Rules Count | Documentation |
|------|-------------|---------------|
| **ESLint** | 200+ | https://eslint.org/docs/latest/rules/ |
| **TypeScript-ESLint** | 100+ | https://typescript-eslint.io/rules/ |
| **Biome** | 200+ | https://biomejs.dev/linter/rules/ |
| **SonarJS** | 422 | https://rules.sonarsource.com/javascript/ |

### Key Rules to Enable

```javascript
// eslint.config.js (ESLint 9+)
export default [
  {
    rules: {
      // Prevent bugs
      'no-unused-vars': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // Code quality
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      'complexity': ['warn', 10],
      'max-depth': ['warn', 4],
    }
  }
];
```

### Recommended Configs

| Tool | Config | Command |
|------|--------|---------|
| ESLint | `@eslint/js` recommended | `npm init @eslint/config` |
| TypeScript-ESLint | `strict-type-checked` | See ts-eslint docs |
| Biome | Default | `npx @biomejs/biome init` |

---

## Production Readiness

### Strict Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

### Error Handling

```typescript
// Type-safe error handling
class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Result type pattern
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

async function safeAsync<T>(
  promise: Promise<T>
): Promise<Result<T>> {
  try {
    const data = await promise;
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error as Error };
  }
}

// Usage
const result = await safeAsync(fetchUser(id));
if (result.success) {
  console.log(result.data);
} else {
  console.error(result.error.message);
}
```

### Type Safety Patterns

```typescript
// Branded types for type safety
type UserId = string & { readonly brand: unique symbol };
type OrderId = string & { readonly brand: unique symbol };

function createUserId(id: string): UserId {
  return id as UserId;
}

// Exhaustive checking
function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}

type Status = 'active' | 'inactive' | 'pending';

function handleStatus(status: Status): string {
  switch (status) {
    case 'active': return 'Active';
    case 'inactive': return 'Inactive';
    case 'pending': return 'Pending';
    default: return assertNever(status);
  }
}

// Zod for runtime validation
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(2),
});

type User = z.infer<typeof UserSchema>;

function parseUser(data: unknown): User {
  return UserSchema.parse(data);
}
```

### Testing

```typescript
// Type testing with expectTypeOf
import { expectTypeOf, describe, it } from 'vitest';

describe('types', () => {
  it('User has correct shape', () => {
    expectTypeOf<User>().toMatchTypeOf<{
      id: string;
      email: string;
      name: string;
    }>();
  });

  it('createUser returns User', () => {
    expectTypeOf(createUser).returns.toEqualTypeOf<User>();
  });
});

// Unit testing with proper types
import { describe, it, expect, vi } from 'vitest';

describe('UserService', () => {
  it('fetches user by id', async () => {
    const mockUser: User = {
      id: '123',
      email: 'test@example.com',
      name: 'Test',
    };

    const repository = {
      findById: vi.fn().mockResolvedValue(mockUser),
    };

    const service = new UserService(repository);
    const result = await service.getUser('123');

    expect(result).toEqual(mockUser);
    expect(repository.findById).toHaveBeenCalledWith('123');
  });
});
```

### Performance

```typescript
// Lazy initialization
class ExpensiveService {
  private static instance: ExpensiveService | null = null;

  static getInstance(): ExpensiveService {
    if (!this.instance) {
      this.instance = new ExpensiveService();
    }
    return this.instance;
  }
}

// Memoization with proper types
function memoize<Args extends unknown[], Result>(
  fn: (...args: Args) => Result
): (...args: Args) => Result {
  const cache = new Map<string, Result>();

  return (...args: Args): Result => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Type coverage | > 95% |
| any usage | 0 instances |
| Build time | < 30s |
| Type errors | 0 |

### Checklist

- [ ] strict: true enabled
- [ ] noUncheckedIndexedAccess enabled
- [ ] No explicit any usage
- [ ] Branded types for IDs
- [ ] Result type for error handling
- [ ] Runtime validation with Zod
- [ ] Type tests with expectTypeOf
- [ ] Declaration files generated
- [ ] Source maps enabled
- [ ] ESLint with typescript-eslint

---

## Reference Documentation
- [Generics](quick-ref/generics.md)
- [Utility Types](quick-ref/utility-types.md)
- [Quality Principles](../../quality/common/SKILL.md)

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `typescript` for comprehensive documentation.
