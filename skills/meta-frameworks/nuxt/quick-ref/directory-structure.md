# Nuxt Directory Structure

> **Knowledge Base:** Read `knowledge/nuxt/structure.md` for complete documentation.

## Core Structure

```
nuxt-app/
├── .nuxt/              # Build output (gitignored)
├── .output/            # Production build
├── app.vue             # Main app component
├── nuxt.config.ts      # Nuxt configuration
│
├── pages/              # File-based routing
│   ├── index.vue       # /
│   ├── about.vue       # /about
│   └── users/
│       ├── index.vue   # /users
│       └── [id].vue    # /users/:id
│
├── components/         # Auto-imported components
│   ├── AppHeader.vue
│   └── ui/
│       └── Button.vue  # <UiButton />
│
├── composables/        # Auto-imported composables
│   └── useAuth.ts      # useAuth()
│
├── layouts/            # Page layouts
│   ├── default.vue
│   └── admin.vue
│
├── middleware/         # Route middleware
│   └── auth.ts
│
├── plugins/            # Vue plugins
│   └── analytics.ts
│
├── server/             # Server-side code
│   ├── api/            # API routes
│   │   └── users.ts    # /api/users
│   ├── middleware/     # Server middleware
│   └── plugins/        # Server plugins
│
├── public/             # Static assets (served as-is)
├── assets/             # Build-processed assets
└── utils/              # Auto-imported utilities
```

## Dynamic Routes

```
pages/
├── users/
│   ├── [id].vue        # /users/:id
│   └── [id]/
│       └── posts.vue   # /users/:id/posts
├── blog/
│   └── [...slug].vue   # /blog/* (catch-all)
└── [[optional]].vue    # Optional param
```

## Page Metadata

```vue
<!-- pages/about.vue -->
<script setup>
definePageMeta({
  layout: 'admin',
  middleware: 'auth',
  title: 'About Us'
});

useSeoMeta({
  title: 'About Us',
  description: 'Learn more about our company'
});
</script>
```

## Layouts

```vue
<!-- layouts/default.vue -->
<template>
  <div>
    <AppHeader />
    <slot />
    <AppFooter />
  </div>
</template>

<!-- pages/index.vue -->
<script setup>
definePageMeta({
  layout: 'default' // or 'admin', false for no layout
});
</script>
```

## Server API Routes

```ts
// server/api/users.ts
export default defineEventHandler(async (event) => {
  return { users: await db.user.findMany() };
});

// server/api/users/[id].ts
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  return await db.user.findUnique({ where: { id } });
});
```

## Middleware

```ts
// middleware/auth.ts
export default defineNuxtRouteMiddleware((to, from) => {
  const { loggedIn } = useAuth();
  if (!loggedIn.value) {
    return navigateTo('/login');
  }
});
```

**Official docs:** https://nuxt.com/docs/guide/directory-structure
