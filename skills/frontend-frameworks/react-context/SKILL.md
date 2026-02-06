---
name: react-context
description: |
  React Context API for state sharing across component trees. Covers createContext,
  useContext, Provider patterns, performance optimization, context composition,
  and when to use vs other state solutions.

  USE WHEN: user mentions "React Context", "createContext", "useContext", "Provider",
  "Context API", "dependency injection", asks about "avoiding prop drilling",
  "global state in React", "context composition"

  DO NOT USE FOR: React 19 use() hook with Context - use `react-19` skill instead,
  state management libraries - use specific library skills (Zustand, Redux, etc.),
  server state - use TanStack Query skill instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# React Context

> **Full Reference**: See [advanced.md](advanced.md) for context selectors with useSyncExternalStore, dependency injection, React 19 use(), testing context, and TypeScript patterns.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `react` topic: `context` for comprehensive documentation.

## Basic Usage

```tsx
import { createContext, useContext, ReactNode } from 'react';

// 1. Create context with default value
interface ThemeContextValue {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// 2. Create Provider component
function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// 3. Create custom hook for consuming
function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// 4. Use in components
function Header() {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className={theme}>
      <button onClick={toggleTheme}>
        Switch to {theme === 'light' ? 'dark' : 'light'}
      </button>
    </header>
  );
}

// 5. Wrap app with provider
function App() {
  return (
    <ThemeProvider>
      <Header />
      <Main />
    </ThemeProvider>
  );
}
```

---

## Context with Reducer

For complex state management:

```tsx
interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
}

type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: User }
  | { type: 'LOGIN_ERROR'; payload: string }
  | { type: 'LOGOUT' };

const initialState: AuthState = {
  user: null,
  isLoading: false,
  error: null,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, isLoading: true, error: null };
    case 'LOGIN_SUCCESS':
      return { ...state, isLoading: false, user: action.payload };
    case 'LOGIN_ERROR':
      return { ...state, isLoading: false, error: action.payload };
    case 'LOGOUT':
      return initialState;
    default:
      return state;
  }
}

// Separate state and dispatch contexts for optimization
const AuthStateContext = createContext<AuthState | null>(null);
const AuthDispatchContext = createContext<React.Dispatch<AuthAction> | null>(null);

function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  return (
    <AuthStateContext.Provider value={state}>
      <AuthDispatchContext.Provider value={dispatch}>
        {children}
      </AuthDispatchContext.Provider>
    </AuthStateContext.Provider>
  );
}

// Custom hooks
function useAuthState() {
  const context = useContext(AuthStateContext);
  if (!context) {
    throw new Error('useAuthState must be used within AuthProvider');
  }
  return context;
}

function useAuthDispatch() {
  const context = useContext(AuthDispatchContext);
  if (!context) {
    throw new Error('useAuthDispatch must be used within AuthProvider');
  }
  return context;
}
```

---

## Performance Optimization

### Split State and Actions

```tsx
// Problem: All consumers re-render when any value changes
const BadContext = createContext({ count: 0, increment: () => {} });

// Solution: Separate frequently changing values
const CountContext = createContext(0);
const CountActionsContext = createContext({ increment: () => {} });

function CountProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  // Memoize actions object
  const actions = useMemo(() => ({
    increment: () => setCount(c => c + 1),
    decrement: () => setCount(c => c - 1),
    reset: () => setCount(0),
  }), []);

  return (
    <CountContext.Provider value={count}>
      <CountActionsContext.Provider value={actions}>
        {children}
      </CountActionsContext.Provider>
    </CountContext.Provider>
  );
}

// Now components can subscribe to only what they need
function DisplayCount() {
  const count = useContext(CountContext);
  console.log('DisplayCount rendered'); // Only when count changes
  return <span>{count}</span>;
}

function IncrementButton() {
  const { increment } = useContext(CountActionsContext);
  console.log('IncrementButton rendered'); // Never re-renders!
  return <button onClick={increment}>+</button>;
}
```

---

## Context Composition

Combine multiple contexts cleanly:

