---
name: react
description: |
  React 18+ library for building user interfaces. Covers components,
  hooks, state management, and rendering patterns.

  USE WHEN: user mentions "React component", "useState", "useEffect", "hooks",
  asks about "building UI", "component lifecycle", "React rendering", "JSX"

  DO NOT USE FOR: React 19 features - use `react-19` instead,
  React Router - use `react-router` instead,
  performance optimization - use `react-performance` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# React Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `react` for comprehensive documentation on hooks, components, and React patterns.

## Component Patterns

### Functional Components (Preferred)
```tsx
function UserCard({ name, email }: UserCardProps) {
  return (
    <div className="card">
      <h2>{name}</h2>
      <p>{email}</p>
    </div>
  );
}
```

### Props Typing
```tsx
interface Props {
  title: string;
  count?: number;
  children: React.ReactNode;
  onClick: (id: string) => void;
}
```

## Essential Hooks

| Hook | Purpose |
|------|---------|
| `useState` | Local state |
| `useEffect` | Side effects, subscriptions |
| `useContext` | Access context values |
| `useRef` | DOM refs, mutable values |
| `useMemo` | Memoize expensive computations |
| `useCallback` | Memoize functions |
| `useReducer` | Complex state logic |

## Key Patterns

- **Composition over inheritance**
- **Lift state up** for shared state
- **Props drilling** → use Context or state library
- **Controlled vs Uncontrolled** inputs

## Performance

- Use `React.memo()` for expensive pure components
- Memoize with `useMemo`/`useCallback` only when needed
- Use `key` prop correctly in lists
- Lazy load with `React.lazy()` + `Suspense`

## Production Readiness

### Security Best Practices

```tsx
// NEVER use dangerouslySetInnerHTML with user input
// BAD
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// GOOD - Sanitize with DOMPurify
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />

// Avoid exposing sensitive data in client-side state
// BAD
const [apiKey, setApiKey] = useState(process.env.API_KEY);

// GOOD - API keys should stay server-side
// Use API routes or server actions instead

// Validate all external URLs
const isValidUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
};
```

### Error Boundaries

```tsx
import { ErrorBoundary } from 'react-error-boundary';

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div role="alert">
      <p>Something went wrong:</p>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
}

// Usage
<ErrorBoundary
  FallbackComponent={ErrorFallback}
  onReset={() => window.location.reload()}
  onError={(error, info) => {
    // Log to error reporting service
    logErrorToService(error, info);
  }}
>
  <App />
</ErrorBoundary>
```

### Performance Optimization

```tsx
// Code splitting with lazy loading
const Dashboard = lazy(() => import('./Dashboard'));

function App() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Dashboard />
    </Suspense>
  );
}

// Memoization - use sparingly, only for expensive components
const ExpensiveList = memo(function ExpensiveList({ items }: Props) {
  return items.map(item => <ExpensiveItem key={item.id} {...item} />);
});

// Virtualization for large lists
import { FixedSizeList } from 'react-window';

function VirtualList({ items }: { items: Item[] }) {
  return (
    <FixedSizeList
      height={400}
      itemCount={items.length}
      itemSize={50}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>{items[index].name}</div>
      )}
    </FixedSizeList>
  );
}
```

### Accessibility (a11y)

```tsx
// Use semantic HTML
<button onClick={handleClick}>Submit</button>  // NOT <div onClick>

// ARIA labels for icons/images
<button aria-label="Close dialog" onClick={onClose}>
  <XIcon />
</button>

// Focus management
const dialogRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  dialogRef.current?.focus();
}, [isOpen]);

// Keyboard navigation
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') onClose();
  if (e.key === 'Tab') trapFocus(e);
};
```

### Testing Setup

```tsx
// Component testing with Testing Library
import { render, screen, userEvent } from '@testing-library/react';

test('submits form with user data', async () => {
  const onSubmit = vi.fn();
  render(<Form onSubmit={onSubmit} />);

  await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
  await userEvent.click(screen.getByRole('button', { name: /submit/i }));

  expect(onSubmit).toHaveBeenCalledWith({ email: 'test@example.com' });
});
```

### Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Largest Contentful Paint (LCP) | > 2.5s |
| First Input Delay (FID) | > 100ms |
| Cumulative Layout Shift (CLS) | > 0.1 |
| JavaScript bundle size | > 200KB (gzipped) |
| Component render time | > 16ms |

### Build & Bundle Optimization

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown'],
        },
      },
    },
    sourcemap: true,  // For error tracking in production
  },
});
```

### Checklist

- [ ] Error boundaries wrapping critical sections
- [ ] No sensitive data in client state
- [ ] DOMPurify for any HTML rendering
- [ ] Lazy loading for route-based code splitting
- [ ] Virtualization for large lists (>100 items)
- [ ] Semantic HTML and ARIA labels
- [ ] Keyboard navigation support
- [ ] Core Web Vitals monitored
- [ ] Bundle size optimized (<200KB gzip)
- [ ] Source maps for production debugging
- [ ] Error reporting service integrated

## When NOT to Use This Skill

- **React 19 specific features** (Actions, useActionState, use()) - Use `react-19` skill instead
- **Advanced performance optimization** - Use `react-performance` skill instead
- **Form handling patterns** - Use `react-forms` or `react-hook-form` skills instead
- **Routing** - Use `react-router` skill instead
- **Testing** - Use `react-testing` skill instead
- **Component design patterns** - Use `react-patterns` skill instead

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Mutating state directly | Doesn't trigger re-render | Use setState with new object/array |
| Missing dependency arrays | Stale closures, memory leaks | Include all dependencies or use ESLint |
| useEffect for derived state | Extra re-renders | Calculate during render or use useMemo |
| Props drilling deeply | Hard to maintain | Use Context or state library |
| Inline object/array in JSX | Breaks memoization | Extract to constant or useMemo |
| New functions in render | Child re-renders unnecessarily | Use useCallback |
| Forgetting cleanup in useEffect | Memory leaks | Return cleanup function |
| Using index as key | Incorrect re-renders | Use stable unique ID |

## Quick Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Component not re-rendering | State mutation | Use setState with new reference |
| Infinite loop in useEffect | Missing/wrong dependencies | Add deps or use functional update |
| "Cannot read property of undefined" | Async data not loaded | Add null checks or loading state |
| Memory leak warning | Missing cleanup | Return cleanup function from useEffect |
| Children not updating | Using index as key | Use unique stable ID |
| Handler not firing | Event propagation stopped | Check stopPropagation() calls |
| Stale state in callback | Closure over old state | Use functional setState |

## Reference Documentation
- [Hooks Cheatsheet](quick-ref/hooks-cheatsheet.md)
- [Component Patterns](quick-ref/component-patterns.md)
- [Deep: Hooks Guide](deep-docs/hooks/)
- [Deep: Performance](deep-docs/performance/)

