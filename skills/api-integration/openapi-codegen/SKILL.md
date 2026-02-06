---
name: openapi-codegen
description: |
  OpenAPI client code generation. Covers openapi-typescript, openapi-generator-cli,
  swagger-typescript-api, and trpc-openapi. Use for generating type-safe API clients.

  USE WHEN: user mentions "OpenAPI codegen", "generate API client", "openapi-typescript",
  "swagger-typescript-api", "openapi-generator", asks about "generate types from OpenAPI",
  "type-safe API client", "OpenAPI client generation"

  DO NOT USE FOR: Writing OpenAPI specs - use `openapi` instead; GraphQL codegen - use `graphql-codegen` instead;
  tRPC - use `trpc` instead; Manual API client code
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# OpenAPI Code Generation Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `openapi-codegen` for comprehensive documentation.

## openapi-typescript (Types Only)

Generates TypeScript types from OpenAPI schemas. Lightweight, no runtime.

```bash
# Installation
npm install -D openapi-typescript

# Generate types
npx openapi-typescript ./openapi.yaml -o ./src/types/api.ts
npx openapi-typescript https://api.example.com/openapi.json -o ./src/types/api.ts
```

### Generated Types Usage

```typescript
import type { paths, components } from './types/api';

// Schema types
type User = components['schemas']['User'];
type CreateUserDto = components['schemas']['CreateUserDto'];

// Request/Response types
type CreateUserRequest = paths['/users']['post']['requestBody']['content']['application/json'];
type UserResponse = paths['/users/{id}']['get']['responses']['200']['content']['application/json'];
type UsersListResponse = paths['/users']['get']['responses']['200']['content']['application/json'];

// Path parameters
type UserPathParams = paths['/users/{id}']['get']['parameters']['path'];
```

### With openapi-fetch

```typescript
import createClient from 'openapi-fetch';
import type { paths } from './types/api';

const client = createClient<paths>({
  baseUrl: 'https://api.example.com',
});

// Fully typed requests
const { data, error } = await client.GET('/users/{id}', {
  params: { path: { id: '123' } },
});

const { data } = await client.POST('/users', {
  body: { name: 'John', email: 'john@example.com' },
});

// Query parameters
const { data } = await client.GET('/users', {
  params: { query: { status: 'active', page: 1 } },
});
```

---

## openapi-generator-cli (Full Client)

Generates complete API clients with fetch/axios implementations.

```bash
# Installation
npm install -D @openapitools/openapi-generator-cli

# Generate TypeScript Fetch client
npx @openapitools/openapi-generator-cli generate \
  -i openapi.yaml \
  -g typescript-fetch \
  -o ./src/api-client

# Generate TypeScript Axios client
npx @openapitools/openapi-generator-cli generate \
  -i openapi.yaml \
  -g typescript-axios \
  -o ./src/api-client
```

### Configuration File

```yaml
# openapitools.json
{
  "$schema": "https://raw.githubusercontent.com/OpenAPITools/openapi-generator-cli/master/apps/generator-cli/src/config.schema.json",
  "spaces": 2,
  "generator-cli": {
    "version": "7.0.0",
    "generators": {
      "typescript-client": {
        "generatorName": "typescript-fetch",
        "output": "#{cwd}/src/api-client",
        "inputSpec": "#{cwd}/openapi.yaml",
        "additionalProperties": {
          "supportsES6": true,
          "npmName": "@myorg/api-client",
          "typescriptThreePlus": true,
          "withInterfaces": true
        }
      }
    }
  }
}
```

### Generated Client Usage

```typescript
import { Configuration, UsersApi } from './api-client';

const config = new Configuration({
  basePath: 'https://api.example.com',
  accessToken: () => localStorage.getItem('token') || '',
});

const usersApi = new UsersApi(config);

// Typed API calls
const users = await usersApi.listUsers({ status: 'active' });
const user = await usersApi.getUserById({ id: '123' });
const newUser = await usersApi.createUser({
  createUserDto: { name: 'John', email: 'john@example.com' },
});
```

---

## swagger-typescript-api

Fast, customizable generator with template support.

```bash
# Installation
npm install -D swagger-typescript-api

# Generate
npx swagger-typescript-api -p ./openapi.yaml -o ./src/api -n api.ts
```

### Configuration

```bash
npx swagger-typescript-api \
  -p ./openapi.yaml \
  -o ./src/api \
  -n api.ts \
  --axios \                    # Use axios instead of fetch
  --modular \                  # Separate files per tag
  --route-types \              # Generate route types
  --extract-request-body \     # Extract request body types
  --extract-response-body      # Extract response body types
```

### Generated Client Usage

```typescript
import { Api } from './api/api';

const api = new Api({
  baseUrl: 'https://api.example.com',
  securityWorker: () => ({
    headers: { Authorization: `Bearer ${getToken()}` },
  }),
});

// Typed API calls
const users = await api.users.usersList({ status: 'active' });
const user = await api.users.usersDetail('123');
const newUser = await api.users.usersCreate({
  name: 'John',
  email: 'john@example.com',
});
```

---

## trpc-openapi (Export tRPC as OpenAPI)

Generate OpenAPI spec from tRPC router. Useful for external API consumers.

```bash
npm install trpc-openapi
```

### Define OpenAPI Endpoints

