# swagger-typescript-api Quick Reference

> See [OpenAPI Codegen SKILL](../SKILL.md) for core knowledge

## Installation

```bash
npm install -D swagger-typescript-api
```

## Basic Generation

```bash
# Generate single file
npx swagger-typescript-api -p ./openapi.yaml -o ./src/api -n api.ts

# From URL
npx swagger-typescript-api -p https://api.example.com/openapi.json -o ./src/api -n api.ts
```

## CLI Options

```bash
npx swagger-typescript-api \
  -p ./openapi.yaml \           # Path to spec
  -o ./src/api \                # Output directory
  -n api.ts \                   # Output filename
  --axios \                     # Use axios (default: fetch)
  --modular \                   # Separate files per tag
  --route-types \               # Generate route types
  --responses \                 # Generate response types for each status
  --union-enums \               # String unions instead of enums
  --extract-request-body \      # Separate request body types
  --extract-response-body \     # Separate response body types
  --extract-response-error \    # Separate error response types
  --unwrap-response-data \      # Return data directly
  --single-http-client \        # Single HTTP client instance
  --silent                      # No console output
```

## Configuration File

```javascript
// swagger-typescript-api.config.js
module.exports = {
  url: './openapi.yaml',
  output: './src/api',
  name: 'api.ts',
  httpClientType: 'axios',
  generateRouteTypes: true,
  generateResponses: true,
  extractRequestBody: true,
  extractResponseBody: true,
  extractEnums: true,
  unwrapResponseData: true,
  singleHttpClient: true,
  moduleNameIndex: 1,
  hooks: {
    onCreateRoute: (routeData) => routeData,
    onCreateComponent: (component) => component,
  },
};
```

Run with config:

```bash
npx swagger-typescript-api -c ./swagger-typescript-api.config.js
```

## Generated Client Usage

### Basic Setup

```typescript
import { Api } from './api/api';

const api = new Api({
  baseUrl: 'https://api.example.com',
});
```

### With Authentication

```typescript
const api = new Api({
  baseUrl: 'https://api.example.com',
  securityWorker: async () => {
    const token = await getToken();
    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  },
});

// Or set later
api.setSecurityData({ token: 'my-token' });
```

### API Calls

```typescript
// List resources
const { data: users } = await api.users.usersList({
  status: 'active',
  page: 1,
});

// Get by ID
const { data: user } = await api.users.usersDetail('123');

// Create
const { data: newUser } = await api.users.usersCreate({
  name: 'John',
  email: 'john@example.com',
});

// Update
const { data: updated } = await api.users.usersUpdate('123', {
  name: 'Updated',
});

// Partial update
const { data: patched } = await api.users.usersPartialUpdate('123', {
  name: 'Patched',
});

// Delete
await api.users.usersDelete('123');
```

### Error Handling

```typescript
try {
  const { data } = await api.users.usersDetail('123');
} catch (error) {
  if (error instanceof api.HttpError) {
    console.log(error.status);    // HTTP status
    console.log(error.error);     // Error body
  }
}

// Or with response check
const response = await api.users.usersDetail('123');
if (response.ok) {
  console.log(response.data);
} else {
  console.log(response.error);
}
```

## Modular Output

```bash
npx swagger-typescript-api -p ./openapi.yaml -o ./src/api --modular
```

Generated structure:

```
src/api/
├── http-client.ts      # HTTP client
├── Users.ts            # Users API
├── Posts.ts            # Posts API
├── data-contracts.ts   # Types/interfaces
└── index.ts            # Exports
```

Usage:

```typescript
import { Api } from './api';

const api = new Api({ baseUrl: 'https://api.example.com' });

const users = await api.users.list();
const posts = await api.posts.list();
```

## Route Types

```bash
npx swagger-typescript-api -p ./openapi.yaml -o ./src/api --route-types
```

Generated:

```typescript
export namespace Users {
  export namespace UsersList {
    export type RequestParams = {};
    export type RequestQuery = { status?: string; page?: number };
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = User[];
  }
}
```

## Custom Templates

```bash
# Extract default templates
npx swagger-typescript-api extract-templates -o ./templates

# Use custom templates
npx swagger-typescript-api -p ./openapi.yaml -o ./src/api --templates ./templates
```

## Programmatic Usage

```typescript
import { generateApi } from 'swagger-typescript-api';
import path from 'path';

generateApi({
  name: 'api.ts',
  output: path.resolve(__dirname, './src/api'),
  url: 'https://api.example.com/openapi.json',
  httpClientType: 'axios',
  generateRouteTypes: true,
  generateResponses: true,
}).then(({ files }) => {
  files.forEach(({ fileName, fileContent }) => {
    console.log(`Generated: ${fileName}`);
  });
});
```

## Package Scripts

```json
{
  "scripts": {
    "generate:api": "swagger-typescript-api -p ./openapi.yaml -o ./src/api -n api.ts --axios --modular",
    "generate:api:watch": "nodemon --watch openapi.yaml --exec 'npm run generate:api'"
  }
}
```
