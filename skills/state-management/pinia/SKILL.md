---
name: pinia
description: |
  Pinia state management for Vue. Covers stores, actions, and
  getters. Use for Vue 3 state management.

  USE WHEN: user mentions "pinia", "vue state", "vue store", asks about "defineStore", "vue 3 state management", "composition stores", "vue global state", "storeToRefs", "pinia plugin"

  DO NOT USE FOR: React apps - use `zustand` or `redux-toolkit`; server data - use composables with fetch/axios; Vuex projects - migrate to Pinia first
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Pinia Core Knowledge

## Store Definition

```typescript
import { defineStore } from 'pinia';

export const useCounterStore = defineStore('counter', {
  state: () => ({
    count: 0,
    name: 'Eduardo',
  }),

  getters: {
    doubleCount: (state) => state.count * 2,
    doublePlusOne(): number {
      return this.doubleCount + 1;
    },
  },

  actions: {
    increment() {
      this.count++;
    },
    async fetchData() {
      const data = await api.getData();
      this.count = data.count;
    },
  },
});
```


> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `pinia` for comprehensive documentation.

## Setup Syntax (Composition API)

```typescript
export const useCounterStore = defineStore('counter', () => {
  const count = ref(0);
  const name = ref('Eduardo');

  const doubleCount = computed(() => count.value * 2);

  function increment() {
    count.value++;
  }

  async function fetchData() {
    const data = await api.getData();
    count.value = data.count;
  }

  return { count, name, doubleCount, increment, fetchData };
});
```

## Usage in Components

```vue
<script setup>
import { useCounterStore } from '@/stores/counter';
import { storeToRefs } from 'pinia';

const store = useCounterStore();

// Reactive destructure
const { count, doubleCount } = storeToRefs(store);

// Actions can be destructured directly
const { increment } = store;
</script>

<template>
  <button @click="increment">{{ count }}</button>
  <p>Double: {{ doubleCount }}</p>
</template>
```

## Persist Plugin

```typescript
import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';

const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);

// In store
export const useUserStore = defineStore('user', {
  state: () => ({ token: '' }),
  persist: true, // or { storage: sessionStorage }
});
```

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| React applications | `zustand` or `redux-toolkit` |
| Server state (API data, caching) | Vue composables with `useFetch` or `useAsyncData` |
| Component-local state | Vue's `ref`/`reactive` |
| Vuex legacy projects | Migrate to Pinia first, or keep Vuex for now |
| Simple key-value storage | `localStorage` or `sessionStorage` directly |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using Options API stores | Less flexible than Composition API | Use `defineStore` with setup function |
| Not using `storeToRefs` | Loses reactivity on destructuring | Wrap with `storeToRefs(store)` |
| Storing server data in Pinia | No cache invalidation | Use composables with fetch/axios |
| Persisting everything | Large storage, security risks | Only persist necessary state |
| Mutating state from components | Breaks single source of truth | Always use actions |
| Circular dependencies between stores | Hard to debug, initialization issues | Use getters or separate composables |
| Not resetting stores on logout | Data leaks between users | Call `$reset()` or reset manually |
| Using global Pinia instance everywhere | Hard to test | Pass pinia instance explicitly in tests |
| No TypeScript types | Loses type safety | Define interfaces for state/getters/actions |
| Accessing stores outside setup | Can cause reactivity issues | Only use stores in setup or composables |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Lost reactivity after destructuring | Not using `storeToRefs` | Use `const { count } = storeToRefs(store)` |
| "getActivePinia was called with no active Pinia" | Store used before app mount or outside Vue | Ensure `app.use(pinia)` before accessing stores |
| Persist not working | Plugin not installed | Add `pinia.use(piniaPluginPersistedstate)` |
| State not resetting with `$reset()` | Using setup syntax without reset logic | Manually implement reset or use Options API |
| TypeScript errors with getters | Wrong return type inference | Explicitly type getter return value |
| Actions not updating components | State not reactive | Use `ref()` or `reactive()` in setup stores |
| Hot reload breaks stores | HMR issues with Vite | Add `if (import.meta.hot) { acceptHMRUpdate(...) }` |
| Can't access router in store | Router not injected | Inject router via plugin or pass as argument |

