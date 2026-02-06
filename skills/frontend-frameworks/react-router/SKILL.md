---
name: react-router
description: |
  React Router v6+ for client-side routing. Covers BrowserRouter, Routes,
  navigation, data loading, nested routes, protected routes, and code splitting.

  USE WHEN: user mentions "React Router", "routing", "navigation", "BrowserRouter",
  "Routes", "useNavigate", "Link", "nested routes", asks about "client-side routing",
  "protected routes", "route parameters", "loaders"

  DO NOT USE FOR: Next.js routing - use Next.js skill instead,
  Server-side routing - use framework-specific skills,
  basic React navigation - use `react` skill for simple conditional rendering
allowed-tools: Read, Grep, Glob, Write, Edit
---
# React Router

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `react` topic: `router` for comprehensive documentation on React Router v6+ patterns and data loading.

> **Full Reference**: See [advanced.md](advanced.md) for Data Loading (v6.4+), Actions, Code Splitting, Route Configuration, Error Handling, Scroll Restoration, Modal Routes, and TypeScript Integration.

## Basic Setup

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/users" element={<Users />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
```

---

## Navigation

### Link Component

```tsx
import { Link, NavLink } from 'react-router-dom';

function Navigation() {
  return (
    <nav>
      {/* Basic link */}
      <Link to="/">Home</Link>

      {/* NavLink with active styling */}
      <NavLink
        to="/about"
        className={({ isActive, isPending }) =>
          isActive ? 'active' : isPending ? 'pending' : ''
        }
      >
        About
      </NavLink>

      {/* With state */}
      <Link to="/dashboard" state={{ from: 'home' }}>
        Dashboard
      </Link>

      {/* Replace instead of push */}
      <Link to="/login" replace>
        Login
      </Link>
    </nav>
  );
}
```

### Programmatic Navigation

```tsx
import { useNavigate, useLocation } from 'react-router-dom';

function LoginButton() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = async () => {
    await login();

    // Navigate with state
    navigate('/dashboard', {
      state: { from: location },
      replace: true,
    });
  };

  const handleBack = () => {
    navigate(-1); // Go back
  };

  return (
    <div>
      <button onClick={handleLogin}>Login</button>
      <button onClick={handleBack}>Back</button>
    </div>
  );
}
```

---

## Route Parameters

### Dynamic Segments

```tsx
<Routes>
  <Route path="/users/:userId" element={<UserProfile />} />
  <Route path="/posts/:postId/comments/:commentId" element={<Comment />} />
</Routes>

// Component
import { useParams } from 'react-router-dom';

function UserProfile() {
  const { userId } = useParams<{ userId: string }>();

  return <div>User ID: {userId}</div>;
}

function Comment() {
  const { postId, commentId } = useParams();

  return (
    <div>
      Post: {postId}, Comment: {commentId}
    </div>
  );
}
```

### Optional Segments

```tsx
<Routes>
  {/* Optional lang parameter */}
  <Route path="/:lang?/products" element={<Products />} />

  {/* Catch-all (splat) */}
  <Route path="/files/*" element={<FileExplorer />} />
</Routes>

function FileExplorer() {
  const { '*': filePath } = useParams();
  // /files/documents/report.pdf → filePath = "documents/report.pdf"

  return <div>Path: {filePath}</div>;
}
```

---

## Query Parameters

```tsx
import { useSearchParams } from 'react-router-dom';

function ProductList() {
  const [searchParams, setSearchParams] = useSearchParams();

  const category = searchParams.get('category') || 'all';
  const page = parseInt(searchParams.get('page') || '1');
  const sort = searchParams.get('sort') || 'name';

  const updateFilters = (newCategory: string) => {
    setSearchParams({
      category: newCategory,
      page: '1', // Reset page
      sort,
    });
  };

  const nextPage = () => {
    setSearchParams(prev => {
      prev.set('page', String(page + 1));
      return prev;
    });
  };

  return (
    <div>
      <select
        value={category}
        onChange={(e) => updateFilters(e.target.value)}
      >
        <option value="all">All</option>
        <option value="electronics">Electronics</option>
      </select>

      <ProductGrid category={category} page={page} sort={sort} />

      <button onClick={nextPage}>Next Page</button>
    </div>
  );
}
```

---

## Nested Routes

```tsx
// Route configuration
<Routes>
  <Route path="/dashboard" element={<DashboardLayout />}>
    <Route index element={<DashboardHome />} />
    <Route path="analytics" element={<Analytics />} />
    <Route path="settings" element={<Settings />} />
    <Route path="users">
      <Route index element={<UserList />} />
      <Route path=":userId" element={<UserDetail />} />
      <Route path="new" element={<NewUser />} />
    </Route>
  </Route>
