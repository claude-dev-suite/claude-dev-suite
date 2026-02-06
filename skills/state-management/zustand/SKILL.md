---
name: zustand
description: |
  Zustand state management for React. Covers stores, actions, and
  persistence. Use for simple global state management.

  USE WHEN: user mentions "zustand", "global state", "store", asks about "simple state management", "lightweight state", "create store", "persist state", "middleware", "devtools integration"

  DO NOT USE FOR: server data - use `tanstack-query` or `swr` instead; Vue apps - use `pinia`; complex async workflows - use `redux-toolkit`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Zustand Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `zustand` for comprehensive documentation.

## Basic Store

```typescript
import { create } from 'zustand';

interface CounterStore {
  count: number;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
}

const useCounterStore = create<CounterStore>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  decrement: () => set((state) => ({ count: state.count - 1 })),
  reset: () => set({ count: 0 }),
}));

// Usage
function Counter() {
  const { count, increment } = useCounterStore();
  return <button onClick={increment}>{count}</button>;
}
```

## Async Actions

```typescript
interface UserStore {
  user: User | null;
  loading: boolean;
  error: string | null;
  fetchUser: (id: string) => Promise<void>;
}

const useUserStore = create<UserStore>((set) => ({
  user: null,
  loading: false,
  error: null,
  fetchUser: async (id) => {
    set({ loading: true, error: null });
    try {
      const user = await api.getUser(id);
      set({ user, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },
}));
```

## Selectors

```typescript
// Select specific state (prevents unnecessary re-renders)
const count = useCounterStore((state) => state.count);
const increment = useCounterStore((state) => state.increment);

// Shallow comparison for objects
import { shallow } from 'zustand/shallow';
const { user, loading } = useUserStore(
  (state) => ({ user: state.user, loading: state.loading }),
  shallow
);
```

## Persist Middleware

```typescript
import { persist } from 'zustand/middleware';

const useStore = create(
  persist<MyStore>(
    (set) => ({
      // ... state and actions
    }),
    {
      name: 'my-store',
      partialize: (state) => ({ count: state.count }), // Only persist count
    }
  )
);
```

## DevTools

```typescript
import { devtools } from 'zustand/middleware';

const useStore = create(
  devtools<MyStore>((set) => ({
    // ... state and actions
  }), { name: 'MyStore' })
);
```

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Server state management (API data, caching) | `tanstack-query` or `swr` |
| Vue 3 applications | `pinia` |
| Complex async workflows with side effects | `redux-toolkit` |
| Form state management | React Hook Form or Formik |
| URL-based state (routing) | React Router or Next.js router |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Storing server data in Zustand | No cache invalidation, manual refetching | Use TanStack Query or SWR |
| Creating multiple stores for everything | Increases complexity unnecessarily | Use slices or combine related state |
| Mutating state without `set()` | Breaks reactivity | Always use `set()` or `immer` middleware |
| Storing derived state | Duplicates data, sync issues | Use selectors with computation |
| Not using selectors | Unnecessary re-renders | Use atomic selectors for each value |
| Persisting sensitive data unencrypted | Security vulnerability | Encrypt with `createJSONStorage` custom storage |
| Using stores outside React components | Memory leaks, testing issues | Keep store access in components/hooks |
| Not resetting state on logout | Data leaks between users | Call `setState(initialState)` or `$reset()` |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Component not re-rendering | Not using selector or wrong selector | Use `(state) => state.value` selector |
| State updates not persisting | Persist middleware not configured | Add `persist()` middleware with storage |
| "Cannot read property of undefined" | State hydration race condition | Add `skipHydration` check or loading state |
| Multiple re-renders | Selecting entire state object | Use shallow equality or atomic selectors |
| Tests failing with store state | Store state persists between tests | Reset with `setState()` in `beforeEach()` |
| DevTools not working | Middleware order incorrect | Wrap with `devtools()` as outer middleware |
| Memory leaks | Subscriptions not cleaned up | Use `store.subscribe()` with cleanup |
| TypeScript errors with middleware | Wrong generic order | Follow `create<T>()(middleware(...))` pattern |

## Production Readiness

### Store Organization

