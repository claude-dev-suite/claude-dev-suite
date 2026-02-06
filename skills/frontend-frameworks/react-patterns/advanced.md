# Advanced React Patterns

## Container/Presentational Pattern

Separate logic from presentation:

```tsx
// Presentational Component (dumb)
interface UserListViewProps {
  users: User[];
  loading: boolean;
  error: Error | null;
  onUserClick: (userId: string) => void;
  onRetry: () => void;
}

function UserListView({
  users,
  loading,
  error,
  onUserClick,
  onRetry,
}: UserListViewProps) {
  if (loading) return <Skeleton count={5} />;
  if (error) return <ErrorState message={error.message} onRetry={onRetry} />;
  if (users.length === 0) return <EmptyState message="No users found" />;

  return (
    <ul className="user-list">
      {users.map((user) => (
        <li key={user.id} onClick={() => onUserClick(user.id)}>
          <Avatar src={user.avatar} />
          <span>{user.name}</span>
        </li>
      ))}
    </ul>
  );
}

// Container Component (smart)
function UserListContainer() {
  const navigate = useNavigate();
  const { data: users, isLoading, error, refetch } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  });

  const handleUserClick = useCallback((userId: string) => {
    navigate(`/users/${userId}`);
  }, [navigate]);

  return (
    <UserListView
      users={users ?? []}
      loading={isLoading}
      error={error}
      onUserClick={handleUserClick}
      onRetry={refetch}
    />
  );
}
```

---

## State Machine Pattern

Use state machines for complex state logic:

```tsx
type AuthState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'authenticated'; user: User }
  | { status: 'error'; error: string };

type AuthAction =
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; user: User }
  | { type: 'LOGIN_ERROR'; error: string }
  | { type: 'LOGOUT' };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (state.status) {
    case 'idle':
      if (action.type === 'LOGIN_START') {
        return { status: 'loading' };
      }
      break;
    case 'loading':
      if (action.type === 'LOGIN_SUCCESS') {
        return { status: 'authenticated', user: action.user };
      }
      if (action.type === 'LOGIN_ERROR') {
        return { status: 'error', error: action.error };
      }
      break;
    case 'authenticated':
      if (action.type === 'LOGOUT') {
        return { status: 'idle' };
      }
      break;
    case 'error':
      if (action.type === 'LOGIN_START') {
        return { status: 'loading' };
      }
      break;
  }
  return state;
}
```

---

## Slots Pattern

Named content areas like Vue slots:

```tsx
function Layout({ children }: LayoutProps) {
  const slots = {
    header: null as ReactNode,
    sidebar: null as ReactNode,
    content: null as ReactNode,
    footer: null as ReactNode,
  };

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      if (child.type === Header) slots.header = child.props.children;
      if (child.type === Sidebar) slots.sidebar = child.props.children;
      if (child.type === Content) slots.content = child.props.children;
      if (child.type === Footer) slots.footer = child.props.children;
    }
  });

  return (
    <div className="layout">
      <header>{slots.header}</header>
      <div className="layout-body">
        <aside>{slots.sidebar}</aside>
        <main>{slots.content}</main>
      </div>
      <footer>{slots.footer}</footer>
    </div>
  );
}

Layout.Header = Header;
Layout.Sidebar = Sidebar;
Layout.Content = Content;
Layout.Footer = Footer;

// Usage
function App() {
  return (
    <Layout>
      <Layout.Header><Logo /><Navigation /></Layout.Header>
      <Layout.Sidebar><Menu items={menuItems} /></Layout.Sidebar>
      <Layout.Content><h1>Welcome</h1></Layout.Content>
      <Layout.Footer><Copyright /></Layout.Footer>
    </Layout>
  );
}
```

---

## Polymorphic Component Pattern

Components that can render as different elements:

```tsx
type AsProp<C extends React.ElementType> = { as?: C };

type PolymorphicComponentProps<
  C extends React.ElementType,
  Props = {}
> = React.PropsWithChildren<Props & AsProp<C>> &
  Omit<React.ComponentPropsWithoutRef<C>, keyof (AsProp<C> & Props)>;

function Box<C extends React.ElementType = 'div'>({
  as,
  children,
  className,
  ...props
}: PolymorphicComponentProps<C, { className?: string }>) {
  const Component = as || 'div';
  return <Component className={className} {...props}>{children}</Component>;
}

// Usage
<Box>Default div</Box>
<Box as="section">As section</Box>
<Box as="a" href="/about">As link</Box>
<Box as="button" onClick={() => alert('clicked')}>As button</Box>
```

---

## Provider Pattern

Combine multiple providers cleanly:

```tsx
interface Provider {
  component: React.ComponentType<{ children: ReactNode }>;
  props?: Record<string, unknown>;
}

function combineProviders(providers: Provider[]) {
  return function CombinedProvider({ children }: { children: ReactNode }) {
    return providers.reduceRight((acc, { component: Provider, props = {} }) => {
      return <Provider {...props}>{acc}</Provider>;
    }, children);
  };
}

const AppProviders = combineProviders([
  { component: ThemeProvider, props: { theme: 'light' } },
  { component: AuthProvider },
  { component: QueryClientProvider, props: { client: queryClient } },
  { component: ToastProvider },
]);

function App() {
  return (
    <AppProviders>
      <Router><Routes /></Router>
    </AppProviders>
  );
}
```

---

## Composition Pattern

Prefer composition over inheritance:

```tsx
// Base Card component
function Card({ children, className }: CardProps) {
  return <div className={`card ${className || ''}`}>{children}</div>;
}

function CardHeader({ children }: { children: ReactNode }) {
  return <div className="card-header">{children}</div>;
}

function CardBody({ children }: { children: ReactNode }) {
  return <div className="card-body">{children}</div>;
}

function CardFooter({ children }: { children: ReactNode }) {
  return <div className="card-footer">{children}</div>;
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
      <CardFooter>
        <Button onClick={() => followUser(user.id)}>Follow</Button>
      </CardFooter>
    </Card>
  );
}
```
