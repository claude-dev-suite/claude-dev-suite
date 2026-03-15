# Svelte 5 Runes Cheatsheet

> **Knowledge Base:** Read `knowledge/svelte/runes.md` for complete documentation.

## State Runes

```svelte
<script>
  // $state - reactive state
  let count = $state(0);
  let user = $state<User | null>(null);

  // $state with objects (deep reactivity)
  let todos = $state([
    { id: 1, text: 'Learn Svelte', done: false }
  ]);

  // Mutate directly
  count++;
  todos.push({ id: 2, text: 'Build app', done: false });
</script>
```

## Derived Runes

```svelte
<script>
  let count = $state(0);

  // $derived - computed value
  let doubled = $derived(count * 2);

  // $derived with complex logic
  let filtered = $derived(
    todos.filter(t => !t.done)
  );

  // $derived.by - for complex derivations
  let stats = $derived.by(() => {
    const total = todos.length;
    const done = todos.filter(t => t.done).length;
    return { total, done, remaining: total - done };
  });
</script>
```

## Effect Runes

```svelte
<script>
  let count = $state(0);

  // $effect - runs when dependencies change
  $effect(() => {
    console.log(`Count is now ${count}`);
  });

  // $effect with cleanup
  $effect(() => {
    const interval = setInterval(() => count++, 1000);
    return () => clearInterval(interval);
  });

  // $effect.pre - runs before DOM updates
  $effect.pre(() => {
    // Runs before the DOM is updated
  });
</script>
```

## Props Runes

```svelte
<script>
  // $props - component props
  let { name, age = 0, ...rest } = $props<{
    name: string;
    age?: number;
  }>();

  // $bindable - two-way binding prop
  let { value = $bindable() } = $props();
</script>
```

## Event Handling (Svelte 5)

```svelte
<script>
  // Functions as event handlers
  function handleClick(event: MouseEvent) {
    console.log('Clicked!', event);
  }

  // With parameters
  function handleSelect(id: number) {
    return () => console.log('Selected:', id);
  }
</script>

<button onclick={handleClick}>Click</button>
<button onclick={handleSelect(1)}>Select 1</button>
```

## Snippets (Replacing Slots)

```svelte
<script>
  // Receive snippet as prop
  let { header, children } = $props<{
    header: Snippet;
    children: Snippet;
  }>();
</script>

{@render header()}
<div class="content">
  {@render children()}
</div>

<!-- Usage -->
<MyComponent>
  {#snippet header()}
    <h1>Title</h1>
  {/snippet}
  <p>Content goes here</p>
</MyComponent>
```

## Migration from Svelte 4

```svelte
<!-- Svelte 4 -->
<script>
  export let count = 0;
  $: doubled = count * 2;
</script>

<!-- Svelte 5 -->
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
```

**Official docs:** https://svelte.dev/docs/svelte/what-are-runes
