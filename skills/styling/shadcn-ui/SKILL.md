---
name: shadcn-ui
description: |
  shadcn/ui component library with Radix primitives and Tailwind CSS. Covers
  component installation, customization, theming, and common patterns.

  USE WHEN: user mentions "shadcn", "shadcn/ui", asks about "shadcn components", "installing shadcn", "shadcn setup", "copy-paste components"

  DO NOT USE FOR: Radix UI only (use radix-ui skill), Tailwind only (use tailwindcss skill), Material-UI, Chakra UI, Ant Design
allowed-tools: Read, Grep, Glob, Write, Edit
---
# shadcn/ui Components

> **Full Reference**: See [advanced.md](advanced.md) for accessibility patterns, virtualized tables, form integration with react-hook-form, testing patterns, and dark mode setup.

## When NOT to Use This Skill

- **Radix UI primitives only** - Use `radix-ui` skill for unstyled components
- **Custom component library** - Build from scratch with Radix + Tailwind
- **Different UI framework** - Material-UI, Chakra, Ant Design have own patterns
- **No Tailwind project** - shadcn/ui requires Tailwind CSS

## Installation

```bash
# Initialize shadcn/ui in your project
npx shadcn@latest init

# Add components
npx shadcn@latest add button card dialog dropdown-menu form input table
```

## Button Variants

```tsx
import { Button } from '@/components/ui/button';

<Button variant="default">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>

// With icon
<Button>
  <PlusIcon className="mr-2 h-4 w-4" />
  Add Item
</Button>

// Loading state
<Button disabled={isLoading}>
  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  Save
</Button>
```

## Card Layout

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>User Profile</CardTitle>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

## Dialog (Modal)

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

<Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger asChild>
    <Button>Create User</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Create User</DialogTitle>
    </DialogHeader>
    <UserForm onSuccess={() => setOpen(false)} />
  </DialogContent>
</Dialog>
```

## Data Table

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Email</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {users.map((user) => (
      <TableRow key={user.id}>
        <TableCell>{user.name}</TableCell>
        <TableCell>{user.email}</TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

## Utils (cn function)

```tsx
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Usage
<div className={cn("base-class", isActive && "active-class")} />
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Modifying component files directly | Lost on re-install | Wrap components or use variants |
| No DialogTitle/DialogDescription | Accessibility issue | Always include for screen readers |
| Missing aria labels | Not accessible | Add aria-label to interactive elements |
| Not using asChild | Extra DOM nodes | Use asChild to merge props |
| Hardcoding theme colors | Can't change theme | Use CSS variables from globals.css |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Components not found | Not installed | Run npx shadcn@latest add [component] |
| Styles not applying | Globals.css not imported | Import in layout/app |
| Dark mode not working | No ThemeProvider | Wrap app in ThemeProvider |
| Type errors | Missing types | Install @radix-ui/react-* peer deps |
| Dialog not closing | No controlled state | Add open and onOpenChange props |
| Form validation not working | Missing zodResolver | Add resolver: zodResolver(schema) |

## Theme Configuration

```css
/* index.css */
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    /* ... more variables */
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
  }
}
```

## Monitoring Metrics

| Metric | Target |
|--------|--------|
| Component bundle size | < 50KB per component |
| First Input Delay | < 100ms |
| Accessibility score | 100% |
| Form submission time | < 300ms |

## Checklist

- [ ] Accessible labels on all form fields
- [ ] DialogTitle and DialogDescription present
- [ ] aria-describedby for error messages
- [ ] Loading states with aria-busy
- [ ] Lazy loading for heavy components
- [ ] Virtual scrolling for large lists
- [ ] Form validation with Zod
- [ ] Dark mode with next-themes
- [ ] Component tests with Testing Library
- [ ] Accessibility tests with jest-axe

## Reference Documentation

- [Component Reference](quick-ref/components.md)
- [Theming](quick-ref/theming.md)
