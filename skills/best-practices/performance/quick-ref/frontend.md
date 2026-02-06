# Frontend Performance Quick Reference

> **Knowledge Base:** Read `knowledge/performance/frontend.md` for complete documentation.

## Core Web Vitals

```
LCP (Largest Contentful Paint): < 2.5s
FID (First Input Delay): < 100ms
CLS (Cumulative Layout Shift): < 0.1
INP (Interaction to Next Paint): < 200ms
TTFB (Time to First Byte): < 800ms
FCP (First Contentful Paint): < 1.8s
```

## Image Optimization

```tsx
// Next.js Image
import Image from 'next/image';

<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={600}
  priority           // For LCP images
  placeholder="blur"
  sizes="(max-width: 768px) 100vw, 50vw"
/>

// Lazy loading
<img loading="lazy" src="image.jpg" alt="" />

// Responsive images
<picture>
  <source srcset="hero.avif" type="image/avif" />
  <source srcset="hero.webp" type="image/webp" />
  <img src="hero.jpg" alt="Hero" />
</picture>

// srcset for resolution
<img
  srcset="hero-320.jpg 320w,
          hero-640.jpg 640w,
          hero-1280.jpg 1280w"
  sizes="(max-width: 640px) 100vw, 50vw"
  src="hero-640.jpg"
  alt="Hero"
/>
```

## JavaScript Optimization

```typescript
// Code splitting with dynamic imports
const HeavyComponent = lazy(() => import('./HeavyComponent'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <HeavyComponent />
    </Suspense>
  );
}

// Debounce expensive operations
import { debounce } from 'lodash-es';

const debouncedSearch = debounce((query: string) => {
  fetchResults(query);
}, 300);

// Throttle scroll handlers
import { throttle } from 'lodash-es';

const throttledScroll = throttle(() => {
  updatePosition();
}, 100);

// Web Workers for heavy computation
const worker = new Worker('./worker.js');
worker.postMessage({ data: largeDataset });
worker.onmessage = (e) => {
  updateUI(e.data);
};
```

## React Optimization

```tsx
// Memoize expensive components
const ExpensiveList = memo(function ExpensiveList({ items }) {
  return items.map(item => <Item key={item.id} {...item} />);
});

// useMemo for expensive calculations
const sortedItems = useMemo(() => {
  return items.sort((a, b) => a.name.localeCompare(b.name));
}, [items]);

// useCallback for stable references
const handleClick = useCallback((id: string) => {
  setSelected(id);
}, []);

// Virtualization for long lists
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={400}
  width={300}
  itemCount={10000}
  itemSize={35}
>
  {({ index, style }) => (
    <div style={style}>{items[index].name}</div>
  )}
</FixedSizeList>

// Avoid unnecessary renders
// BAD: New object every render
<Component style={{ color: 'red' }} />

// GOOD: Stable reference
const style = useMemo(() => ({ color: 'red' }), []);
<Component style={style} />
```

## CSS Optimization

```css
/* Avoid layout thrashing */
/* BAD: Forces reflow */
element.style.width = '100px';
const height = element.offsetHeight; /* Reflow */
element.style.height = height + 'px';

/* GOOD: Batch reads and writes */
const height = element.offsetHeight;
requestAnimationFrame(() => {
  element.style.width = '100px';
  element.style.height = height + 'px';
});

/* Use transform instead of top/left */
/* BAD */
.animate { left: 100px; }

/* GOOD */
.animate { transform: translateX(100px); }

/* Contain property for isolation */
.card {
  contain: layout style paint;
}

/* Will-change for animations */
.animate-on-hover:hover {
  will-change: transform;
}

/* content-visibility for off-screen content */
.section {
  content-visibility: auto;
  contain-intrinsic-size: 0 500px;
}
```

## Resource Loading

```html
<!-- Preload critical resources -->
<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/hero.webp" as="image">
<link rel="preload" href="/critical.css" as="style">

<!-- Preconnect to origins -->
<link rel="preconnect" href="https://api.example.com">
<link rel="dns-prefetch" href="https://analytics.example.com">

<!-- Defer non-critical JS -->
<script src="analytics.js" defer></script>

<!-- Async for independent scripts -->
<script src="third-party.js" async></script>

<!-- Module/nomodule pattern -->
<script type="module" src="modern.js"></script>
<script nomodule src="legacy.js"></script>
```

## Caching

```typescript
// Service Worker caching
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

// HTTP Cache headers
Cache-Control: public, max-age=31536000, immutable
Cache-Control: private, no-cache, no-store, must-revalidate

// SWR/React Query for data caching
const { data } = useQuery({
  queryKey: ['users'],
  queryFn: fetchUsers,
  staleTime: 1000 * 60 * 5, // 5 minutes
  gcTime: 1000 * 60 * 30,   // 30 minutes
});
```

## Bundle Optimization

```javascript
// webpack.config.js
module.exports = {
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
      },
    },
  },
};

// Tree shaking - use named imports
import { debounce } from 'lodash-es'; // Good
import _ from 'lodash';              // Bad - imports everything

// Analyze bundle
npx webpack-bundle-analyzer stats.json
npx @next/bundle-analyzer
```

**Tools:** Lighthouse, WebPageTest, Chrome DevTools Performance
