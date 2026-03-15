# Skeleton UI Components Cheatsheet

## Button Variants

| Class | Description |
|-------|-------------|
| `btn` | Base button |
| `btn-sm` | Small size |
| `btn-lg` | Large size |
| `btn-xl` | Extra large |
| `btn-icon` | Icon-only button |
| `variant-filled` | Solid background |
| `variant-filled-primary` | Primary filled |
| `variant-ghost` | Transparent with hover |
| `variant-soft` | Light tinted background |
| `variant-ringed` | Border outline |

```svelte
<button class="btn variant-filled-primary">Primary</button>
<button class="btn-icon variant-filled">🔔</button>
```

---

## Form Elements

### Input Classes

| Class | Description |
|-------|-------------|
| `input` | Text input |
| `textarea` | Multi-line input |
| `select` | Dropdown select |
| `checkbox` | Checkbox input |
| `radio` | Radio input |
| `toggle` | Switch toggle |
| `label` | Label wrapper |

```svelte
<label class="label">
  <span>Email</span>
  <input class="input" type="email" />
</label>

<label class="flex items-center gap-2">
  <input class="checkbox" type="checkbox" />
  <span>Accept</span>
</label>
```

### Input Groups

```svelte
<div class="input-group input-group-divider grid-cols-[auto_1fr_auto]">
  <div class="input-group-shim">$</div>
  <input type="number" placeholder="Amount" />
  <button class="variant-filled-primary">Pay</button>
</div>
```

---

## Layout Components

### AppShell Slots

| Slot | Description |
|------|-------------|
| `header` | Fixed top bar |
| `sidebarLeft` | Left sidebar |
| `sidebarRight` | Right sidebar |
| `pageHeader` | Page-level header |
| `default` | Main content |
| `pageFooter` | Page-level footer |
| `footer` | Fixed bottom bar |

```svelte
<AppShell>
  <svelte:fragment slot="header">...</svelte:fragment>
  <svelte:fragment slot="sidebarLeft">...</svelte:fragment>
  {children}
  <svelte:fragment slot="pageFooter">...</svelte:fragment>
</AppShell>
```

### AppBar Slots

| Slot | Description |
|------|-------------|
| `lead` | Left content |
| `default` | Center content |
| `trail` | Right content |

```svelte
<AppBar>
  <svelte:fragment slot="lead">Logo</svelte:fragment>
  Title
  <svelte:fragment slot="trail">Profile</svelte:fragment>
</AppBar>
```

---

## Card Structure

```svelte
<div class="card">
  <header class="card-header">Title</header>
  <section class="p-4">Content</section>
  <footer class="card-footer">
    <button class="btn variant-filled">Action</button>
  </footer>
</div>

<!-- Hover effect -->
<a href="/" class="card card-hover p-4">Clickable</a>
```

---

## Navigation

### Tabs

```svelte
<TabGroup>
  <Tab bind:group={tab} value={0}>Tab 1</Tab>
  <Tab bind:group={tab} value={1}>Tab 2</Tab>
  <svelte:fragment slot="panel">
    {#if tab === 0}Content 1{:else}Content 2{/if}
  </svelte:fragment>
</TabGroup>
```

### List Navigation

```svelte
<nav class="list-nav">
  <ul>
    <li><a href="/" class="active">Home</a></li>
    <li><a href="/about">About</a></li>
  </ul>
</nav>
```

### AppRail

```svelte
<AppRail>
  <AppRailTile label="Home" title="Home">
    <svelte:fragment slot="lead">🏠</svelte:fragment>
  </AppRailTile>
  <AppRailTile label="Settings">
    <svelte:fragment slot="lead">⚙️</svelte:fragment>
  </AppRailTile>
  <svelte:fragment slot="trail">
    <AppRailAnchor href="/help">❓</AppRailAnchor>
  </svelte:fragment>
</AppRail>
```

---

## Feedback Components

### Toast

