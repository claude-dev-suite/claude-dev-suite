# React Router Advanced Patterns

## Data Loading (v6.4+)

```tsx
import {
  createBrowserRouter,
  RouterProvider,
  useLoaderData,
  useNavigation,
} from 'react-router-dom';

// Loader function
async function userLoader({ params }: LoaderFunctionArgs) {
  const response = await fetch(`/api/users/${params.userId}`);
  if (!response.ok) {
    throw new Response('User not found', { status: 404 });
  }
  return response.json();
}

// Route configuration
const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        path: 'users/:userId',
        element: <UserProfile />,
        loader: userLoader,
        errorElement: <UserError />,
      },
    ],
  },
]);

// Component using loader data
function UserProfile() {
  const user = useLoaderData() as User;
  const navigation = useNavigation();

  if (navigation.state === 'loading') {
    return <Skeleton />;
  }

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  );
}

function App() {
  return <RouterProvider router={router} />;
}
```

### Actions for Mutations

```tsx
async function updateUserAction({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();

  const response = await fetch(`/api/users/${params.userId}`, {
    method: 'PUT',
    body: formData,
  });

  if (!response.ok) {
    return { error: 'Failed to update user' };
  }

  return redirect('/users');
}

const router = createBrowserRouter([
  {
    path: 'users/:userId/edit',
    element: <EditUser />,
    loader: userLoader,
    action: updateUserAction,
  },
]);

// Component with Form
import { Form, useActionData, useNavigation } from 'react-router-dom';

function EditUser() {
  const user = useLoaderData() as User;
  const actionData = useActionData() as { error?: string } | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === 'submitting';

  return (
    <Form method="post">
      <input name="name" defaultValue={user.name} />
      <input name="email" defaultValue={user.email} />

      {actionData?.error && <p className="error">{actionData.error}</p>}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Save'}
      </button>
    </Form>
  );
}
```

---

## Code Splitting with Routes

```tsx
import { lazy, Suspense } from 'react';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));
const Profile = lazy(() => import('./pages/Profile'));

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
```

### Preloading Routes

```tsx
const DashboardImport = () => import('./pages/Dashboard');
const Dashboard = lazy(DashboardImport);

function NavLink({ to, children, preload }: Props) {
  const handleMouseEnter = () => {
    if (preload) {
      preload();
    }
  };

  return (
    <Link to={to} onMouseEnter={handleMouseEnter}>
      {children}
    </Link>
  );
}

// Usage
<NavLink to="/dashboard" preload={DashboardImport}>
  Dashboard
</NavLink>
```

---

## Route Configuration Object

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RootError />,
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        path: 'about',
        element: <About />,
      },
      {
        path: 'products',
        element: <ProductsLayout />,
        children: [
          {
            index: true,
            element: <ProductList />,
            loader: productsLoader,
          },
          {
            path: ':productId',
            element: <ProductDetail />,
            loader: productLoader,
          },
        ],
      },
      {
        path: '*',
        element: <NotFound />,
      },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}
```

---

## Error Handling

```tsx
import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';

function ErrorPage() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return (
        <div>
          <h1>Page Not Found</h1>
          <p>The page you're looking for doesn't exist.</p>
          <Link to="/">Go Home</Link>
        </div>
      );
    }

    if (error.status === 401) {
      return (
        <div>
          <h1>Unauthorized</h1>
          <p>You need to log in to access this page.</p>
          <Link to="/login">Log In</Link>
        </div>
      );
    }

    return (
      <div>
        <h1>Error {error.status}</h1>
        <p>{error.statusText}</p>
      </div>
    );
  }

  // Unknown error
  return (
    <div>
      <h1>Something went wrong</h1>
      <p>{error instanceof Error ? error.message : 'Unknown error'}</p>
    </div>
  );
}
```

---

## Scroll Restoration

```tsx
import { ScrollRestoration } from 'react-router-dom';

function RootLayout() {
  return (
    <>
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />

      {/* Automatically restores scroll position */}
      <ScrollRestoration />
    </>
  );
}

// Custom scroll behavior
<ScrollRestoration
  getKey={(location, matches) => {
    const paths = ['/home', '/products'];
    return paths.includes(location.pathname)
      ? location.pathname
      : location.key;
  }}
/>
```

---

## Modal Routes

```tsx
function App() {
  const location = useLocation();
  const state = location.state as { backgroundLocation?: Location };

  return (
    <>
      <Routes location={state?.backgroundLocation || location}>
        <Route path="/" element={<Home />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/gallery/:imageId" element={<ImagePage />} />
      </Routes>

      {/* Modal routes - render on top when backgroundLocation exists */}
      {state?.backgroundLocation && (
        <Routes>
          <Route path="/gallery/:imageId" element={<ImageModal />} />
        </Routes>
      )}
    </>
  );
}

function Gallery() {
  const location = useLocation();

  return (
    <div className="gallery">
      {images.map(image => (
        <Link
          key={image.id}
          to={`/gallery/${image.id}`}
          state={{ backgroundLocation: location }}
        >
          <img src={image.thumbnail} alt={image.title} />
        </Link>
      ))}
    </div>
  );
}

function ImageModal() {
  const navigate = useNavigate();
  const { imageId } = useParams();

  return (
    <div className="modal-overlay" onClick={() => navigate(-1)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <img src={images.find(i => i.id === imageId)?.src} />
        <button onClick={() => navigate(-1)}>Close</button>
      </div>
    </div>
  );
}
```

---

## TypeScript Integration

```tsx
// Typed params
import { useParams, Params } from 'react-router-dom';

interface UserParams extends Params {
  userId: string;
}

function UserProfile() {
  const { userId } = useParams<UserParams>();
  // or
  const params = useParams() as UserParams;
}

// Typed loader data
interface User {
  id: string;
  name: string;
  email: string;
}

function UserProfile() {
  const user = useLoaderData() as User;
}

// Consider: typesafe-routes or remix-routes for type-safe route definitions
```
