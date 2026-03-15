# Svelte Component Patterns

> **Knowledge Base:** Read `knowledge/svelte/components.md` for complete documentation.

## Basic Component

```svelte
<!-- Button.svelte -->
<script lang="ts">
  let { label, onclick, variant = 'primary' } = $props<{
    label: string;
    onclick: () => void;
    variant?: 'primary' | 'secondary';
  }>();
</script>

<button class={variant} {onclick}>
  {label}
</button>

<style>
  .primary { background: blue; color: white; }
  .secondary { background: gray; color: black; }
</style>
```

## Two-Way Binding

```svelte
<!-- Input.svelte -->
<script lang="ts">
  let { value = $bindable('') } = $props<{
    value?: string;
  }>();
</script>

<input bind:value />

<!-- Usage -->
<Input bind:value={name} />
```

## Children & Snippets

```svelte
<!-- Card.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { header, footer, children } = $props<{
    header?: Snippet;
    footer?: Snippet;
    children: Snippet;
  }>();
</script>

<div class="card">
  {#if header}
    <header>{@render header()}</header>
  {/if}

  <main>{@render children()}</main>

  {#if footer}
    <footer>{@render footer()}</footer>
  {/if}
</div>
```

## Event Forwarding

```svelte
<!-- Button.svelte -->
<script lang="ts">
  let { onclick, ...rest } = $props<{
    onclick?: (e: MouseEvent) => void;
  }>();
</script>

<button {onclick} {...rest}>
  <slot />
</button>
```

## Context API

```svelte
<!-- Parent.svelte -->
<script>
  import { setContext } from 'svelte';

  const theme = $state({ mode: 'dark' });
  setContext('theme', theme);
</script>

<!-- Child.svelte -->
<script>
  import { getContext } from 'svelte';

  const theme = getContext<{ mode: string }>('theme');
</script>
```

## Stores (Still Valid in Svelte 5)

```ts
// stores/counter.ts
import { writable, derived } from 'svelte/store';

export const count = writable(0);
export const doubled = derived(count, $c => $c * 2);

// In component
import { count, doubled } from './stores/counter';
count.update(n => n + 1);
```

## Lifecycle

```svelte
<script>
  import { onMount, onDestroy } from 'svelte';

  onMount(() => {
    console.log('Component mounted');
    return () => console.log('Cleanup on unmount');
  });

  onDestroy(() => {
    console.log('Component destroyed');
  });
</script>
```

## Transitions

```svelte
<script>
  import { fade, slide, fly } from 'svelte/transition';

  let visible = $state(true);
</script>

{#if visible}
  <div transition:fade={{ duration: 300 }}>
    Fading content
  </div>
{/if}

<div in:fly={{ y: 200 }} out:fade>
  Different in/out transitions
</div>
```

**Official docs:** https://svelte.dev/docs/svelte/overview
