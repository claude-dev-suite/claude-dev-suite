---
name: redux-toolkit
description: |
  Redux Toolkit for React state management. Covers slices, thunks,
  and RTK Query. Use for complex global state.

  USE WHEN: user mentions "redux", "redux toolkit", "RTK", "createSlice", asks about "complex state management", "time-travel debugging", "middleware", "thunks", "RTK Query", "global state with DevTools", "enterprise state management"

  DO NOT USE FOR: simple state - use `zustand`; server data - prefer `tanstack-query`; Vue apps - use `pinia`; small projects - overhead not justified
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Redux Toolkit Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `redux-toolkit` for comprehensive documentation.

## Slice

```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface CounterState {
  value: number;
}

const counterSlice = createSlice({
  name: 'counter',
  initialState: { value: 0 } as CounterState,
  reducers: {
    increment: (state) => { state.value += 1; },
    decrement: (state) => { state.value -= 1; },
    incrementByAmount: (state, action: PayloadAction<number>) => {
      state.value += action.payload;
    },
  },
});

export const { increment, decrement, incrementByAmount } = counterSlice.actions;
export default counterSlice.reducer;
```

## Store Setup

```typescript
import { configureStore } from '@reduxjs/toolkit';

export const store = configureStore({
  reducer: {
    counter: counterReducer,
    users: usersReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

## Async Thunks

```typescript
import { createAsyncThunk } from '@reduxjs/toolkit';

export const fetchUsers = createAsyncThunk(
  'users/fetchUsers',
  async (_, { rejectWithValue }) => {
    try {
      const response = await api.getUsers();
      return response.data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

// In slice
extraReducers: (builder) => {
  builder
    .addCase(fetchUsers.pending, (state) => { state.loading = true; })
    .addCase(fetchUsers.fulfilled, (state, action) => {
      state.loading = false;
      state.users = action.payload;
    })
    .addCase(fetchUsers.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload;
    });
}
```

## Hooks

```typescript
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from './store';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

// Usage
const count = useAppSelector((state) => state.counter.value);
const dispatch = useAppDispatch();
dispatch(increment());
```

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Simple global state (user prefs, theme) | `zustand` for less boilerplate |
| Server state management | `tanstack-query` or RTK Query only |
| Vue 3 applications | `pinia` |
| Small projects or prototypes | React Context + hooks or Zustand |
| Component-local state | React useState/useReducer |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using plain Redux instead of RTK | Massive boilerplate, error-prone | Always use Redux Toolkit |
| Mutating state without Immer | Breaks immutability, bugs | Use `createSlice` with Immer built-in |
| Storing everything in Redux | Unnecessary complexity | Keep component state local when possible |
| Not using typed hooks | Loses type safety | Export typed `useAppDispatch`/`useAppSelector` |
| Fetching data in components with thunks | Duplicates request logic | Use RTK Query for data fetching |
| Not using `createAsyncThunk` | Manual loading/error handling | Use `createAsyncThunk` for async actions |
| Persisting entire state | Large localStorage, slow hydration | Only persist auth/critical slices |
| No error handling in thunks | Silent failures | Use `rejectWithValue` in thunks |
| Circular dependencies between slices | Hard to maintain, bugs | Use middleware or separate selectors |
| Not normalizing nested data | Slow updates, complex reducers | Normalize with `@reduxjs/toolkit/normalizr` |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Cannot read property of undefined" | State hydration race condition | Add loading checks or use `skipHydration` |
| Actions not triggering re-renders | Not using typed selectors | Use `useAppSelector` with proper typing |
| "Invariant violation" in Redux | State mutation outside Immer | Only mutate in `createSlice` reducers |
| Slow performance with large state | Non-memoized selectors | Use `createSelector` from Reselect |
| DevTools not showing actions | DevTools disabled in production | Set `devTools: process.env.NODE_ENV !== 'production'` |
| RTK Query cache not invalidating | Missing or wrong tags | Add `providesTags` and `invalidatesTags` |
| Serialization errors with persist | Non-serializable data in state | Add to `serializableCheck.ignoredActions` |
| Thunk errors not caught | No error boundary | Wrap with error boundary or handle in component |

## Production Readiness

### Store Configuration

```typescript
// store/index.ts - Production-ready store
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from 'redux-persist';
import storage from 'redux-persist/lib/storage';

const rootReducer = combineReducers({
  auth: authReducer,
  users: usersReducer,
  [api.reducerPath]: api.reducer,
});

const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['auth'], // Only persist auth
  blacklist: [api.reducerPath], // Don't persist API cache
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }).concat(api.middleware),
  devTools: process.env.NODE_ENV !== 'production',
});

