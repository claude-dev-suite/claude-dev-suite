# Fetch API Quick Reference

> See [HTTP Clients SKILL](../SKILL.md) for core knowledge

## Basic Requests

```typescript
// GET
const response = await fetch('/api/users');
const users = await response.json();

// POST
const response = await fetch('/api/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'John' }),
});

// PUT
await fetch('/api/users/123', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Updated' }),
});

// DELETE
await fetch('/api/users/123', { method: 'DELETE' });
```

## Request Options

```typescript
const options: RequestInit = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer token',
  },
  body: JSON.stringify(data),
  mode: 'cors',                    // cors, no-cors, same-origin
  credentials: 'include',          // include, same-origin, omit
  cache: 'no-cache',              // default, no-cache, reload, force-cache
  redirect: 'follow',              // follow, error, manual
  signal: controller.signal,       // AbortController signal
};
```

## Response Handling

```typescript
const response = await fetch('/api/users');

// Properties
response.ok;          // true if status 200-299
response.status;      // HTTP status code
response.statusText;  // Status message
response.headers;     // Headers object
response.url;         // Final URL after redirects

// Body methods (can only be called once)
const json = await response.json();
const text = await response.text();
const blob = await response.blob();
const buffer = await response.arrayBuffer();
const formData = await response.formData();

// Clone to read body multiple times
const clone = response.clone();
```

## Error Handling

```typescript
async function safeFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// Usage
try {
  const data = await safeFetch<User[]>('/api/users');
} catch (error) {
  console.error('Request failed:', error.message);
}
```

## Timeout

```typescript
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
```

## Cancellation

```typescript
const controller = new AbortController();

// Start request
fetch('/api/users', { signal: controller.signal })
  .then(res => res.json())
  .catch(err => {
    if (err.name === 'AbortError') {
      console.log('Request cancelled');
    }
  });

// Cancel request
controller.abort();
```

## Headers

```typescript
// Create headers
const headers = new Headers();
headers.append('Content-Type', 'application/json');
headers.append('Authorization', 'Bearer token');

// Or from object
const headers = new Headers({
  'Content-Type': 'application/json',
  'Authorization': 'Bearer token',
});

// Read response headers
const contentType = response.headers.get('Content-Type');
response.headers.forEach((value, key) => console.log(key, value));
```

## File Upload

```typescript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('name', 'document.pdf');

// Don't set Content-Type - browser sets it with boundary
const response = await fetch('/api/upload', {
  method: 'POST',
  body: formData,
});
```

## File Download

```typescript
const response = await fetch('/api/files/123');
const blob = await response.blob();

// Get filename from header
const contentDisposition = response.headers.get('Content-Disposition');
const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] ?? 'download';

// Create download link
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = filename;
a.click();
URL.revokeObjectURL(url);
```

## Streaming Response

```typescript
const response = await fetch('/api/stream');
const reader = response.body?.getReader();

if (reader) {
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    console.log(text);
  }
}
```

## Query Parameters

```typescript
const params = new URLSearchParams({
  page: '1',
  limit: '10',
  status: 'active',
});

// Arrays
params.append('tags', 'javascript');
params.append('tags', 'typescript');

const url = `/api/users?${params.toString()}`;
// /api/users?page=1&limit=10&status=active&tags=javascript&tags=typescript
```

## TypeScript Wrapper

```typescript
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestConfig extends Omit<RequestInit, 'method' | 'body'> {
  params?: Record<string, string>;
  data?: unknown;
  timeout?: number;
}

async function request<T>(
  method: HttpMethod,
  url: string,
  config: RequestConfig = {}
): Promise<T> {
  const { params, data, timeout = 10000, ...init } = config;

  // Add query params
  const urlWithParams = params
    ? `${url}?${new URLSearchParams(params)}`
    : url;

  // Setup timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(urlWithParams, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
      signal: controller.signal,
      ...init,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// Helper methods
const http = {
  get: <T>(url: string, config?: RequestConfig) => request<T>('GET', url, config),
  post: <T>(url: string, data?: unknown, config?: RequestConfig) =>
    request<T>('POST', url, { ...config, data }),
  put: <T>(url: string, data?: unknown, config?: RequestConfig) =>
    request<T>('PUT', url, { ...config, data }),
  patch: <T>(url: string, data?: unknown, config?: RequestConfig) =>
    request<T>('PATCH', url, { ...config, data }),
  delete: <T>(url: string, config?: RequestConfig) => request<T>('DELETE', url, config),
};

// Usage
const users = await http.get<User[]>('/api/users', { params: { status: 'active' } });
const user = await http.post<User>('/api/users', { name: 'John' });
```
