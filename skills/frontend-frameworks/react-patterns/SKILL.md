---
name: react-patterns
description: |
  React component patterns and architectural best practices. Covers compound
  components, render props, higher-order components, custom hooks, composition,
  state machines, and container/presentational patterns.

  USE WHEN: user mentions "compound components", "render props", "HOC", "higher-order component",
  "composition pattern", "component architecture", asks about "reusable components",
  "component patterns", "slots pattern", "polymorphic components"

  DO NOT USE FOR: Basic React components - use `react` skill instead,
  hooks implementation - use `react-hooks` skill instead,
  performance patterns - use `react-performance` skill instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# React Patterns

> **Full Reference**: See [advanced.md](advanced.md) for Container/Presentational, State Machine, Slots, Polymorphic, and Provider patterns.

## Compound Components

Components that work together to form a cohesive UI:

```tsx
import { createContext, useContext, useState, ReactNode } from 'react';

interface AccordionContextValue {
  openItems: Set<string>;
  toggle: (id: string) => void;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

function useAccordion() {
  const context = useContext(AccordionContext);
  if (!context) {
    throw new Error('Accordion components must be used within Accordion');
  }
  return context;
}

function Accordion({ children, multiple = false, defaultOpen = [] }: AccordionProps) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set(defaultOpen));

  const toggle = (id: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (!multiple) next.clear();
        next.add(id);
      }
      return next;
    });
  };

  return (
    <AccordionContext.Provider value={{ openItems, toggle }}>
      <div className="accordion">{children}</div>
    </AccordionContext.Provider>
  );
}

// Attach sub-components
Accordion.Item = Item;
Accordion.Trigger = Trigger;
Accordion.Content = Content;
```

---

## Render Props

Pass a function as children or prop to control rendering:

```tsx
interface DataFetcherProps<T> {
  url: string;
  children: (state: {
    data: T | null;
    loading: boolean;
    error: Error | null;
    refetch: () => void;
  }) => ReactNode;
}

function DataFetcher<T>({ url, children }: DataFetcherProps<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch');
      setData(await res.json());
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return <>{children({ data, loading, error, refetch: fetchData })}</>;
}

// Usage
<DataFetcher<User[]> url="/api/users">
  {({ data, loading, error, refetch }) => {
    if (loading) return <Spinner />;
    if (error) return <ErrorMessage error={error} onRetry={refetch} />;
    return <ul>{data?.map(user => <li key={user.id}>{user.name}</li>)}</ul>;
  }}
</DataFetcher>
```

---

## Higher-Order Components (HOC)

Wrap components to add functionality:

```tsx
function withLoading<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  LoadingComponent: React.ComponentType = DefaultSpinner
) {
  return function WithLoadingComponent(props: P & { loading: boolean }) {
    const { loading, ...restProps } = props;
    if (loading) return <LoadingComponent />;
    return <WrappedComponent {...(restProps as P)} />;
  };
}

// HOC with Refs
function withLogger<P extends object>(WrappedComponent: React.ComponentType<P>) {
  const WithLogger = React.forwardRef<unknown, P>((props, ref) => {
    useEffect(() => { console.log('Props changed:', props); }, [props]);
    return <WrappedComponent {...props} ref={ref} />;
  });
  WithLogger.displayName = `WithLogger(${WrappedComponent.displayName || WrappedComponent.name})`;
  return WithLogger;
}
```

---

## Custom Hooks Pattern

Extract reusable logic into hooks:

```tsx
// useLocalStorage
function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch { return initialValue; }
  });

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    const valueToStore = value instanceof Function ? value(storedValue) : value;
    setStoredValue(valueToStore);
    window.localStorage.setItem(key, JSON.stringify(valueToStore));
  }, [key, storedValue]);

  return [storedValue, setValue] as const;
}

// useDebounce
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// useOnClickOutside
function useOnClickOutside(
  ref: RefObject<HTMLElement>,
  handler: (event: MouseEvent | TouchEvent) => void
) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      handler(event);
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}
```

---

## Composition Pattern

Prefer composition over inheritance:

```tsx
function Card({ children, className }: CardProps) {
  return <div className={`card ${className || ''}`}>{children}</div>;
}

function CardHeader({ children }: { children: ReactNode }) {
  return <div className="card-header">{children}</div>;
}

function CardBody({ children }: { children: ReactNode }) {
  return <div className="card-body">{children}</div>;
}

// Specialized cards through composition
function UserCard({ user }: { user: User }) {
  return (
    <Card>
      <CardHeader>
        <Avatar src={user.avatar} />
        <h3>{user.name}</h3>
      </CardHeader>
      <CardBody><p>{user.bio}</p></CardBody>
    </Card>
  );
}
```

---

## Best Practices Summary

| Pattern | When to Use |
|---------|-------------|
| Compound Components | Flexible, related components |
| Render Props | Share behavior, control rendering |
| HOC | Cross-cutting concerns, legacy code |
| Custom Hooks | Reusable stateful logic |
| Composition | Building complex from simple |
| Container/Presentational | Separate logic from UI |
| State Machine | Complex state transitions |
| Polymorphic | Flexible element types |

- Use custom hooks for reusable logic
- Keep components small and focused
- Use TypeScript for better DX
- Don't overuse patterns - KISS
- Don't nest too many HOCs

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Over-engineering simple components | Unnecessary complexity | Use simple props |
| Nesting too many HOCs | Props collision, hard to debug | Use composition or hooks |
| Render props without memoization | Performance issues | Memoize render function |
| Deep prop drilling | Hard to maintain | Use Context or Compound Components |
| Context for frequently changing values | Performance issues | Use state library |

## Quick Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Context not available | Missing Provider | Wrap with Provider component |
| HOC losing refs | Not forwarding refs | Use React.forwardRef |
| Render props re-rendering | Function identity changes | Memoize render function |

## Reference Documentation

- [React Patterns](https://reactpatterns.com/)
- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)
