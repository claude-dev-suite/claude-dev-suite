# React Component Patterns

> **Knowledge Base:** Read `knowledge/react/components.md` for complete documentation.

## Functional Components

```tsx
// Basic component with props
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

const Button = ({ label, onClick, variant = 'primary' }: ButtonProps) => (
  <button className={variant} onClick={onClick}>
    {label}
  </button>
);
```

## Children Pattern

```tsx
interface CardProps {
  children: React.ReactNode;
  title?: string;
}

const Card = ({ children, title }: CardProps) => (
  <div className="card">
    {title && <h2>{title}</h2>}
    {children}
  </div>
);
```

## Render Props

```tsx
interface MouseTrackerProps {
  render: (position: { x: number; y: number }) => React.ReactNode;
}

const MouseTracker = ({ render }: MouseTrackerProps) => {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  // ... mouse tracking logic
  return <>{render(pos)}</>;
};
```

## Compound Components

```tsx
const Tabs = ({ children }: { children: React.ReactNode }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  return (
    <TabsContext.Provider value={{ activeIndex, setActiveIndex }}>
      {children}
    </TabsContext.Provider>
  );
};

Tabs.List = TabList;
Tabs.Panel = TabPanel;
```

## Higher-Order Components (HOC)

```tsx
function withAuth<P extends object>(Component: React.ComponentType<P>) {
  return function AuthenticatedComponent(props: P) {
    const { user } = useAuth();
    if (!user) return <Navigate to="/login" />;
    return <Component {...props} />;
  };
}
```

## Custom Hooks Pattern

```tsx
function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : initialValue;
  });

  const setValue = (value: T) => {
    setStoredValue(value);
    localStorage.setItem(key, JSON.stringify(value));
  };

  return [storedValue, setValue] as const;
}
```

## Controlled vs Uncontrolled

```tsx
// Controlled - React manages state
<input value={value} onChange={e => setValue(e.target.value)} />

// Uncontrolled - DOM manages state
<input ref={inputRef} defaultValue="initial" />
```

**Official docs:** https://react.dev/reference/react/components
