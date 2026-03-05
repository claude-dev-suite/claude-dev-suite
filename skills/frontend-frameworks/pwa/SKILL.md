---
name: pwa
description: |
  Progressive Web App development. Service workers, Web App Manifest,
  offline-first strategies, caching with Workbox, push notifications,
  and installability.

  USE WHEN: user mentions "PWA", "Progressive Web App", "service worker",
  "offline-first", "Web App Manifest", "Workbox", "installable web app",
  "cache-first", "add to home screen"

  DO NOT USE FOR: native mobile apps - use `react-native`, `flutter`, `expo`;
  push notification server-side - use `push-notifications`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Progressive Web Apps

## Web App Manifest

```json
{
  "name": "My App",
  "short_name": "MyApp",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "icons": [
    { "src": "/icons/192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#000000" />
<link rel="apple-touch-icon" href="/icons/192.png" />
```

## Service Worker (Workbox — recommended)

```typescript
// sw.ts (using Workbox)
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Precache app shell
precacheAndRoute(self.__WB_MANIFEST);

// Cache-first for static assets
registerRoute(
  ({ request }) => request.destination === 'image' || request.destination === 'font',
  new CacheFirst({
    cacheName: 'static-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  })
);

// Network-first for API calls
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 5 * 60 })],
  })
);

// Stale-while-revalidate for pages
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new StaleWhileRevalidate({ cacheName: 'pages' })
);
```

## Registration

```typescript
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('SW registered:', registration.scope);
  });
}
```

## Offline Fallback

```typescript
// In service worker
import { setCatchHandler } from 'workbox-routing';

setCatchHandler(async ({ event }) => {
  if (event.request.destination === 'document') {
    return caches.match('/offline.html');
  }
  return Response.error();
});
```

## Caching Strategies

| Strategy | Use For | Freshness |
|----------|---------|-----------|
| Cache First | Static assets, fonts, images | Stale OK |
| Network First | API data, dynamic pages | Fresh preferred |
| Stale While Revalidate | Semi-dynamic content | Stale, updating |
| Network Only | Auth, POST requests | Always fresh |
| Cache Only | Precached app shell | Immutable |

## Install Prompt

```typescript
let deferredPrompt: BeforeInstallPromptEvent | null = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallButton();
});

async function installApp() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  console.log(`Install ${outcome}`);
  deferredPrompt = null;
}
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Caching everything with Cache First | Use Network First for dynamic data |
| No offline fallback page | Precache an offline.html |
| No cache expiration | Use ExpirationPlugin with maxEntries/maxAge |
| SW caches auth tokens | Never cache sensitive data |
| No SW update strategy | Use `skipWaiting()` + prompt user to refresh |

## Production Checklist

- [ ] Web App Manifest with icons and theme
- [ ] Service worker with Workbox strategies
- [ ] Offline fallback page
- [ ] Cache expiration policies
- [ ] Install prompt UX
- [ ] Lighthouse PWA audit passing
