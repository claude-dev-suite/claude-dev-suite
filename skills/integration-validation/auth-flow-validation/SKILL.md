---
name: auth-flow-validation
description: |
  Authentication flow validation between frontend and backend.
  Covers JWT, OAuth2, token refresh, and session management sync.

  USE WHEN: user asks about "auth integration", "JWT validation", "token refresh", "401 handling", "authentication flow", "login integration"

  DO NOT USE FOR: security auditing - use security skills, OAuth provider setup - use authentication skills
allowed-tools: Read, Grep, Glob, Bash
---
# Auth Flow Validation - Quick Reference

## When NOT to Use This Skill
- **Security auditing** - Use `security` skills
- **OAuth provider configuration** - Use `oauth2` skill
- **JWT implementation** - Use `jwt` skill

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `jwt` or `oauth2` for protocol details.

## Auth Flow Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     AUTHENTICATION FLOW                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Frontend                    Backend                                 │
│  ┌──────────────┐           ┌──────────────┐                        │
│  │ 1. Login     │──────────→│ POST /auth   │                        │
│  │    Form      │           │ /login       │                        │
│  └──────────────┘           └──────┬───────┘                        │
│         ↑                          │                                 │
│         │                          ↓                                 │
│  ┌──────────────┐           ┌──────────────┐                        │
│  │ 2. Store     │←──────────│ Return JWT   │                        │
│  │    Tokens    │           │ + Refresh    │                        │
│  └──────────────┘           └──────────────┘                        │
│         │                                                            │
│         ↓                                                            │
│  ┌──────────────┐           ┌──────────────┐                        │
│  │ 3. API Call  │──────────→│ Validate JWT │                        │
│  │ + Auth Header│           │              │                        │
│  └──────────────┘           └──────┬───────┘                        │
│         ↑                          │                                 │
│         │      401 Unauthorized    │                                 │
│         │←─────────────────────────┤                                 │
│         │                          │                                 │
│         ↓                          │                                 │
│  ┌──────────────┐           ┌──────────────┐                        │
│  │ 4. Refresh   │──────────→│ POST /auth   │                        │
│  │    Token     │           │ /refresh     │                        │
│  └──────────────┘           └──────────────┘                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Validation Checklist

### Login Flow

| Step | Frontend | Backend | Validation |
|------|----------|---------|------------|
| Endpoint | POST /auth/login | POST /auth/login | Path match |
| Request Body | { email, password } | { email, password } | Schema match |
| Response | { accessToken, refreshToken, user } | Same structure | Type match |
| Token Storage | localStorage/httpOnly cookie | Expects cookie or header | Method match |
| Error Response | Handle 401, 400 | Returns structured error | Error format |

### Token Refresh Flow

| Step | Frontend | Backend | Validation |
|------|----------|---------|------------|
| Trigger | 401 response intercepted | Returns 401 on expired | Consistent behavior |
| Endpoint | POST /auth/refresh | POST /auth/refresh | Path match |
| Request | refreshToken in body/cookie | Expects same location | Method match |
| Response | New accessToken | Returns new token | Structure match |
| Retry | Original request retried | Accepts new token | Flow complete |

## Common Discrepancies

### 1. Token Storage Mismatch

```typescript
// Backend expects: HttpOnly cookie
res.cookie('accessToken', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
});

// Frontend stores: localStorage (MISMATCH!)
localStorage.setItem('accessToken', response.accessToken);

// Frontend should: Let backend set cookie
// No manual storage needed - cookie sent automatically
```

### 2. Authorization Header Format

```typescript
// Backend expects
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

// Frontend sends (WRONG)
Authorization: eyJhbGciOiJIUzI1NiIs...  // Missing "Bearer "

// Frontend sends (WRONG)
Authorization: bearer eyJhbGciOiJIUzI1NiIs...  // Wrong case

// Correct frontend implementation
const token = getAccessToken();
fetch('/api/users', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

### 3. Refresh Token Placement

```typescript
// Backend expects: Cookie
app.post('/auth/refresh', (req, res) => {
  const refreshToken = req.cookies.refreshToken;  // From cookie
});

