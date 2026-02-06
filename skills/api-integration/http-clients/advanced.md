# HTTP Clients Advanced Patterns

## Token Refresh with Axios

```typescript
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const { data } = await axios.post('/auth/refresh', { refreshToken });

        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);

        api.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
        processQueue(null, data.accessToken);

        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as Error, null);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
```

## Retry with Exponential Backoff

```typescript
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryOn: number[];
}

const defaultConfig: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  retryOn: [408, 429, 500, 502, 503, 504],
};

async function fetchWithRetry<T>(
  url: string,
  options: RequestInit = {},
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const { maxRetries, baseDelay, maxDelay, retryOn } = {
    ...defaultConfig,
    ...config,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        if (retryOn.includes(response.status) && attempt < maxRetries) {
          const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new ApiError(response.status, response.statusText);
      }

      return response.json();
    } catch (error) {
      lastError = error as Error;
      if (attempt === maxRetries) break;

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
```

## Request Cancellation

```typescript
import { useRef, useCallback, useEffect } from 'react';

export function useCancellableRequest() {
  const controllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const request = useCallback(async <T>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> => {
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();

    const response = await fetch(url, {
      ...options,
      signal: controllerRef.current.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }, []);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  return { request, cancel };
}

// Usage
function SearchComponent() {
  const { request, cancel } = useCancellableRequest();

  const handleSearch = async (query: string) => {
    try {
      const results = await request<SearchResults>(`/api/search?q=${query}`);
      setResults(results);
    } catch (error) {
      if (error.name !== 'AbortError') {
        setError(error.message);
      }
    }
  };
}
```

## Type-Safe API Client

```typescript
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ApiEndpoint<TRequest, TResponse> {
  method: HttpMethod;
  path: string;
}

function createEndpoint<TRequest, TResponse>(
  method: HttpMethod,
  path: string
): ApiEndpoint<TRequest, TResponse> {
  return { method, path };
}

const endpoints = {
  getUsers: createEndpoint<void, User[]>('GET', '/users'),
  getUser: createEndpoint<{ id: string }, User>('GET', '/users/:id'),
  createUser: createEndpoint<CreateUserDto, User>('POST', '/users'),
  updateUser: createEndpoint<UpdateUserDto & { id: string }, User>('PUT', '/users/:id'),
  deleteUser: createEndpoint<{ id: string }, void>('DELETE', '/users/:id'),
};

async function apiRequest<TRequest, TResponse>(
  endpoint: ApiEndpoint<TRequest, TResponse>,
  params?: TRequest
): Promise<TResponse> {
  let path = endpoint.path;

  if (params && typeof params === 'object') {
    Object.entries(params).forEach(([key, value]) => {
      path = path.replace(`:${key}`, String(value));
    });
  }

  const response = await fetch(`${API_URL}${path}`, {
    method: endpoint.method,
    headers: { 'Content-Type': 'application/json' },
    body: endpoint.method !== 'GET' ? JSON.stringify(params) : undefined,
  });

  if (!response.ok) throw new ApiError(response.status, response.statusText);

  if (response.status === 204) return undefined as TResponse;
  return response.json();
}

// Usage - fully typed
const users = await apiRequest(endpoints.getUsers);
const user = await apiRequest(endpoints.getUser, { id: '123' });
const newUser = await apiRequest(endpoints.createUser, { name: 'John', email: 'john@example.com' });
```

## ky with Token Refresh

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
    afterResponse: [
      async (request, options, response) => {
        if (response.status === 401) {
          const newToken = await refreshToken();
          if (newToken) {
            request.headers.set('Authorization', `Bearer ${newToken}`);
            return ky(request);
          }
        }
        return response;
      },
    ],
  },
});
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
      options.headers = {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      };
    }
  },

  async onResponseError({ response }) {
    if (response.status === 401) {
      await navigateTo('/login');
    }
  },
});

// Usage (works in Node.js and browser)
const users = await api<User[]>('/users');
const user = await api<User>('/users', {
  method: 'POST',
  body: newUser,
});
```
