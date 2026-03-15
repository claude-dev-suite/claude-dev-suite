# ky and ofetch Quick Reference

> See [HTTP Clients SKILL](../SKILL.md) for core knowledge

## ky - Modern Fetch Wrapper

### Installation

```bash
npm install ky
```

### Basic Usage

```typescript
import ky from 'ky';

// Simple requests
const users = await ky.get('https://api.example.com/users').json<User[]>();
const user = await ky.post('https://api.example.com/users', { json: newUser }).json<User>();

// With base URL
const api = ky.create({ prefixUrl: 'https://api.example.com' });
const users = await api.get('users').json<User[]>();
```

### Instance Configuration

```typescript
import ky from 'ky';

const api = ky.create({
  prefixUrl: process.env.NEXT_PUBLIC_API_URL,
  timeout: 10000,
  retry: {
    limit: 2,
    methods: ['get', 'put', 'delete'],
    statusCodes: [408, 429, 500, 502, 503, 504],
    backoffLimit: 3000,
  },
  headers: {
    'Accept': 'application/json',
  },
});
```

### Hooks

```typescript
const api = ky.create({
  prefixUrl: 'https://api.example.com',
  hooks: {
    beforeRequest: [
      (request) => {
        const token = localStorage.getItem('token');
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`);
        }
      },
    ],
    beforeRetry: [
      async ({ request, options, error, retryCount }) => {
        console.log(`Retry attempt ${retryCount}`);
      },
    ],
    afterResponse: [
      async (request, options, response) => {
        if (response.status === 401) {
          // Refresh token and retry
          const newToken = await refreshToken();
          request.headers.set('Authorization', `Bearer ${newToken}`);
          return ky(request);
        }
        return response;
      },
    ],
    beforeError: [
      async (error) => {
        const { response } = error;
        if (response?.body) {
          const body = await response.json();
          error.message = body.message || error.message;
        }
        return error;
      },
    ],
  },
});
```

### Request Methods

```typescript
// All methods return KyResponse
const response = await api.get('users');
const response = await api.post('users', { json: data });
const response = await api.put('users/123', { json: data });
const response = await api.patch('users/123', { json: data });
const response = await api.delete('users/123');

// Parse response
const json = await response.json<User>();
const text = await response.text();
const blob = await response.blob();
const arrayBuffer = await response.arrayBuffer();

// Shorthand
const user = await api.get('users/123').json<User>();
```

### Request Options

```typescript
const response = await api.get('users', {
  searchParams: { status: 'active', page: 1 },
  headers: { 'X-Custom': 'value' },
  timeout: 5000,
  retry: 0,
  signal: controller.signal,
});

// POST with different body types
await api.post('upload', { body: formData });
await api.post('users', { json: { name: 'John' } });
```

### Error Handling

```typescript
import ky, { HTTPError, TimeoutError } from 'ky';

try {
  await api.get('users');
} catch (error) {
  if (error instanceof HTTPError) {
    const body = await error.response.json();
    console.log(error.response.status, body.message);
  } else if (error instanceof TimeoutError) {
    console.log('Request timed out');
  }
}
```

---

## ofetch - Universal Fetch

### Installation

```bash
npm install ofetch
```

### Basic Usage

```typescript
import { ofetch } from 'ofetch';

// Simple requests
const users = await ofetch<User[]>('https://api.example.com/users');
const user = await ofetch<User>('https://api.example.com/users', {
  method: 'POST',
  body: { name: 'John' },
});
```

### Instance Configuration

```typescript
import { ofetch } from 'ofetch';

const api = ofetch.create({
  baseURL: process.env.NUXT_PUBLIC_API_URL,
  retry: 2,
  retryDelay: 500,
  timeout: 10000,
  headers: {
    'Accept': 'application/json',
  },
});
```

### Interceptors

```typescript
const api = ofetch.create({
  baseURL: 'https://api.example.com',

  async onRequest({ request, options }) {
    // Add auth header
    const token = getToken();
    if (token) {
      options.headers = {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      };
    }
    console.log(`[${options.method}] ${request}`);
  },

  async onRequestError({ request, error }) {
    console.error('Request error:', error);
  },

  async onResponse({ response }) {
    console.log(`Response: ${response.status}`);
  },

  async onResponseError({ response }) {
    if (response.status === 401) {
      await redirectToLogin();
    }
    throw createError({
      statusCode: response.status,
      message: response._data?.message || 'Request failed',
    });
  },
});
```

### Request Methods

```typescript
// GET
const users = await api<User[]>('/users');
const users = await api<User[]>('/users', { query: { status: 'active' } });

// POST
const user = await api<User>('/users', {
  method: 'POST',
  body: { name: 'John', email: 'john@example.com' },
});

// PUT
await api('/users/123', {
  method: 'PUT',
  body: { name: 'Updated' },
});

// DELETE
await api('/users/123', { method: 'DELETE' });
```

### Request Options

```typescript
const response = await api('/users', {
  method: 'POST',
  body: { name: 'John' },            // Auto JSON.stringify
  query: { include: 'posts' },       // URL params
  headers: { 'X-Custom': 'value' },
  timeout: 5000,
  retry: 3,
  retryDelay: 1000,
  signal: controller.signal,
  responseType: 'json',              // json, text, blob, arrayBuffer
  parseResponse: JSON.parse,         // Custom parser
});
```

### Error Handling

```typescript
import { ofetch, FetchError } from 'ofetch';

try {
  await api('/users');
} catch (error) {
  if (error instanceof FetchError) {
    console.log('Status:', error.status);
    console.log('Status Text:', error.statusText);
    console.log('Data:', error.data);
    console.log('Request:', error.request);
    console.log('Response:', error.response);
  }
}
```

### Node.js Usage

```typescript
// Works in Node.js without polyfills
import { ofetch } from 'ofetch';

const data = await ofetch('https://api.example.com/data');
```

### Nuxt Integration

```typescript
// In Nuxt, use $fetch (built on ofetch)
// composables/useApi.ts
export function useApi() {
  const config = useRuntimeConfig();

  return $fetch.create({
    baseURL: config.public.apiUrl,
    async onRequest({ options }) {
      const { token } = useAuth();
      if (token.value) {
        options.headers = {
          ...options.headers,
          Authorization: `Bearer ${token.value}`,
        };
      }
    },
  });
}

// Usage in component
const api = useApi();
const users = await api<User[]>('/users');
```

---

## Comparison

| Feature | ky | ofetch |
|---------|-----|--------|
| Bundle size | ~4KB | ~3KB |
| Node.js | ❌ (browser only) | ✅ |
| Nuxt integration | Manual | Built-in ($fetch) |
| Auto JSON | ✅ | ✅ |
| Retry | ✅ | ✅ |
| Timeout | ✅ | ✅ |
| Hooks/Interceptors | ✅ | ✅ |
| TypeScript | ✅ | ✅ |
| Response methods | .json(), .text() | via responseType |

### When to use ky

- Browser-only applications
- React/Next.js projects
- When you want chainable response methods

### When to use ofetch

- Universal (Node + browser) applications
- Nuxt projects (built-in)
- Server-side code
- When you need simpler API