// Frontend sends: Body (MISMATCH!)
fetch('/auth/refresh', {
  method: 'POST',
  body: JSON.stringify({ refreshToken }),  // Wrong!
});

// Correct: Cookie sent automatically
fetch('/auth/refresh', {
  method: 'POST',
  credentials: 'include',  // Include cookies
});
```

### 4. Token Expiration Handling

```typescript
// Backend: Token expires after 15 minutes
const token = jwt.sign(payload, secret, { expiresIn: '15m' });

// Frontend: No expiration check (BAD)
function makeAuthenticatedRequest() {
  return fetch('/api/data', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// Frontend: Check expiration before request (GOOD)
function makeAuthenticatedRequest() {
  const token = getAccessToken();

  if (isTokenExpired(token)) {
    await refreshAccessToken();
  }

  return fetch('/api/data', {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
}

// Helper to check expiration
function isTokenExpired(token: string): boolean {
  const payload = JSON.parse(atob(token.split('.')[1]));
  return payload.exp * 1000 < Date.now();
}
```

## Token Refresh Patterns

### Axios Interceptor

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// Request interceptor - add token
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const newToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed - logout user
        logout();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
```

### Fetch with Refresh

```typescript
async function fetchWithAuth(url: string, options: RequestInit = {}) {
  let token = getAccessToken();

  // Check if token expired
  if (isTokenExpired(token)) {
    token = await refreshAccessToken();
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });

  // Handle 401 (token rejected by server)
  if (response.status === 401) {
    token = await refreshAccessToken();

    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  }

  return response;
}
```

### React Query Auth

```typescript
import { QueryClient } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry on 401
        if (error instanceof Response && error.status === 401) {
          return false;
        }
        return failureCount < 3;
      },
    },
  },
});

// Global error handler
queryClient.setDefaultOptions({
  mutations: {
    onError: (error) => {
      if (error instanceof Response && error.status === 401) {
        // Redirect to login
        window.location.href = '/login';
      }
    },
  },
});
```

## OpenAPI Auth Definition

### JWT Bearer

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

security:
  - bearerAuth: []

paths:
  /users:
    get:
      security:
        - bearerAuth: []
      responses:
        401:
          description: Unauthorized
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
```

### Cookie Auth

```yaml
components:
  securitySchemes:
    cookieAuth:
      type: apiKey
      in: cookie
      name: accessToken

paths:
  /users:
    get:
      security:
        - cookieAuth: []
```

## Validation Report Template

```markdown
## Auth Flow Validation Report

### Login Flow
| Check | Status | Details |
|-------|--------|---------|
| Endpoint path | OK | POST /auth/login |
| Request body | OK | { email, password } |
| Response structure | WARNING | Missing `expiresIn` field |
| Token storage | ERROR | Frontend uses localStorage, backend expects cookie |

### Token Refresh Flow
| Check | Status | Details |
|-------|--------|---------|
| Trigger condition | OK | 401 intercepted |
| Refresh endpoint | OK | POST /auth/refresh |
| Token placement | ERROR | Frontend sends in body, backend expects cookie |
| Retry mechanism | OK | Original request retried |

### Recommendations
1. **Critical**: Change token storage to httpOnly cookies
2. **Critical**: Update refresh to use credentials: 'include'
3. **Warning**: Add expiresIn to login response for proactive refresh
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| localStorage for tokens | XSS vulnerability | Use httpOnly cookies |
| No token refresh | Poor UX, forced logout | Implement refresh flow |
| Refresh on every request | Performance | Refresh on 401 or near expiry |
| No logout on refresh fail | Security risk | Clear tokens and redirect |
| Hardcoded token expiry | Drift with backend | Parse from token or response |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| 401 on login | Wrong credentials format | Check request body schema |
| 401 after refresh | Refresh token also expired | Re-authenticate user |
| Infinite refresh loop | Not marking retried requests | Add retry flag |
| CORS on auth endpoints | Missing credentials config | Add `credentials: 'include'` |
| Token not sent | Authorization header format | Check "Bearer " prefix |

## Related Skills
- [OpenAPI Contract](../openapi-contract/SKILL.md)
- [Error Contract](../error-contract/SKILL.md)
- [JWT Security](../../security/owasp/SKILL.md)
