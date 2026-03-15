# Astro Islands Architecture

> **Knowledge Base:** Read `knowledge/astro/islands.md` for complete documentation.

## What Are Islands?

Islands are interactive UI components on an otherwise static HTML page. Astro renders everything to static HTML by default, then hydrates only the interactive parts.

## Client Directives

```astro
---
import Counter from '../components/Counter.tsx';
import Sidebar from '../components/Sidebar.vue';
import Comments from '../components/Comments.svelte';
---

<!-- Static by default (no JS) -->
<Counter />

<!-- Hydrate immediately on page load -->
<Counter client:load />

<!-- Hydrate when visible in viewport -->
<Sidebar client:visible />

<!-- Hydrate when browser is idle -->
<Comments client:idle />

<!-- Hydrate only on specific media query -->
<MobileMenu client:media="(max-width: 768px)" />

<!-- Hydrate only (skip SSR) -->
<NoSSRComponent client:only="react" />
```

## Directive Comparison

| Directive | When to Use |
|-----------|-------------|
| `client:load` | Immediately interactive (e.g., above-fold CTAs) |
| `client:idle` | Low-priority interactivity |
| `client:visible` | Below-fold components |
| `client:media` | Mobile-only features |
| `client:only` | Client-only (no SSR) |

## Using Different Frameworks

```astro
---
// Mix frameworks in one page!
import ReactCounter from '../components/Counter.tsx';
import VueSlider from '../components/Slider.vue';
import SvelteToggle from '../components/Toggle.svelte';
import SolidTimer from '../components/Timer.tsx'; // Solid
---

<ReactCounter client:load />
<VueSlider client:visible />
<SvelteToggle client:idle />
<SolidTimer client:load />
```

## Passing Props

```astro
---
import Counter from '../components/Counter.tsx';

const initialCount = 10;
const items = ['a', 'b', 'c'];
---

<!-- Props work like normal -->
<Counter
  client:load
  initialCount={initialCount}
  items={items}
  onIncrement={() => console.log('incremented')}
/>
```

## Nested Islands

```astro
---
import Wrapper from '../components/Wrapper.astro';
import Interactive from '../components/Interactive.tsx';
---

<!-- Static Astro wrapper -->
<Wrapper>
  <!-- Interactive island inside -->
  <Interactive client:load />
</Wrapper>
```

## Sharing State Between Islands

```tsx
// stores/counter.ts (using nanostores)
import { atom } from 'nanostores';

export const count = atom(0);

// ComponentA.tsx
import { useStore } from '@nanostores/react';
import { count } from '../stores/counter';

export function ComponentA() {
  const $count = useStore(count);
  return <button onClick={() => count.set($count + 1)}>Count: {$count}</button>;
}

// ComponentB.tsx
import { useStore } from '@nanostores/react';
import { count } from '../stores/counter';

export function ComponentB() {
  const $count = useStore(count);
  return <p>The count is: {$count}</p>;
}
```

## Performance Tips

```astro
---
// Good: Static by default
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import Newsletter from '../components/Newsletter.tsx';
---

<!-- Static (0 JS) -->
<Header />

<main>
  <!-- Only this ships JS -->
  <Newsletter client:visible />
</main>

<!-- Static (0 JS) -->
<Footer />
```

**Official docs:** https://docs.astro.build/en/concepts/islands/
