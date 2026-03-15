# Zustand Middleware

> **Knowledge Base:** Read `knowledge/zustand/basics.md` for complete documentation.

## Persist Middleware

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface UserStore {
  user: User | null;
  setUser: (user: User) => void;
  logout: () => void;
}

const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      logout: () => set({ user: null }),
    }),
    {
      name: 'user-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user }), // Only persist user
    }
  )
);
```

## Devtools Middleware

```ts
import { devtools } from 'zustand/middleware';

const useStore = create<Store>()(
  devtools(
    (set) => ({
      count: 0,
      increment: () => set(
        (state) => ({ count: state.count + 1 }),
        false,
        'increment' // Action name for devtools
      ),
    }),
    { name: 'CounterStore' }
  )
);
```

## Immer Middleware

```ts
import { immer } from 'zustand/middleware/immer';

interface TodoStore {
  todos: Todo[];
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
}

const useTodoStore = create<TodoStore>()(
  immer((set) => ({
    todos: [],
    addTodo: (text) => set((state) => {
      state.todos.push({ id: Date.now().toString(), text, done: false });
    }),
    toggleTodo: (id) => set((state) => {
      const todo = state.todos.find(t => t.id === id);
      if (todo) todo.done = !todo.done;
    }),
  }))
);
```

## Combining Middleware

```ts
const useStore = create<Store>()(
  devtools(
    persist(
      immer((set) => ({
        // Store definition
      })),
      { name: 'store' }
    ),
    { name: 'Store' }
  )
);
```

## Subscriptions Middleware

```ts
import { subscribeWithSelector } from 'zustand/middleware';

const useStore = create<Store>()(
  subscribeWithSelector((set) => ({
    count: 0,
    increment: () => set((s) => ({ count: s.count + 1 })),
  }))
);

// Subscribe to specific selector
useStore.subscribe(
  (state) => state.count,
  (count, prevCount) => {
    console.log(`Count changed from ${prevCount} to ${count}`);
  }
);
```

**Official docs:** https://docs.pmnd.rs/zustand/guides/connect-to-state-with-url-hash
