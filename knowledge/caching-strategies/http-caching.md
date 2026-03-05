# HTTP Caching

## Overview

HTTP caching reduces server load and improves latency by storing responses at various points in the request chain: the browser, proxy servers, CDNs, and reverse proxies. Proper HTTP caching headers instruct each layer on what to cache, for how long, and when to revalidate. This is one of the most impactful performance optimizations for web applications.

## Cache-Control Header

The `Cache-Control` header is the primary mechanism for controlling HTTP caching behavior. It contains one or more comma-separated directives.

### Response Directives

| Directive | Description |
|-----------|-------------|
| `max-age=N` | Cache is fresh for N seconds from the time of the request |
| `s-maxage=N` | Same as max-age but only for shared caches (CDN, proxy) |
| `no-cache` | Cache must revalidate with the origin before serving |
| `no-store` | Do not cache the response at all |
| `private` | Only browser cache may store this (not CDN/proxy) |
| `public` | Any cache may store this, even if normally restricted |
| `must-revalidate` | Once stale, must revalidate before using |
| `proxy-revalidate` | Like must-revalidate but for shared caches |
| `immutable` | Response will not change; do not revalidate even on reload |
| `stale-while-revalidate=N` | Serve stale for N seconds while revalidating in background |
| `stale-if-error=N` | Serve stale for N seconds if origin returns 5xx |
| `no-transform` | Proxy must not modify the response body |

### Common Configurations

```
# Static assets with content hashing (fingerprinted filenames)
Cache-Control: public, max-age=31536000, immutable

# API responses (cacheable by CDN)
Cache-Control: public, s-maxage=60, stale-while-revalidate=300

# User-specific data
Cache-Control: private, max-age=300

# Sensitive data (authentication, financial)
Cache-Control: no-store

# HTML pages (always revalidate)
Cache-Control: no-cache

# API with SWR pattern
Cache-Control: public, max-age=10, s-maxage=60, stale-while-revalidate=600, stale-if-error=86400
```

### Express.js Implementation

```javascript
// Static assets middleware
app.use('/static', express.static('public', {
  maxAge: '1y',
  immutable: true,
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// API route with caching
app.get('/api/products', (req, res) => {
  res.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  res.json(products);
});

// Private user data
app.get('/api/profile', authMiddleware, (req, res) => {
  res.set('Cache-Control', 'private, max-age=300');
  res.json(req.user.profile);
});

// No caching for sensitive endpoints
app.get('/api/account/balance', authMiddleware, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ balance: account.balance });
});
```

### Spring Boot Configuration

```java
@RestController
public class ProductController {

    @GetMapping("/api/products")
    public ResponseEntity<List<Product>> getProducts() {
        return ResponseEntity.ok()
            .cacheControl(CacheControl.maxAge(60, TimeUnit.SECONDS)
                .sMaxAge(120, TimeUnit.SECONDS)
                .staleWhileRevalidate(300, TimeUnit.SECONDS))
            .body(productService.findAll());
    }

    @GetMapping("/api/products/{id}")
    public ResponseEntity<Product> getProduct(@PathVariable String id) {
        Product product = productService.findById(id);
        return ResponseEntity.ok()
            .cacheControl(CacheControl.maxAge(300, TimeUnit.SECONDS))
            .eTag(product.getVersion().toString())
            .body(product);
    }
}
```

## ETag and Conditional Requests

ETags provide content-based validation. The server generates a unique identifier for the response content, and the client sends it back to check if the content has changed.

### How It Works

```
First request:
  Client:  GET /api/products/123
  Server:  200 OK
           ETag: "abc123"
           Body: {"name":"Widget","price":9.99}

Subsequent request:
  Client:  GET /api/products/123
           If-None-Match: "abc123"
  Server:  304 Not Modified (no body, saves bandwidth)

After content changes:
  Client:  GET /api/products/123
           If-None-Match: "abc123"
  Server:  200 OK
           ETag: "def456"
           Body: {"name":"Widget","price":12.99}
```

### Express.js with ETag

```javascript
import crypto from 'crypto';

function generateETag(data) {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
}

app.get('/api/products/:id', async (req, res) => {
  const product = await productService.findById(req.params.id);
  const etag = generateETag(product);

  res.set('ETag', `"${etag}"`);
  res.set('Cache-Control', 'private, max-age=0, must-revalidate');

  if (req.headers['if-none-match'] === `"${etag}"`) {
    return res.status(304).end();
  }

  res.json(product);
});
```

