---
name: zod
description: |
  Zod TypeScript schema validation library for runtime type checking.

  USE WHEN: user mentions "Zod", "schema validation", "form validation", "API validation", "type-safe validation", asks about "runtime validation", "React Hook Form validation"

  DO NOT USE FOR: Yup projects (use yup skill), class-validator/NestJS DTOs (use class-validator skill), PropTypes, compile-time only validation
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Zod - Quick Reference

## When to Use This Skill
- Form validation with React Hook Form
- API data parsing/validation
- Type inference from schemas

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `zod` for comprehensive documentation.

## Essential Patterns

### Basic Schema
```typescript
import { z } from 'zod';

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  age: z.number().min(18).optional(),
  role: z.enum(['admin', 'user'])
});

// Type inference
type User = z.infer<typeof userSchema>;

// Parse
const user = userSchema.parse(data); // throws ZodError
const result = userSchema.safeParse(data); // { success, data/error }
```

### Common Validations
```typescript
// String
z.string().min(1).max(100).email().url().uuid()

// Number
z.number().int().positive().min(0).max(100)

// Custom validation
z.string().refine(val => val.startsWith('@'), "Must start with @")

// Object cross-field
z.object({
  password: z.string(),
  confirm: z.string()
}).refine(d => d.password === d.confirm, {
  message: "Passwords don't match",
  path: ['confirm']
});
```

### React Hook Form
```tsx
import { zodResolver } from '@hookform/resolvers/zod';

const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(userSchema)
});

<input {...register('name')} />
{errors.name && <span>{errors.name.message}</span>}
```

### Schema Operations
```typescript
userSchema.partial()           // All fields optional
userSchema.pick({ name: true }) // Pick fields
userSchema.omit({ id: true })   // Omit fields
userSchema.extend({ phone: z.string() }) // Extend
```

## When NOT to Use This Skill

- **Yup existing projects** - Use `yup` skill for Formik integration
- **NestJS DTOs** - Use `class-validator` skill for decorator-based validation
- **Compile-time only checks** - TypeScript types are sufficient
- **Simple PropTypes** - React PropTypes might be enough

## Anti-Patterns to Avoid
- Do not define schemas inside components (performance)
- Do not use `.parse()` for user input without try/catch
- Do not forget custom error messages

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Schema inside components | Re-created on every render | Define at module level |
| Using .parse() without try-catch | Throws unhandled errors | Use .safeParse() for user input |
| No custom error messages | Generic "Invalid input" | Add custom messages to all validations |
| Validating twice (FE + BE) | Performance waste | Share schemas between client/server |
| Not using z.infer | Manual type definitions | Always use type inference |
| Ignoring .transform() | Miss data normalization | Use transforms for trimming, etc. |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Expected string, received number" | Type mismatch | Use z.coerce.string() for type coercion |
| Performance issues | Schema in component | Move schema to module level |
| Async validation not working | Using .parse() | Use .parseAsync() for async refinements |
| Nested errors not showing | Not using flatten() | Use error.flatten() for nested structures |
| "Invalid type" on optional fields | Using undefined | Use .optional() or .nullable() |
| Form not validating | Resolver not set | Add resolver: zodResolver(schema) |

## Production Readiness

### Error Handling

```typescript
import { z, ZodError } from 'zod';

// Safe parsing with error handling
function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const errors = result.error.flatten();
    throw new ValidationError(errors);
  }

  return result.data;
}

// Custom error messages
const userSchema = z.object({
  email: z.string({
    required_error: 'Email is required',
    invalid_type_error: 'Email must be a string',
  }).email({ message: 'Invalid email format' }),

  password: z.string()
    .min(8, { message: 'Password must be at least 8 characters' })
    .regex(/[A-Z]/, { message: 'Password must contain uppercase letter' })
    .regex(/[0-9]/, { message: 'Password must contain number' }),
});

// Error formatting for API responses
function formatZodError(error: ZodError): Record<string, string[]> {
  return error.flatten().fieldErrors as Record<string, string[]>;
}
```

### API Integration

```typescript
// Express middleware
import { Request, Response, NextFunction } from 'express';

function validate<T extends z.ZodSchema>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        errors: formatZodError(result.error),
      });
    }

    req.body = result.data;
    next();
  };
}

// Usage
app.post('/users', validate(createUserSchema), createUser);

// tRPC integration
export const appRouter = t.router({
  createUser: t.procedure
    .input(createUserSchema)
    .mutation(({ input }) => {
      // input is fully typed and validated
      return db.users.create({ data: input });
    }),
});
```

### Complex Validations

```typescript
// Conditional fields
const formSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('individual'),
    name: z.string(),
    ssn: z.string().regex(/^\d{3}-\d{2}-\d{4}$/),
  }),
  z.object({
    type: z.literal('business'),
    companyName: z.string(),
    ein: z.string().regex(/^\d{2}-\d{7}$/),
  }),
]);

// Async validation
const uniqueEmailSchema = z.string().email().refine(
  async (email) => {
    const exists = await db.users.findByEmail(email);
    return !exists;
  },
  { message: 'Email already registered' }
);

// Transform and validate
const dateSchema = z.string()
  .transform((str) => new Date(str))
  .refine((date) => !isNaN(date.getTime()), 'Invalid date');

// Preprocess for type coercion
const querySchema = z.object({
  page: z.preprocess(
    (val) => parseInt(val as string, 10),
    z.number().min(1).default(1)
  ),
  limit: z.preprocess(
    (val) => parseInt(val as string, 10),
    z.number().min(1).max(100).default(20)
  ),
});
```

### Testing

```typescript
import { describe, it, expect } from 'vitest';

describe('userSchema', () => {
  it('validates correct input', () => {
    const input = { email: 'test@example.com', password: 'Password1!' };
    const result = userSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('test@example.com');
    }
  });

  it('fails on invalid email', () => {
    const input = { email: 'invalid', password: 'Password1!' };
    const result = userSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email).toContain('Invalid email format');
    }
  });

  it('fails on weak password', () => {
    const input = { email: 'test@example.com', password: 'weak' };
    const result = userSchema.safeParse(input);

    expect(result.success).toBe(false);
  });
});

// Property-based testing with fast-check
import * as fc from 'fast-check';

it('accepts all valid emails', () => {
  fc.assert(
    fc.property(fc.emailAddress(), (email) => {
      const result = z.string().email().safeParse(email);
      return result.success;
    })
  );
});
```

### Performance

```typescript
// Define schemas outside components/functions
const schemas = {
  user: z.object({ /* ... */ }),
  product: z.object({ /* ... */ }),
} as const;

// Lazy loading for circular references
const categorySchema: z.ZodType<Category> = z.lazy(() =>
  z.object({
    name: z.string(),
    children: z.array(categorySchema).optional(),
  })
);

// Coercion for better performance on known types
const numberSchema = z.coerce.number(); // Auto-converts strings
const dateSchema = z.coerce.date();
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Validation errors | Track & analyze |
| Schema coverage | 100% API inputs |
| Type inference | All schemas |
| Parse time | < 5ms |

### Checklist

- [ ] Custom error messages
- [ ] safeParse for user input
- [ ] Error formatting for API
- [ ] Schemas defined at module level
- [ ] Type inference (z.infer)
- [ ] Complex validation (refine)
- [ ] Async validation where needed
- [ ] Unit tests for schemas
- [ ] Integration with React Hook Form
- [ ] OpenAPI generation (zod-to-openapi)

## Further Reading
> For advanced validations: `mcp__documentation__fetch_docs`
> - Technology: `zod` (available in MCP)
> - [Zod Docs](https://zod.dev/)
