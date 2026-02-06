# SolidJS Primitives Cheatsheet

> **Knowledge Base:** Read `knowledge/solid/primitives.md` for complete documentation.

## Signals

```tsx
import { createSignal } from 'solid-js';

// Create signal (getter + setter)
const [count, setCount] = createSignal(0);
const [user, setUser] = createSignal<User | null>(null);

// Read value - MUST call as function
console.log(count()); // 0

// Set value
setCount(5);
setCount(c => c + 1); // functional update
```

## Derived State (Memos)

```tsx
import { createMemo } from 'solid-js';

const [count, setCount] = createSignal(0);

// Memoized derived value
const doubled = createMemo(() => count() * 2);

// With dependencies
const [items, setItems] = createSignal<Item[]>([]);
const activeItems = createMemo(() =>
  items().filter(item => item.active)
);
```

## Effects

```tsx
import { createEffect, onCleanup } from 'solid-js';

const [count, setCount] = createSignal(0);

// Auto-tracks dependencies
createEffect(() => {
  console.log('Count changed:', count());
});

// With cleanup
createEffect(() => {
  const interval = setInterval(() => setCount(c => c + 1), 1000);
  onCleanup(() => clearInterval(interval));
});

// Explicit tracking
import { on } from 'solid-js';
createEffect(on(count, (value, prev) => {
  console.log(`Changed from ${prev} to ${value}`);
}));
```

## Stores (Deep Reactivity)

```tsx
import { createStore, produce } from 'solid-js/store';

const [state, setState] = createStore({
  todos: [{ id: 1, text: 'Learn Solid', done: false }],
  filter: 'all'
});

// Path-based updates
setState('filter', 'active');
setState('todos', 0, 'done', true);

// With produce (Immer-like)
setState(produce(s => {
  s.todos.push({ id: 2, text: 'New todo', done: false });
}));

// Array updates
setState('todos', todos => [...todos, newTodo]);
```

## Resources (Async Data)

```tsx
import { createResource, Suspense } from 'solid-js';

const fetchUser = async (id: string) => {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
};

const [userId, setUserId] = createSignal('1');
const [user, { refetch, mutate }] = createResource(userId, fetchUser);

// In component
<Suspense fallback={<Loading />}>
  <Show when={user()}>
    {u => <UserCard user={u()} />}
  </Show>
</Suspense>
```

## Context

```tsx
import { createContext, useContext } from 'solid-js';

const ThemeContext = createContext<{ mode: string }>();

// Provider
<ThemeContext.Provider value={{ mode: 'dark' }}>
  <App />
</ThemeContext.Provider>

// Consumer
const theme = useContext(ThemeContext);
```

## Refs

```tsx
let inputRef: HTMLInputElement | undefined;

<input ref={inputRef} />
<button onClick={() => inputRef?.focus()}>Focus</button>

// Callback ref
<input ref={el => console.log('Element:', el)} />
```

**Official docs:** https://docs.solidjs.com/concepts/signals