```typescript
// stores/userStore.ts - Typed store with slices
import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface UserState {
  user: User | null;
  isAuthenticated: boolean;
}

interface UserActions {
  setUser: (user: User | null) => void;
  logout: () => void;
}

type UserStore = UserState & UserActions;

const initialState: UserState = {
  user: null,
  isAuthenticated: false,
};

export const useUserStore = create<UserStore>()(
  devtools(
    persist(
      subscribeWithSelector(
        immer((set) => ({
          ...initialState,
          setUser: (user) =>
            set((state) => {
              state.user = user;
              state.isAuthenticated = !!user;
            }),
          logout: () => set(initialState),
        }))
      ),
      {
        name: 'user-store',
        partialize: (state) => ({ user: state.user }),
        // Don't persist to localStorage in SSR
        skipHydration: typeof window === 'undefined',
      }
    ),
    { name: 'UserStore', enabled: process.env.NODE_ENV === 'development' }
  )
);
```

### Security Best Practices

```typescript
// Secure persistence with encryption
import { persist, createJSONStorage } from 'zustand/middleware';
import CryptoJS from 'crypto-js';

const SECRET_KEY = process.env.NEXT_PUBLIC_STORE_KEY!;

const encryptedStorage = {
  getItem: (name: string) => {
    const encrypted = localStorage.getItem(name);
    if (!encrypted) return null;
    const decrypted = CryptoJS.AES.decrypt(encrypted, SECRET_KEY);
    return decrypted.toString(CryptoJS.enc.Utf8);
  },
  setItem: (name: string, value: string) => {
    const encrypted = CryptoJS.AES.encrypt(value, SECRET_KEY).toString();
    localStorage.setItem(name, encrypted);
  },
  removeItem: (name: string) => localStorage.removeItem(name),
};

export const useAuthStore = create(
  persist(
    (set) => ({ token: null }),
    {
      name: 'auth-store',
      storage: createJSONStorage(() => encryptedStorage),
    }
  )
);
```

### Testing Stores

```typescript
// Store testing with isolated state
import { act, renderHook } from '@testing-library/react';
import { useUserStore } from './userStore';

describe('UserStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useUserStore.setState({ user: null, isAuthenticated: false });
  });

  it('should set user and authenticate', () => {
    const { result } = renderHook(() => useUserStore());

    act(() => {
      result.current.setUser({ id: '1', name: 'John' });
    });

    expect(result.current.user?.name).toBe('John');
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('should logout and clear state', () => {
    useUserStore.setState({ user: { id: '1', name: 'John' }, isAuthenticated: true });

    const { result } = renderHook(() => useUserStore());

    act(() => {
      result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });
});
```

### Performance Optimization

```typescript
// Atomic selectors to prevent unnecessary re-renders
const userName = useUserStore((state) => state.user?.name);
const isAuthenticated = useUserStore((state) => state.isAuthenticated);

// createSelectors helper for auto-generated selectors
import { StoreApi, UseBoundStore } from 'zustand';

type WithSelectors<S> = S extends { getState: () => infer T }
  ? S & { use: { [K in keyof T]: () => T[K] } }
  : never;

const createSelectors = <S extends UseBoundStore<StoreApi<object>>>(
  _store: S
) => {
  const store = _store as WithSelectors<typeof _store>;
  store.use = {};
  for (const k of Object.keys(store.getState())) {
    (store.use as any)[k] = () => store((s) => s[k as keyof typeof s]);
  }
  return store;
};

// Usage
export const useUserStore = createSelectors(useUserStoreBase);
const userName = useUserStore.use.user()?.name;
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Store re-render count | Minimal |
| Hydration time | < 50ms |
| Bundle size impact | < 5KB |
| Test coverage | > 90% |

### Checklist

- [ ] TypeScript types for state and actions
- [ ] Devtools enabled (dev only)
- [ ] Atomic selectors for performance
- [ ] Persist sensitive data encrypted
- [ ] SSR hydration handled
- [ ] Store reset on logout
- [ ] Immer for complex updates
- [ ] subscribeWithSelector for reactions
- [ ] Comprehensive unit tests
- [ ] No sensitive data in plain localStorage

## Reference Documentation
- [Middleware](quick-ref/middleware.md)
- [Patterns](quick-ref/patterns.md)
