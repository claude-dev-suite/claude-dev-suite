---
name: axios
description: |
  Axios - promise-based HTTP client for browser and Node.js

  USE WHEN: user mentions "Axios", "HTTP requests", "API calls", "interceptors",
  "Axios instance", asks about "how to make HTTP calls", "configure Axios",
  "add auth header", "handle HTTP errors"

  DO NOT USE FOR: Fetch API - use `http-clients` instead; ky/ofetch - use `http-clients` instead;
  GraphQL clients - use `graphql-codegen` instead; tRPC - use `trpc` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Axios - Quick Reference

## When to Use This Skill
- HTTP requests in JavaScript/TypeScript applications
- Configuring interceptors for auth/error handling
- Creating Axios instances for specific APIs
- Request/response transformation
- File uploads and downloads

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `axios` for comprehensive documentation.

## Setup Base

```bash
npm install axios
```

## Pattern Essenziali

### GET Request
```typescript
import axios from 'axios';

const response = await axios.get('/api/users');
const users = response.data;

// With params
const response = await axios.get('/api/users', {
  params: { page: 1, limit: 10 }
});
```

### POST Request
```typescript
const response = await axios.post('/api/users', {
  name: 'John',
  email: 'john@example.com'
});
```

### Axios Instance
```typescript
const api = axios.create({
  baseURL: 'https://api.example.com',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' }
});

// Use instance
const users = await api.get('/users');
```

### Interceptors
```typescript
// Request interceptor (add auth token)
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor (handle errors)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

### TypeScript Types
```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

const response = await api.get<User[]>('/users');
const users: User[] = response.data;
```

### Error Handling
```typescript
try {
  const response = await api.get('/users');
} catch (error) {
  if (axios.isAxiosError(error)) {
    console.error('API Error:', error.response?.data);
    console.error('Status:', error.response?.status);
  }
}
```

## When NOT to Use This Skill

- Native Fetch API patterns (use `http-clients` skill)
- ky or ofetch configuration (use `http-clients` skill)
- GraphQL client setup (use `graphql-codegen` skill)
- tRPC client configuration (use `trpc` skill)
- WebSocket connections

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| No timeout configured | Requests hang indefinitely | Set timeout in axios.create() |
| Hardcoded base URLs | Environment coupling | Use env variables for baseURL |
| No error interceptor | Inconsistent error handling | Add response error interceptor |
| Not typing responses | Loses type safety | Use generics: `axios.get<User>()` |
| Duplicating auth logic | Maintenance burden | Use request interceptor |
| Ignoring response status | Silent failures | Check response.status or use validateStatus |
| No request cancellation | Memory leaks on unmount | Use AbortController |
| Logging sensitive data | Security risk | Redact tokens/passwords from logs |

## Quick Troubleshooting

| Issue | Possible Cause | Solution |
|-------|----------------|----------|
| CORS errors | Server not allowing origin | Configure CORS on server, check preflight |
| 401 Unauthorized | Missing or invalid token | Check interceptor, verify token |
| Network Error | Server unreachable, CORS | Check baseURL, server status, CORS config |
| Timeout errors | Request taking too long | Increase timeout or optimize endpoint |
| Request canceled | AbortController triggered | Check component lifecycle, don't cancel needed requests |
| Type errors | Response shape mismatch | Verify API response matches type definition |
| Interceptor not firing | Interceptor added after request | Add interceptors during client setup |
| Memory leaks | Not canceling requests on unmount | Use cleanup in useEffect |
