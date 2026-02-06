# Fastify Schema Validation

> **Knowledge Base:** Read `knowledge/fastify/validation.md` for complete documentation.

## JSON Schema Validation

```ts
import Fastify from 'fastify';

const fastify = Fastify({ logger: true });

// Route with schema
fastify.post('/users', {
  schema: {
    body: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 8 },
        name: { type: 'string' }
      }
    },
    response: {
      201: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string' },
          name: { type: 'string' }
        }
      }
    }
  }
}, async (request, reply) => {
  const { email, password, name } = request.body;
  const user = await createUser({ email, password, name });
  return reply.code(201).send(user);
});
```

## TypeBox (Type-Safe Schemas)

```ts
import { Type, Static } from '@sinclair/typebox';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

// Define schema
const CreateUserSchema = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 8 }),
  name: Type.Optional(Type.String())
});

type CreateUserBody = Static<typeof CreateUserSchema>;

// Use with Fastify
const fastify = Fastify().withTypeProvider<TypeBoxTypeProvider>();

fastify.post<{ Body: CreateUserBody }>('/users', {
  schema: {
    body: CreateUserSchema
  }
}, async (request) => {
  // request.body is fully typed!
  const { email, password, name } = request.body;
});
```

## Zod Validation

```ts
import { z } from 'zod';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider
} from 'fastify-type-provider-zod';

const fastify = Fastify().withTypeProvider<ZodTypeProvider>();

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional()
});

fastify.post('/users', {
  schema: {
    body: CreateUserSchema
  }
}, async (request) => {
  const { email, password } = request.body; // Typed!
});
```

## Query & Params Validation

```ts
fastify.get('/users/:id', {
  schema: {
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' }
      }
    },
    querystring: {
      type: 'object',
      properties: {
        include: { type: 'string', enum: ['posts', 'comments'] }
      }
    }
  }
}, async (request) => {
  const { id } = request.params;
  const { include } = request.query;
});
```

## Shared Schemas

```ts
// Register shared schema
fastify.addSchema({
  $id: 'User',
  type: 'object',
  properties: {
    id: { type: 'string' },
    email: { type: 'string' },
    name: { type: 'string' }
  }
});

// Reference in route
fastify.get('/users', {
  schema: {
    response: {
      200: {
        type: 'array',
        items: { $ref: 'User#' }
      }
    }
  }
});
```

## Custom Error Messages

```ts
fastify.setErrorHandler((error, request, reply) => {
  if (error.validation) {
    return reply.status(400).send({
      error: 'Validation Error',
      details: error.validation.map(err => ({
        field: err.instancePath,
        message: err.message
      }))
    });
  }
  throw error;
});
```

**Official docs:** https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/
