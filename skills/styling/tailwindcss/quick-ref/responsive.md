# Tailwind CSS Responsive Design

> **Knowledge Base:** Read `knowledge/tailwind/responsive.md` for complete documentation.

## Breakpoints

```
sm:  640px   @media (min-width: 640px)
md:  768px   @media (min-width: 768px)
lg:  1024px  @media (min-width: 1024px)
xl:  1280px  @media (min-width: 1280px)
2xl: 1536px  @media (min-width: 1536px)
```

## Mobile-First Approach

```html
<!-- Base (mobile) → larger screens -->
<div class="w-full md:w-1/2 lg:w-1/3">
  <!-- 100% on mobile, 50% on md+, 33% on lg+ -->
</div>

<div class="flex flex-col md:flex-row">
  <!-- Stack on mobile, row on md+ -->
</div>

<p class="text-sm md:text-base lg:text-lg">
  <!-- Text scales up with screen size -->
</p>
```

## Responsive Grid

```html
<!-- 1 col mobile, 2 col tablet, 4 col desktop -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
  <div>Item 4</div>
</div>

<!-- 12-column responsive -->
<div class="grid grid-cols-12 gap-4">
  <div class="col-span-12 md:col-span-8 lg:col-span-6">Main</div>
  <div class="col-span-12 md:col-span-4 lg:col-span-6">Sidebar</div>
</div>
```

## Show/Hide by Breakpoint

```html
<!-- Hide on mobile, show on md+ -->
<nav class="hidden md:flex">Desktop Nav</nav>

<!-- Show on mobile, hide on md+ -->
<button class="md:hidden">Mobile Menu</button>

<!-- Different layouts per breakpoint -->
<div class="block md:hidden">Mobile content</div>
<div class="hidden md:block lg:hidden">Tablet content</div>
<div class="hidden lg:block">Desktop content</div>
```

## Responsive Spacing

```html
<!-- Smaller padding on mobile -->
<div class="p-4 md:p-6 lg:p-8">
  Responsive padding
</div>

<!-- Responsive gap -->
<div class="flex gap-2 md:gap-4 lg:gap-6">
  Items with responsive gap
</div>
```

## Container

```html
<!-- Centered container with max-width per breakpoint -->
<div class="container mx-auto px-4">
  <!-- sm: 640px, md: 768px, lg: 1024px, xl: 1280px -->
</div>

<!-- Custom max-widths -->
<div class="max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl mx-auto">
  Responsive max-width
</div>
```

## Responsive Typography

```html
<h1 class="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold">
  Responsive Heading
</h1>

<p class="text-sm md:text-base leading-relaxed md:leading-loose">
  Responsive paragraph with line height
</p>
```

## Custom Breakpoints

```js
// tailwind.config.js
module.exports = {
  theme: {
    screens: {
      'xs': '475px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
      '3xl': '1920px',
    },
  },
};
```

**Official docs:** https://tailwindcss.com/docs/responsive-design
