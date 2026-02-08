---
name: radix-ui
description: |
  Radix UI unstyled accessible React components. Headless primitives.

  USE WHEN: user mentions "Radix", "Radix UI", "headless components", "unstyled primitives", asks about "accessible components", "Radix primitives"

  DO NOT USE FOR: shadcn/ui (use shadcn-ui skill), styled component libraries (Material-UI, Chakra), Vue/Svelte (use Headless UI)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Radix UI - Quick Reference

## When to Use This Skill
- Accessible Dialog/Modal components
- Dropdown menu, Select, Popover
- Headless components to style with Tailwind

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `radix-ui` for comprehensive documentation.

## When NOT to Use This Skill

- **shadcn/ui project** - Use `shadcn-ui` skill for pre-styled components
- **Need styled components** - Use Material-UI, Chakra UI, Ant Design
- **Vue/Svelte projects** - Use Headless UI or framework-specific libraries
- **Simple use cases** - Native HTML elements might suffice

## Essential Patterns

### Dialog (Modal)
```tsx
import * as Dialog from '@radix-ui/react-dialog';

<Dialog.Root>
  <Dialog.Trigger asChild>
    <button>Open</button>
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 bg-black/50" />
    <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded">
      <Dialog.Title>Title</Dialog.Title>
      <Dialog.Description>Description</Dialog.Description>
      <Dialog.Close asChild>
        <button>Close</button>
      </Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

### Dropdown Menu
```tsx
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

<DropdownMenu.Root>
  <DropdownMenu.Trigger asChild>
    <button>Menu</button>
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content className="bg-white shadow-lg rounded p-2">
      <DropdownMenu.Item onSelect={() => handleEdit()}>
        Edit
      </DropdownMenu.Item>
      <DropdownMenu.Item onSelect={() => handleDelete()}>
        Delete
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
```

### Select
```tsx
import * as Select from '@radix-ui/react-select';

<Select.Root value={value} onValueChange={setValue}>
  <Select.Trigger className="select-trigger">
    <Select.Value placeholder="Select..." />
  </Select.Trigger>
  <Select.Portal>
    <Select.Content>
      <Select.Viewport>
        <Select.Item value="admin">
          <Select.ItemText>Admin</Select.ItemText>
        </Select.Item>
      </Select.Viewport>
    </Select.Content>
  </Select.Portal>
</Select.Root>
```

### Controlled State
```tsx
const [open, setOpen] = useState(false);
<Dialog.Root open={open} onOpenChange={setOpen}>
```

## Common Props
| Prop | Usage |
|------|-------|
| `asChild` | Merge props to child |
| `open/onOpenChange` | Controlled state |
| `side/align` | Positioning |
| `sideOffset` | Distance offset |

## Anti-Patterns to Avoid
- Do not forget `Portal` for z-index
- Do not forget `asChild` to avoid wrapper divs
- Do not neglect accessibility (ARIA labels)

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| No Portal for overlays | Z-index issues | Always use Portal for dialogs/dropdowns |
| Missing asChild | Extra wrapper divs | Use asChild to merge props |
| No controlled state | Can't track open/close | Use open/onOpenChange |
| Missing aria labels | Not accessible | Add proper labels to all interactive elements |
| Inline styles only | Hard to maintain | Use Tailwind classes or CSS modules |
| Not handling keyboard nav | Poor UX | Radix handles it, don't override |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Overlay behind other elements | No Portal | Wrap in Portal component |
| Extra div wrapper | Not using asChild | Add asChild prop to Trigger/Content |
| Component not opening | No state management | Add open/onOpenChange props |
| Styling not applying | Wrong element | Check Radix docs for data-attributes |
| Keyboard nav broken | Preventing default | Don't preventDefault on Radix events |
| Type errors | Wrong component import | Check @radix-ui/react-[component] package |

## Further Reading
> For complete API reference: [Radix UI Docs](https://www.radix-ui.com/primitives)
