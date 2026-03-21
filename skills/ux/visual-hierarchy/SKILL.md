---
name: visual-hierarchy
description: |
  UX visual hierarchy principles. Covers fluid typography scales, spatial layout,
  color contrast, cognitive load reduction, and user scanning patterns.

  USE WHEN: user mentions "visual hierarchy", "typography", "type scale", "color system",
  "cognitive load", "whitespace", "layout", "information architecture", "visual weight",
  "readability", "scanning pattern", "F-pattern", "progressive disclosure"

  DO NOT USE FOR: WCAG compliance auditing (use accessibility/wcag),
  Tailwind-specific utility classes (use styling/tailwindcss),
  component library APIs (use styling/shadcn-ui or styling/radix-ui)
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Visual Hierarchy

## Fluid Typography Scale

Use `clamp(min, preferred, max)` for fluid type that scales between breakpoints without jumps.

```css
:root {
  /* Fluid type scale — adapts between ~375px and ~1280px viewport */
  --text-xs:   clamp(0.75rem,  0.70rem + 0.25vw, 0.875rem);
  --text-sm:   clamp(0.875rem, 0.82rem + 0.30vw, 1rem);
  --text-base: clamp(1rem,     0.92rem + 0.40vw, 1.125rem);
  --text-lg:   clamp(1.125rem, 1.00rem + 0.60vw, 1.375rem);
  --text-xl:   clamp(1.25rem,  1.10rem + 0.75vw, 1.75rem);
  --text-2xl:  clamp(1.5rem,   1.25rem + 1.25vw, 2.25rem);
  --text-3xl:  clamp(1.875rem, 1.50rem + 1.90vw, 3rem);
  --text-4xl:  clamp(2.25rem,  1.75rem + 2.50vw, 3.75rem);
}
```

**Key rules:**
- Body text: 16px minimum (1rem) — never smaller for continuous reading
- Line height: 1.4–1.6 for body text; 1.1–1.3 for headings
- Optimal line length: **45–90 characters** desktop, **30–50 characters** mobile
- Letter spacing: 0 to +0.02em for body; −0.02em to −0.04em for large headings

---

## Spacing System (4px base grid)

All spacing values should be multiples of 4px for visual consistency.

```css
:root {
  --space-1:  0.25rem;  /*  4px */
  --space-2:  0.5rem;   /*  8px */
  --space-3:  0.75rem;  /* 12px */
  --space-4:  1rem;     /* 16px */
  --space-5:  1.25rem;  /* 20px */
  --space-6:  1.5rem;   /* 24px */
  --space-8:  2rem;     /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  --space-20: 5rem;     /* 80px */
  --space-24: 6rem;     /* 96px */
}
```

---

## User Scanning Patterns

Research from Nielsen Norman Group eye-tracking studies (2006–2024):

| Pattern | Shape | When it occurs | Layout implication |
|---------|-------|---------------|-------------------|
| **F-pattern** | Two horizontal bands + left vertical | Text-heavy pages, unfocused reading | Place key info top-left; front-load headings with meaningful words |
| **Z-pattern** | Diagonal from top-left to bottom-right | Landing pages, minimal UI | Logo top-left, CTA bottom-right, key message along diagonal |
| **Layer-Cake** | Horizontal bands (headings only) | Motivated users scanning for info | Use meaningful subheadings; bold keywords; avoid generic labels |
| **Spotted** | Jump to visuals/links/bold text | Users seeking specific content | Use visual anchors; highlight action words; bold CTAs |
| **Commitment** | Top-to-bottom linear | High-motivation, interested users | Reward with well-structured content; don't waste early paragraphs |

**Practical rules:**
- First 2 words of a heading carry 80% of scanning weight — make them meaningful
- Users read ~28% of words on a page on average
- Layer-Cake is the most effective pattern to design for after initial F-pattern entry

---

## Cognitive Load Reduction

**Miller's Law**: Working memory holds 7 ± 2 chunks. Keep navigation items, form fields, and choice options within this range.

**Progressive Disclosure** types:
1. **Staged disclosure** — linear steps (wizard, onboarding)
2. **Contextual disclosure** — show details relevant to current action (tooltip, expand)
3. **Feature-based** — reveal advanced options only when needed ("Advanced settings...")
4. **Interaction-triggered** — appear on demand (accordion, "Show more")

**Chunking patterns:**
```
Bad:  12 navigation items in a flat list
Good: 4 groups × 3 items each (same 12 items, 4 cognitive units)

Bad:  Phone: 0612345678
Good: Phone: 06 1234 5678  (chunked into familiar groups)
```

**Hick's Law**: Decision time increases logarithmically with number of choices. Reduce choices at every decision point.

---

## Visual Weight Principles

Visual weight determines what users look at first. In descending order of weight:

| Factor | High weight | Low weight |
|--------|-------------|------------|
| **Size** | Large elements | Small elements |
| **Contrast** | High contrast vs background | Low contrast |
| **Color** | Saturated / warm colors | Desaturated / cool / gray |
| **Position** | Top-left, center | Bottom-right, edges |
| **Isolation** | Surrounded by whitespace | Crowded with other elements |
| **Motion** | Animated elements | Static elements |
| **Shape** | Irregular, complex | Rectangular, simple |

**Hierarchy creation rule**: For any screen, one element should have clearly the highest visual weight (primary focus), one or two secondary, and the rest tertiary. Multiple "primary" elements = no hierarchy.

---

## Whitespace as Design Element

Whitespace is not empty — it actively communicates grouping, importance, and breathing room.

**Gestalt proximity**: Elements close together are perceived as a group. Use consistent internal vs. external spacing.

```
Component internal spacing: --space-3 to --space-4  (12–16px)
Between components:         --space-6 to --space-8  (24–32px)
Section separations:        --space-12 to --space-16 (48–64px)
Page padding (mobile):      --space-4  (16px min)
Page padding (desktop):     --space-8 to --space-16
```

**Macro vs micro whitespace:**
- **Micro**: Padding inside buttons, cells, inputs — affects scanability
- **Macro**: Space between sections and components — affects perceived quality; generous macro whitespace signals premium

**Research finding**: Increasing whitespace around text and titles increases comprehension by 20%.

---

## Related Skills

- `styling/tailwindcss` — implementation utilities (spacing, text sizing)
- `styling/shadcn-ui` — component-level whitespace and typography tokens
- `accessibility/wcag` — contrast ratios for color in hierarchy
- `ux/design-systems` — tokens that codify the spacing and type scale
- `ux/interaction-design` — motion and loading states

## Deep Knowledge

Load via `mcp__documentation__fetch_docs`:
- `ux-visual-hierarchy` — full scanning pattern data, cognitive load research, fluid typography reference
