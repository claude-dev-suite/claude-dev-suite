---
name: vue-composition
description: |
  Vue 3 with Composition API. Covers reactivity, composables,
  lifecycle hooks, and component patterns.

  USE WHEN: user mentions "Vue", "Composition API", "composables", "ref", "reactive",
  "v-model", "v-if", "v-for", asks about "Vue 3 patterns", "reactive state in Vue"

  DO NOT USE FOR: Vue 2 Options API - use legacy Vue documentation instead,
  React - use `frontend-react`, Angular - use `angular`, Svelte - use `svelte`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Vue 3 Composition API

> **Full Reference**: See [advanced.md](advanced.md) for WebSocket composable, provide/inject plugin pattern, Socket.IO integration, and room management.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `vue` for comprehensive documentation.

## When NOT to Use This Skill

Skip this skill when:
- Working with Vue 2 Options API (use legacy Vue docs)
- Building React applications (use `frontend-react`)
- Using Angular framework (use `angular`)
- Working with Svelte (use `svelte`)
- Dealing with server-side only logic (no framework needed)

## Component Structure

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

interface Props {
  title: string
  count?: number
}

const props = defineProps<Props>()
const emit = defineEmits<{
  update: [value: string]
}>()

const localState = ref('')
const doubled = computed(() => props.count * 2)

onMounted(() => {
  console.log('Component mounted')
})
</script>

<template>
  <div>
    <h1>{{ title }}</h1>
    <p>{{ doubled }}</p>
  </div>
</template>
```

## Reactivity System

| API | Purpose |
|-----|---------|
| `ref()` | Primitive reactive value |
| `reactive()` | Reactive object |
| `computed()` | Derived state |
| `watch()` | Watch reactive sources |
| `watchEffect()` | Auto-track dependencies |

## Composables Pattern

```ts
// useCounter.ts
export function useCounter(initial = 0) {
  const count = ref(initial)
  const increment = () => count.value++
  const decrement = () => count.value--
  return { count, increment, decrement }
}
```

## Key Concepts

- `<script setup>` is recommended syntax
- Use `ref` for primitives, `reactive` for objects
- `v-model` for two-way binding
- Slots for content distribution

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using `reactive()` for primitives | Loses reactivity on destructure | Use `ref()` for primitives |
| Mutating props directly | Breaks one-way data flow | Emit events, use `v-model` |
| Using `v-html` without sanitization | XSS vulnerability | Use DOMPurify before rendering |
| Large computed without memo | Recalculates on every render | Break into smaller computeds |
| Not cleaning up in `onUnmounted` | Memory leaks | Clear timers, unsubscribe |
| Using `watch` when `computed` suffices | Unnecessary complexity | Use `computed` for derived state |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Computed not updating | Forgot `.value` on ref | Access refs with `.value` |
| Template not reactive | Used `let` instead of `ref` | Convert to `ref()` or `reactive()` |
| Props mutation warning | Directly modifying props | Clone props or emit update event |
| Component not re-rendering | Using `reactive` on primitive | Use `ref()` for primitives |
| Memory leaks | Forgot to cleanup | Add cleanup in `onUnmounted` |
| `v-model` not working | Wrong event name | Use `update:modelValue` event |

## Production Readiness

### Security Best Practices

```vue
<script setup lang="ts">
// NEVER use v-html with user input without sanitization
import DOMPurify from 'dompurify'

const props = defineProps<{ userContent: string }>()
const sanitizedContent = computed(() => DOMPurify.sanitize(props.userContent))
</script>

<template>
  <!-- BAD -->
  <div v-html="userContent" />

  <!-- GOOD -->
  <div v-html="sanitizedContent" />
</template>
```

```typescript
// Validate external URLs
const isValidUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

// Never expose secrets in client code
// Use runtime config or server routes instead
const config = useRuntimeConfig()
// config.public.* is safe for client
// config.* (without public) stays server-side
```

### Error Handling

```vue
<script setup lang="ts">
import { onErrorCaptured } from 'vue'

