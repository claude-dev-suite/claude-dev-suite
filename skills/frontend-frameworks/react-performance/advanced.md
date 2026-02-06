# React Performance Advanced Patterns

## Profiling

### React DevTools Profiler

```tsx
// Add Profiler component
import { Profiler } from 'react';

function onRender(
  id: string,
  phase: 'mount' | 'update',
  actualDuration: number,
  baseDuration: number,
  startTime: number,
  commitTime: number
) {
  console.log({
    id,
    phase,
    actualDuration,
    baseDuration,
  });
}

function App() {
  return (
    <Profiler id="App" onRender={onRender}>
      <Dashboard />
    </Profiler>
  );
}
```

### Custom Performance Hooks

```tsx
function useRenderCount(componentName: string) {
  const renderCount = useRef(0);

  useEffect(() => {
    renderCount.current += 1;
    console.log(`${componentName} rendered ${renderCount.current} times`);
  });
}

function useWhyDidYouUpdate(name: string, props: Record<string, unknown>) {
  const previousProps = useRef<Record<string, unknown>>();

  useEffect(() => {
    if (previousProps.current) {
      const allKeys = Object.keys({ ...previousProps.current, ...props });
      const changedProps: Record<string, { from: unknown; to: unknown }> = {};

      allKeys.forEach(key => {
        if (previousProps.current![key] !== props[key]) {
          changedProps[key] = {
            from: previousProps.current![key],
            to: props[key],
          };
        }
      });

      if (Object.keys(changedProps).length) {
        console.log('[why-did-you-update]', name, changedProps);
      }
    }

    previousProps.current = props;
  });
}

// Usage
function MyComponent(props: Props) {
  useRenderCount('MyComponent');
  useWhyDidYouUpdate('MyComponent', props);

  return <div>...</div>;
}
```

---

## Bundle Optimization

### Tree Shaking

```tsx
// ❌ Bad: Imports entire library
import _ from 'lodash';
const result = _.debounce(fn, 300);

// ✅ Good: Import only what you need
import debounce from 'lodash/debounce';
const result = debounce(fn, 300);

// ✅ Good: Use lodash-es for better tree shaking
import { debounce } from 'lodash-es';
```

### Dynamic Imports

```tsx
// Load heavy dependencies only when needed
async function handleExport() {
  const xlsx = await import('xlsx');
  const workbook = xlsx.utils.book_new();
  // ...
}

// Load polyfills conditionally
if (!window.IntersectionObserver) {
  await import('intersection-observer');
}
```

### Vite/Webpack Configuration

```ts
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
          charts: ['recharts'],
        },
      },
    },
  },
});
```

---

## Image Optimization

```tsx
// Lazy loading images
function LazyImage({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return <img src={src} alt={alt} loading="lazy" {...props} />;
}

// With placeholder
function OptimizedImage({ src, placeholder, alt }: Props) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="image-container">
      {!loaded && <img src={placeholder} alt="" className="placeholder" />}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className={loaded ? 'visible' : 'hidden'}
      />
    </div>
  );
}

// With Intersection Observer
function LazyLoadImage({ src, alt }: Props) {
  const ref = useRef<HTMLImageElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );

    if (ref.current) observer.observe(ref.current);

    return () => observer.disconnect();
  }, []);

  return (
    <img
      ref={ref}
      src={isVisible ? src : undefined}
      data-src={src}
      alt={alt}
    />
  );
}
```

---

## Web Workers

Offload heavy computations:

```tsx
// worker.ts
self.onmessage = (event) => {
  const { data, type } = event.data;

  if (type === 'PROCESS_DATA') {
    const result = heavyComputation(data);
    self.postMessage({ type: 'RESULT', result });
  }
};

// Component
function DataProcessor({ data }: { data: Data[] }) {
  const [result, setResult] = useState<Result | null>(null);
  const workerRef = useRef<Worker>();

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('./worker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (event) => {
      if (event.data.type === 'RESULT') {
        setResult(event.data.result);
      }
    };

    return () => workerRef.current?.terminate();
  }, []);

  const processData = () => {
    workerRef.current?.postMessage({ type: 'PROCESS_DATA', data });
  };

  return (
    <div>
      <button onClick={processData}>Process</button>
      {result && <ResultDisplay result={result} />}
    </div>
  );
}
```
