# Pinia Stores Quick Reference

> **Knowledge Base:** Read `knowledge/pinia/stores.md` for complete documentation.

## Setup

```typescript
// main.ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

const app = createApp(App);
app.use(createPinia());
app.mount('#app');
```

## Option Store

```typescript
// stores/counter.ts
import { defineStore } from 'pinia';

export const useCounterStore = defineStore('counter', {
  state: () => ({
    count: 0,
    name: 'Counter',
  }),

  getters: {
    doubleCount: (state) => state.count * 2,
    // Getter with argument
    countPlusN: (state) => {
      return (n: number) => state.count + n;
    },
    // Using other getters
    quadrupleCount(): number {
      return this.doubleCount * 2;
    },
  },

  actions: {
    increment() {
      this.count++;
    },
    async fetchCount() {
      const response = await fetch('/api/count');
      this.count = await response.json();
    },
    // Using other actions
    incrementBy(amount: number) {
      this.count += amount;
    },
  },
});
```

## Setup Store (Composition API)

```typescript
// stores/user.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useUserStore = defineStore('user', () => {
  // State
  const user = ref<User | null>(null);
  const loading = ref(false);

  // Getters
  const isLoggedIn = computed(() => !!user.value);
  const fullName = computed(() =>
    user.value ? `${user.value.firstName} ${user.value.lastName}` : ''
  );

  // Actions
  async function login(email: string, password: string) {
    loading.value = true;
    try {
      const response = await api.login(email, password);
      user.value = response.user;
    } finally {
      loading.value = false;
    }
  }

  function logout() {
    user.value = null;
  }

  return {
    user,
    loading,
    isLoggedIn,
    fullName,
    login,
    logout,
  };
});
```

## Using Stores

```vue
<script setup lang="ts">
import { useCounterStore } from '@/stores/counter';
import { storeToRefs } from 'pinia';

const counterStore = useCounterStore();

// Direct access (reactive)
counterStore.count;
counterStore.increment();

// Destructure with storeToRefs (preserves reactivity)
const { count, doubleCount } = storeToRefs(counterStore);

// Actions can be destructured directly
const { increment, fetchCount } = counterStore;
</script>

<template>
  <div>
    <p>Count: {{ count }}</p>
    <p>Double: {{ doubleCount }}</p>
    <button @click="increment">+1</button>
  </div>
</template>
```

## Modifying State

```typescript
const store = useCounterStore();

// Direct mutation
store.count++;

// $patch with object
store.$patch({
  count: store.count + 1,
  name: 'New Name',
});

// $patch with function (for complex changes)
store.$patch((state) => {
  state.count++;
  state.items.push({ id: 1, name: 'Item' });
});

// Replace entire state
store.$state = { count: 0, name: 'Reset' };

// Reset to initial state
store.$reset();
```

## Store Interaction

```typescript
// stores/cart.ts
import { defineStore } from 'pinia';
import { useUserStore } from './user';

export const useCartStore = defineStore('cart', {
  state: () => ({
    items: [] as CartItem[],
  }),

  actions: {
    async checkout() {
      const userStore = useUserStore();

      if (!userStore.isLoggedIn) {
        throw new Error('Must be logged in');
      }

      await api.checkout({
        userId: userStore.user!.id,
        items: this.items,
      });

      this.items = [];
    },
  },
});
```

## Subscriptions

```typescript
const store = useCounterStore();

// Subscribe to state changes
const unsubscribe = store.$subscribe((mutation, state) => {
  console.log('Mutation type:', mutation.type);
  console.log('Store id:', mutation.storeId);
  console.log('New state:', state);

  // Persist to localStorage
  localStorage.setItem('counter', JSON.stringify(state));
});

// Subscribe to actions
store.$onAction(({ name, args, after, onError }) => {
  console.log(`Action ${name} called with args:`, args);

  after((result) => {
    console.log(`Action ${name} finished with result:`, result);
  });

  onError((error) => {
    console.error(`Action ${name} failed:`, error);
  });
});

// Unsubscribe
unsubscribe();
```

## Plugins

```typescript
// plugins/persist.ts
import { PiniaPluginContext } from 'pinia';

export function persistPlugin({ store }: PiniaPluginContext) {
  // Restore state from localStorage
  const saved = localStorage.getItem(store.$id);
  if (saved) {
    store.$patch(JSON.parse(saved));
  }

  // Save state changes
  store.$subscribe((mutation, state) => {
    localStorage.setItem(store.$id, JSON.stringify(state));
  });
}

// main.ts
const pinia = createPinia();
pinia.use(persistPlugin);
```

## TypeScript

```typescript
// Type-safe store
interface UserState {
  user: User | null;
  loading: boolean;
}

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    user: null,
    loading: false,
  }),
  // ...
});

// Infer types from store
type UserStore = ReturnType<typeof useUserStore>;
```

**Official docs:** https://pinia.vuejs.org/core-concepts/