```tsx
// Compose multiple providers
function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SettingsProvider>
          <NotificationsProvider>
            {children}
          </NotificationsProvider>
        </SettingsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

// Or use a composition helper
type ProviderProps = { children: ReactNode };
type Provider = React.ComponentType<ProviderProps>;

function composeProviders(...providers: Provider[]) {
  return function ComposedProvider({ children }: ProviderProps) {
    return providers.reduceRight(
      (child, Provider) => <Provider>{child}</Provider>,
      children
    );
  };
}

const AppProviders = composeProviders(
  ThemeProvider,
  AuthProvider,
  SettingsProvider,
  NotificationsProvider
);

// Usage
function App() {
  return (
    <AppProviders>
      <Router />
    </AppProviders>
  );
}
```

---

## Context vs Other State Solutions

| Solution | Use Case |
|----------|----------|
| Context | Dependency injection, theme, auth, rarely changing data |
| useState | Local component state |
| useReducer | Complex local state logic |
| Zustand/Jotai | Frequent updates, performance critical |
| TanStack Query | Server state, caching |
| Redux | Large apps, time-travel debugging |

### When NOT to Use Context

```tsx
// ❌ Frequently changing data (causes unnecessary re-renders)
const PositionContext = createContext({ x: 0, y: 0 });

// ✅ Use a proper state library instead
const useMouseStore = create((set) => ({
  position: { x: 0, y: 0 },
  setPosition: (pos) => set({ position: pos }),
}));

// ❌ Complex nested updates
const FormContext = createContext({
  values: {},
  errors: {},
  touched: {},
  // ...many more fields
});

// ✅ Use a form library
const { register, handleSubmit } = useForm();
```

---

## Common Pitfalls

| Issue | Cause | Solution |
|-------|-------|----------|
| Unnecessary re-renders | Context value not memoized | Use useMemo for value |
| "Cannot read undefined" | Missing Provider | Add null check or throw in hook |
| Stale closures | Missing dependencies | Add to dependency array |
| Performance issues | Large frequently updating context | Split into multiple contexts |

## Best Practices

- Always create custom hooks for consuming context
- Memoize context value with useMemo
- Split state and dispatch into separate contexts
- Use TypeScript for type safety
- Throw error if context used outside provider
- Don't use context for frequently changing values
- Don't pass entire state when only part is needed
- Don't deeply nest too many providers

## When NOT to Use This Skill

- **React 19 use() hook** - Use `react-19` skill for conditional context reading
- **State management libraries** - Use Zustand, Redux, or Jotai skills for complex state
- **Server state** - Use TanStack Query skill for data fetching and caching
- **Form state** - Use React Hook Form skill for form-specific state

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Context for frequently changing values | Performance issues, many re-renders | Use state library (Zustand) or useSyncExternalStore |
| Not memoizing context value | New object every render, all consumers re-render | Use useMemo for context value |
| Single context with all state | Unnecessary re-renders | Split into multiple focused contexts |
| Not throwing in custom hook | Poor error messages | Throw error if context is null/undefined |
| Deeply nested providers | Hard to read, maintain | Use provider composition helper |
| Context for local component state | Unnecessary complexity | Use useState in component |
| Default value that's never used | Misleading | Use null/undefined and throw in hook |

## Quick Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| "Cannot read property of undefined" | Missing Provider | Wrap component tree with Provider |
| All consumers re-rendering | Context value not memoized | Wrap value in useMemo |
| Context value undefined | Used outside Provider | Check Provider wraps component |
| Poor performance | Large frequently-changing context | Split context or use state library |
| Type errors | Wrong context type | Check TypeScript generic in createContext |
| Stale values | Missing dependencies | Add values to useMemo dependencies |
| Nested providers confusing | Too many providers | Use composition helper function |

## Reference Documentation

- [React Context](https://react.dev/reference/react/useContext)
- [Scaling Up with Reducer and Context](https://react.dev/learn/scaling-up-with-reducer-and-context)
- MCP: `mcp__documentation__fetch_docs` → technology: `react`, topic: `context`
