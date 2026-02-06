# Skeleton Theming & Components

## Design Tokens

Skeleton uses CSS custom properties (design tokens) for theming:

```css
/* Base colors */
--color-primary-500
--color-secondary-500
--color-tertiary-500
--color-success-500
--color-warning-500
--color-error-500
--color-surface-500

/* Typography */
--base-font-family
--heading-font-family
--base-font-size
--base-line-height

/* Border radius */
--theme-rounded-base
--theme-rounded-container
```

### Color Shades

Each color has 50-950 shades:
```css
--color-primary-50    /* Lightest */
--color-primary-100
--color-primary-200
--color-primary-300
--color-primary-400
--color-primary-500   /* Base */
--color-primary-600
--color-primary-700
--color-primary-800
--color-primary-900
--color-primary-950   /* Darkest */
```

---

## Custom Theme

```javascript
// my-theme.ts
import type { CustomThemeConfig } from '@skeletonlabs/tw-plugin';

export const myTheme: CustomThemeConfig = {
  name: 'my-theme',
  properties: {
    // Colors
    '--color-primary-50': '219 246 255',
    '--color-primary-100': '207 243 255',
    '--color-primary-200': '195 239 255',
    '--color-primary-300': '159 230 255',
    '--color-primary-400': '86 210 255',
    '--color-primary-500': '14 190 255',
    '--color-primary-600': '13 171 230',
    '--color-primary-700': '11 143 191',
    '--color-primary-800': '8 114 153',
    '--color-primary-900': '7 93 125',
    '--color-primary-950': '3 47 63',

    // Typography
    '--theme-font-family-base': 'Inter, sans-serif',
    '--theme-font-family-heading': 'Inter, sans-serif',

    // Border radius
    '--theme-rounded-base': '8px',
    '--theme-rounded-container': '12px',

    // Border
    '--theme-border-base': '1px',

    // On-X Colors (text on colored backgrounds)
    '--on-primary': '255 255 255',
    '--on-secondary': '255 255 255',
    '--on-tertiary': '0 0 0',
    '--on-success': '0 0 0',
    '--on-warning': '0 0 0',
    '--on-error': '255 255 255',
    '--on-surface': '255 255 255',
  },
  properties_dark: {
    // Dark mode overrides if needed
  },
};
```

### Register Custom Theme

```javascript
// tailwind.config.js
import { skeleton } from '@skeletonlabs/tw-plugin';
import { myTheme } from './my-theme';

export default {
  plugins: [
    skeleton({
      themes: {
        preset: ['skeleton'],
        custom: [myTheme],
      },
    }),
  ],
};
```

### Theme Switching

```svelte
<script>
  let theme = $state('skeleton');

  function setTheme(newTheme: string) {
    theme = newTheme;
    document.body.setAttribute('data-theme', newTheme);
  }
</script>

<select class="select" onchange={(e) => setTheme(e.target.value)}>
  <option value="skeleton">Skeleton</option>
  <option value="modern">Modern</option>
  <option value="my-theme">My Theme</option>
</select>
```

---

## Data Display Components

### Cards

```svelte
<!-- Basic card -->
<div class="card p-4">
  <header class="card-header">
    <h3 class="h3">Card Title</h3>
  </header>
  <section class="p-4">
    Card content goes here.
  </section>
  <footer class="card-footer">
    <button class="btn variant-filled-primary">Action</button>
  </footer>
</div>

<!-- Interactive card -->
<a href="/item/1" class="card card-hover p-4">
  Clickable card
</a>
```

### Tables

```svelte
<script>
  import { Table, tableMapperValues } from '@skeletonlabs/skeleton';

  const tableData = {
    head: ['Name', 'Email', 'Role'],
    body: tableMapperValues([
      { name: 'John', email: 'john@example.com', role: 'Admin' },
      { name: 'Jane', email: 'jane@example.com', role: 'User' },
    ], ['name', 'email', 'role']),
  };
</script>

<Table
  source={tableData}
  interactive={true}
  on:selected={(e) => console.log(e.detail)}
/>

<!-- Manual table -->
<div class="table-container">
  <table class="table table-hover">
    <thead>
      <tr>
        <th>Name</th>
        <th>Email</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>John</td>
        <td>john@example.com</td>
      </tr>
    </tbody>
  </table>
</div>
```