## Production Readiness

### Store Organization

```typescript
// stores/index.ts - Centralized store setup
import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import { markRaw } from 'vue';
import router from '@/router';

export const pinia = createPinia();

// Add plugins
pinia.use(piniaPluginPersistedstate);

// Add router to all stores
pinia.use(({ store }) => {
  store.router = markRaw(router);
});

// stores/authStore.ts - Production-ready auth store
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(null);
  const isAuthenticated = computed(() => !!token.value);

  async function login(credentials: LoginCredentials) {
    try {
      const response = await api.login(credentials);
      token.value = response.token;
      user.value = response.user;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  function logout() {
    token.value = null;
    user.value = null;
    // Clear all other stores
    const userStore = useUserStore();
    userStore.$reset();
  }

  return { user, token, isAuthenticated, login, logout };
}, {
  persist: {
    key: 'auth',
    storage: localStorage,
    paths: ['token'], // Only persist token
  },
});
```

### Security Best Practices

```typescript
// Secure persistence with encryption
import CryptoJS from 'crypto-js';
import type { StorageLike } from 'pinia-plugin-persistedstate';

const SECRET = import.meta.env.VITE_STORE_SECRET;

const encryptedStorage: StorageLike = {
  getItem(key: string): string | null {
    const encrypted = localStorage.getItem(key);
    if (!encrypted) return null;
    try {
      const bytes = CryptoJS.AES.decrypt(encrypted, SECRET);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    const encrypted = CryptoJS.AES.encrypt(value, SECRET).toString();
    localStorage.setItem(key, encrypted);
  },
};

export const useSecureStore = defineStore('secure', {
  state: () => ({ sensitiveData: null }),
  persist: {
    storage: encryptedStorage,
  },
});
```

### Testing Stores

```typescript
// tests/stores/authStore.test.ts
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '@/stores/authStore';
import { vi } from 'vitest';

describe('AuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should login successfully', async () => {
    const store = useAuthStore();
    vi.spyOn(api, 'login').mockResolvedValue({
      token: 'jwt-token',
      user: { id: '1', name: 'John' },
    });

    const result = await store.login({ email: 'test@example.com', password: 'password' });

    expect(result.success).toBe(true);
    expect(store.isAuthenticated).toBe(true);
    expect(store.user?.name).toBe('John');
  });

  it('should clear state on logout', () => {
    const store = useAuthStore();
    store.token = 'token';
    store.user = { id: '1', name: 'John' };

    store.logout();

    expect(store.token).toBeNull();
    expect(store.user).toBeNull();
    expect(store.isAuthenticated).toBe(false);
  });
});
```

### Error Handling

```typescript
// stores/errorStore.ts
export const useErrorStore = defineStore('error', () => {
  const errors = ref<AppError[]>([]);

  function addError(error: AppError) {
    errors.value.push({
      ...error,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    });

    // Auto-remove after 5 seconds
    setTimeout(() => {
      removeError(error.id);
    }, 5000);
  }

  function removeError(id: string) {
    errors.value = errors.value.filter((e) => e.id !== id);
  }

  return { errors, addError, removeError };
});

// Usage with composable
export function useApi<T>(fn: () => Promise<T>) {
  const errorStore = useErrorStore();
  const loading = ref(false);
  const data = ref<T | null>(null);

  async function execute() {
    loading.value = true;
    try {
      data.value = await fn();
    } catch (error) {
      errorStore.addError({ message: error.message, type: 'error' });
    } finally {
      loading.value = false;
    }
  }

  return { data, loading, execute };
}
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Store hydration time | < 50ms |
| Action execution time | < 100ms |
| Memory footprint | Minimal |
| Test coverage | > 90% |

### Checklist

- [ ] Composition API stores (setup syntax)
- [ ] storeToRefs for reactive destructuring
- [ ] Persist plugin for auth state
- [ ] Encrypted storage for sensitive data
- [ ] $reset() for clearing state
- [ ] Router accessible in stores
- [ ] Comprehensive store tests
- [ ] Error handling with error store
- [ ] DevTools integration
- [ ] No circular dependencies between stores

## Reference Documentation
- [Composition Stores](quick-ref/composition.md)
- [Plugins](quick-ref/plugins.md)
