# openapi-generator-cli Quick Reference

> See [OpenAPI Codegen SKILL](../SKILL.md) for core knowledge

## Installation

```bash
npm install -D @openapitools/openapi-generator-cli
```

## Basic Generation

```bash
# TypeScript Fetch client
npx @openapitools/openapi-generator-cli generate \
  -i openapi.yaml \
  -g typescript-fetch \
  -o ./src/api-client

# TypeScript Axios client
npx @openapitools/openapi-generator-cli generate \
  -i openapi.yaml \
  -g typescript-axios \
  -o ./src/api-client

# Java client
npx @openapitools/openapi-generator-cli generate \
  -i openapi.yaml \
  -g java \
  -o ./java-client
```

## TypeScript Generators

| Generator | Description |
|-----------|-------------|
| `typescript-fetch` | Native fetch API |
| `typescript-axios` | Axios HTTP client |
| `typescript-node` | Node.js HTTP client |
| `typescript-angular` | Angular HttpClient |
| `typescript-rxjs` | RxJS observables |

## Configuration File

```json
// openapitools.json
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
          "npmVersion": "1.0.0",
          "typescriptThreePlus": true,
          "withInterfaces": true,
          "useSingleRequestParameter": true
        }
      }
    }
  }
}
```

Run with config:

```bash
npx @openapitools/openapi-generator-cli generate
```

## Additional Properties

### typescript-fetch

```bash
--additional-properties=\
supportsES6=true,\
typescriptThreePlus=true,\
withInterfaces=true,\
useSingleRequestParameter=true,\
prefixParameterInterfaces=true
```

### typescript-axios

```bash
--additional-properties=\
supportsES6=true,\
withSeparateModelsAndApi=true,\
apiPackage=api,\
modelPackage=models,\
withInterfaces=true
```

## Generated Client Usage

### Configuration

```typescript
import { Configuration, UsersApi, PostsApi } from './api-client';

const config = new Configuration({
  basePath: 'https://api.example.com',
  accessToken: () => localStorage.getItem('token') || '',
  headers: {
    'X-Custom-Header': 'value',
  },
});

const usersApi = new UsersApi(config);
const postsApi = new PostsApi(config);
```

### API Calls

```typescript
// List with query params
const users = await usersApi.listUsers({
  status: 'active',
  page: 1,
  limit: 10,
});

// Get by ID
const user = await usersApi.getUserById({ id: '123' });

// Create
const newUser = await usersApi.createUser({
  createUserDto: {
    name: 'John',
    email: 'john@example.com',
  },
});

// Update
const updated = await usersApi.updateUser({
  id: '123',
  updateUserDto: { name: 'Updated' },
});

// Delete
await usersApi.deleteUser({ id: '123' });
```

### Error Handling

```typescript
import { ResponseError } from './api-client';

try {
  await usersApi.getUserById({ id: '123' });
} catch (error) {
  if (error instanceof ResponseError) {
    console.log(error.response.status);
    const body = await error.response.json();
    console.log(body.message);
  }
}
```

## Custom Templates

```bash
# Extract templates
npx @openapitools/openapi-generator-cli author template \
  -g typescript-fetch \
  -o ./templates

# Use custom templates
npx @openapitools/openapi-generator-cli generate \
  -i openapi.yaml \
  -g typescript-fetch \
  -o ./src/api-client \
  -t ./templates
```

## Global Properties

```bash
# Skip certain files
--global-property=models,apis,supportingFiles

# Generate only models
--global-property=models

# Generate only APIs
--global-property=apis

# Skip validation
--global-property=skipFormModel=true
```

## Model Naming

```bash
# Add suffix to models
--model-name-suffix=Dto

# Add prefix to models
--model-name-prefix=Api
```

## Package Scripts

```json
{
  "scripts": {
    "generate:client": "openapi-generator-cli generate",
    "generate:client:validate": "openapi-generator-cli validate -i openapi.yaml && npm run generate:client"
  }
}
```

## List Available Generators

```bash
npx @openapitools/openapi-generator-cli list
```

## Validate Spec

```bash
npx @openapitools/openapi-generator-cli validate -i openapi.yaml
```
