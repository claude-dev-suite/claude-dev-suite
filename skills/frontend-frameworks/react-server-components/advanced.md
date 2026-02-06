# React Server Components Advanced Patterns

## Streaming with Suspense

```tsx
// app/dashboard/page.tsx
import { Suspense } from 'react';
import { RevenueChart, LatestOrders, Stats } from './components';

export default function DashboardPage() {
  return (
    <div className="dashboard">
      {/* Stats load first - fast query */}
      <Suspense fallback={<StatsSkeleton />}>
        <Stats />
      </Suspense>

      <div className="grid grid-cols-2 gap-4">
        {/* Chart and orders stream independently */}
        <Suspense fallback={<ChartSkeleton />}>
          <RevenueChart />
        </Suspense>

        <Suspense fallback={<OrdersSkeleton />}>
          <LatestOrders />
        </Suspense>
      </div>
    </div>
  );
}

// Each component fetches its own data
async function Stats() {
  const stats = await fetchStats(); // 100ms
  return <StatsDisplay stats={stats} />;
}

async function RevenueChart() {
  const revenue = await fetchRevenue(); // 500ms
  return <Chart data={revenue} />;
}

async function LatestOrders() {
  const orders = await fetchLatestOrders(); // 300ms
  return <OrderList orders={orders} />;
}
```

---

## Caching Strategies

```tsx
// app/products/page.tsx
import { unstable_cache } from 'next/cache';

// Cache database query
const getProducts = unstable_cache(
  async (category: string) => {
    return db.product.findMany({
      where: { category },
      orderBy: { createdAt: 'desc' },
    });
  },
  ['products'],
  {
    revalidate: 60, // Revalidate every 60 seconds
    tags: ['products'],
  }
);

export default async function ProductsPage({
  params,
}: {
  params: { category: string };
}) {
  const products = await getProducts(params.category);
  return <ProductGrid products={products} />;
}

// Revalidate cache from Server Action
'use server';

import { revalidateTag } from 'next/cache';

export async function createProduct(formData: FormData) {
  await db.product.create({ ... });

  // Invalidate products cache
  revalidateTag('products');
}
```

### Route Segment Config

```tsx
// Force dynamic rendering
export const dynamic = 'force-dynamic';

// Force static rendering
export const dynamic = 'force-static';

// Revalidation interval
export const revalidate = 60;

// Runtime
export const runtime = 'edge'; // or 'nodejs'
```

---

## Patterns

### Passing Server Data to Client Components

```tsx
// ✅ Good: Pass data as props (serializable)
async function ProductPage({ id }: { id: string }) {
  const product = await getProduct(id);
  return <AddToCartButton product={product} />;
}

// ❌ Bad: Cannot pass functions
async function ProductPage({ id }: { id: string }) {
  const addToCart = async () => { ... };
  // Error: Functions cannot be passed to Client Components
  return <AddToCartButton onAdd={addToCart} />;
}

// ✅ Good: Use Server Actions instead
// actions.ts
'use server';
export async function addToCart(productId: string) { ... }

// components/add-to-cart.tsx
'use client';
import { addToCart } from '@/app/actions';

export function AddToCartButton({ productId }: { productId: string }) {
  return (
    <button onClick={() => addToCart(productId)}>
      Add to Cart
    </button>
  );
}
```

### Interleaving Server and Client Components

```tsx
// Server Component
async function ProductList() {
  const products = await getProducts();

  return (
    <div>
      {products.map(product => (
        // Server Component can render Client Component
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

// Client Component
'use client';

function ProductCard({ product }: { product: Product }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <h3>{product.name}</h3>
    </div>
  );
}
```

### Children Pattern for Server Components in Client

```tsx
// ✅ Pattern: Pass Server Components as children
'use client';

function ClientWrapper({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button onClick={() => setIsOpen(true)}>Open</button>
      {isOpen && children}  {/* Server Component works here! */}
    </div>
  );
}

// Usage in Server Component
async function Page() {
  const data = await fetchData();

  return (
    <ClientWrapper>
      <ServerComponent data={data} />
    </ClientWrapper>
  );
}
```

---

## Error Handling

```tsx
// app/products/error.tsx
'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}

// app/products/loading.tsx
export default function Loading() {
  return <ProductsSkeleton />;
}

// app/products/not-found.tsx
export default function NotFound() {
  return (
    <div>
      <h2>Product not found</h2>
      <Link href="/products">Back to products</Link>
    </div>
  );
}
```

---

## Parallel and Sequential Data Fetching

```tsx
// Sequential (slower) - default
async function Page() {
  const user = await getUser();      // Wait...
  const posts = await getPosts();    // Then wait...
  return <div>...</div>;
}

// Parallel (faster)
async function Page() {
  // Start both fetches simultaneously
  const userPromise = getUser();
  const postsPromise = getPosts();

  // Wait for both
  const [user, posts] = await Promise.all([userPromise, postsPromise]);

  return <div>...</div>;
}

// Streaming (best UX)
async function Page() {
  return (
    <div>
      <Suspense fallback={<UserSkeleton />}>
        <User />
      </Suspense>
      <Suspense fallback={<PostsSkeleton />}>
        <Posts />
      </Suspense>
    </div>
  );
}

async function User() {
  const user = await getUser();
  return <UserProfile user={user} />;
}

async function Posts() {
  const posts = await getPosts();
  return <PostsList posts={posts} />;
}
```
