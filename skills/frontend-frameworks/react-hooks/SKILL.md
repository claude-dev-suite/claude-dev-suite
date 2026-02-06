---
name: react-hooks
description: |
  React Hooks patterns, rules, and custom hook development. Covers all built-in
  hooks (useState, useEffect, useContext, etc.), performance hooks, and patterns
  for creating reusable custom hooks.

  USE WHEN: user mentions "custom hooks", "hook rules", "useState", "useEffect",
  "useReducer", "useCallback", "useMemo", asks about "hook dependencies",
  "creating hooks", "hook patterns"

  DO NOT USE FOR: React 19 use() hook - use `react-19` skill instead,
  Context API details - use `react-context` skill instead,
  form-specific hooks - use `react-forms` or `react-hook-form` skills instead
allowed-tools: Read, Grep, Glob, Write, Edit
---

# React Hooks

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `react` topic: `hooks` for comprehensive documentation on all React hooks and custom hook patterns.

## Built-in Hooks Reference

### State Hooks

| Hook | Purpose | When to Use |
|------|---------|-------------|
| `useState` | Local component state | Simple state values |
| `useReducer` | Complex state logic | Multiple sub-values, complex updates |

```tsx
// useState - simple state
const [count, setCount] = useState(0);
const [user, setUser] = useState<User | null>(null);

// useReducer - complex state
type Action = { type: 'increment' } | { type: 'decrement' } | { type: 'reset'; payload: number };

function reducer(state: number, action: Action): number {
  switch (action.type) {
    case 'increment': return state + 1;
    case 'decrement': return state - 1;
    case 'reset': return action.payload;
  }
}

const [count, dispatch] = useReducer(reducer, 0);
```

### Effect Hooks

| Hook | Purpose | Timing |
|------|---------|--------|
| `useEffect` | Side effects, subscriptions | After paint |
| `useLayoutEffect` | DOM measurements | Before paint |
| `useInsertionEffect` | CSS-in-JS injection | Before DOM mutations |

```tsx
// useEffect - most common
useEffect(() => {
  const subscription = api.subscribe(id);
  return () => subscription.unsubscribe(); // Cleanup
}, [id]); // Dependency array

// useLayoutEffect - measure DOM before paint
useLayoutEffect(() => {
  const { height } = ref.current.getBoundingClientRect();
  setHeight(height);
}, []);
```

### Context Hook

```tsx
const ThemeContext = createContext<Theme>('light');

function Component() {
  const theme = useContext(ThemeContext); // Reads nearest Provider value
  return <div className={theme}>...</div>;
}
```

### Ref Hooks

```tsx
// DOM reference
const inputRef = useRef<HTMLInputElement>(null);
useEffect(() => {
  inputRef.current?.focus();
}, []);

// Mutable value (no re-render on change)
const renderCount = useRef(0);
renderCount.current++; // Doesn't cause re-render

// useImperativeHandle - customize ref exposed to parent
useImperativeHandle(ref, () => ({
  focus: () => inputRef.current?.focus(),
  scrollIntoView: () => inputRef.current?.scrollIntoView(),
}), []);
```

### Performance Hooks

```tsx
// useMemo - cache expensive calculations
const sortedItems = useMemo(() => {
  return items.sort((a, b) => a.name.localeCompare(b.name));
}, [items]);

// useCallback - cache function references
const handleClick = useCallback((id: string) => {
  setSelected(id);
}, []); // Empty deps = stable reference

// useTransition - non-blocking state updates
const [isPending, startTransition] = useTransition();
startTransition(() => {
  setSearchResults(filterLargeList(query)); // Won't block UI
});

// useDeferredValue - defer updating expensive UI
const deferredQuery = useDeferredValue(query);
// UI shows stale value while new value computes
```

### Other Hooks

```tsx
// useId - unique IDs for accessibility
const id = useId();
<label htmlFor={id}>Email</label>
<input id={id} type="email" />

// useSyncExternalStore - subscribe to external stores
const state = useSyncExternalStore(
  store.subscribe,
  store.getSnapshot,
  store.getServerSnapshot // Optional: for SSR
);
```

## Rules of Hooks

### 1. Only Call at Top Level

```tsx
// BAD - conditional hook
if (condition) {
  const [value, setValue] = useState(0); // ERROR
}

// BAD - hook in loop
for (const item of items) {
  useEffect(() => {}, [item]); // ERROR
}

// GOOD - conditional logic inside hook
const [value, setValue] = useState(0);
useEffect(() => {
  if (condition) {
    // Do something
  }
}, [condition]);
```

