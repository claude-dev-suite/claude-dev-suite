# Axios Quick Reference

> See [HTTP Clients SKILL](../SKILL.md) for core knowledge

## Installation

```bash
npm install axios
```

## Instance Configuration

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://api.example.com',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  withCredentials: true, // Include cookies
});
```

## Request Methods

```typescript
// GET
const { data } = await api.get<User[]>('/users');
const { data } = await api.get<User>('/users/123');
const { data } = await api.get('/users', { params: { status: 'active' } });

// POST
const { data } = await api.post<User>('/users', { name: 'John' });

// PUT
const { data } = await api.put<User>('/users/123', { name: 'John Updated' });

// PATCH
const { data } = await api.patch<User>('/users/123', { name: 'John Updated' });

// DELETE
await api.delete('/users/123');
```

## Request Config Options

```typescript
const config = {
  url: '/users',
  method: 'get',
  baseURL: 'https://api.example.com',
  headers: { 'X-Custom-Header': 'value' },
  params: { id: 123 },              // URL query params
  data: { name: 'John' },           // Request body
  timeout: 5000,
  withCredentials: true,
  responseType: 'json',             // 'arraybuffer', 'blob', 'document', 'json', 'text', 'stream'
  validateStatus: (status) => status < 500,
  maxRedirects: 5,
  signal: controller.signal,        // AbortController signal
};
```

## Response Structure

```typescript
const response = await api.get('/users');

response.data;         // Response body
response.status;       // HTTP status code
response.statusText;   // HTTP status message
response.headers;      // Response headers
response.config;       // Request config
response.request;      // XMLHttpRequest instance
```

## Error Handling

```typescript
import { AxiosError, isAxiosError } from 'axios';

try {
  await api.get('/users');
} catch (error) {
  if (isAxiosError(error)) {
    console.log(error.response?.status);  // HTTP status
    console.log(error.response?.data);    // Response body
    console.log(error.message);           // Error message
    console.log(error.code);              // ECONNABORTED, ERR_NETWORK, etc.
  }
}
```

## File Upload

```typescript
const formData = new FormData();
formData.append('file', file);
formData.append('name', 'document.pdf');

const { data } = await api.post('/upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  onUploadProgress: (progressEvent) => {
    const percent = Math.round(
      (progressEvent.loaded * 100) / (progressEvent.total ?? 1)
    );
    console.log(`Upload: ${percent}%`);
  },
});
```

## File Download

```typescript
const response = await api.get('/files/123', {
  responseType: 'blob',
  onDownloadProgress: (progressEvent) => {
    const percent = Math.round(
      (progressEvent.loaded * 100) / (progressEvent.total ?? 1)
    );
    console.log(`Download: ${percent}%`);
  },
});

// Create download link
const url = window.URL.createObjectURL(response.data);
const link = document.createElement('a');
link.href = url;
link.download = 'file.pdf';
link.click();
```

## Cancel Request

```typescript
const controller = new AbortController();

api.get('/users', { signal: controller.signal });

// Cancel the request
controller.abort();
```

## Concurrent Requests

```typescript
const [users, posts] = await Promise.all([
  api.get<User[]>('/users'),
  api.get<Post[]>('/posts'),
]);

// Or use axios.all (deprecated, use Promise.all)
const results = await axios.all([
  api.get('/users'),
  api.get('/posts'),
]);
```

## TypeScript Types

```typescript
import type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';

// Typed response
interface User {
  id: string;
  name: string;
}

const { data } = await api.get<User>('/users/123');
// data is typed as User
```
