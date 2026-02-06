# React to SolidJS Migration Guide

> **Knowledge Base:** Read `knowledge/solid/migration.md` for complete documentation.

## Key Differences

| React | SolidJS |
|-------|---------|
| Virtual DOM | Fine-grained reactivity |
| Re-renders entire component | Updates only what changed |
| Hooks run on every render | Primitives run once on setup |
| JSX returns virtual nodes | JSX compiles to real DOM |

## State

```tsx
// React
const [count, setCount] = useState(0);
console.log(count); // direct access

// SolidJS
const [count, setCount] = createSignal(0);
console.log(count()); // MUST call as function
```

## Effects

```tsx
// React
useEffect(() => {
  document.title = `Count: ${count}`;
}, [count]); // explicit deps

// SolidJS
createEffect(() => {
  document.title = `Count: ${count()}`; // auto-tracks
});
```

## Memoization

```tsx
// React
const doubled = useMemo(() => count * 2, [count]);
const handleClick = useCallback(() => setCount(c => c + 1), []);

// SolidJS - NO useCallback needed!
const doubled = createMemo(() => count() * 2);
const handleClick = () => setCount(c => c + 1); // stable reference
```

## Conditional Rendering

```tsx
// React
{isLoggedIn ? <Dashboard /> : <Login />}
{items.map(item => <Item key={item.id} {...item} />)}

// SolidJS
<Show when={isLoggedIn()} fallback={<Login />}>
  <Dashboard />
</Show>

<For each={items()}>
  {(item) => <Item {...item} />}
</For>
```

## Props

```tsx
// React
function Button({ onClick, children }) {
  return <button onClick={onClick}>{children}</button>;
}

// SolidJS - props are reactive, don't destructure early!
function Button(props) {
  return <button onClick={props.onClick}>{props.children}</button>;
}

// Or use splitProps for partial destructuring
import { splitProps } from 'solid-js';
function Button(props) {
  const [local, others] = splitProps(props, ['onClick']);
  return <button onClick={local.onClick} {...others} />;
}
```

## Context

```tsx
// React
const ThemeContext = createContext();
const theme = useContext(ThemeContext);

// SolidJS
const ThemeContext = createContext();
const theme = useContext(ThemeContext);
// Same API!
```

## Refs

```tsx
// React
const inputRef = useRef<HTMLInputElement>(null);
<input ref={inputRef} />
inputRef.current?.focus();

// SolidJS
let inputRef: HTMLInputElement | undefined;
<input ref={inputRef} />
inputRef?.focus(); // no .current needed
```

## Data Fetching

```tsx
// React (with React Query)
const { data, isLoading } = useQuery(['user', id], fetchUser);

// SolidJS
const [user] = createResource(() => id(), fetchUser);
// user() is the data, user.loading for loading state
```

## Migration Gotchas

1. **Don't destructure props** - breaks reactivity
2. **Call signals as functions** - `count()` not `count`
3. **No dependency arrays** - tracking is automatic
4. **Components run once** - not on every update
5. **No need for memo/useCallback** - references are stable

**Official docs:** https://docs.solidjs.com/guides/migrating-from-react
