# React Hooks Quick Reference

## State & Lifecycle

```tsx
// State
const [value, setValue] = useState(initial);
setValue(newValue);           // Direct update
setValue(prev => prev + 1);   // Functional update

// Reducer
const [state, dispatch] = useReducer(reducer, initialState);
dispatch({ type: 'ACTION' });

// Effect (runs after render)
useEffect(() => {
  // Effect code
  return () => { /* cleanup */ };
}, [dependencies]);

// Layout Effect (runs before paint)
useLayoutEffect(() => { /* measure DOM */ }, []);
```

## References & Context

```tsx
// DOM ref
const ref = useRef<HTMLElement>(null);
ref.current?.focus();

// Mutable value (no re-render)
const count = useRef(0);
count.current++;

// Context
const value = useContext(MyContext);
```

## Performance

```tsx
// Memoize value
const computed = useMemo(() => expensiveFn(a, b), [a, b]);

// Memoize function
const handler = useCallback((x) => doSomething(x, id), [id]);

// Non-blocking update
const [isPending, startTransition] = useTransition();
startTransition(() => setSlowState(value));

// Defer value
const deferred = useDeferredValue(value);
```

## Hook Rules

| Rule | Do | Don't |
|------|-----|-------|
| Top level only | Call in component body | Call in if/for/nested functions |
| React functions only | Components, custom hooks | Regular JS functions |
| Consistent order | Same hooks every render | Conditional hooks |

## Dependency Array

```tsx
[]        // Run once on mount
[a, b]    // Run when a or b changes
// omit    // Run every render (rarely needed)
```

## Custom Hook Template

```tsx
function useMyHook(param: string) {
  const [state, setState] = useState(null);

  useEffect(() => {
    // Effect using param
  }, [param]);

  const action = useCallback(() => {
    // Action logic
  }, []);

  return { state, action };
}
```