setupListeners(store.dispatch);

export const persistor = persistStore(store);
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

### RTK Query Best Practices

```typescript
// services/api.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const baseQuery = fetchBaseQuery({
  baseUrl: '/api',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.token;
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

const baseQueryWithReauth = async (args, api, extraOptions) => {
  let result = await baseQuery(args, api, extraOptions);

  if (result.error?.status === 401) {
    const refreshResult = await baseQuery('/auth/refresh', api, extraOptions);
    if (refreshResult.data) {
      api.dispatch(setToken(refreshResult.data.token));
      result = await baseQuery(args, api, extraOptions);
    } else {
      api.dispatch(logout());
    }
  }

  return result;
};

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['User', 'Post'],
  endpoints: (builder) => ({
    getUsers: builder.query<User[], void>({
      query: () => '/users',
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'User' as const, id })), 'User']
          : ['User'],
    }),
    createUser: builder.mutation<User, CreateUserDto>({
      query: (body) => ({
        url: '/users',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['User'],
    }),
  }),
});

export const { useGetUsersQuery, useCreateUserMutation } = api;
```

### Testing Redux

```typescript
// test-utils.tsx
import { configureStore } from '@reduxjs/toolkit';
import { render, RenderOptions } from '@testing-library/react';
import { Provider } from 'react-redux';

interface ExtendedRenderOptions extends Omit<RenderOptions, 'queries'> {
  preloadedState?: Partial<RootState>;
  store?: ReturnType<typeof configureStore>;
}

export function renderWithProviders(
  ui: React.ReactElement,
  {
    preloadedState = {},
    store = configureStore({
      reducer: rootReducer,
      preloadedState,
    }),
    ...renderOptions
  }: ExtendedRenderOptions = {}
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  }
  return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
}

// Usage
test('displays user list', async () => {
  renderWithProviders(<UserList />, {
    preloadedState: {
      users: { items: [{ id: '1', name: 'John' }], loading: false },
    },
  });

  expect(screen.getByText('John')).toBeInTheDocument();
});
```

### Error Handling

```typescript
// Centralized error handling middleware
const errorMiddleware: Middleware = () => (next) => (action) => {
  if (isRejectedWithValue(action)) {
    const error = action.payload;

    if (error.status === 401) {
      // Handle unauthorized
      store.dispatch(logout());
    }

    // Log to monitoring service
    logError({
      action: action.type,
      error: error.data?.message || 'Unknown error',
    });
  }

  return next(action);
};
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| State serialization time | < 50ms |
| Action dispatch time | < 16ms |
| Cache hit ratio | > 80% |
| Test coverage | > 85% |

### Checklist

- [ ] Typed hooks (useAppDispatch, useAppSelector)
- [ ] RTK Query for data fetching
- [ ] Automatic cache invalidation
- [ ] Token refresh handling
- [ ] Redux Persist for auth state
- [ ] DevTools disabled in production
- [ ] Error handling middleware
- [ ] Test utilities with preloaded state
- [ ] Memoized selectors for derived data
- [ ] No sensitive data in Redux DevTools

## Reference Documentation
- [RTK Query](quick-ref/rtk-query.md)
- [Middleware](quick-ref/middleware.md)
