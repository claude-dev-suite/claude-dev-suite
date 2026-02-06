---
name: tailwindcss
description: |
  Tailwind CSS utility framework. Covers utility classes, responsive
  design, and customization. Use for styling web applications.

  USE WHEN: user mentions "Tailwind", "utility CSS", "Tailwind classes", asks about "responsive design", "Tailwind config", "utility-first CSS"

  DO NOT USE FOR: CSS-in-JS (styled-components, emotion), CSS Modules only projects, traditional CSS/SCSS workflows, component libraries like Material-UI
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Tailwind CSS Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `tailwindcss` for comprehensive documentation.

## Common Utilities

```html
<!-- Layout -->
<div class="flex items-center justify-between gap-4">
<div class="grid grid-cols-3 gap-4">
<div class="container mx-auto px-4">

<!-- Spacing -->
<div class="p-4 m-2 space-y-4">
<div class="px-4 py-2 mt-8 mb-4">

<!-- Sizing -->
<div class="w-full h-screen max-w-md min-h-[200px]">

<!-- Typography -->
<p class="text-lg font-semibold text-gray-900">
<p class="text-sm text-gray-500 leading-relaxed">

<!-- Colors -->
<div class="bg-blue-500 text-white border-gray-200">
<div class="bg-gradient-to-r from-blue-500 to-purple-500">
```

## Responsive Design

```html
<!-- Mobile-first breakpoints -->
<div class="text-sm md:text-base lg:text-lg">
<div class="flex-col md:flex-row">
<div class="hidden lg:block">

<!-- Breakpoints: sm(640) md(768) lg(1024) xl(1280) 2xl(1536) -->
```

## States

```html
<!-- Hover, Focus, Active -->
<button class="bg-blue-500 hover:bg-blue-600 active:bg-blue-700">
<input class="border focus:ring-2 focus:ring-blue-500 focus:border-blue-500">

<!-- Group hover -->
<div class="group">
  <span class="group-hover:text-blue-500">Text</span>
</div>

<!-- Dark mode -->
<div class="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
```

## Components Pattern

```html
<!-- Card -->
<div class="rounded-lg shadow-md bg-white p-6 hover:shadow-lg transition-shadow">

<!-- Button -->
<button class="px-4 py-2 rounded-md bg-blue-500 text-white font-medium
               hover:bg-blue-600 focus:outline-none focus:ring-2
               focus:ring-blue-500 focus:ring-offset-2
               disabled:opacity-50 disabled:cursor-not-allowed">

<!-- Input -->
<input class="w-full px-3 py-2 border border-gray-300 rounded-md
              focus:outline-none focus:ring-2 focus:ring-blue-500
              focus:border-transparent">
```

## When NOT to Use This Skill

- **CSS-in-JS preferred** - Use styled-components or Emotion
- **Traditional CSS workflow** - Stick with SCSS/PostCSS
- **Component library projects** - Material-UI, Ant Design have their own styling
- **Email templates** - Inline styles required

## Config

