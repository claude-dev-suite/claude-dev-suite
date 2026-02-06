---
name: solid
description: |
  SolidJS reactive UI library. Covers signals, effects, and fine-grained
  reactivity.

  USE WHEN: user mentions "SolidJS", "Solid", "createSignal", "createEffect", "createMemo",
  "fine-grained reactivity", asks about "Solid patterns", "reactive primitives"

  DO NOT USE FOR: React - use `frontend-react` (different API despite similar JSX),
  Vue - use `vue-composition`, Svelte - use `svelte`, Angular - use `angular`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# SolidJS Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for WebSocket primitive, context provider, chat component, room management, Socket.IO integration, and store patterns.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `solid` for comprehensive documentation.

## When NOT to Use This Skill

Skip this skill when:
- Working with React (use `frontend-react` - APIs are different)
- Building Vue applications (use `vue-composition`)
- Using Svelte (use `svelte`)
- Working with Angular (use `angular`)
- Need server-side only logic (no framework needed)

## Component Structure

```tsx
import { createSignal, createEffect, createMemo } from 'solid-js';

interface Props {
  name: string;
  count?: number;
}

function Counter(props: Props) {
  const [localState, setLocalState] = createSignal('');
  const doubled = createMemo(() => (props.count ?? 0) * 2);

  createEffect(() => {
    console.log('Count changed:', props.count);
  });

  return (
    <div>
      <h1>Hello {props.name}</h1>
      <p>Doubled: {doubled()}</p>
      <button onClick={() => setLocalState('clicked')}>
        Click
      </button>
    </div>
  );
}
```

## Reactivity Primitives

| API | Purpose |
|-----|---------|
| `createSignal` | Reactive state |
| `createMemo` | Cached computation |
| `createEffect` | Side effects |
| `createResource` | Async data fetching |
| `createStore` | Nested reactive objects |

## Key Differences from React

- **No Virtual DOM** - fine-grained updates
- **Props are getters** - access via `props.name`
- **No dependency arrays** - auto-tracking
- **Components run once** - not on every render
- **JSX compiles differently** - expressions are reactive

## Control Flow

```tsx
import { Show, For, Switch, Match } from 'solid-js';

<Show when={isLoggedIn()} fallback={<Login />}>
  <Dashboard />
</Show>

<For each={items()}>{(item) => <Item data={item} />}</For>
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Destructuring props | Loses reactivity | Access via `props.name` |
| Using React patterns | Different paradigm | Use Solid primitives |
| Not using `<Show>` component | Manual conditional logic | Use `<Show when={}>` |
| Recreating signals in components | Components run once | Create outside or use stores |
| Using `innerHTML` without sanitization | XSS vulnerability | Use DOMPurify |
| Not cleaning up in `onCleanup` | Memory leaks | Add cleanup logic |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Props not reactive | Destructured props | Access via `props.name` |
| Signal not updating | Forgot to call setter | Use `setCount(newValue)` |
| Effect not running | Not tracking signal | Call signal inside effect: `count()` |
| Component re-running | Treating like React | Components run once, use signals |
| List not updating | Using array methods | Use `produce()` from solid-js/store |
| Memory leaks | No cleanup | Use `onCleanup()` |

## Production Readiness

### Error Handling

```tsx
import { ErrorBoundary } from 'solid-js';

function App() {
  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div>
          <p>Error: {err.message}</p>
          <button onClick={reset}>Retry</button>
        </div>
      )}
    >
      <MainContent />
    </ErrorBoundary>
  );
}
```

### Performance

```tsx
// Lazy loading components
const HeavyComponent = lazy(() => import('./HeavyComponent'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <HeavyComponent />
    </Suspense>
  );
}

// Batch updates (rarely needed)
import { batch } from 'solid-js';

batch(() => {
  setCount(count() + 1);
  setName('New Name');
});
```

### Store Patterns

```tsx
import { createStore, produce } from 'solid-js/store';

const [state, setState] = createStore({
  users: [] as User[],
  filters: { active: true },
});

// Immutable-style updates with produce
function addUser(user: User) {
  setState(produce((s) => {
    s.users.push(user);
  }));
}

// Path-based updates
setState('users', (users) => [...users, newUser]);
setState('filters', 'active', false);
```

### Testing

```tsx
import { render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import Counter from './Counter';

describe('Counter', () => {
  it('increments on click', async () => {
    const user = userEvent.setup();
    render(() => <Counter initial={0} />);

    const button = screen.getByRole('button');
    await user.click(button);

    expect(screen.getByText('Count: 1')).toBeInTheDocument();
  });
});
```

### Security

```tsx
// innerHTML - only with trusted content
<div innerHTML={sanitizedHtml} />

// Prefer text content
<div>{userInput}</div> // Safe - auto-escaped

// XSS prevention
import DOMPurify from 'dompurify';

function SafeHtml(props: { html: string }) {
  const clean = () => DOMPurify.sanitize(props.html);
  return <div innerHTML={clean()} />;
}
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Bundle size | < 30KB |
| First Contentful Paint | < 1s |
| Time to Interactive | < 1.5s |
| Memory usage | Stable |

### Checklist

- [ ] ErrorBoundary for error handling
- [ ] Suspense for async operations
- [ ] Lazy loading for code splitting
- [ ] createStore for complex state
- [ ] Virtual lists for large data
- [ ] No innerHTML with user input
- [ ] Testing with @solidjs/testing-library
- [ ] SSR with SolidStart
- [ ] Fine-grained updates (no unnecessary re-renders)
- [ ] Bundle analysis

## Reference Documentation

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `solid` for comprehensive documentation.

- [Primitives Cheatsheet](quick-ref/primitives-cheatsheet.md)
- [React Migration Guide](quick-ref/react-migration.md)