### Weak ETags

Weak ETags indicate semantic equivalence rather than byte-for-byte identity. Useful when responses may vary slightly (formatting, whitespace) but represent the same data.

```
ETag: W/"abc123"
If-None-Match: W/"abc123"
```

```javascript
// Weak ETag based on version/timestamp
app.get('/api/products/:id', async (req, res) => {
  const product = await productService.findById(req.params.id);
  const etag = `W/"${product.version}-${product.updatedAt.getTime()}"`;

  res.set('ETag', etag);

  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  res.json(product);
});
```

## Last-Modified and If-Modified-Since

Date-based validation. Simpler than ETags but with second-level precision.

```
First request:
  Server:  200 OK
           Last-Modified: Wed, 15 Jan 2025 10:30:00 GMT

Subsequent request:
  Client:  GET /api/products/123
           If-Modified-Since: Wed, 15 Jan 2025 10:30:00 GMT
  Server:  304 Not Modified
```

```javascript
app.get('/api/products/:id', async (req, res) => {
  const product = await productService.findById(req.params.id);
  const lastModified = product.updatedAt;

  res.set('Last-Modified', lastModified.toUTCString());
  res.set('Cache-Control', 'public, max-age=60');

  const ifModifiedSince = req.headers['if-modified-since'];
  if (ifModifiedSince) {
    const clientDate = new Date(ifModifiedSince);
    if (lastModified <= clientDate) {
      return res.status(304).end();
    }
  }

  res.json(product);
});
```

## CDN Caching

CDNs (CloudFront, Cloudflare, Fastly, Akamai) cache responses at edge locations geographically close to users. They respect `Cache-Control` headers but often have additional configuration.

### CDN Cache Hierarchy

```
User → Edge (CDN PoP) → Shield (regional cache) → Origin Server
```

### CloudFront Configuration

```javascript
// CloudFront behavior settings
const cacheBehavior = {
  PathPattern: '/api/*',
  CachePolicyId: 'custom-api-policy',
  OriginRequestPolicyId: 'AllViewer',
  ViewerProtocolPolicy: 'https-only',
  TTL: {
    DefaultTTL: 60,
    MaxTTL: 86400,
    MinTTL: 0,
  },
  // Forward these headers to origin (varies cache)
  Headers: ['Authorization', 'Accept-Language'],
};
```

### Cloudflare Cache Rules

```
# Cache API responses for 1 hour
URL: api.example.com/products/*
Edge TTL: 3600
Browser TTL: 60

# Bypass cache for authenticated requests
URL: api.example.com/account/*
Cache Level: Bypass
```

### Programmatic CDN Purge

```javascript
// Cloudflare API
async function purgeUrls(urls) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ files: urls }),
    }
  );
  return response.json();
}

// After product update
await purgeUrls([
  `https://api.example.com/products/${productId}`,
  `https://api.example.com/products?category=${product.category}`,
]);
```

## Browser Cache

The browser cache stores responses locally. It is the fastest cache layer (no network call) but only serves the individual user.

### Cache Busting Strategies

Since `Cache-Control: immutable` with long max-age means the browser will never revalidate, you need a way to force updates when content changes.

**Content hashing (recommended):**
```html
<!-- Vite/Webpack generate hashed filenames -->
<link rel="stylesheet" href="/assets/styles-a1b2c3d4.css">
<script src="/assets/app-e5f6g7h8.js"></script>
```

**Query string versioning:**
```html
<!-- Less reliable; some CDNs ignore query strings -->
<link rel="stylesheet" href="/styles.css?v=1.2.3">
```

**Path versioning:**
```html
<link rel="stylesheet" href="/v2/styles.css">
```

### Service Worker Cache

```javascript
// sw.js - Cache-first strategy for assets
self.addEventListener('fetch', (event) => {
  if (event.request.destination === 'image' ||
      event.request.destination === 'style' ||
      event.request.destination === 'script') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open('assets-v1').then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
  }
});

// Network-first strategy for API calls
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open('api-v1').then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
```

## Vary Header

The `Vary` header tells caches that the response varies based on specific request headers. The cache must store separate entries for different values of those headers.

```
# Response varies by language
Vary: Accept-Language

