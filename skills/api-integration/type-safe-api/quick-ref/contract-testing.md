# Contract Testing Quick Reference

> See [Type-Safe API SKILL](../SKILL.md) for core knowledge

## Pact (Consumer-Driven Contracts)

### Installation

```bash
npm install -D @pact-foundation/pact
```

### Consumer Test

```typescript
import { Pact, Matchers } from '@pact-foundation/pact';
import path from 'path';

const { like, eachLike, regex } = Matchers;

const provider = new Pact({
  consumer: 'Frontend',
  provider: 'UserAPI',
  port: 1234,
  log: path.resolve(__dirname, 'logs', 'pact.log'),
  dir: path.resolve(__dirname, 'pacts'),
});

describe('User API Contract', () => {
  beforeAll(() => provider.setup());
  afterAll(() => provider.finalize());
  afterEach(() => provider.verify());

  describe('GET /users/:id', () => {
    it('returns user when exists', async () => {
      await provider.addInteraction({
        state: 'user with id 123 exists',
        uponReceiving: 'a request to get user 123',
        withRequest: {
          method: 'GET',
          path: '/users/123',
          headers: {
            Accept: 'application/json',
          },
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          body: like({
            id: '123',
            name: 'John Doe',
            email: 'john@example.com',
          }),
        },
      });

      const response = await fetch(`${provider.mockService.baseUrl}/users/123`);
      const user = await response.json();

      expect(user.id).toBe('123');
      expect(user.name).toBe('John Doe');
    });

    it('returns 404 when not found', async () => {
      await provider.addInteraction({
        state: 'user with id 999 does not exist',
        uponReceiving: 'a request to get user 999',
        withRequest: {
          method: 'GET',
          path: '/users/999',
        },
        willRespondWith: {
          status: 404,
          body: like({
            message: 'User not found',
          }),
        },
      });

      const response = await fetch(`${provider.mockService.baseUrl}/users/999`);
      expect(response.status).toBe(404);
    });
  });

  describe('POST /users', () => {
    it('creates user', async () => {
      await provider.addInteraction({
        state: 'can create users',
        uponReceiving: 'a request to create user',
        withRequest: {
          method: 'POST',
          path: '/users',
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            name: 'Jane Doe',
            email: 'jane@example.com',
          },
        },
        willRespondWith: {
          status: 201,
          body: like({
            id: regex(/^[a-z0-9-]+$/, 'user-456'),
            name: 'Jane Doe',
            email: 'jane@example.com',
          }),
        },
      });

      const response = await fetch(`${provider.mockService.baseUrl}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Jane Doe', email: 'jane@example.com' }),
      });

      expect(response.status).toBe(201);
    });
  });
});
```

### Provider Verification

```typescript
import { Verifier } from '@pact-foundation/pact';

describe('Provider Verification', () => {
  it('validates the expectations of the consumer', async () => {
    const verifier = new Verifier({
      provider: 'UserAPI',
      providerBaseUrl: 'http://localhost:3000',
      pactUrls: [path.resolve(__dirname, 'pacts', 'frontend-userapi.json')],
      stateHandlers: {
        'user with id 123 exists': async () => {
          await db.user.create({ id: '123', name: 'John Doe', email: 'john@example.com' });
        },
        'user with id 999 does not exist': async () => {
          await db.user.deleteMany({ where: { id: '999' } });
        },
        'can create users': async () => {
          // Setup for user creation
        },
      },
    });

    await verifier.verifyProvider();
  });
});
```

---

## OpenAPI Contract Testing

### With AJV

```typescript
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import SwaggerParser from '@apidevtools/swagger-parser';

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

let api: any;

beforeAll(async () => {
  api = await SwaggerParser.dereference('./openapi.yaml');
});

describe('API Contract', () => {
  it('GET /users/:id returns valid response', async () => {
    const response = await fetch('http://localhost:3000/users/123');
    const data = await response.json();

    const schema = api.paths['/users/{id}'].get.responses['200'].content['application/json'].schema;
    const validate = ajv.compile(schema);
    const valid = validate(data);

    expect(valid).toBe(true);
    if (!valid) {
      console.log(validate.errors);
    }
  });
});
```

### With Prism

```bash
# Install Prism
npm install -D @stoplight/prism-cli

# Mock server
npx prism mock openapi.yaml

# Validation proxy
npx prism proxy openapi.yaml http://localhost:3000
```

```typescript
// Test against Prism proxy
describe('API Contract with Prism', () => {
  it('validates request/response', async () => {
    // Prism validates automatically
    const response = await fetch('http://localhost:4010/users/123');
    expect(response.ok).toBe(true);
  });
});
```

---

## Zod Runtime Validation

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

describe('API Response Validation', () => {
  it('validates response against schema', async () => {
    const response = await fetch('/api/users/123');
    const data = await response.json();

    const result = UserSchema.safeParse(data);

    expect(result.success).toBe(true);
    if (!result.success) {
      console.log(result.error.issues);
    }
  });
});
```

---

## CI Integration

```yaml
# .github/workflows/contract-test.yml
name: Contract Tests

on: [push, pull_request]

jobs:
  consumer-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test:contract
      - uses: actions/upload-artifact@v4
        with:
          name: pacts
          path: pacts/

  provider-verification:
    needs: consumer-tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: pacts
          path: pacts/
      - run: npm ci
      - run: npm run start:test &
      - run: npm run verify:pacts
```

## Package Scripts

```json
{
  "scripts": {
    "test:contract": "jest --config jest.contract.config.js",
    "verify:pacts": "jest --config jest.pact-verify.config.js",
    "pact:publish": "pact-broker publish ./pacts --consumer-app-version=$npm_package_version"
  }
}
```
