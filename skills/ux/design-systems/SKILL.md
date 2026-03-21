---
name: design-systems
description: |
  Design system architecture and design tokens. Covers W3C Design Token spec,
  atomic design methodology, component documentation, theming, dark/light mode,
  and modern CSS custom property patterns.

  USE WHEN: user mentions "design system", "design tokens", "component library",
  "theming", "dark mode", "light mode", "CSS variables", "atomic design",
  "color palette", "token architecture", "shadcn theming", "brand tokens"

  DO NOT USE FOR: specific component APIs (use styling/shadcn-ui or styling/radix-ui),
  animation timing (use ux/interaction-design), WCAG audit (use accessibility/wcag)
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Design Systems & Design Tokens

## W3C Design Token Specification (v1.0 — October 2025)

The W3C Design Tokens Community Group spec defines a vendor-neutral JSON format for sharing design decisions across tools (Figma, Sketch, Style Dictionary, Tokens Studio).

### Token structure

```json
{
  "color": {
    "brand": {
      "$type": "color",
      "primary": { "$value": "#2563eb", "$description": "Primary brand blue" },
      "primary-hover": { "$value": "#1d4ed8" },
      "secondary": { "$value": "#7c3aed" }
    },
    "neutral": {
      "$type": "color",
      "50":  { "$value": "#f8fafc" },
      "100": { "$value": "#f1f5f9" },
      "500": { "$value": "#64748b" },
      "900": { "$value": "#0f172a" }
    }
  },
  "spacing": {
    "$type": "dimension",
    "4":  { "$value": "1rem" },
    "8":  { "$value": "2rem" },
    "12": { "$value": "3rem" }
  },
  "font-size": {
    "$type": "dimension",
    "base": { "$value": "1rem" },
    "lg":   { "$value": "1.125rem" }
  },
  "border-radius": {
    "$type": "dimension",
    "sm":  { "$value": "0.25rem" },
    "md":  { "$value": "0.375rem" },
    "lg":  { "$value": "0.5rem" },
    "full": { "$value": "9999px" }
  }
}
```

### Token hierarchy (3 layers)

```
Primitive tokens      →  Semantic tokens       →  Component tokens
─────────────────────────────────────────────────────────────────
color.neutral.900        color.text.primary        button.text.color
color.brand.primary      color.interactive.default button.bg.default
spacing.4                spacing.component.padding input.padding
```

**Rule**: Components consume semantic tokens, never primitives directly. This enables theming by swapping the semantic layer.

---

## shadcn/ui CSS Variable Convention

shadcn uses HSL values without the `hsl()` wrapper, enabling opacity modifiers (`bg-background/80`):

```css
:root {
  --background:    0 0% 100%;        /* white */
  --foreground:    222.2 47.4% 11.2%;
  --card:          0 0% 100%;
  --card-foreground: 222.2 47.4% 11.2%;
  --popover:       0 0% 100%;
  --popover-foreground: 222.2 47.4% 11.2%;
  --primary:       222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --secondary:     210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted:         210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent:        210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive:   0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border:        214.3 31.8% 91.4%;
  --input:         214.3 31.8% 91.4%;
  --ring:          222.2 47.4% 11.2%;
  --radius:        0.5rem;
}

.dark {
  --background:    224 71% 4%;
  --foreground:    213 31% 91%;
  --primary:       210 40% 98%;
  --primary-foreground: 222.2 47.4% 1.2%;
  --muted:         223 47% 11%;
  --muted-foreground: 215.4 16.3% 56.9%;
  --border:        216 34% 17%;
  --input:         216 34% 17%;
}
```

Usage in Tailwind: `bg-background`, `text-foreground`, `border-border`, `bg-primary/80`.

---

## Theme Switching Implementation

### System preference + manual override

```tsx
// ThemeProvider — respects system, allows manual override
type Theme = "light" | "dark" | "system";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
  root.setAttribute("data-theme", isDark ? "dark" : "light");
}

// Watch for system changes
const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
mediaQuery.addEventListener("change", () => {
  if (currentTheme === "system") applyTheme("system");
});
```

### CSS-only approach (no JS for initial render)

```html
<!-- In <head> — prevents flash of wrong theme -->
<script>
  const theme = localStorage.getItem("theme") || "system";
  const isDark = theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
</script>
```

---

## Atomic Design Levels

| Level | Description | shadcn/Radix equivalent | Example |
|-------|-------------|------------------------|---------|
| **Atoms** | Smallest UI elements | `Button`, `Input`, `Badge`, `Avatar` | `<Button variant="outline">` |
| **Molecules** | 2–3 atoms combined | `FormField` (Label + Input + Error), `SearchBar` | `<FormField>` |
| **Organisms** | Complex sections | `DataTable`, `Header`, `Sidebar` | `<Table>` with toolbar |
| **Templates** | Page-level layout skeleton | `DashboardLayout`, `AuthLayout` | Layout with slots |
| **Pages** | Fully assembled with real content | `DashboardPage`, `ProfilePage` | Complete screen |

**Note**: Few teams follow Atomic Design strictly. Use it as a mental model for deciding where a component belongs, not as a rigid rule.

---

## Style Dictionary Config Skeleton

Style Dictionary transforms design token JSON into platform-specific outputs (CSS variables, Sass, iOS, Android).

```javascript
// style-dictionary.config.js
import StyleDictionary from "style-dictionary";

export default {
  source: ["tokens/**/*.json"],
  platforms: {
    css: {
      transformGroup: "css",
      prefix: "ds",
      buildPath: "dist/",
      files: [
        {
          destination: "tokens.css",
          format: "css/variables",
          options: { outputReferences: true },
        },
      ],
    },
    js: {
      transformGroup: "js",
      buildPath: "dist/",
      files: [{ destination: "tokens.js", format: "javascript/es6" }],
    },
  },
};
```

---

## Design System Efficiency Data

- Design tokens reduce design-to-dev handoff time by **~35%**
- Shared component libraries boost development efficiency by **30–50%**
- Design systems reduce QA cycles by eliminating per-component inconsistencies
- Single source of truth: updating a token propagates to all components/platforms instantly

---

## Related Skills

- `styling/shadcn-ui` — component usage and customization
- `styling/radix-ui` — headless primitive composition
- `styling/tailwindcss` — utility implementation layer
- `ux/visual-hierarchy` — type scale and spacing foundation
- `ux/interaction-design` — animation tokens (duration, easing)

## Deep Knowledge

Load via `mcp__documentation__fetch_docs`:
- `ux-design-systems` — W3C token spec details, Style Dictionary advanced config, atomic design extended guide