# Response varies by encoding and language
Vary: Accept-Encoding, Accept-Language

# Response varies by everything (effectively uncacheable by shared caches)
Vary: *
```

```javascript
app.get('/api/products', (req, res) => {
  const lang = req.headers['accept-language']?.split(',')[0] || 'en';
  const products = productService.findAll(lang);

  res.set('Cache-Control', 'public, s-maxage=300');
  res.set('Vary', 'Accept-Language, Accept-Encoding');
  res.json(products);
});
```

**Caution**: Each unique combination of Vary header values creates a separate cache entry. `Vary: User-Agent` creates thousands of entries and effectively disables CDN caching.

## Surrogate Keys

Surrogate keys (also called cache tags) allow purging groups of cached responses from a CDN by a logical tag rather than by URL.

```javascript
// Tag responses with surrogate keys
app.get('/api/products/:id', async (req, res) => {
  const product = await productService.findById(req.params.id);

  res.set('Surrogate-Key', `product-${product.id} category-${product.category} all-products`);
  res.set('Cache-Control', 'public, s-maxage=3600');
  res.json(product);
});

// Purge all products in a category (Fastly example)
async function purgeSurrogateKey(key) {
  await fetch(`https://api.fastly.com/service/${SERVICE_ID}/purge/${key}`, {
    method: 'POST',
    headers: { 'Fastly-Key': FASTLY_API_KEY },
  });
}

// After category update
await purgeSurrogateKey('category-electronics');
```

### Cloudflare Cache Tags

```javascript
// Set cache tags via header
res.set('Cache-Tag', 'product-123, electronics, all-products');

// Purge by tag
await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${CF_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ tags: ['electronics'] }),
});
```

## Response Caching Summary by Content Type

| Content Type | Cache-Control | ETag | CDN | Browser |
|-------------|---------------|------|-----|---------|
| Static assets (hashed) | `public, max-age=31536000, immutable` | No | Yes | Yes |
| HTML pages | `no-cache` or `max-age=0, must-revalidate` | Yes | Optional | Yes |
| Public API data | `public, s-maxage=60, stale-while-revalidate=300` | Optional | Yes | Short |
| Private user data | `private, max-age=300` | Optional | No | Yes |
| Authentication tokens | `no-store` | No | No | No |
| Real-time data | `no-store` or very short TTL | No | No | No |
| Images/fonts | `public, max-age=604800` | Optional | Yes | Yes |

## Anti-Patterns

1. **`Cache-Control: no-cache, no-store`** - These are different directives with different meanings. `no-cache` means revalidate; `no-store` means do not cache. Combining them is redundant; use only what you need.
2. **`Vary: *`** - Makes the response effectively uncacheable. Never use this.
3. **`Vary: Cookie`** - Each unique cookie value creates a separate cache entry, making CDN caching useless.
4. **Long max-age without cache busting** - If you set `max-age=31536000` without content hashing in filenames, you cannot update the cached content.
5. **Caching authenticated responses as public** - Setting `public` on responses that contain user-specific data leaks data between users via CDN.
6. **Forgetting `s-maxage` for CDN** - Without `s-maxage`, the CDN uses `max-age`, which may not be appropriate (user's browser TTL differs from CDN TTL).
7. **Ignoring `Accept-Encoding` in Vary** - If your server compresses responses, omitting `Vary: Accept-Encoding` can serve compressed content to clients that do not support it.

## Production Checklist

- [ ] Cache-Control headers set for every response type (static, API, HTML, private)
- [ ] Static assets use content hashing with long max-age and immutable
- [ ] HTML pages use no-cache or short max-age with ETag/Last-Modified
- [ ] Sensitive data uses no-store
- [ ] s-maxage configured separately from max-age for CDN-cached responses
- [ ] stale-while-revalidate enabled for API responses that tolerate brief staleness
- [ ] Vary header used correctly (Accept-Encoding, Accept-Language as needed)
- [ ] CDN purge mechanism in place for content updates
- [ ] Surrogate keys configured for logical cache group invalidation
- [ ] ETag generation uses content hash or version, not timestamp alone
- [ ] Browser DevTools verified: correct caching behavior (200 from cache, 304)
- [ ] Cache hit ratio monitored at CDN level (target > 80% for static content)
