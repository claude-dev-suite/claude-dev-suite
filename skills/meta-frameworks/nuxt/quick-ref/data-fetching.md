# Nuxt Data Fetching

> **Knowledge Base:** Read `knowledge/nuxt/data-fetching.md` for complete documentation.

## useFetch (Recommended)

```vue
<script setup>
// Auto-imports, SSR-friendly, caches results
const { data, pending, error, refresh } = await useFetch('/api/users');

// With options
const { data: user } = await useFetch(`/api/users/${id}`, {
  pick: ['name', 'email'], // Select specific fields
  transform: (data) => data.user, // Transform response
  default: () => ({ name: '', email: '' }), // Default value
});
</script>
```

## useAsyncData (Custom Sources)

```vue
<script setup>
// For non-fetch data sources
const { data, pending, error } = await useAsyncData(
  'users', // unique key
  () => $fetch('/api/users')
);

// With dependencies
const { data } = await useAsyncData(
  `user-${id}`,
  () => fetchUserById(id),
  { watch: [id] }
);
</script>
```

## useLazyFetch / useLazyAsyncData

```vue
<script setup>
// Non-blocking - renders immediately, fetches in background
const { data, pending } = useLazyFetch('/api/users');

// Component renders with pending=true, data=null
</script>

<template>
  <div v-if="pending">Loading...</div>
  <ul v-else>
    <li v-for="user in data" :key="user.id">{{ user.name }}</li>
  </ul>
</template>
```

## $fetch (Direct Calls)

```vue
<script setup>
// Client-side only, or in server routes
const submitForm = async () => {
  const result = await $fetch('/api/users', {
    method: 'POST',
    body: { name: 'John' }
  });
};
</script>
```

## Refresh & Refetch

```vue
<script setup>
const { data, refresh, execute } = await useFetch('/api/users', {
  immediate: false // Don't fetch on mount
});

// Manual refresh (uses cache)
await refresh();

// Force refetch (ignores cache)
await refresh({ dedupe: true });

// Execute when immediate: false
await execute();
</script>
```

## Server-Side Only

```vue
<script setup>
const { data } = await useFetch('/api/secret', {
  server: true,  // Only on server
  lazy: false    // Block navigation
});
</script>
```

## Error Handling

```vue
<script setup>
const { data, error } = await useFetch('/api/users');

if (error.value) {
  throw createError({
    statusCode: error.value.statusCode,
    message: error.value.message
  });
}
</script>
```

## Caching

```vue
<script setup>
// Cache for 60 seconds
const { data } = await useFetch('/api/users', {
  getCachedData: (key) => nuxtApp.payload.data[key]
});

// Or use useState for cross-request state
const users = useState('users', () => []);
</script>
```

## Server API with Database

```ts
// server/api/users.get.ts
export default defineEventHandler(async () => {
  return await prisma.user.findMany();
});

// server/api/users.post.ts
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  return await prisma.user.create({ data: body });
});
```

**Official docs:** https://nuxt.com/docs/getting-started/data-fetching
