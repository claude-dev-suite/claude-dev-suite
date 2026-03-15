# OpenAPI Tools Quick Reference

> **Knowledge Base:** Read `knowledge/openapi/tools.md` for complete documentation.

## Code Generation

### OpenAPI Generator

```bash
# Install
npm install @openapitools/openapi-generator-cli -g

# Generate TypeScript client
openapi-generator-cli generate \
  -i openapi.yaml \
  -g typescript-axios \
  -o ./generated/client

# Generate server stubs
openapi-generator-cli generate \
  -i openapi.yaml \
  -g nodejs-express-server \
  -o ./generated/server

# Common generators:
# Client: typescript-axios, typescript-fetch, swift5, kotlin
# Server: nodejs-express-server, spring, python-flask, go-server
```

### Swagger Codegen

```bash
# Generate
swagger-codegen generate \
  -i openapi.yaml \
  -l typescript-fetch \
  -o ./generated
```

### orval (TypeScript)

```bash
# Install
npm install orval -D

# orval.config.ts
export default {
  api: {
    input: './openapi.yaml',
    output: {
      target: './src/api/generated.ts',
      client: 'react-query',
      mode: 'tags-split',
    },
  },
};

# Generate
npx orval
```

## Validation

### Spectral

```bash
# Install
npm install @stoplight/spectral-cli -g

# Lint OpenAPI spec
spectral lint openapi.yaml

# With custom ruleset
spectral lint openapi.yaml --ruleset .spectral.yaml
```

```yaml
# .spectral.yaml
extends: spectral:oas
rules:
  operation-operationId: error
  operation-tags: error
  info-contact: warn
```

### OpenAPI CLI

```bash
# Install
npm install @redocly/openapi-cli -g

# Lint
openapi lint openapi.yaml

# Bundle (resolve $refs)
openapi bundle openapi.yaml -o bundled.yaml

# Preview docs
openapi preview-docs openapi.yaml
```

## Documentation

### Swagger UI

```html
<!-- CDN -->
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css">
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
<script>
  SwaggerUIBundle({
    url: '/openapi.yaml',
    dom_id: '#swagger-ui',
  });
</script>
```

```typescript
// Express middleware
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';

const spec = YAML.load('./openapi.yaml');
app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));
```

### Redoc

```html
<!-- CDN -->
<script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
<redoc spec-url="/openapi.yaml"></redoc>
```

```bash
# Generate static HTML
npx @redocly/cli build-docs openapi.yaml -o docs.html
```

### Stoplight Elements

```html
<script src="https://unpkg.com/@stoplight/elements/web-components.min.js"></script>
<link rel="stylesheet" href="https://unpkg.com/@stoplight/elements/styles.min.css">

<elements-api
  apiDescriptionUrl="/openapi.yaml"
  router="hash"
/>
```

## Testing

### Prism (Mock Server)

```bash
# Install
npm install @stoplight/prism-cli -g

# Start mock server
prism mock openapi.yaml

# With dynamic responses
prism mock openapi.yaml --dynamic
```

### Dredd

```bash
# Install
npm install dredd -g

# Run API tests against spec
dredd openapi.yaml http://localhost:3000
```

### Schemathesis

```bash
# Install
pip install schemathesis

# Run property-based tests
schemathesis run http://localhost:3000/openapi.json
```

## Express Integration

```typescript
// With express-openapi-validator
import * as OpenApiValidator from 'express-openapi-validator';

app.use(
  OpenApiValidator.middleware({
    apiSpec: './openapi.yaml',
    validateRequests: true,
    validateResponses: true,
  })
);

// Error handler for validation errors
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    error: {
      message: err.message,
      errors: err.errors,
    },
  });
});
```

## FastAPI (Python)

```python
from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

app = FastAPI()

# Auto-generates OpenAPI spec
# Access at /openapi.json
# Docs at /docs (Swagger UI) and /redoc

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title="My API",
        version="1.0.0",
        routes=app.routes,
    )
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi
```

## Type Generation

```bash
# openapi-typescript
npx openapi-typescript openapi.yaml -o types.ts

# Usage
import type { paths, components } from './types';

type User = components['schemas']['User'];
type GetUsersResponse = paths['/users']['get']['responses']['200']['content']['application/json'];
```

**Official docs:** https://tools.openapis.org/
