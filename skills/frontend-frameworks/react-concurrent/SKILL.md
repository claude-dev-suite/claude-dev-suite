---
name: react-concurrent
description: |
  React Concurrent Features for responsive UIs. Covers useTransition,
  useDeferredValue, Suspense, startTransition, concurrent rendering patterns,
  and priority-based updates.

  USE WHEN: user mentions "useTransition", "useDeferredValue", "startTransition",
  "concurrent rendering", "non-urgent updates", asks about "keeping UI responsive",
  "priority updates in React"

  DO NOT USE FOR: React 17 and earlier (concurrent mode not available),
  Simple applications without heavy rendering, Non-React frameworks
allowed-tools: Read, Grep, Glob, Write, Edit
---
# React Concurrent Features

> **Full Reference**: See [advanced.md](advanced.md) for advanced concurrent patterns including priority-based updates, optimistic updates with transitions, router integration, form actions, and debugging techniques.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `react`, topic: `concurrent` for comprehensive documentation.

## When NOT to Use This Skill

Skip this skill when:
- Using React 17 or earlier (not available)
- Building simple apps with fast renders
- All state updates are already fast (< 16ms)
- Working with non-React frameworks
- Server Components handle the work (Next.js App Router)

## Overview

Concurrent React allows interrupting renders to keep the UI responsive:

```
Traditional Rendering:
[Update starts]────────────────────────[Render complete]
                    UI blocked!

Concurrent Rendering:
[Update starts]──[pause]──[higher priority]──[resume]──[complete]
                    UI remains responsive!
```

## useTransition

Mark state updates as non-urgent (can be interrupted):

```tsx
import { useState, useTransition } from 'react';

function TabContainer() {
  const [tab, setTab] = useState('home');
  const [isPending, startTransition] = useTransition();

  function selectTab(nextTab: string) {
    startTransition(() => {
      setTab(nextTab);
    });
  }

  return (
    <div>
      <nav>
        {['home', 'about', 'contact'].map((t) => (
          <button key={t} onClick={() => selectTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      <div className={isPending ? 'opacity-50' : ''}>
        {tab === 'home' && <Home />}
        {tab === 'about' && <About />}
        {tab === 'contact' && <Contact />}
      </div>
    </div>
  );
}
```

## useDeferredValue

Defer updating a value to keep UI responsive:

```tsx
import { useState, useDeferredValue, memo } from 'react';

function SearchPage() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const isStale = query !== deferredQuery;

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search..."
      />

      <div className={isStale ? 'opacity-50' : ''}>
        <SearchResults query={deferredQuery} />
      </div>
    </div>
  );
}

// Memoize to actually benefit from deferred value
const SearchResults = memo(function SearchResults({ query }: { query: string }) {
  const results = useMemo(() => {
    return items.filter(item =>
      item.name.toLowerCase().includes(query.toLowerCase())
    );
  }, [query]);

  return <ul>{results.map(item => <li key={item.id}>{item.name}</li>)}</ul>;
});
```

## startTransition (without Hook)

For use outside components or when you don't need `isPending`:

```tsx
import { startTransition } from 'react';

function handleClick() {
  startTransition(() => {
    setPage('/heavy-page');
  });
}
```

## Suspense with Transitions

```tsx
function App() {
  const [tab, setTab] = useState('home');
  const [isPending, startTransition] = useTransition();

  return (
    <div>
      <nav>
        <button onClick={() => startTransition(() => setTab('posts'))}>
          Posts
        </button>
      </nav>

      <Suspense fallback={<TabSkeleton />}>
        <div className={isPending ? 'opacity-50' : ''}>
          {tab === 'posts' && <Posts />}
        </div>
      </Suspense>
    </div>
  );
}
```

## useTransition vs useDeferredValue

| Feature | useTransition | useDeferredValue |
|---------|---------------|------------------|
| Purpose | Wrap state updates | Defer a value |
| Usage | When you control the update | When you receive a value |
| Returns | `[isPending, startTransition]` | Deferred value |
| Use case | Button clicks, form submits | Props from parent |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Wrapping every state update | Adds unnecessary complexity | Only for heavy updates |
| Not memoizing child components | No benefit from deferred value | Use `memo()` |
| Using for fast operations | Performance overhead | Reserve for slow renders (> 50ms) |
| Ignoring isPending state | User sees no feedback | Show loading indicator |
| Multiple transitions unnecessarily | Confusing behavior | Batch related updates |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| No performance improvement | Child not memoized | Add `memo()` to component |
| Still blocking UI | Synchronous heavy computation | Move to Web Worker |
| isPending always false | Update completes too fast | No transition needed |
| Stale UI shown too long | No loading indicator | Check and display isPending |
| Transition not working | Using in React < 18 | Upgrade to React 18+ |

## Best Practices

- ✅ Use for user-initiated heavy updates
- ✅ Combine with `memo()` for list components
- ✅ Show visual feedback during pending state
- ✅ Use for route transitions
- ✅ Prefer `useDeferredValue` for received props
- ❌ Don't wrap every state update
- ❌ Don't use for fast operations
- ❌ Don't forget to memoize child components

## Reference Documentation

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `react`, topic: `concurrent` for comprehensive documentation.

- [useTransition](https://react.dev/reference/react/useTransition)
- [useDeferredValue](https://react.dev/reference/react/useDeferredValue)