```typescript
// Trigger toast
toastStore.trigger({
  message: 'Success!',
  background: 'variant-filled-success',
  timeout: 3000,
});

// Toast types
'variant-filled-success'
'variant-filled-warning'
'variant-filled-error'
'variant-filled-primary'
```

### Modal Types

```typescript
// Alert
{ type: 'alert', title: 'Title', body: 'Message' }

// Confirm
{ type: 'confirm', title: 'Sure?', response: (r) => {} }

// Prompt
{ type: 'prompt', title: 'Name?', value: '', response: (v) => {} }

// Component
{ type: 'component', component: 'myModal', meta: { data } }
```

---

## Data Display

### Table

```svelte
<div class="table-container">
  <table class="table table-hover">
    <thead>
      <tr><th>Name</th><th>Email</th></tr>
    </thead>
    <tbody>
      <tr><td>John</td><td>john@example.com</td></tr>
    </tbody>
  </table>
</div>
```

### Avatar

```svelte
<Avatar src="/image.jpg" width="w-12" rounded="rounded-full" />
<Avatar initials="JD" background="bg-primary-500" />
```

### Badge

```svelte
<span class="badge variant-filled-primary">New</span>
<span class="badge variant-soft-secondary">Draft</span>
```

### Progress

```svelte
<ProgressBar value={75} max={100} />
<ProgressRadial value={75} />
```

---

## Utility Classes

### Token-Aware Colors

```css
/* Background (light in light, dark in dark) */
bg-surface-100-800-token
bg-surface-200-700-token
bg-surface-300-600-token

/* Works with any color */
bg-primary-400-500-token
text-primary-400-500-token
```

### Typography

```css
h1, h2, h3, h4, h5, h6  /* Heading classes */
lead                     /* Large intro text */
anchor                   /* Styled links */
code                     /* Inline code */
pre                      /* Code blocks */
```

### Badges & Chips

```svelte
<!-- Badge -->
<span class="badge variant-filled">Label</span>

<!-- Chip (with icon) -->
<span class="chip variant-soft">
  <span>🏷️</span>
  <span>Tag</span>
</span>
```

---

## Store Initialization

```svelte
<!-- +layout.svelte (REQUIRED) -->
<script>
  import { initializeStores, storePopup } from '@skeletonlabs/skeleton';
  import { computePosition, autoUpdate, flip, shift, offset, arrow } from '@floating-ui/dom';

  initializeStores();
  storePopup.set({ computePosition, autoUpdate, flip, shift, offset, arrow });
</script>

<Toast />
<Modal />
<Drawer />
```

---

## Getting Stores

```typescript
import {
  getToastStore,
  getModalStore,
  getDrawerStore,
} from '@skeletonlabs/skeleton';

const toastStore = getToastStore();
const modalStore = getModalStore();
const drawerStore = getDrawerStore();
```

---

## Theme Quick Reference

### Set Theme

```html
<body data-theme="skeleton">
```

### Available Presets

- `skeleton` (default)
- `modern`
- `crimson`
- `seafoam`
- `wintry`
- `vintage`
- `sahara`
- `hamlindigo`
- `rocket`
- `gold-nouveau`

### Dark Mode

```html
<html class="dark"><!-- or 'light' -->
```

Toggle with JavaScript:
```javascript
document.documentElement.classList.toggle('dark');
```

---

## Import Reference

```typescript
// Components
import {
  AppShell,
  AppBar,
  AppRail,
  AppRailTile,
  Avatar,
  Drawer,
  Modal,
  Paginator,
  ProgressBar,
  ProgressRadial,
  RangeSlider,
  Step,
  Stepper,
  Tab,
  TabGroup,
  Table,
  Toast,
} from '@skeletonlabs/skeleton';

// Stores
import {
  initializeStores,
  getToastStore,
  getModalStore,
  getDrawerStore,
  storePopup,
} from '@skeletonlabs/skeleton';

// Types
import type {
  ModalSettings,
  DrawerSettings,
  ToastSettings,
  TableSource,
} from '@skeletonlabs/skeleton';

// Utilities
import { tableMapperValues } from '@skeletonlabs/skeleton';
```
