# Vue Composables Patterns

> **Knowledge Base:** Read `knowledge/vue/composition-api.md` for complete documentation.

## Basic Composable

```ts
// composables/useCounter.ts
import { ref, computed } from 'vue';

export function useCounter(initialValue = 0) {
  const count = ref(initialValue);

  const double = computed(() => count.value * 2);

  function increment() {
    count.value++;
  }

  function decrement() {
    count.value--;
  }

  return { count, double, increment, decrement };
}
```

## Async Composable

```ts
// composables/useFetch.ts
import { ref, watchEffect } from 'vue';

export function useFetch<T>(url: string) {
  const data = ref<T | null>(null);
  const error = ref<Error | null>(null);
  const loading = ref(true);

  watchEffect(async () => {
    loading.value = true;
    error.value = null;

    try {
      const response = await fetch(url);
      data.value = await response.json();
    } catch (e) {
      error.value = e as Error;
    } finally {
      loading.value = false;
    }
  });

  return { data, error, loading };
}
```

## Composable with Options

```ts
// composables/useLocalStorage.ts
import { ref, watch } from 'vue';

interface UseLocalStorageOptions<T> {
  serializer?: (value: T) => string;
  deserializer?: (value: string) => T;
}

export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  options: UseLocalStorageOptions<T> = {}
) {
  const {
    serializer = JSON.stringify,
    deserializer = JSON.parse
  } = options;

  const storedValue = localStorage.getItem(key);
  const data = ref<T>(
    storedValue ? deserializer(storedValue) : defaultValue
  );

  watch(data, (newValue) => {
    localStorage.setItem(key, serializer(newValue));
  }, { deep: true });

  return data;
}
```

## Event Composable

```ts
// composables/useEventListener.ts
import { onMounted, onUnmounted } from 'vue';

export function useEventListener(
  target: EventTarget,
  event: string,
  handler: EventListener
) {
  onMounted(() => target.addEventListener(event, handler));
  onUnmounted(() => target.removeEventListener(event, handler));
}
```

## Composable with Cleanup

```ts
// composables/useInterval.ts
import { ref, onUnmounted } from 'vue';

export function useInterval(callback: () => void, delay: number) {
  const id = ref<number | null>(null);

  function start() {
    stop();
    id.value = window.setInterval(callback, delay);
  }

  function stop() {
    if (id.value !== null) {
      clearInterval(id.value);
      id.value = null;
    }
  }

  onUnmounted(stop);

  return { start, stop };
}
```

## Usage in Component

```vue
<script setup lang="ts">
import { useFetch } from '@/composables/useFetch';
import { useCounter } from '@/composables/useCounter';

const { data, loading, error } = useFetch<User[]>('/api/users');
const { count, increment } = useCounter(10);
</script>
```

**Official docs:** https://vuejs.org/guide/reusability/composables.html