// Component-level error boundary
onErrorCaptured((error, instance, info) => {
  // Log to error tracking service
  logError(error, { component: instance?.$options.name, info })

  // Return false to prevent error propagation
  return false
})
</script>
```

```typescript
// Global error handler (main.ts)
const app = createApp(App)

app.config.errorHandler = (error, instance, info) => {
  console.error('Global error:', error)
  // Send to error tracking (Sentry, etc.)
  captureException(error, { extra: { info } })
}

app.config.warnHandler = (msg, instance, trace) => {
  // Log warnings in development
  if (import.meta.env.DEV) console.warn(msg, trace)
}
```

### Performance Optimization

```vue
<script setup lang="ts">
import { defineAsyncComponent, shallowRef } from 'vue'

// Lazy load heavy components
const HeavyChart = defineAsyncComponent({
  loader: () => import('./HeavyChart.vue'),
  loadingComponent: LoadingSpinner,
  delay: 200,
  errorComponent: ErrorDisplay,
})

// Use shallowRef for large objects that don't need deep reactivity
const largeDataset = shallowRef<DataItem[]>([])

// Computed with getter/setter for derived state
const filteredItems = computed(() =>
  items.value.filter(item => item.active)
)
</script>

<template>
  <!-- Use v-once for static content -->
  <header v-once>
    <h1>{{ appTitle }}</h1>
  </header>

  <!-- Use v-memo for expensive list items -->
  <div v-for="item in list" :key="item.id" v-memo="[item.id, item.updated]">
    <ExpensiveComponent :data="item" />
  </div>

  <!-- Virtual scrolling for large lists -->
  <VirtualList :items="largeDataset" :item-height="50" />
</template>
```

### Accessibility (a11y)

```vue
<template>
  <!-- Use semantic HTML -->
  <button @click="handleClick">Submit</button>

  <!-- ARIA for dynamic content -->
  <div role="alert" aria-live="polite" v-if="error">
    {{ error }}
  </div>

  <!-- Focus management -->
  <dialog ref="dialogRef" @vue:mounted="dialogRef?.focus()">
    <h2 id="dialog-title">Confirm Action</h2>
    <div aria-labelledby="dialog-title">...</div>
  </dialog>
</template>
```

### Testing Setup

```typescript
// Component testing with Vue Test Utils
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'

describe('UserForm', () => {
  it('emits submit with form data', async () => {
    const wrapper = mount(UserForm)

    await wrapper.find('input[name="email"]').setValue('test@example.com')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('submit')).toBeTruthy()
    expect(wrapper.emitted('submit')[0]).toEqual([{ email: 'test@example.com' }])
  })
})
```

### Monitoring Metrics

| Metric | Alert Threshold |
|--------|-----------------|
| Largest Contentful Paint (LCP) | > 2.5s |
| First Input Delay (FID) | > 100ms |
| Cumulative Layout Shift (CLS) | > 0.1 |
| JavaScript bundle size | > 200KB (gzipped) |
| Component render time | > 16ms |

### Build Optimization

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ['vue', 'vue-router', 'pinia'],
          ui: ['@headlessui/vue', '@vueuse/core'],
        },
      },
    },
    sourcemap: true,
  },
})
```

### Checklist

- [ ] Global error handler configured
- [ ] No sensitive data in client state
- [ ] DOMPurify for v-html content
- [ ] Async components for code splitting
- [ ] shallowRef for large non-reactive data
- [ ] v-memo for expensive list rendering
- [ ] Virtual scrolling for long lists
- [ ] Semantic HTML and ARIA labels
- [ ] Core Web Vitals monitored
- [ ] Bundle size optimized
- [ ] Error reporting service integrated

## Reference Documentation

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `vue` for comprehensive documentation.

- [Reactivity Cheatsheet](quick-ref/reactivity-cheatsheet.md)
- [Composables Patterns](quick-ref/composables.md)
