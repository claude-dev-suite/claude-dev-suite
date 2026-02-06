# Vue Reactivity Cheatsheet

> **Knowledge Base:** Read `knowledge/vue/composition-api.md` for complete documentation.

## Reactive References

```vue
<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';

// ref - primitives and objects
const count = ref(0);
const user = ref<User | null>(null);

// reactive - objects only (deep reactivity)
const state = reactive({
  items: [],
  loading: false
});

// Access ref value
count.value++;
console.log(count.value);
</script>
```

## Computed Properties

```vue
<script setup lang="ts">
// Read-only computed
const fullName = computed(() => `${firstName.value} ${lastName.value}`);

// Writable computed
const fullName = computed({
  get: () => `${firstName.value} ${lastName.value}`,
  set: (val) => {
    [firstName.value, lastName.value] = val.split(' ');
  }
});
</script>
```

## Watchers

```vue
<script setup lang="ts">
// Watch single ref
watch(count, (newVal, oldVal) => {
  console.log(`Changed from ${oldVal} to ${newVal}`);
});

// Watch multiple sources
watch([firstName, lastName], ([newFirst, newLast]) => {
  fullName.value = `${newFirst} ${newLast}`;
});

// Watch with options
watch(
  () => state.items,
  (items) => { /* handle */ },
  { deep: true, immediate: true }
);

// watchEffect - auto-tracks dependencies
watchEffect(() => {
  console.log(`Count is: ${count.value}`);
});
</script>
```

## Reactivity Utilities

```vue
<script setup lang="ts">
import { toRef, toRefs, isRef, unref, toRaw } from 'vue';

// toRef - create ref from reactive property
const nameRef = toRef(state, 'name');

// toRefs - destructure reactive object
const { name, age } = toRefs(state);

// isRef - check if ref
if (isRef(maybeRef)) { /* */ }

// unref - get value (works for both ref and plain)
const value = unref(maybeRef);

// toRaw - get original object
const rawState = toRaw(state);
</script>
```

## Shallow Reactivity

```vue
<script setup lang="ts">
import { shallowRef, shallowReactive } from 'vue';

// Only top-level is reactive
const shallowState = shallowReactive({ nested: { value: 1 } });
const shallowCount = shallowRef({ count: 0 });
</script>
```

**Official docs:** https://vuejs.org/guide/essentials/reactivity-fundamentals.html
