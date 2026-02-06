---
name: yup
description: |
  Yup schema validation library. Popular with Formik for form validation.
  Use when building forms with React/Formik or needing schema-based validation.

  USE WHEN: user mentions "Yup", "Formik validation", asks about "yup schema", "Formik setup", "form validation library"

  DO NOT USE FOR: Zod projects (use zod skill), NestJS/class-validator (use class-validator skill), new projects (prefer Zod)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Yup - Quick Reference

> **Full Reference**: See [advanced.md](advanced.md) for conditional validation (.when), custom validation (.test), Formik/React Hook Form integration, transforms, and localization.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `yup` for comprehensive documentation.

## Setup

```bash
npm install yup
```

## Basic Usage

```typescript
import * as yup from 'yup';

const userSchema = yup.object({
  name: yup.string().required().min(2).max(50),
  email: yup.string().required().email(),
  age: yup.number().required().min(18).max(120).integer(),
  bio: yup.string().optional(),
});

// Type inference
type User = yup.InferType<typeof userSchema>;

// Validate
async function validateUser(data: unknown) {
  try {
    const user = await userSchema.validate(data, { abortEarly: false });
    return { success: true, data: user };
  } catch (error) {
    if (error instanceof yup.ValidationError) {
      return { success: false, errors: error.errors };
    }
    throw error;
  }
}
```

## Schema Types

### String
```typescript
const stringSchema = yup
  .string()
  .required('Name is required')
  .min(2, 'Too short')
  .max(100, 'Too long')
  .trim()
  .email('Invalid email')
  .url('Invalid URL')
  .matches(/^[a-zA-Z]+$/, 'Only letters allowed')
  .oneOf(['option1', 'option2'], 'Must be one of the options');
```

### Number
```typescript
const numberSchema = yup
  .number()
  .required()
  .min(0)
  .max(100)
  .positive()
  .integer()
  .typeError('Must be a number');
```

### Date
```typescript
const dateSchema = yup
  .date()
  .required()
  .min(new Date('2020-01-01'), 'Too old')
  .max(new Date(), 'Cannot be in future');
```

### Array
```typescript
const arraySchema = yup
  .array()
  .of(yup.string().required())
  .required()
  .min(1, 'At least one item')
  .max(10, 'Maximum 10 items')
  .ensure();  // Transform null/undefined to []
```

### Object
```typescript
const objectSchema = yup.object({
  name: yup.string().required(),
  address: yup.object({
    street: yup.string().required(),
    city: yup.string().required(),
  }),
}).noUnknown(true);  // Strip unknown keys

// Partial object (all fields optional)
const partialSchema = objectSchema.partial();
```

## Validation Options

```typescript
const result = await schema.validate(data, {
  abortEarly: false,    // Return all errors, not just first
  stripUnknown: true,   // Remove unknown keys
  strict: false,        // Allow type coercion
});

// Sync validation
schema.validateSync(data);
schema.isValidSync(data);  // Returns boolean
```

## Comparison: Yup vs Zod

| Feature | Yup | Zod |
|---------|-----|-----|
| Type inference | Good | Excellent |
| Bundle size | ~12KB | ~8KB |
| Async validation | Built-in | .parseAsync() |
| Formik | Native | Via resolver |
| Conditional | .when() | .refine() |

## When NOT to Use This Skill

- **New projects** - Prefer Zod for better TypeScript integration
- **NestJS applications** - Use `class-validator` with decorators
- **Non-form validation** - Zod has better API for general validation

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Schema in component | Re-created on render | Define at module level |
| Forgetting abortEarly: false | Only shows first error | Set abortEarly: false |
| No custom messages | Generic errors | Add custom message to each |
| Not using InferType | Manual type definitions | Use yup.InferType<typeof schema> |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Type errors with InferType | Missing import | Import type from 'yup' |
| Async validation not working | Using validateSync | Use .validate() (async) |
| "Value is required" unexpectedly | Undefined vs null | Use .nullable() or .optional() |
| Error messages not showing | abortEarly: true | Set abortEarly: false |

## Production Checklist

- [ ] Schema defined at module level
- [ ] Type inference with InferType
- [ ] Custom error messages
- [ ] abortEarly: false for forms
- [ ] Resolver for form library
- [ ] Localization if multilingual

## Reference Documentation
- [Yup GitHub](https://github.com/jquense/yup)
