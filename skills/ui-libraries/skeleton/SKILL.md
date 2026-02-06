---
name: skeleton
description: |
  Skeleton UI component library for Svelte applications. Built on Tailwind CSS with
  comprehensive theming, design tokens, and accessible components. Expert patterns
  for layouts, forms, data display, and navigation.

  USE WHEN: user mentions "Skeleton UI", "Skeleton Svelte", asks about "Svelte component library", "Tailwind + Svelte", "Skeleton components", "Svelte design system", "Skeleton theming"

  DO NOT USE FOR: Other UI libraries - use respective skills (Shadcn, DaisyUI, etc.)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Skeleton UI Skill

> **Full Reference**: See [theming.md](theming.md) for Design Tokens, Custom Themes, Theme Switching, Data Display (Cards, Tables, Avatars), Feedback (Toast, Modal), Navigation (Tabs, Stepper, Pagination), and Stores Setup.

## When NOT to Use This Skill

- **React/Vue/Angular projects** - Skeleton is Svelte-only
- **Plain HTML/CSS** - Skeleton requires Svelte and Tailwind CSS
- **Headless UI needs** - Skeleton provides styled components
- **SvelteKit not used** - Skeleton is optimized for SvelteKit

## Installation

```bash
# Create new SvelteKit project
npx sv create my-app
cd my-app

# Add Skeleton
npx @skeletonlabs/skeleton-cli add skeleton

# Or manual installation
npm install @skeletonlabs/skeleton @skeletonlabs/tw-plugin
npm install -D tailwindcss postcss autoprefixer
```

## Configuration

### tailwind.config.js
```javascript
import { skeleton } from '@skeletonlabs/tw-plugin';

export default {
  darkMode: 'class',
  content: [
    './src/**/*.{html,js,svelte,ts}',
    require.resolve('@skeletonlabs/skeleton').replace(/\/index\.js$/, '/**/*.{html,js,svelte,ts}')
  ],
  plugins: [
    skeleton({
      themes: {
        preset: ['skeleton', 'modern', 'crimson'],
      },
    }),
  ],
};
```

### app.postcss
```css
@import '@skeletonlabs/skeleton/styles/skeleton.css';
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### app.html
```html
<body data-theme="skeleton" class="h-full">
  %sveltekit.body%
</body>
```

---

## Layout Components

### AppShell
```svelte
<script>
  import { AppShell, AppBar, AppRail, AppRailTile } from '@skeletonlabs/skeleton';
  let { children } = $props();
</script>

<AppShell>
  <svelte:fragment slot="header">
    <AppBar>
      <svelte:fragment slot="lead">
        <strong>My App</strong>
      </svelte:fragment>
      <svelte:fragment slot="trail">
        <button class="btn variant-filled-primary">Login</button>
      </svelte:fragment>
    </AppBar>
  </svelte:fragment>

  <svelte:fragment slot="sidebarLeft">
    <AppRail>
      <AppRailTile label="Home">🏠</AppRailTile>
      <AppRailTile label="Settings">⚙️</AppRailTile>
    </AppRail>
  </svelte:fragment>

  {@render children()}
</AppShell>
```

---

## Form Components

### Buttons
```svelte
<!-- Variants -->
<button class="btn variant-filled-primary">Primary</button>
<button class="btn variant-ghost-primary">Ghost</button>
<button class="btn variant-soft-primary">Soft</button>
<button class="btn variant-ringed-primary">Ringed</button>

<!-- Sizes -->
<button class="btn btn-sm">Small</button>
<button class="btn btn-lg">Large</button>

<!-- Icon button -->
<button class="btn-icon variant-filled-primary">🔔</button>
```

### Inputs
```svelte
<label class="label">
  <span>Email</span>
  <input class="input" type="email" placeholder="Enter email" />
</label>

<label class="label">
  <span>Message</span>
  <textarea class="textarea" rows="4"></textarea>
</label>

<label class="label">
  <span>Country</span>
  <select class="select">
    <option value="us">United States</option>
    <option value="uk">United Kingdom</option>
  </select>
</label>
```

### Checkbox, Radio & Toggle
```svelte
<label class="flex items-center space-x-2">
  <input class="checkbox" type="checkbox" />
  <span>Accept terms</span>
</label>

<label class="flex items-center space-x-2">
  <input class="radio" type="radio" name="plan" value="pro" />
  <span>Pro</span>
</label>

<label class="flex items-center space-x-2">
  <input class="toggle" type="checkbox" />
  <span>Dark mode</span>
</label>
```

---

## Data Display

### Cards
```svelte
<div class="card p-4">
  <header class="card-header">
    <h3 class="h3">Card Title</h3>
  </header>
  <section class="p-4">Card content</section>
  <footer class="card-footer">
    <button class="btn variant-filled-primary">Action</button>
  </footer>
</div>

<!-- Interactive card -->
<a href="/item/1" class="card card-hover p-4">Clickable</a>
```

### Lists
```svelte
<nav class="list-nav">
  <ul>
    <li><a href="/">Dashboard</a></li>
    <li><a href="/users">Users</a></li>
  </ul>
</nav>
```

---

## Utility Classes

```svelte
<!-- Token-aware backgrounds -->
<div class="bg-surface-100-800-token">Adapts to theme</div>

<!-- Typography -->
<h1 class="h1">Heading 1</h1>
<h2 class="h2">Heading 2</h2>
<p class="lead">Lead paragraph</p>

<!-- Badges -->
<span class="badge variant-filled-primary">Badge</span>
<span class="chip variant-filled-tertiary">Chip</span>
```

---

## Design Tokens

```css
/* Base colors */
--color-primary-500
--color-secondary-500
--color-surface-500

/* Color shades: 50-950 */
--color-primary-50    /* Lightest */
--color-primary-500   /* Base */
--color-primary-950   /* Darkest */

/* Typography */
--base-font-family
--heading-font-family

/* Border radius */
--theme-rounded-base
--theme-rounded-container
```

### Using Design Tokens
```svelte
<!-- Via Tailwind classes -->
<div class="bg-primary-500 text-on-primary-token">
  Primary background
</div>

<!-- Via CSS variables -->
<div style="background-color: rgb(var(--color-primary-500));">
  Custom styling
</div>
```

---

## Best Practices

1. **Always initialize stores** in root layout
2. **Use variant classes** for consistent styling
3. **Leverage design tokens** for theme-aware colors
4. **Use `-token` suffix** for auto dark/light switching
5. **Keep accessibility in mind** - use semantic HTML

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|-------------|----------------|------------------|
| Not initializing stores | Modals, toasts won't work | Call `initializeStores()` in layout |
| Forgetting `skeleton.css` | Components unstyled | Import before Tailwind directives |
| Using raw Tailwind colors | Breaks theming | Use design tokens |
| Missing `data-theme` | Theme not applied | Add to `<body>` |
| `darkMode: 'media'` | Wrong dark mode | Set `darkMode: 'class'` |

## Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| Modal not showing | Call `initializeStores()` in root layout |
| No styling | Import `skeleton.css` in app.postcss |
| Theme not applying | Add `data-theme="skeleton"` to body |
| Dark mode broken | Set `darkMode: 'class'` in tailwind.config |
| Toast not appearing | Add `<Toast />` to root layout |

## Reference Documentation

- [Components Cheatsheet](quick-ref/components-cheatsheet.md)