### Avatars

```svelte
<script>
  import { Avatar } from '@skeletonlabs/skeleton';
</script>

<!-- Image avatar -->
<Avatar src="/path/to/image.jpg" width="w-16" rounded="rounded-full" />

<!-- Initials avatar -->
<Avatar initials="JD" background="bg-primary-500" />
```

---

## Feedback Components

### Toast

```svelte
<script>
  import { Toast, getToastStore } from '@skeletonlabs/skeleton';

  const toastStore = getToastStore();

  function showToast() {
    toastStore.trigger({
      message: 'Operation completed!',
      background: 'variant-filled-success',
      timeout: 3000,
    });
  }
</script>

<!-- Place in layout -->
<Toast />

<button onclick={showToast}>Show Toast</button>
```

### Modal

```svelte
<script>
  import { Modal, getModalStore } from '@skeletonlabs/skeleton';
  import type { ModalSettings } from '@skeletonlabs/skeleton';

  const modalStore = getModalStore();

  function showAlert() {
    const modal: ModalSettings = {
      type: 'alert',
      title: 'Alert',
      body: 'This is an alert message.',
    };
    modalStore.trigger(modal);
  }

  function showConfirm() {
    const modal: ModalSettings = {
      type: 'confirm',
      title: 'Confirm',
      body: 'Are you sure?',
      response: (confirmed: boolean) => {
        console.log('Confirmed:', confirmed);
      },
    };
    modalStore.trigger(modal);
  }
</script>

<!-- Place in layout -->
<Modal />
```

---

## Navigation Components

### Tabs

```svelte
<script>
  import { TabGroup, Tab } from '@skeletonlabs/skeleton';
  let tabSet = $state(0);
</script>

<TabGroup>
  <Tab bind:group={tabSet} name="tab1" value={0}>Tab 1</Tab>
  <Tab bind:group={tabSet} name="tab2" value={1}>Tab 2</Tab>
  <Tab bind:group={tabSet} name="tab3" value={2}>Tab 3</Tab>
  <svelte:fragment slot="panel">
    {#if tabSet === 0}
      <p>Content 1</p>
    {:else if tabSet === 1}
      <p>Content 2</p>
    {:else}
      <p>Content 3</p>
    {/if}
  </svelte:fragment>
</TabGroup>
```

### Stepper

```svelte
<script>
  import { Stepper, Step } from '@skeletonlabs/skeleton';

  function onComplete() {
    console.log('Wizard complete!');
  }
</script>

<Stepper on:complete={onComplete}>
  <Step>
    <svelte:fragment slot="header">Step 1</svelte:fragment>
    Step 1 content
  </Step>
  <Step>
    <svelte:fragment slot="header">Step 2</svelte:fragment>
    Step 2 content
  </Step>
  <Step locked={!isValid}>
    <svelte:fragment slot="header">Step 3</svelte:fragment>
    Step 3 content (locked until valid)
  </Step>
</Stepper>
```

### Pagination

```svelte
<script>
  import { Paginator } from '@skeletonlabs/skeleton';

  let page = $state({
    offset: 0,
    limit: 10,
    size: 100,
    amounts: [5, 10, 25, 50],
  });
</script>

<Paginator
  settings={page}
  showFirstLastButtons={true}
  showPreviousNextButtons={true}
/>
```

---

## Stores Setup (Required)

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import '../app.postcss';
  import {
    AppShell,
    Toast,
    Modal,
    Drawer,
    initializeStores,
    storePopup,
  } from '@skeletonlabs/skeleton';
  import { computePosition, autoUpdate, flip, shift, offset, arrow } from '@floating-ui/dom';

  // Initialize stores once
  initializeStores();

  // Configure popup positioning
  storePopup.set({ computePosition, autoUpdate, flip, shift, offset, arrow });

  let { children } = $props();
</script>

<Toast />
<Modal />
<Drawer />

<AppShell>
  {@render children()}
</AppShell>
```
