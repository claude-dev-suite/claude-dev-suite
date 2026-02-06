# React Context Advanced Patterns

## Context Selectors (with useSyncExternalStore)

```tsx
import { useSyncExternalStore, useCallback } from 'react';

function createStore<T>(initialState: T) {
  let state = initialState;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    setState: (newState: Partial<T> | ((prev: T) => Partial<T>)) => {
      state = {
        ...state,
        ...(typeof newState === 'function' ? newState(state) : newState),
      };
      listeners.forEach(listener => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const store = createStore({
  user: null as User | null,
  theme: 'light' as 'light' | 'dark',
  notifications: [] as Notification[],
});

const StoreContext = createContext(store);

// Selector hook - only re-renders when selected value changes
function useSelector<T>(selector: (state: typeof store extends { getState: () => infer S } ? S : never) => T): T {
  const store = useContext(StoreContext);

  return useSyncExternalStore(
    store.subscribe,
    useCallback(() => selector(store.getState()), [store, selector])
  );
}

// Usage - only re-renders when theme changes
function ThemeToggle() {
  const theme = useSelector(state => state.theme);
  const store = useContext(StoreContext);

  return (
    <button onClick={() => store.setState({ theme: theme === 'light' ? 'dark' : 'light' })}>
      Current: {theme}
    </button>
  );
}

// This doesn't re-render when theme changes!
function NotificationBadge() {
  const count = useSelector(state => state.notifications.length);
  return <span className="badge">{count}</span>;
}
```

---

## Context for Dependency Injection

```tsx
interface ApiClient {
  get<T>(url: string): Promise<T>;
  post<T>(url: string, data: unknown): Promise<T>;
}

interface Logger {
  log(message: string): void;
  error(message: string, error?: Error): void;
}

interface Services {
  api: ApiClient;
  logger: Logger;
}

const ServicesContext = createContext<Services | null>(null);

// Production implementation
const productionServices: Services = {
  api: {
    async get(url) {
      const res = await fetch(url);
      return res.json();
    },
    async post(url, data) {
      const res = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.json();
    },
  },
  logger: {
    log: (msg) => console.log(msg),
    error: (msg, err) => console.error(msg, err),
  },
};

// Test implementation
const testServices: Services = {
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  logger: {
    log: vi.fn(),
    error: vi.fn(),
  },
};

function ServicesProvider({
  children,
  services = productionServices,
}: {
  children: ReactNode;
  services?: Services;
}) {
  return (
    <ServicesContext.Provider value={services}>
      {children}
    </ServicesContext.Provider>
  );
}

function useServices() {
  const context = useContext(ServicesContext);
  if (!context) {
    throw new Error('useServices must be used within ServicesProvider');
  }
  return context;
}

// Usage in component
function UserProfile({ userId }: { userId: string }) {
  const { api, logger } = useServices();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    logger.log(`Fetching user ${userId}`);
    api.get<User>(`/users/${userId}`)
      .then(setUser)
      .catch(err => logger.error('Failed to fetch user', err));
  }, [userId, api, logger]);

  return user ? <div>{user.name}</div> : <Skeleton />;
}

// In tests
test('fetches user on mount', async () => {
  const mockUser = { id: '1', name: 'John' };
  testServices.api.get.mockResolvedValue(mockUser);

  render(
    <ServicesProvider services={testServices}>
      <UserProfile userId="1" />
    </ServicesProvider>
  );

  expect(testServices.api.get).toHaveBeenCalledWith('/users/1');
});
```

---

## React 19: use() with Context

```tsx
import { use } from 'react';

const SettingsContext = createContext<Settings | null>(null);

function SettingsDisplay({ showAdvanced }: { showAdvanced: boolean }) {
  // Can be called conditionally!
  if (showAdvanced) {
    const settings = use(SettingsContext);
    return <AdvancedSettings settings={settings} />;
  }

  return <BasicSettings />;
}
```

---

## Testing Context

```tsx
// Create a wrapper for testing
function createWrapper(initialValue?: Partial<AuthState>) {
  const TestAuthProvider = ({ children }: { children: ReactNode }) => {
    const [state, dispatch] = useReducer(authReducer, {
      ...initialState,
      ...initialValue,
    });

    return (
      <AuthStateContext.Provider value={state}>
        <AuthDispatchContext.Provider value={dispatch}>
          {children}
        </AuthDispatchContext.Provider>
      </AuthStateContext.Provider>
    );
  };

  return TestAuthProvider;
}

// In tests
test('shows user name when authenticated', () => {
  render(<UserGreeting />, {
    wrapper: createWrapper({
      user: { id: '1', name: 'John' },
    }),
  });

  expect(screen.getByText('Hello, John')).toBeInTheDocument();
});

// Testing custom hook
import { renderHook, act } from '@testing-library/react';

test('useAuth login flow', async () => {
  const wrapper = createWrapper();

  const { result } = renderHook(() => useAuth(), { wrapper });

  expect(result.current.isAuthenticated).toBe(false);

  await act(async () => {
    await result.current.login({ email: 'test@test.com', password: 'password' });
  });

  expect(result.current.isAuthenticated).toBe(true);
});
```

---

## TypeScript Patterns

### Default Value with Type Safety

```tsx
// Option 1: Non-null assertion in custom hook
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

// Option 2: Generic createContext with required provider
function createSafeContext<T>(displayName: string) {
  const Context = createContext<T | undefined>(undefined);
  Context.displayName = displayName;

  function useContextSafe() {
    const context = useContext(Context);
    if (context === undefined) {
      throw new Error(`use${displayName} must be used within ${displayName}Provider`);
    }
    return context;
  }

  return [Context.Provider, useContextSafe] as const;
}

// Usage
const [ThemeProvider, useTheme] = createSafeContext<ThemeContextValue>('Theme');
```

---

## Context Composition Helper

```tsx
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

function App() {
  return (
    <AppProviders>
      <Router />
    </AppProviders>
  );
}
```
