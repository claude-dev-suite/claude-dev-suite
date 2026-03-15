# Tailwind CSS Utilities Cheatsheet

> **Knowledge Base:** Read `knowledge/tailwind/utilities.md` for complete documentation.

## Layout

```html
<!-- Display -->
<div class="block">Block</div>
<div class="inline-block">Inline Block</div>
<div class="flex">Flex Container</div>
<div class="grid">Grid Container</div>
<div class="hidden">Hidden</div>

<!-- Flexbox -->
<div class="flex flex-row">Row</div>
<div class="flex flex-col">Column</div>
<div class="flex items-center justify-between">Center + Space Between</div>
<div class="flex gap-4">Gap 1rem</div>

<!-- Grid -->
<div class="grid grid-cols-3 gap-4">3 Columns</div>
<div class="grid grid-cols-12">12 Column Grid</div>
<div class="col-span-4">Span 4 columns</div>
```

## Spacing

```html
<!-- Margin -->
<div class="m-4">All sides 1rem</div>
<div class="mx-auto">Center horizontally</div>
<div class="mt-8 mb-4">Top 2rem, Bottom 1rem</div>
<div class="ml-auto">Push right</div>

<!-- Padding -->
<div class="p-4">All sides 1rem</div>
<div class="px-6 py-4">X: 1.5rem, Y: 1rem</div>

<!-- Space between children -->
<div class="space-y-4">Vertical space</div>
<div class="space-x-4">Horizontal space</div>
```

## Sizing

```html
<!-- Width -->
<div class="w-full">100%</div>
<div class="w-1/2">50%</div>
<div class="w-64">16rem</div>
<div class="max-w-md">Max width md</div>
<div class="min-w-0">Min width 0</div>

<!-- Height -->
<div class="h-screen">100vh</div>
<div class="h-full">100%</div>
<div class="min-h-screen">Min 100vh</div>
```

## Typography

```html
<!-- Font size -->
<p class="text-xs">Extra small</p>
<p class="text-sm">Small</p>
<p class="text-base">Base (default)</p>
<p class="text-lg">Large</p>
<p class="text-2xl">2XL</p>

<!-- Font weight -->
<p class="font-normal">Normal</p>
<p class="font-medium">Medium</p>
<p class="font-semibold">Semibold</p>
<p class="font-bold">Bold</p>

<!-- Text alignment & color -->
<p class="text-center text-gray-700">Centered gray text</p>
<p class="text-right text-blue-500">Right blue text</p>
<p class="truncate">Truncate with ellipsis...</p>
```

## Colors & Background

```html
<!-- Text colors -->
<p class="text-black">Black</p>
<p class="text-gray-500">Gray 500</p>
<p class="text-blue-600">Blue 600</p>

<!-- Background -->
<div class="bg-white">White bg</div>
<div class="bg-gray-100">Light gray bg</div>
<div class="bg-gradient-to-r from-blue-500 to-purple-500">Gradient</div>
```

## Borders & Shadows

```html
<!-- Border -->
<div class="border">1px border</div>
<div class="border-2 border-gray-300">2px gray border</div>
<div class="border-t border-b">Top and bottom only</div>
<div class="rounded">Small radius</div>
<div class="rounded-lg">Large radius</div>
<div class="rounded-full">Full circle</div>

<!-- Shadow -->
<div class="shadow">Small shadow</div>
<div class="shadow-md">Medium shadow</div>
<div class="shadow-lg">Large shadow</div>
```

## Interactive States

```html
<!-- Hover, Focus, Active -->
<button class="bg-blue-500 hover:bg-blue-600 active:bg-blue-700">
  Hover me
</button>
<input class="border focus:border-blue-500 focus:ring-2" />

<!-- Dark mode -->
<div class="bg-white dark:bg-gray-900">
  <p class="text-black dark:text-white">Adapts to theme</p>
</div>
```

**Official docs:** https://tailwindcss.com/docs/utility-first
