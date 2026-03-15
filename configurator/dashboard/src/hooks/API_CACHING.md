# API Response Caching

This document describes the in-memory caching system implemented for API requests in the dashboard.

## Overview

The `useApi` hook now includes automatic response caching for GET requests to prevent redundant network calls. The cache is in-memory with configurable TTL (Time To Live).

## Features

- **Automatic caching**: GET requests are cached by default
- **TTL support**: Cache entries expire after a configurable duration (default: 30 seconds)
- **Manual invalidation**: Clear specific endpoints or all cache
- **Force refresh**: Bypass cache when needed
- **Mutation integration**: Automatically invalidate related cache after mutations

## Usage

### Basic Usage (Automatic Caching)

```typescript
import { useApi } from '@/hooks/useApi';

// GET request - automatically cached for 30 seconds
const { data, loading, error } = useApi<Agent[]>('/api/agents');
```

### Disable Caching

```typescript
// Disable caching for specific request
const { data } = useApi('/api/config', { cache: false });
```

### Custom Cache TTL

```typescript
// Cache for 60 seconds instead of default 30
const { data } = useApi('/api/data', { cacheTtl: 60000 });
```

### Force Refresh

```typescript
// Bypass cache and fetch fresh data
const { data } = useApi('/api/data', { forceRefresh: true });
```

### Manual Cache Invalidation

```typescript
import { invalidateCache } from '@/hooks/useApi';

// Clear cache for specific endpoint
invalidateCache('/api/agents');

// Clear all cache
invalidateCache();
```

### Mutation with Cache Invalidation

```typescript
import { useMutation } from '@/hooks/useMutation';

// Automatically invalidate related cache after successful mutation
const { mutate } = useMutation('/api/agents', 'POST', {
  invalidateCache: ['/api/agents', '/api/config'],
});

// When mutation succeeds, both endpoints will be invalidated
await mutate({ name: 'New Agent' });
```

## Cache Behavior

### What Gets Cached

- ✅ Successful GET requests (HTTP 200)
- ✅ Non-null response data
- ✅ Requests with unique endpoint + method + body combinations

### What Doesn't Get Cached

- ❌ POST, PUT, DELETE requests
- ❌ Failed requests (HTTP errors)
- ❌ Requests with `cache: false` option
- ❌ Requests with `forceRefresh: true` option
- ❌ Responses with null data

### Cache Key Generation

Cache keys are generated using:
- HTTP method (GET, POST, etc.)
- Endpoint URL
- Request body (for POST/PUT)

Example: `GET:/api/agents:` or `POST:/api/install:{"projectPath":"..."}`

### Cache TTL

- **Default**: 30 seconds (30000ms)
- **Configurable**: Use `cacheTtl` option to override
- **Expiration**: Entries are checked on each request
- **No background cleanup**: Expired entries remain until checked

## Implementation Details

### Cache Storage

```typescript
interface CacheEntry<T> {
  data: T;           // Cached response data
  timestamp: number; // When the entry was cached
}

const cache = new Map<string, CacheEntry<unknown>>();
```

### Cache Validation

```typescript
function isCacheValid<T>(entry: CacheEntry<T> | undefined, ttl: number): boolean {
  if (!entry) return false;
  return Date.now() - entry.timestamp < ttl;
}
```

### Invalidation After Mutations

The `useMutation` hook supports automatic cache invalidation:

```typescript
// After successful mutation
if (cacheEndpoints && cacheEndpoints.length > 0) {
  cacheEndpoints.forEach((endpoint) => {
    invalidateCache(endpoint);
  });
}
```

## Best Practices

### 1. Use Default Caching for Read-Only Data

```typescript
// Good: Static data (frameworks, presets)
const { data: frameworks } = useApi<Framework[]>('/api/frameworks');

// Good: Infrequently changing data (agent list)
const { data: agents } = useApi<Agent[]>('/api/agents');
```

### 2. Disable Caching for Real-Time Data

```typescript
// Good: Real-time status updates
const { data: status } = useApi('/api/status', { cache: false });

// Good: Frequently changing data
const { data: jobs } = useApi('/api/jobs', {
  cache: false,
  pollingInterval: 1000
});
```

### 3. Use Force Refresh for User-Initiated Updates

```typescript
const handleRefresh = () => {
  const { refetch } = useApi('/api/data', { forceRefresh: true });
  refetch();
};
```

### 4. Invalidate Related Cache After Mutations

```typescript
// Good: Update agent list after creating/deleting agents
const { mutate: createAgent } = useMutation('/api/agents', 'POST', {
  invalidateCache: ['/api/agents'],
});

// Good: Update multiple related endpoints
const { mutate: installProject } = useMutation('/api/install', 'POST', {
  invalidateCache: [
    '/api/detection',
    '/api/management/installed',
    '/api/config'
  ],
});
```

### 5. Adjust TTL Based on Data Volatility

```typescript
// Short TTL for frequently changing data
const { data } = useApi('/api/logs', { cacheTtl: 5000 }); // 5 seconds

// Long TTL for static data
const { data } = useApi('/api/frameworks', { cacheTtl: 300000 }); // 5 minutes
```

## Performance Impact

### Benefits

- **Reduced network traffic**: Fewer redundant API calls
- **Faster UI updates**: Instant data from cache
- **Better UX**: No loading states for cached data
- **Lower server load**: Fewer requests to process

### Considerations

- **Memory usage**: Cache grows with unique requests
- **Stale data**: Cache may serve outdated data until TTL expires
- **Initial load**: First request still requires network call

### Monitoring Cache Effectiveness

Enable debug logging to see cache hits:

```typescript
// In browser console, enable debug logs
localStorage.setItem('debug', '*');

// You'll see messages like:
// [useApi] Using cached response { endpoint: '/api/agents', cacheKey: 'GET:/api/agents:' }
// [useApi] Cached response { endpoint: '/api/agents', cacheKey: 'GET:/api/agents:' }
```

## Future Enhancements

Potential improvements for future versions:

1. **Persistent cache**: Store cache in localStorage/IndexedDB
2. **Cache size limits**: LRU eviction when cache grows too large
3. **Background refresh**: Fetch fresh data in background before TTL expires
4. **Conditional requests**: Use ETag/If-Modified-Since headers
5. **Query invalidation**: Pattern-based cache invalidation
6. **Cache warming**: Pre-populate cache for common requests

## Testing

The caching system includes comprehensive test coverage:

- `src/hooks/__tests__/useApi.cache.test.ts`: 8 tests for useApi caching
- `src/hooks/__tests__/useMutation.cache.test.ts`: 5 tests for mutation invalidation

Run tests:

```bash
npm test -- src/hooks/__tests__/useApi.cache.test.ts
npm test -- src/hooks/__tests__/useMutation.cache.test.ts
```

## Related Files

- `src/hooks/useApi.ts`: Main implementation
- `src/hooks/useMutation.ts`: Mutation with cache invalidation
- `src/hooks/__tests__/useApi.cache.test.ts`: Tests
- `src/hooks/__tests__/useMutation.cache.test.ts`: Mutation tests
