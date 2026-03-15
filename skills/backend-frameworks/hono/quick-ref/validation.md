# Hono Validation

> **Knowledge Base:** Read `knowledge/hono/validation.md` for complete documentation.

## Zod Validator

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const app = new Hono();

// Body validation
const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).optional(),
});

app.post('/users',
  zValidator('json', createUserSchema),
  async (c) => {
    const data = c.req.valid('json');
    // data is typed as { email: string; password: string; name?: string }
    return c.json({ user: data }, 201);
  }
);
```

## Query & Param Validation

```ts
// Query parameters
const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sort: z.enum(['asc', 'desc']).default('desc'),
});

app.get('/users',
  zValidator('query', paginationSchema),
  (c) => {
    const { page, limit, sort } = c.req.valid('query');
    return c.json({ page, limit, sort });
  }
);

// Path parameters
const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});

app.get('/users/:id',
  zValidator('param', idSchema),
  (c) => {
    const { id } = c.req.valid('param');
    return c.json({ id });
  }
);
```

## Custom Error Messages

```ts
const userSchema = z.object({
  email: z.string().email({ message: 'Invalid email format' }),
  password: z.string()
    .min(8, { message: 'Password must be at least 8 characters' })
    .regex(/[A-Z]/, { message: 'Password must contain uppercase' })
    .regex(/[0-9]/, { message: 'Password must contain number' }),
});

app.post('/users',
  zValidator('json', userSchema, (result, c) => {
    if (!result.success) {
      return c.json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      }, 400);
    }
  }),
  (c) => {
    const data = c.req.valid('json');
    return c.json(data, 201);
  }
);
```

## TypeBox Validator

```ts
import { tbValidator } from '@hono/typebox-validator';
import { Type } from '@sinclair/typebox';

const CreateUserSchema = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 8 }),
});

app.post('/users',
  tbValidator('json', CreateUserSchema),
  (c) => {
    const data = c.req.valid('json');
    return c.json(data, 201);
  }
);
```

## Valibot Validator

```ts
import { vValidator } from '@hono/valibot-validator';
import * as v from 'valibot';

const CreateUserSchema = v.object({
  email: v.pipe(v.string(), v.email()),
  password: v.pipe(v.string(), v.minLength(8)),
});

app.post('/users',
  vValidator('json', CreateUserSchema),
  (c) => {
    const data = c.req.valid('json');
    return c.json(data, 201);
  }
);
```

## Multiple Validations

```ts
app.put('/users/:id',
  zValidator('param', z.object({ id: z.coerce.number() })),
  zValidator('json', z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
  })),
  async (c) => {
    const { id } = c.req.valid('param');
    const data = c.req.valid('json');
    return c.json({ id, ...data });
  }
);
```

## Form Data Validation

```ts
const uploadSchema = z.object({
  title: z.string(),
  file: z.instanceof(File),
});

app.post('/upload',
  zValidator('form', uploadSchema),
  async (c) => {
    const { title, file } = c.req.valid('form');
    // Handle file upload
    return c.json({ title, filename: file.name });
  }
);
```

**Official docs:** https://hono.dev/guides/validation
