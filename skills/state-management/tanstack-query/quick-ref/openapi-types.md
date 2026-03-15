# TanStack Query with OpenAPI Types Quick Reference

> See [TanStack Query SKILL](../SKILL.md) for core knowledge

## Setup

```bash
npm install @tanstack/react-query openapi-fetch
npm install -D openapi-typescript
npx openapi-typescript ./openapi.yaml -o ./src/types/api.ts
```

## API Client Setup

```typescript
// lib/api.ts
import createClient from 'openapi-fetch';
import type { paths } from '@/types/api';

export const api = createClient<paths>({
  baseUrl: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// With auth token
export function createAuthenticatedClient(token: string) {
  return createClient<paths>({
    baseUrl: process.env.NEXT_PUBLIC_API_URL,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}
```

## Type-Safe Query Keys

```typescript
// lib/queryKeys.ts
import type { paths } from '@/types/api';

type UserFilters = paths['/users']['get']['parameters']['query'];

export const queryKeys = {
  users: {
    all: ['users'] as const,
    list: (filters?: UserFilters) => [...queryKeys.users.all, 'list', filters] as const,
    detail: (id: string) => [...queryKeys.users.all, 'detail', id] as const,
  },
  posts: {
    all: ['posts'] as const,
    byUser: (userId: string) => [...queryKeys.posts.all, 'user', userId] as const,
  },
};
```

## Type-Safe Queries

```typescript
import type { paths, components } from '@/types/api';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

type User = components['schemas']['User'];

export function useUsers(filters?: paths['/users']['get']['parameters']['query']) {
  return useQuery({
    queryKey: queryKeys.users.list(filters),
    queryFn: async () => {
      const { data, error } = await api.GET('/users', {
        params: { query: filters },
      });
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: async () => {
      const { data, error } = await api.GET('/users/{id}', {
        params: { path: { id } },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!id,
  });
}
```

## Type-Safe Mutations

```typescript
import type { paths } from '@/types/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

type CreateUserBody = paths['/users']['post']['requestBody']['content']['application/json'];
type UpdateUserBody = paths['/users/{id}']['put']['requestBody']['content']['application/json'];

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateUserBody) => {
      const { data, error } = await api.POST('/users', { body });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useUpdateUser(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: UpdateUserBody) => {
      const { data, error } = await api.PUT('/users/{id}', {
        params: { path: { id } },
        body,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.list() });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/users/{id}', {
        params: { path: { id } },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}
```

## Optimistic Updates with Types

```typescript
import type { components } from '@/types/api';

type User = components['schemas']['User'];

export function useOptimisticUpdateUser(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: UpdateUserBody) => {
      const { data, error } = await api.PUT('/users/{id}', {
        params: { path: { id } },
        body,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.users.detail(id) });
      const previous = queryClient.getQueryData<User>(queryKeys.users.detail(id));

      queryClient.setQueryData<User>(queryKeys.users.detail(id), (old) => ({
        ...old!,
        ...newData,
      }));

      return { previous };
    },
    onError: (err, newData, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.users.detail(id), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(id) });
    },
  });
}
```

## Custom Hook Factory

```typescript
import type { paths } from '@/types/api';
import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';

type ApiPaths = keyof paths;
type GetPaths = {
  [K in ApiPaths]: paths[K] extends { get: unknown } ? K : never;
}[ApiPaths];

export function createUseQuery<P extends GetPaths>(
  path: P,
  getParams?: (args: unknown) => paths[P]['get']['parameters']
) {
  return function useApiQuery<TData = paths[P]['get']['responses']['200']['content']['application/json']>(
    args?: unknown,
    options?: Omit<UseQueryOptions<TData>, 'queryKey' | 'queryFn'>
  ) {
    return useQuery({
      queryKey: [path, args],
      queryFn: async () => {
        const params = getParams?.(args);
        const { data, error } = await api.GET(path as string, { params });
        if (error) throw error;
        return data as TData;
      },
      ...options,
    });
  };
}

// Usage
const useUsers = createUseQuery('/users', (filters) => ({ query: filters }));
const useUser = createUseQuery('/users/{id}', (id) => ({ path: { id } }));
```

## Error Type Handling

```typescript
import type { components } from '@/types/api';

type ApiError = components['schemas']['Error'];

export function useUserWithErrorHandling(id: string) {
  return useQuery<User, ApiError>({
    queryKey: queryKeys.users.detail(id),
    queryFn: async () => {
      const { data, error } = await api.GET('/users/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
      return data;
    },
    throwOnError: (error) => error.code === 'INTERNAL_ERROR',
  });
}
```

