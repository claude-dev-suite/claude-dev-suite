---
name: react-performance
description: |
  React performance optimization techniques and best practices. Covers
  memoization, virtualization, code splitting, profiling, React DevTools,
  bundle optimization, and avoiding common performance pitfalls.

  USE WHEN: user mentions "React performance", "slow React app", "memoization", "virtualization",
  "code splitting", "lazy loading", "bundle size", asks about "optimizing React",
  "React DevTools Profiler", "preventing re-renders"

  DO NOT USE FOR: React 19 Compiler - use `react-19` skill instead,
  basic React concepts - use `react` skill instead,
  testing performance - use `react-testing` skill instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# React Performance

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `react` topic: `performance` for comprehensive documentation on React performance optimization and profiling techniques.

> **Full Reference**: See [advanced.md](advanced.md) for Profiling with React DevTools, Bundle Optimization, Image Optimization, and Web Workers.

## Memoization

### React.memo

Prevents re-renders when props haven't changed:

```tsx
// Only re-renders when props change (shallow comparison)
const ExpensiveComponent = memo(function ExpensiveComponent({
  data,
  onItemClick,
}: Props) {
  return (
    <ul>
      {data.map(item => (
        <li key={item.id} onClick={() => onItemClick(item.id)}>
          {item.name}
        </li>
      ))}
    </ul>
  );
});

// With custom comparison
const OptimizedComponent = memo(
  function OptimizedComponent({ user }: Props) {
    return <div>{user.name}</div>;
  },
  (prevProps, nextProps) => prevProps.user.id === nextProps.user.id
);
```

### When to Use memo

```tsx
// ✅ Good: Expensive component with stable parent
const ExpensiveList = memo(function ExpensiveList({ items }: { items: Item[] }) {
  return items.map(item => <ExpensiveItem key={item.id} item={item} />);
});

// ❌ Bad: Simple component, memo overhead not worth it
const SimpleText = memo(function SimpleText({ text }: { text: string }) {
  return <span>{text}</span>;
});

// ❌ Bad: Props always change anyway
function Parent() {
  // New object on every render - memo is useless!
  return <MemoizedChild data={{ value: 1 }} />;
}
```

### useMemo

Memoize expensive calculations:

```tsx
function ProductList({ products, filter }: Props) {
  const filteredProducts = useMemo(() => {
    return products
      .filter(p => p.category === filter.category)
      .filter(p => p.price >= filter.minPrice && p.price <= filter.maxPrice)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, filter.category, filter.minPrice, filter.maxPrice]);

  return (
    <ul>
      {filteredProducts.map(p => <ProductCard key={p.id} product={p} />)}
    </ul>
  );
}

// ❌ Don't overuse - simple operations don't need memoization
const total = useMemo(() => a + b, [a, b]); // Overkill!
```

### useCallback

Memoize functions to prevent child re-renders:

```tsx
function Parent() {
  const [count, setCount] = useState(0);

  // ✅ Stable reference for child components
  const handleClick = useCallback((id: string) => {
    console.log('Clicked:', id);
  }, []);

  // ✅ Dependencies that change function behavior
  const handleSubmit = useCallback((data: FormData) => {
    submitWithCount(data, count);
  }, [count]);

  return (
    <>
      <ChildComponent onClick={handleClick} />
      <Form onSubmit={handleSubmit} />
    </>
  );
}
```

---

## Virtualization

Render only visible items for large lists:

```tsx
import { FixedSizeList } from 'react-window';

function VirtualList({ items }: { items: Item[] }) {
  const Row = ({ index, style }: { index: number; style: CSSProperties }) => (
    <div style={style} className="list-item">
      {items[index].name}
    </div>
  );

  return (
    <FixedSizeList
      height={400}
      width="100%"
      itemCount={items.length}
      itemSize={50}
    >
      {Row}
    </FixedSizeList>
  );
}
```

