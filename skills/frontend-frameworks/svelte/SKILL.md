---
name: svelte
description: |
  Svelte 5 with runes reactivity system. Covers components, state
  management, and reactive declarations.

  USE WHEN: user mentions "Svelte", "runes", "$state", "$derived", "$effect",
  "SvelteKit", asks about "Svelte 5 patterns", "reactive runes"

  DO NOT USE FOR: Svelte 4 and earlier - use Svelte 4 documentation,
  React - use `frontend-react`, Vue - use `vue-composition`, Angular - use `angular`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Svelte 5 Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for WebSocket store patterns, room management, Socket.IO integration, and SvelteKit SSE patterns.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `svelte` for comprehensive documentation.

## When NOT to Use This Skill

Skip this skill when:
- Working with Svelte 4 or earlier (use Svelte 4 docs)
- Building React applications (use `frontend-react`)
- Using Vue framework (use `vue-composition`)
- Working with Angular (use `angular`)
- Need only vanilla JavaScript (no framework needed)

## Component Structure

```svelte
<script lang="ts">
  interface Props {
    name: string;
    count?: number;
  }

  let { name, count = 0 }: Props = $props();

  let localState = $state('');
  let doubled = $derived(count * 2);

  function handleClick() {
    localState = 'clicked';
  }
</script>

<div>
  <h1>Hello {name}</h1>
  <p>Count: {count}, Doubled: {doubled}</p>
  <button onclick={handleClick}>Click</button>
</div>

<style>
  div { padding: 1rem; }
</style>
```

## Runes (Svelte 5)

| Rune | Purpose |
|------|---------|
| `$state` | Reactive state |
| `$derived` | Computed values |
| `$effect` | Side effects |
| `$props` | Component props |
| `$bindable` | Two-way bindable props |

## Key Concepts

- No virtual DOM - compiles to vanilla JS
- Scoped CSS by default
- `{#if}`, `{#each}`, `{#await}` blocks
- `bind:` for two-way binding
- `use:` for actions (reusable behaviors)

## Migration from Svelte 4

```svelte
<!-- Svelte 4 -->
<script>
  export let count = 0;
  $: doubled = count * 2;
</script>

<!-- Svelte 5 -->
<script>
  let { count = 0 } = $props();
  let doubled = $derived(count * 2);
</script>
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using Svelte 4 `$:` syntax | Deprecated in Svelte 5 | Use `$derived` rune |
| Not using `$props()` | Old prop syntax | Use `let { prop } = $props()` |
| Using `{@html}` without sanitization | XSS vulnerability | Use DOMPurify before rendering |
| Complex logic in templates | Hard to read/test | Extract to `$derived` or functions |
| Not cleaning up in `onDestroy` | Memory leaks | Clear timers, unsubscribe |
| Overusing stores | Unnecessary complexity | Use component state when possible |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| State not reactive | Using regular `let` | Use `$state()` rune |
| Derived not updating | Not using `$derived` | Convert to `$derived()` |
| Effect running too often | Missing dependencies | Check `$effect` dependencies |
| Props not updating | Using old syntax | Use `$props()` rune |
| Memory leaks | No cleanup | Add `onDestroy()` lifecycle |
| Binding not working | Wrong syntax | Use `bind:value` not `:value` |

## Production Readiness

### Security

```svelte
<script lang="ts">
  import DOMPurify from 'dompurify';
  let { rawHtml }: { rawHtml: string } = $props();
  let safeHtml = $derived(DOMPurify.sanitize(rawHtml));
</script>

{@html safeHtml}
```

### Testing

```typescript
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Counter from './Counter.svelte';

describe('Counter', () => {
  it('increments count on click', async () => {
    const user = userEvent.setup();
    render(Counter, { props: { initial: 0 } });

    const button = screen.getByRole('button');
    await user.click(button);

    expect(screen.getByText('Count: 1')).toBeInTheDocument();
  });
});
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| Bundle size | < 50KB |
| First Contentful Paint | < 1s |
| Time to Interactive | < 2s |
| Hydration time | < 100ms |

### Checklist

- [ ] Svelte 5 runes ($state, $derived, $effect)
- [ ] No {@html} with user input
- [ ] Error boundaries in SvelteKit
- [ ] Virtual lists for large data
- [ ] Lazy loaded components
- [ ] Proper ARIA attributes
- [ ] Testing with @testing-library/svelte
- [ ] Server-side rendering enabled
- [ ] Prerendering static pages
- [ ] Bundle analysis

## Reference Documentation

- [Runes Cheatsheet](quick-ref/runes-cheatsheet.md)
- [Component Patterns](quick-ref/component-patterns.md)