</Routes>

// Parent layout with Outlet
import { Outlet, Link } from 'react-router-dom';

function DashboardLayout() {
  return (
    <div className="dashboard">
      <nav className="sidebar">
        <Link to="/dashboard">Home</Link>
        <Link to="/dashboard/analytics">Analytics</Link>
        <Link to="/dashboard/settings">Settings</Link>
        <Link to="/dashboard/users">Users</Link>
      </nav>

      <main className="content">
        {/* Child routes render here */}
        <Outlet />
      </main>
    </div>
  );
}
```

### Relative Links

```tsx
function UserDetail() {
  const { userId } = useParams();

  return (
    <div>
      <h1>User {userId}</h1>

      {/* Relative to current route */}
      <Link to="edit">Edit User</Link>      {/* → /dashboard/users/:userId/edit */}
      <Link to="../">Back to List</Link>    {/* → /dashboard/users */}
      <Link to="../../">Dashboard</Link>    {/* → /dashboard */}
    </div>
  );
}
```

---

## Protected Routes

```tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';

function ProtectedRoute({ children }: { children?: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    // Redirect to login, preserving intended destination
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children ?? <Outlet />;
}

// Usage
<Routes>
  <Route path="/login" element={<Login />} />

  {/* Protected routes */}
  <Route element={<ProtectedRoute />}>
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/settings" element={<Settings />} />
    <Route path="/profile" element={<Profile />} />
  </Route>
</Routes>

// Role-based protection
function AdminRoute({ children }: { children?: ReactNode }) {
  const { user } = useAuth();

  if (user?.role !== 'admin') {
    return <Navigate to="/unauthorized" replace />;
  }

  return children ?? <Outlet />;
}

<Routes>
  <Route element={<ProtectedRoute />}>
    <Route path="/dashboard" element={<Dashboard />} />

    {/* Admin only */}
    <Route element={<AdminRoute />}>
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="/users/manage" element={<UserManagement />} />
    </Route>
  </Route>
</Routes>
```

---

## Best Practices

- Use nested routes for shared layouts
- Use loaders for data fetching (v6.4+)
- Implement proper error boundaries
- Use relative links in nested routes
- Lazy load route components
- Preload on user intent (hover)
- Don't fetch data in useEffect when loaders available
- Don't hardcode paths - use relative navigation
- Don't forget to handle loading states

## When NOT to Use This Skill

- **Next.js applications** - Use Next.js App Router or Pages Router instead
- **Server-side routing** - Use framework-specific routing (Express, etc.)
- **Simple conditional rendering** - Use `react` skill for basic show/hide logic
- **Static sites** - Consider if routing library is needed

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Fetching in useEffect with loaders available | Waterfall loading, slower UX | Use loader functions |
| Hardcoding absolute paths | Hard to refactor, breaks nested routes | Use relative paths |
| Not handling loading states | Poor UX | Use useNavigation or Suspense |
| Missing error boundaries | App crashes on route errors | Add errorElement to routes |
| Not lazy loading routes | Large initial bundle | Use React.lazy() for routes |
| Using index as route key | Incorrect behavior | Don't use keys for routes |
| Forgetting to handle 404 | Blank page or crash | Add catch-all route with path="*" |

## Quick Troubleshooting

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| Route not matching | Wrong path syntax | Check path definition, use exact paths |
| Link not working | Wrong to prop | Verify path starts with / or is relative |
| Params undefined | Using wrong hook | Use useParams() for route params |
| Navigation not working | Wrong hook | Use useNavigate() for programmatic navigation |
| Nested route not showing | Missing Outlet | Add <Outlet /> in parent component |
| Loader not called | Using Routes instead of RouterProvider | Use createBrowserRouter with loaders |
| Protected route not working | Wrong redirect logic | Check authentication state and Navigate component |

## Reference Documentation

- [React Router](https://reactrouter.com/)
- [Upgrading to v6](https://reactrouter.com/en/main/upgrading/v5)
- [Advanced Patterns](advanced.md)
- MCP: `mcp__documentation__fetch_docs` → technology: `react`, topic: `router`
