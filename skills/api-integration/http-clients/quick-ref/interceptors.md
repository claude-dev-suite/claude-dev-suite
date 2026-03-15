# Interceptors Quick Reference

> See [HTTP Clients SKILL](../SKILL.md) for core knowledge

## Axios Interceptors

### Request Interceptor

```typescript
import axios, { InternalAxiosRequestConfig } from 'axios';

// Add auth token to every request
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

// Add request ID for tracing
api.interceptors.request.use((config) => {
  config.headers['X-Request-ID'] = crypto.randomUUID();
  return config;
});

// Log requests (development)
api.interceptors.request.use((config) => {
  console.log(`[${config.method?.toUpperCase()}] ${config.url}`);
  return config;
});
```

### Response Interceptor

```typescript
import { AxiosResponse, AxiosError } from 'axios';

// Transform response data
api.interceptors.response.use(
  (response: AxiosResponse) => {
    // Unwrap data envelope
    if (response.data?.data) {
      response.data = response.data.data;
    }
    return response;
  }
);

// Handle errors globally
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      window.location.href = '/login';
    }
    if (error.response?.status === 403) {
      toast.error('Permission denied');
    }
    if (error.response?.status >= 500) {
      toast.error('Server error. Please try again later.');
    }
    return Promise.reject(error);
  }
);
```

### Remove Interceptor

```typescript
const interceptorId = api.interceptors.request.use((config) => config);

// Remove later
api.interceptors.request.eject(interceptorId);
```

---

## Token Refresh Pattern

### Axios Token Refresh

```typescript
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

    // Only handle 401 and not already retried
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // If already refreshing, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = localStorage.getItem('refreshToken');
      const { data } = await axios.post('/auth/refresh', { refreshToken });

      // Store new tokens
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);

      // Update default header
      api.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;

      // Process queued requests
      processQueue(null, data.accessToken);

      // Retry original request
      originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(originalRequest);

    } catch (refreshError) {
      processQueue(refreshError as Error, null);

      // Clear tokens and redirect
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
```

### ky Token Refresh

```typescript
import ky from 'ky';

const api = ky.create({
  prefixUrl: 'https://api.example.com',
  hooks: {
    afterResponse: [
      async (request, options, response) => {
        if (response.status === 401) {
          // Get new token
          const refreshToken = localStorage.getItem('refreshToken');
          const tokenResponse = await ky.post('auth/refresh', {
            prefixUrl: 'https://api.example.com',
            json: { refreshToken },
          }).json<{ accessToken: string; refreshToken: string }>();

          // Store new tokens
          localStorage.setItem('accessToken', tokenResponse.accessToken);
          localStorage.setItem('refreshToken', tokenResponse.refreshToken);

          // Retry with new token
          request.headers.set('Authorization', `Bearer ${tokenResponse.accessToken}`);
          return ky(request);
        }
        return response;
      },
    ],
  },
});
```

### ofetch Token Refresh

```typescript
import { ofetch } from 'ofetch';

let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

const api = ofetch.create({
  baseURL: 'https://api.example.com',

  async onResponseError({ response }) {
    if (response.status === 401) {
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = refreshAccessToken();
      }

      try {
        const newToken = await refreshPromise;
        // Request will be retried automatically
        return;
      } catch {
        await redirectToLogin();
      } finally {
        isRefreshing = false;
        refreshPromise = null;
      }
    }
  },

  async onRequest({ options }) {
    const token = localStorage.getItem('accessToken');
    if (token) {
      options.headers = {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      };
    }
  },
});

async function refreshAccessToken(): Promise<string> {
  const refreshToken = localStorage.getItem('refreshToken');
  const data = await ofetch<{ accessToken: string; refreshToken: string }>(
    'https://api.example.com/auth/refresh',
    { method: 'POST', body: { refreshToken } }
  );
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
  return data.accessToken;
}
```

---

## Common Interceptor Patterns

### Request Timing

```typescript
api.interceptors.request.use((config) => {
  config.metadata = { startTime: Date.now() };
  return config;
});

api.interceptors.response.use((response) => {
  const duration = Date.now() - response.config.metadata.startTime;
  console.log(`${response.config.url} took ${duration}ms`);
  return response;
});
```

### Retry on Network Error

```typescript
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config } = error;

    if (!config || config._retryCount >= 3) {
      return Promise.reject(error);
    }

    // Only retry network errors
    if (!error.response) {
      config._retryCount = (config._retryCount || 0) + 1;
      const delay = Math.pow(2, config._retryCount) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return api(config);
    }

    return Promise.reject(error);
  }
);
```

### Cache Responses

```typescript
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

api.interceptors.request.use((config) => {
  if (config.method === 'get') {
    const cached = cache.get(config.url!);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      config.adapter = () =>
        Promise.resolve({
          data: cached.data,
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        });
    }
  }
  return config;
});

api.interceptors.response.use((response) => {
  if (response.config.method === 'get') {
    cache.set(response.config.url!, {
      data: response.data,
      timestamp: Date.now(),
    });
  }
  return response;
});
```

### Error Normalization

```typescript
interface ApiError {
  message: string;
  code: string;
  status: number;
  details?: Record<string, string[]>;
}

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const apiError: ApiError = {
      message: 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
      status: error.response?.status || 0,
    };

    if (error.response?.data) {
      const data = error.response.data as Record<string, unknown>;
      apiError.message = (data.message as string) || apiError.message;
      apiError.code = (data.code as string) || apiError.code;
      apiError.details = data.errors as Record<string, string[]>;
    } else if (error.message === 'Network Error') {
      apiError.message = 'Unable to connect to server';
      apiError.code = 'NETWORK_ERROR';
    } else if (error.code === 'ECONNABORTED') {
      apiError.message = 'Request timed out';
      apiError.code = 'TIMEOUT';
    }

    return Promise.reject(apiError);
  }
);
```

### Request Deduplication

```typescript
const pendingRequests = new Map<string, Promise<AxiosResponse>>();

function getRequestKey(config: InternalAxiosRequestConfig): string {
  return `${config.method}:${config.url}:${JSON.stringify(config.params)}`;
}

api.interceptors.request.use((config) => {
  if (config.method === 'get') {
    const key = getRequestKey(config);
    if (pendingRequests.has(key)) {
      config.adapter = () => pendingRequests.get(key)!;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const key = getRequestKey(response.config);
    pendingRequests.delete(key);
    return response;
  },
  (error) => {
    if (error.config) {
      const key = getRequestKey(error.config);
      pendingRequests.delete(key);
    }
    return Promise.reject(error);
  }
);
```