### 2. Only Call in React Functions

```tsx
// GOOD - in component
function Component() {
  const [state, setState] = useState(0);
}

// GOOD - in custom hook
function useCustomHook() {
  const [state, setState] = useState(0);
  return state;
}

// BAD - regular function
function helper() {
  const [state, setState] = useState(0); // ERROR
}
```

## Custom Hooks Patterns

### Basic Pattern

```tsx
function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : initialValue;
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}

// Usage
const [theme, setTheme] = useLocalStorage('theme', 'dark');
```

### Fetch Hook with Loading/Error States

```tsx
interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

function useFetch<T>(url: string): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData(await response.json());
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
```

### Debounce Hook

```tsx
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Usage
const [query, setQuery] = useState('');
const debouncedQuery = useDebounce(query, 300);

useEffect(() => {
  if (debouncedQuery) {
    searchAPI(debouncedQuery);
  }
}, [debouncedQuery]);
```

### Toggle Hook

```tsx
function useToggle(initialValue = false) {
  const [value, setValue] = useState(initialValue);

  const toggle = useCallback(() => setValue(v => !v), []);
  const setTrue = useCallback(() => setValue(true), []);
  const setFalse = useCallback(() => setValue(false), []);

  return { value, toggle, setTrue, setFalse };
}

// Usage
const { value: isOpen, toggle, setFalse: close } = useToggle();
```

### Previous Value Hook

```tsx
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

// Usage - detect changes
const prevCount = usePrevious(count);
useEffect(() => {
  if (prevCount !== undefined && prevCount !== count) {
    console.log(`Count changed from ${prevCount} to ${count}`);
  }
}, [count, prevCount]);
```

### Media Query Hook

```tsx
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    window.matchMedia(query).matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

// Usage
const isMobile = useMediaQuery('(max-width: 768px)');
const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
```

## Common Pitfalls

### 1. Missing Dependencies

```tsx
// BAD - missing userId dependency
useEffect(() => {
  fetchUser(userId);
}, []); // Lint error: userId missing

// GOOD
useEffect(() => {
  fetchUser(userId);
}, [userId]);
```

### 2. Object/Array Dependencies

```tsx
// BAD - new object every render
useEffect(() => {
  doSomething(options);
}, [{ page: 1, limit: 10 }]); // Always triggers

// GOOD - use useMemo or primitive values
const options = useMemo(() => ({ page, limit }), [page, limit]);
useEffect(() => {
  doSomething(options);
}, [options]);
```

### 3. Stale Closures

```tsx
// BAD - stale count value
useEffect(() => {
  const interval = setInterval(() => {
    setCount(count + 1); // Always uses initial count
  }, 1000);
  return () => clearInterval(interval);
}, []); // count not in deps but used

// GOOD - functional update
useEffect(() => {
  const interval = setInterval(() => {
    setCount(c => c + 1); // Uses current value
  }, 1000);
  return () => clearInterval(interval);
}, []);
```

## When NOT to Use This Skill

- **React 19 use() hook** - Use `react-19` skill instead
- **Context API implementation** - Use `react-context` skill for full Context patterns
- **Form state management** - Use `react-forms` or `react-hook-form` skills instead
- **Performance optimization** - Use `react-performance` skill for detailed optimization strategies

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Calling hooks conditionally | Breaks hook order | Always call at component top level |
| Missing dependencies | Stale closures | Include all dependencies in array |
| Empty dependency array with state | Stale state in callback | Use functional update or add dependency |
| Object/array as dependency | Always triggers | Use useMemo or individual primitives |
| useEffect for derived state | Extra render cycles | Calculate during render |
| Not cleaning up effects | Memory leaks | Return cleanup function |
| Custom hook not starting with 'use' | Linter doesn't check | Name all hooks use* |

## Quick Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Hook order error | Conditional hook call | Move condition inside hook |
| Infinite loop | Missing/wrong dependencies | Check dependency array |
| Stale closure | Missing dependency | Add to dependency array or use functional update |
| Effect runs on every render | Missing dependency array | Add [] or proper dependencies |
| Cleanup not running | Not returning function | Return cleanup from useEffect |
| useCallback not working | New inline function | Check dependency array |
| useMemo not memoizing | Dependencies changing | Check if dependencies are stable |

## Reference

- [Quick Reference: Hooks Cheatsheet](quick-ref/hooks-cheatsheet.md)
- [Official React Hooks Reference](https://react.dev/reference/react/hooks)