```typescript
import { initTRPC } from '@trpc/server';
import { OpenApiMeta } from 'trpc-openapi';
import { z } from 'zod';

const t = initTRPC.meta<OpenApiMeta>().create();

export const appRouter = t.router({
  getUser: t.procedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/users/{id}',
        tags: ['users'],
        summary: 'Get user by ID',
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    }))
    .query(({ input }) => getUserById(input.id)),

  createUser: t.procedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/users',
        tags: ['users'],
        summary: 'Create a new user',
      },
    })
    .input(z.object({
      name: z.string(),
      email: z.string().email(),
    }))
    .output(z.object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    }))
    .mutation(({ input }) => createUser(input)),
});
```

### Generate OpenAPI Document

```typescript
import { generateOpenApiDocument } from 'trpc-openapi';
import { appRouter } from './router';

const openApiDocument = generateOpenApiDocument(appRouter, {
  title: 'My API',
  version: '1.0.0',
  baseUrl: 'https://api.example.com',
});

// Save to file
import fs from 'fs';
fs.writeFileSync('./openapi.json', JSON.stringify(openApiDocument, null, 2));
```

### REST Handler

```typescript
import { createOpenApiNextHandler } from 'trpc-openapi';
import { appRouter } from './router';

// Next.js API route: pages/api/[...trpc].ts
export default createOpenApiNextHandler({
  router: appRouter,
  createContext: () => ({}),
});
```

---

## Production Readiness

### CI/CD Integration

```yaml
# .github/workflows/generate-client.yml
name: Generate API Client

on:
  push:
    paths:
      - 'openapi.yaml'

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Generate types
        run: npx openapi-typescript ./openapi.yaml -o ./src/types/api.ts

      - name: Check for changes
        id: check
        run: |
          if git diff --quiet src/types/api.ts; then
            echo "changed=false" >> $GITHUB_OUTPUT
          else
            echo "changed=true" >> $GITHUB_OUTPUT
          fi

      - name: Commit and push
        if: steps.check.outputs.changed == 'true'
        run: |
          git config --local user.email "bot@example.com"
          git config --local user.name "API Generator Bot"
          git add src/types/api.ts
          git commit -m "chore: regenerate API types"
          git push
```

### Package Scripts

```json
{
  "scripts": {
    "generate:types": "openapi-typescript ./openapi.yaml -o ./src/types/api.ts",
    "generate:client": "openapi-generator-cli generate -c openapitools.json",
    "generate:all": "npm run generate:types && npm run generate:client",
    "precommit": "npm run generate:types && git add src/types/api.ts"
  }
}
```

### Watch Mode Development

```bash
# openapi-typescript with watch
npx openapi-typescript ./openapi.yaml -o ./src/types/api.ts --watch

# Or use nodemon
npx nodemon --watch openapi.yaml --exec "npx openapi-typescript ./openapi.yaml -o ./src/types/api.ts"
```

### Validation Before Generation

```bash
# Validate spec first
npx @redocly/cli lint openapi.yaml

# Then generate
npx openapi-typescript ./openapi.yaml -o ./src/types/api.ts
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Generated type coverage | 100% of endpoints |
| Build time with generation | < 30s |
| Type errors after generation | 0 |
| Spec validation errors | 0 |

### Checklist

- [ ] OpenAPI spec validation in CI
- [ ] Automated type generation on spec changes
- [ ] Generated code committed or gitignored
- [ ] Version pinned for generator CLI
- [ ] Custom templates documented
- [ ] API client initialization documented
- [ ] Error handling patterns documented
- [ ] Authentication setup in client
- [ ] Breaking change detection
- [ ] Generated code tested

## When NOT to Use This Skill

- Writing OpenAPI specifications (use `openapi` skill)
- GraphQL type generation (use `graphql-codegen` skill)
- tRPC type-safe APIs (use `trpc` skill)
- Manual API client implementation
- Simple APIs where manual types suffice

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Committing generated code to git | Merge conflicts, stale code | Add to .gitignore, generate in CI/build |
| Not versioning generator CLI | Inconsistent output | Pin generator versions in package.json |
| Editing generated files manually | Changes lost on regeneration | Extend or wrap generated code |
| No validation before generation | Invalid types generated | Validate spec with @redocly/cli first |
| Using different generators across team | Type inconsistencies | Standardize on one generator |
| Generating from remote spec without caching | Slow builds, network dependency | Cache spec locally or use schema registry |
| Not updating on spec changes | Type/runtime mismatch | Run generation in CI on spec updates |
| Missing error handling in generated code | Poor error UX | Wrap generated client with error handling |

## Quick Troubleshooting

| Issue | Possible Cause | Solution |
|-------|----------------|----------|
| Generation fails | Invalid OpenAPI spec | Validate with `@redocly/cli lint` |
| Type errors after generation | Spec doesn't match API | Verify spec matches actual responses |
| Missing types | Spec incomplete or refs broken | Check all $refs resolve, add missing schemas |
| Wrong HTTP client generated | Generator config mismatch | Check -g flag or generator setting |
| Circular reference errors | Self-referencing schemas | Use discriminators or flatten schema |
| Slow generation | Large spec file | Use spec splitting or partial generation |
| Auth not working | Security scheme not configured | Add securityWorker or token config |
| "Cannot find module" errors | Generation didn't complete | Check for generation errors, rerun |
| Type conflicts | Multiple generators running | Use single generator, remove others |

## Reference Documentation
- [openapi-typescript](quick-ref/openapi-typescript.md)
- [openapi-generator](quick-ref/openapi-generator.md)
- [swagger-typescript-api](quick-ref/swagger-typescript-api.md)
- [trpc-openapi](quick-ref/trpc-openapi.md)
