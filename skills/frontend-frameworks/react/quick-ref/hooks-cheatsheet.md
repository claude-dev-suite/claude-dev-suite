# React Hooks Cheatsheet

> **Knowledge Base:** Read `knowledge/react/hooks.md` for complete documentation.

## State Hooks

```tsx
// useState - primitive state
const [count, setCount] = useState(0);
const [user, setUser] = useState<User | null>(null);

// useReducer - complex state
const [state, dispatch] = useReducer(reducer, initialState);
```

## Effect Hooks

```tsx
// useEffect - side effects
useEffect(() => {
  const subscription = subscribe();
  return () => subscription.unsubscribe(); // cleanup
}, [dependency]);

// useLayoutEffect - sync DOM updates
useLayoutEffect(() => {
  measureElement();
}, []);
```

## Ref Hooks

```tsx
// useRef - mutable ref
const inputRef = useRef<HTMLInputElement>(null);
const countRef = useRef(0); // doesn't trigger re-render

// useImperativeHandle - expose methods
useImperativeHandle(ref, () => ({
  focus: () => inputRef.current?.focus()
}));
```

## Performance Hooks

```tsx
// useMemo - memoize values
const filtered = useMemo(
  () => items.filter(item => item.active),
  [items]
);

// useCallback - memoize functions
const handleClick = useCallback(
  () => setCount(c => c + 1),
  []
);
```

## Context Hook

```tsx
const theme = useContext(ThemeContext);
```

## React 19 Hooks

```tsx
// useTransition - non-blocking updates
const [isPending, startTransition] = useTransition();

// useDeferredValue - defer expensive renders
const deferredQuery = useDeferredValue(query);

// useId - unique IDs for accessibility
const id = useId();
```

## Rules of Hooks
1. Only call at top level (not in loops/conditions)
2. Only call from React functions
3. Custom hooks must start with `use`

**Official docs:** https://react.dev/reference/react/hooks
