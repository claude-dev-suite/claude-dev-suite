---
name: http-clients
description: |
  HTTP clients for frontend and Node.js. Covers Axios, Fetch API, ky, and ofetch.
  Includes interceptors, error handling, retry logic, and auth token management.
  Use for configuring API clients and HTTP communication.

  USE WHEN: user mentions "HTTP client", "Fetch API", "ky", "ofetch", "HTTP wrapper",
  "retry logic", "token refresh", asks about "which HTTP client to use",
  "HTTP request library", "API client setup", "request interceptors"

  DO NOT USE FOR: Axios-specific questions - use `axios` instead; GraphQL - use `graphql-codegen` instead;
  tRPC - use `trpc` instead; WebSocket connections
allowed-tools: Read, Grep, Glob, Write, Edit
---
# HTTP Clients Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for token refresh flow, retry with exponential backoff, request cancellation, and type-safe API client patterns.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `http-clients` for comprehensive documentation.

## Axios Setup

```typescript
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

## Fetch API Wrapper

```typescript
class ApiError extends Error {
  constructor(public status: number, public statusText: string, public data?: unknown) {
    super(`${status}: ${statusText}`);
  }
}

async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 10000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, { ...fetchOptions, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('accessToken');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };

  const response = await fetchWithTimeout(`${API_URL}${endpoint}`, { ...options, headers });

  if (!response.ok) {
    throw new ApiError(response.status, response.statusText);
  }

  return response.json();
}
```

## ky (Modern Fetch Wrapper)

```typescript
import ky from 'ky';

const api = ky.create({
  prefixUrl: process.env.NEXT_PUBLIC_API_URL,
  timeout: 10000,
  retry: {
    limit: 2,
    methods: ['get', 'put', 'delete'],
    statusCodes: [408, 429, 500, 502, 503, 504],
  },
  hooks: {
    beforeRequest: [
      (request) => {
        const token = localStorage.getItem('accessToken');
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`);
        }
      },
    ],
  },
});

// Usage
const users = await api.get('users').json<User[]>();
const user = await api.post('users', { json: newUser }).json<User>();
```

## ofetch (Universal Fetch)

```typescript
import { ofetch } from 'ofetch';

const api = ofetch.create({
  baseURL: process.env.NUXT_PUBLIC_API_URL,
  retry: 2,
  retryDelay: 500,
  timeout: 10000,

  async onRequest({ options }) {
    const token = localStorage.getItem('accessToken');
    if (token) {
      options.headers = { ...options.headers, Authorization: `Bearer ${token}` };
    }
  },
});

// Works in Node.js and browser
const users = await api<User[]>('/users');
```

## When NOT to Use This Skill

- Axios-specific configuration (use `axios` skill)
- GraphQL client setup (use `graphql-codegen` skill)
- tRPC client configuration (use `trpc` skill)
- WebSocket or Server-Sent Events

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| No timeout configured | Hanging requests | Set timeout on all clients |
| Hardcoded API URLs | Environment coupling | Use environment variables |
| No retry logic | Poor UX on transient failures | Implement exponential backoff |
| Ignoring token expiration | 401 errors | Implement token refresh flow |
| Not canceling on unmount | Memory leaks | Use AbortController cleanup |
| Not typing responses | Runtime errors | Use TypeScript generics |

## Quick Troubleshooting

| Issue | Possible Cause | Solution |
|-------|----------------|----------|
| CORS errors | Server misconfiguration | Configure CORS on backend |
| 401 after some time | Token expired | Implement token refresh |
| Memory leaks | Not aborting on unmount | Add cleanup in useEffect |
| Network timeout | Server slow | Increase timeout, add retry |
| Infinite refresh loop | Refresh returns 401 | Exclude refresh from interceptor |

## Production Checklist

- [ ] Base URL via environment
- [ ] Request timeout configured
- [ ] Auth token interceptor
- [ ] Token refresh logic
- [ ] Error response handling
- [ ] Retry with exponential backoff
- [ ] Request cancellation on unmount
- [ ] Type-safe API methods

## Reference Documentation
- [Axios Configuration](quick-ref/axios.md)
- [Fetch Patterns](quick-ref/fetch.md)
- [ky and ofetch](quick-ref/ky-ofetch.md)