```javascript
// tailwind.config.js
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: { brand: '#1a73e8' },
      fontFamily: { sans: ['Inter', 'sans-serif'] }
    }
  },
  plugins: [require('@tailwindcss/forms')]
}
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Using arbitrary values everywhere | Hard to maintain | Define in theme config |
| Long className strings | Hard to read | Use cn() utility or component extraction |
| Not using content config | Large CSS bundles | Specify exact file paths |
| Inline @apply in HTML | Defeats utility-first | Use @apply in CSS or extract component |
| Ignoring purge warnings | Unused CSS in production | Fix content paths |
| Not using CSS variables | Can't change dynamically | Use CSS vars for themeable values |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Styles not applying | Purge removed classes | Add to safelist or fix content paths |
| Dark mode not working | darkMode not set | Set darkMode: 'class' in config |
| Custom colors not working | Not in theme.extend | Add to theme.extend.colors |
| Build size too large | Including too many files | Be specific in content patterns |
| Hover not working on touch | Using :hover only | Add focus states for accessibility |
| Class conflicts | Multiple utility classes | Use cn() with tailwind-merge |

## Production Readiness

### Performance Optimization

```javascript
// tailwind.config.js
export default {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    // Be specific to avoid scanning node_modules
  ],
  theme: {
    extend: {},
  },
  // Remove unused utilities in production
  safelist: [
    // Only if dynamically generated
    { pattern: /bg-(red|green|blue)-(100|500)/ },
  ],
  // Disable unused core plugins
  corePlugins: {
    preflight: true,
    // container: false, // if not using
  },
};
```

```javascript
// postcss.config.js
export default {
  plugins: {
    'tailwindcss/nesting': {},
    tailwindcss: {},
    autoprefixer: {},
    // Production only
    ...(process.env.NODE_ENV === 'production'
      ? { cssnano: { preset: 'default' } }
      : {}),
  },
};
```

### Design System

```javascript
// tailwind.config.js
export default {
  theme: {
    // Override defaults
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#ffffff',
      black: '#000000',
      // Brand colors
      primary: {
        50: '#eff6ff',
        100: '#dbeafe',
        500: '#3b82f6',
        600: '#2563eb',
        700: '#1d4ed8',
      },
      // Semantic colors
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
    },
    // Consistent spacing scale
    spacing: {
      px: '1px',
      0: '0',
      1: '0.25rem',
      2: '0.5rem',
      3: '0.75rem',
      4: '1rem',
      // ...
    },
    // Typography scale
    fontSize: {
      xs: ['0.75rem', { lineHeight: '1rem' }],
      sm: ['0.875rem', { lineHeight: '1.25rem' }],
      base: ['1rem', { lineHeight: '1.5rem' }],
      lg: ['1.125rem', { lineHeight: '1.75rem' }],
      xl: ['1.25rem', { lineHeight: '1.75rem' }],
    },
  },
};
```

### Component Patterns

```typescript
// lib/styles.ts - Reusable class compositions
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Variant patterns with cva
import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary-600 text-white hover:bg-primary-700',
        outline: 'border border-gray-300 hover:bg-gray-50',
        ghost: 'hover:bg-gray-100',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);
```

### Accessibility

```html
<!-- Focus visible for keyboard users -->
<button class="focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">

<!-- Skip link -->
<a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white">
  Skip to content
</a>

<!-- Reduced motion -->
<div class="transition-transform motion-reduce:transition-none motion-reduce:transform-none">

<!-- Forced colors mode -->
<button class="bg-blue-500 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonBorder]">
```

### Dark Mode

```javascript
// tailwind.config.js
export default {
  darkMode: 'class', // or 'media'
  // ...
};
```

```tsx
// Theme toggle component
function ThemeToggle() {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
      Toggle theme
    </button>
  );
}
```

### Testing

```typescript
// Visual regression testing
import { test, expect } from '@playwright/test';

test('button variants render correctly', async ({ page }) => {
  await page.goto('/storybook/button');

  // Screenshot comparison
  await expect(page.locator('.button-primary')).toHaveScreenshot('button-primary.png');
  await expect(page.locator('.button-outline')).toHaveScreenshot('button-outline.png');
});

// Unit testing class compositions
import { cn, buttonVariants } from '@/lib/styles';

describe('buttonVariants', () => {
  it('generates correct classes for default variant', () => {
    const classes = buttonVariants({ variant: 'default', size: 'md' });
    expect(classes).toContain('bg-primary-600');
    expect(classes).toContain('h-10');
  });
});
```

### Monitoring Metrics

| Metric | Target |
|--------|--------|
| CSS bundle size | < 30KB gzipped |
| Unused CSS | 0% |
| First Contentful Paint | < 1s |
| Lighthouse Performance | > 90 |

### Checklist

- [ ] Content paths correctly configured
- [ ] PostCSS with cssnano in production
- [ ] Design tokens (colors, spacing, typography)
- [ ] cn() utility for class merging
- [ ] CVA for component variants
- [ ] Dark mode support
- [ ] Focus-visible for accessibility
- [ ] Reduced motion support
- [ ] Bundle size monitoring
- [ ] Visual regression tests

## Reference Documentation
- [Utilities Cheatsheet](quick-ref/utilities.md)
- [Responsive Patterns](quick-ref/responsive.md)