### With TanStack Virtual

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
    overscan: 5,
  });

  return (
    <div ref={parentRef} style={{ height: 400, overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: virtualItem.size,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {items[virtualItem.index].name}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Code Splitting

### Route-based Splitting

```tsx
import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';

const Home = lazy(() => import('./pages/Home'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  );
}
```

### Component-based Splitting

```tsx
const HeavyChart = lazy(() => import('./HeavyChart'));

function Dashboard() {
  const [showChart, setShowChart] = useState(false);

  return (
    <div>
      <button onClick={() => setShowChart(true)}>Show Chart</button>

      {showChart && (
        <Suspense fallback={<ChartSkeleton />}>
          <HeavyChart data={data} />
        </Suspense>
      )}
    </div>
  );
}
```

### Preloading

```tsx
const Dashboard = lazy(() => import('./Dashboard'));
const preloadDashboard = () => import('./Dashboard');

function NavLink() {
  return (
    <Link
      to="/dashboard"
      onMouseEnter={preloadDashboard}
      onFocus={preloadDashboard}
    >
      Dashboard
    </Link>
  );
}
```

---

## Avoiding Unnecessary Re-renders

### Stable References

```tsx
// ❌ Bad: New object on every render
function Parent() {
  return <Child style={{ color: 'red' }} />;
}

// ✅ Good: Stable reference
const style = { color: 'red' };
function Parent() {
  return <Child style={style} />;
}

// ✅ Good: useMemo for dynamic values
function Parent({ color }) {
  const style = useMemo(() => ({ color }), [color]);
  return <Child style={style} />;
}
```

### Component Composition

```tsx
// ❌ Bad: Entire component re-renders on count change
function App() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <button onClick={() => setCount(c => c + 1)}>{count}</button>
      <ExpensiveComponent />  {/* Re-renders on every count change! */}
    </div>
  );
}

// ✅ Good: Move state down
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}

function App() {
  return (
    <div>
      <Counter />
      <ExpensiveComponent />  {/* Doesn't re-render! */}
    </div>
  );
}

// ✅ Good: Pass children as props
function Counter({ children }) {
  const [count, setCount] = useState(0);
  return (
    <div>
      <button onClick={() => setCount(c => c + 1)}>{count}</button>
      {children}  {/* Doesn't re-render! */}
    </div>
  );
}
```

---

## State Management Optimization

### Batching Updates

```tsx
// React 18+ automatically batches these
function handleClick() {
  setCount(c => c + 1);
  setFlag(f => !f);
  setText('updated');
  // Only ONE re-render!
}
```

### Derived State

```tsx
// ❌ Bad: Synchronized state
function Form() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setTotal(items.reduce((sum, item) => sum + item.price, 0));
  }, [items]);  // Extra re-render!
}

// ✅ Good: Calculate during render
function Form() {
  const [items, setItems] = useState([]);
  const total = items.reduce((sum, item) => sum + item.price, 0);
}

// ✅ Good: useMemo for expensive calculations
function Form() {
  const [items, setItems] = useState([]);
  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.price, 0),
    [items]
  );
}
```

---

## Common Pitfalls

| Issue | Cause | Solution |
|-------|-------|----------|
| Slow initial render | Large bundle | Code splitting, lazy loading |
| Slow updates | Too many re-renders | memo, useMemo, useCallback |
| Janky scrolling | Rendering all list items | Virtualization |
| Memory leaks | Uncleaned effects | Proper cleanup functions |
| Layout thrashing | Forced synchronous layout | Batch DOM reads/writes |

## Best Practices

- ✅ Profile before optimizing
- ✅ Use React DevTools Profiler
- ✅ Virtualize long lists (>100 items)
- ✅ Code split at route level
- ✅ Memoize expensive computations
- ✅ Use stable references for objects/functions
- ❌ Don't over-optimize prematurely
- ❌ Don't wrap everything in memo
- ❌ Don't block main thread with heavy JS

## When NOT to Use This Skill

- **React 19 Compiler optimization** - Use `react-19` skill for compiler-specific features
- **Basic React development** - Use `react` skill for general component development
- **Testing** - Use `react-testing` skill for performance testing strategies
- **Non-performance React issues** - This skill is specifically for optimization

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Premature optimization | Wasted effort, complex code | Profile first, optimize what matters |
| Wrapping everything in memo | Overhead, no benefit | Only memoize expensive components |
| useMemo for cheap calculations | More overhead than savings | Only memoize expensive operations |
| Inline object/function in JSX | Breaks child memoization | Extract to constant or useCallback |
| Not using key prop correctly | Full list re-render | Use stable unique IDs |
| Rendering entire list | Slow scrolling | Use virtualization for >100 items |
| Large bundle without code splitting | Slow initial load | Split by routes |

## Quick Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Slow initial load | Large bundle size | Code split, lazy load routes |
| Janky scrolling | Rendering all list items | Use react-window or TanStack Virtual |
| Frequent unnecessary re-renders | Props changing identity | Memoize objects/functions with useMemo/useCallback |
| Slow component updates | Heavy computation in render | Move to useMemo or Web Worker |
| Memory leaks | Uncleaned effects/subscriptions | Add cleanup functions to useEffect |
| Large JavaScript payload | Not tree-shaking | Import only what you need |

## Reference Documentation

- [React Profiler](https://react.dev/reference/react/Profiler)
- [Performance Optimization](https://react.dev/learn/render-and-commit)
- MCP: `mcp__documentation__fetch_docs` → technology: `react`, topic: `performance`
