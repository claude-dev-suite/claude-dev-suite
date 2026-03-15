# RTK Query Quick Reference

> **Knowledge Base:** Read `knowledge/redux-toolkit/rtk-query.md` for complete documentation.

## API Definition

```typescript
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

interface User {
  id: number;
  name: string;
  email: string;
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api',
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.token;
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return headers;
    },
  }),
  tagTypes: ['User', 'Post'],
  endpoints: (builder) => ({
    // Query endpoint
    getUsers: builder.query<User[], void>({
      query: () => '/users',
      providesTags: ['User'],
    }),

    // Query with parameter
    getUser: builder.query<User, number>({
      query: (id) => `/users/${id}`,
      providesTags: (result, error, id) => [{ type: 'User', id }],
    }),

    // Mutation endpoint
    createUser: builder.mutation<User, Partial<User>>({
      query: (body) => ({
        url: '/users',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['User'],
    }),

    // Update mutation
    updateUser: builder.mutation<User, { id: number; data: Partial<User> }>({
      query: ({ id, data }) => ({
        url: `/users/${id}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'User', id }],
    }),

    // Delete mutation
    deleteUser: builder.mutation<void, number>({
      query: (id) => ({
        url: `/users/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, id) => [{ type: 'User', id }],
    }),
  }),
});

export const {
  useGetUsersQuery,
  useGetUserQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
} = api;
```

## Store Setup

```typescript
import { configureStore } from '@reduxjs/toolkit';
import { api } from './api';

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(api.middleware),
});
```

## Using Queries

```tsx
function UserList() {
  const {
    data: users,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useGetUsersQuery();

  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Error: {error.message}</div>;

  return (
    <>
      <button onClick={refetch} disabled={isFetching}>
        {isFetching ? 'Refreshing...' : 'Refresh'}
      </button>
      <ul>
        {users?.map(user => <li key={user.id}>{user.name}</li>)}
      </ul>
    </>
  );
}

// With parameters
function UserProfile({ userId }: { userId: number }) {
  const { data: user, isLoading } = useGetUserQuery(userId);

  if (isLoading) return <div>Loading...</div>;

  return <div>{user?.name}</div>;
}

// Query options
const { data } = useGetUsersQuery(undefined, {
  pollingInterval: 30000,        // Poll every 30s
  skip: !isLoggedIn,             // Conditional fetching
  refetchOnMountOrArgChange: true,
  refetchOnFocus: true,
  refetchOnReconnect: true,
});
```

## Using Mutations

```tsx
function CreateUserForm() {
  const [createUser, { isLoading, isError, error }] = useCreateUserMutation();

  const handleSubmit = async (data: Partial<User>) => {
    try {
      const result = await createUser(data).unwrap();
      console.log('Created:', result);
    } catch (err) {
      console.error('Failed:', err);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Creating...' : 'Create'}
      </button>
    </form>
  );
}

function UserActions({ user }: { user: User }) {
  const [updateUser] = useUpdateUserMutation();
  const [deleteUser] = useDeleteUserMutation();

  return (
    <>
      <button onClick={() => updateUser({ id: user.id, data: { name: 'New Name' } })}>
        Update
      </button>
      <button onClick={() => deleteUser(user.id)}>
        Delete
      </button>
    </>
  );
}
```

## Cache Tags

```typescript
endpoints: (builder) => ({
  getPosts: builder.query<Post[], number>({
    query: (userId) => `/users/${userId}/posts`,
    providesTags: (result, error, userId) =>
      result
        ? [
            ...result.map(({ id }) => ({ type: 'Post' as const, id })),
            { type: 'Post', id: 'LIST' },
          ]
        : [{ type: 'Post', id: 'LIST' }],
  }),

  addPost: builder.mutation<Post, Partial<Post>>({
    query: (body) => ({
      url: '/posts',
      method: 'POST',
      body,
    }),
    invalidatesTags: [{ type: 'Post', id: 'LIST' }],
  }),

  updatePost: builder.mutation<Post, { id: number; data: Partial<Post> }>({
    query: ({ id, data }) => ({
      url: `/posts/${id}`,
      method: 'PATCH',
      body: data,
    }),
    invalidatesTags: (result, error, { id }) => [{ type: 'Post', id }],
  }),
}),
```

## Optimistic Updates

```typescript
updatePost: builder.mutation<Post, { id: number; data: Partial<Post> }>({
  query: ({ id, data }) => ({
    url: `/posts/${id}`,
    method: 'PATCH',
    body: data,
  }),
  async onQueryStarted({ id, data }, { dispatch, queryFulfilled }) {
    // Optimistic update
    const patchResult = dispatch(
      api.util.updateQueryData('getPost', id, (draft) => {
        Object.assign(draft, data);
      })
    );

    try {
      await queryFulfilled;
    } catch {
      // Rollback on error
      patchResult.undo();
    }
  },
}),
```

## Transform Response

```typescript
getUsers: builder.query<User[], void>({
  query: () => '/users',
  transformResponse: (response: { data: User[] }) => response.data,
  transformErrorResponse: (response) => response.data,
}),
```

**Official docs:** https://redux-toolkit.js.org/rtk-query/overview
