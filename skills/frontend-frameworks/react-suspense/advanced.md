# React Suspense Advanced Patterns

## Streaming SSR

```tsx
// Next.js App Router - Streaming with Suspense
// app/dashboard/page.tsx
import { Suspense } from 'react';
import { RevenueChart, LatestInvoices, Cards } from './components';
import { CardsSkeleton, RevenueChartSkeleton, LatestInvoicesSkeleton } from './skeletons';

export default function DashboardPage() {
  return (
    <main>
      <h1>Dashboard</h1>

      {/* Cards stream first */}
      <Suspense fallback={<CardsSkeleton />}>
        <Cards />
      </Suspense>

      <div className="grid grid-cols-2 gap-6">
        {/* Chart streams independently */}
        <Suspense fallback={<RevenueChartSkeleton />}>
          <RevenueChart />
        </Suspense>

        {/* Invoices stream independently */}
        <Suspense fallback={<LatestInvoicesSkeleton />}>
          <LatestInvoices />
        </Suspense>
      </div>
    </main>
  );
}

// Components fetch their own data
async function Cards() {
  const data = await fetchCardData();
  return <CardsDisplay data={data} />;
}

async function RevenueChart() {
  const revenue = await fetchRevenue();
  return <Chart data={revenue} />;
}
```

### Loading UI (Next.js)

```tsx
// app/dashboard/loading.tsx
// Automatically wraps page in Suspense
export default function Loading() {
  return <DashboardSkeleton />;
}

// Equivalent to:
<Suspense fallback={<DashboardSkeleton />}>
  <DashboardPage />
</Suspense>
```

---

## SuspenseList (Experimental)

Coordinate multiple Suspense boundaries:

```tsx
import { SuspenseList, Suspense } from 'react';

function Feed() {
  return (
    <SuspenseList revealOrder="forwards" tail="collapsed">
      <Suspense fallback={<PostSkeleton />}>
        <Post id={1} />
      </Suspense>
      <Suspense fallback={<PostSkeleton />}>
        <Post id={2} />
      </Suspense>
      <Suspense fallback={<PostSkeleton />}>
        <Post id={3} />
      </Suspense>
    </SuspenseList>
  );
}

// revealOrder options:
// - "forwards": Reveal in order, even if later ones load first
// - "backwards": Reveal in reverse order
// - "together": Reveal all at once when all are ready

// tail options:
// - "collapsed": Only show one fallback at a time
// - "hidden": Don't show any fallbacks
```

---

## Custom Suspense-Enabled Hook

```tsx
// Create a resource for suspense
function createResource<T>(promise: Promise<T>) {
  let status: 'pending' | 'success' | 'error' = 'pending';
  let result: T;
  let error: Error;

  const suspender = promise.then(
    (data) => {
      status = 'success';
      result = data;
    },
    (e) => {
      status = 'error';
      error = e;
    }
  );

  return {
    read(): T {
      switch (status) {
        case 'pending':
          throw suspender; // Suspense catches this
        case 'error':
          throw error; // ErrorBoundary catches this
        case 'success':
          return result;
      }
    },
  };
}

// Usage
const userResource = createResource(fetchUser(userId));

function UserProfile() {
  const user = userResource.read(); // Suspends until ready
  return <div>{user.name}</div>;
}
```

### With Cache

```tsx
const resourceCache = new Map<string, ReturnType<typeof createResource>>();

function getResource<T>(key: string, fetcher: () => Promise<T>) {
  if (!resourceCache.has(key)) {
    resourceCache.set(key, createResource(fetcher()));
  }
  return resourceCache.get(key)!;
}

function UserProfile({ userId }: { userId: string }) {
  const resource = getResource(`user-${userId}`, () => fetchUser(userId));
  const user = resource.read();

  return <div>{user.name}</div>;
}
```

---

## Image Loading with Suspense

```tsx
function SuspenseImage({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  if (!isLoaded) {
    throw new Promise<void>((resolve) => {
      const img = new Image();
      img.src = src!;
      img.onload = () => {
        setIsLoaded(true);
        resolve();
      };
      img.onerror = () => {
        setIsLoaded(true);
        resolve();
      };
    });
  }

  return <img ref={imgRef} src={src} alt={alt} {...props} />;
}

// Usage
function Gallery({ images }: { images: string[] }) {
  return (
    <div className="gallery">
      {images.map((src, i) => (
        <Suspense key={i} fallback={<ImagePlaceholder />}>
          <SuspenseImage src={src} alt={`Image ${i}`} />
        </Suspense>
      ))}
    </div>
  );
}
```

---

## Route-Based Code Splitting

```tsx
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Lazy load all route components
const Home = lazy(() => import('./pages/Home'));
const About = lazy(() => import('./pages/About'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/dashboard/*" element={<Dashboard />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Suspense>
      </Layout>
    </BrowserRouter>
  );
}

// Page loader with minimum display time
function PageLoader() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 200);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <div className="page-loader">
      <Spinner />
    </div>
  );
}
```

---

## Testing Suspense Components

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';

// Mock the lazy component
jest.mock('./Dashboard', () => ({
  __esModule: true,
  default: () => <div>Dashboard Content</div>,
}));

test('shows loading state then content', async () => {
  render(
    <Suspense fallback={<div>Loading...</div>}>
      <Dashboard />
    </Suspense>
  );

  // Initially shows loading
  expect(screen.getByText('Loading...')).toBeInTheDocument();

  // Wait for content
  await waitFor(() => {
    expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
  });
});

// Testing with TanStack Query
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

test('fetches and displays user', async () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<div>Loading user...</div>}>
        <UserProfile userId="1" />
      </Suspense>
    </QueryClientProvider>
  );

  expect(screen.getByText('Loading user...')).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });
});
```

---

## Skeleton Loading Patterns

```tsx
// Skeleton components that match real component dimensions
function UserCardSkeleton() {
  return (
    <div className="user-card">
      <div className="skeleton skeleton-avatar" />
      <div className="skeleton skeleton-text" style={{ width: '60%' }} />
      <div className="skeleton skeleton-text" style={{ width: '40%' }} />
    </div>
  );
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="table-skeleton">
      <div className="skeleton skeleton-header" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton skeleton-row" />
      ))}
    </div>
  );
}

// CSS
const skeletonStyles = `
.skeleton {
  background: linear-gradient(
    90deg,
    #f0f0f0 25%,
    #e0e0e0 50%,
    #f0f0f0 75%
  );
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
  border-radius: 4px;
}

@keyframes skeleton-loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skeleton-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
}

.skeleton-text {
  height: 16px;
  margin: 8px 0;
}
`;
```
