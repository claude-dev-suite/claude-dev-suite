---
name: interaction-design
description: |
  Interaction design patterns for web interfaces. Covers motion and animation
  timing, microinteractions, loading states, skeleton screens, optimistic UI,
  form UX, mobile touch targets, thumb zones, and responsive interaction patterns.

  USE WHEN: user mentions "animation", "transition", "loading state", "skeleton screen",
  "microinteraction", "form UX", "touch target", "mobile UX", "thumb zone",
  "optimistic UI", "perceived performance", "CLS", "reduced motion",
  "bottom navigation", "hamburger menu", asks "how fast should animations be"

  DO NOT USE FOR: CSS animation syntax (use styling/tailwindcss),
  performance profiling (use best-practices/performance),
  WCAG audit (use accessibility/wcag)
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Interaction Design

## Animation Timing Reference

Research-backed durations. **The most common mistake is animations that are too slow.**

| Interaction type | Duration | Easing | Notes |
|-----------------|----------|--------|-------|
| Hover state change | 80–120ms | ease-out | Opacity, color, shadow |
| Focus ring | 80ms | ease-out | Should feel instant |
| Tap/click feedback | 80–100ms | ease-out | Scale or opacity pulse |
| Toggle (checkbox, switch) | 150ms | ease-in-out | State change |
| Dropdown open | 150–200ms | ease-out | Entering |
| Dropdown close | 100–150ms | ease-in | Exiting — faster than entering |
| Modal/dialog open | 200–250ms | ease-out | Entering |
| Modal/dialog close | 150–200ms | ease-in | Exiting |
| Toast notification | 200–300ms in, 150ms out | ease-out / ease-in | |
| Page transition | 300–400ms | ease-in-out | Max for page-level |
| **Hard limit** | **500ms** | — | Never exceed; users feel it as lag |

**Easing rules:**
- **ease-out** (`cubic-bezier(0, 0, 0.2, 1)`): For elements **entering** the screen — starts fast, decelerates. Feels responsive.
- **ease-in** (`cubic-bezier(0.4, 0, 1, 1)`): For elements **leaving** — starts slow, accelerates. Feels natural.
- **ease-in-out** (`cubic-bezier(0.4, 0, 0.2, 1)`): For elements **transforming** within the screen.
- **Never use linear** for UI — looks mechanical.

```css
:root {
  --ease-out:     cubic-bezier(0, 0, 0.2, 1);
  --ease-in:      cubic-bezier(0.4, 0, 1, 1);
  --ease-in-out:  cubic-bezier(0.4, 0, 0.2, 1);

  --duration-fast:    100ms;
  --duration-normal:  200ms;
  --duration-slow:    300ms;
}
```

---

## prefers-reduced-motion (SAFETY-CRITICAL)

Parallax, large-scale animations, and auto-playing effects can cause **nausea, dizziness, and seizures** in users with vestibular disorders. This is a safety concern, not just a preference.

```css
/* Global reduced-motion reset — add to your base CSS */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

For animations that serve a purpose (progress feedback), provide a reduced alternative:

```css
.spinner {
  animation: spin 1s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
    /* Show a static indicator instead */
    opacity: 0.5;
  }
}
```

In React/Tailwind:

```tsx
import { useReducedMotion } from "@/hooks/use-reduced-motion";

function AnimatedModal({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <div
      className={cn(
        "transition-all",
        reduced ? "duration-0" : "duration-200 ease-out"
      )}
    >
      {children}
    </div>
  );
}

// Hook
function useReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
```

---

## Loading States Decision Matrix

| Scenario | Best pattern | Avoid |
|----------|-------------|-------|
| Page / section load | **Skeleton screen** | Spinner |
| Button action (fast, low-risk) | **Optimistic UI** | Blocking overlay |
| Button action (uncertain outcome) | **Loading spinner on button** | Full-page overlay |
| Background data fetch | No indicator | Spinner |
| File upload | **Progress bar** | Spinner |
| Long operation (>3s) | **Progress bar + estimated time** | Spinner |

**Skeleton screens feel 20–30% faster** than spinners for the same wait time. They set layout expectations and eliminate "jumping" content.

### Skeleton screen pattern (Tailwind)

```tsx
function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      aria-hidden="true"
    />
  );
}

// Usage — mirror the actual layout
function CardSkeleton() {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
```

### Optimistic UI pattern

```tsx
function useLikePost(postId: string) {
  const [liked, setLiked] = useState(false);

  async function toggleLike() {
    // 1. Update UI immediately (optimistic)
    setLiked((prev) => !prev);
    try {
      // 2. Sync with server
      await api.toggleLike(postId);
    } catch {
      // 3. Revert on error
      setLiked((prev) => !prev);
      toast.error("Failed to update. Please try again.");
    }
  }

  return { liked, toggleLike };
}
```

Use optimistic UI for: liking, bookmarking, toggling settings, marking items complete. Not suitable for: payments, deletions, irreversible actions.

---

## CLS Prevention (Cumulative Layout Shift)

Target: **CLS < 0.1** (Google Core Web Vitals "Good" threshold).

60% of CLS is caused by images without dimensions.

```css
/* Always reserve space for images */
.image-wrapper {
  aspect-ratio: 16 / 9;        /* reserves correct proportional space */
  background-color: hsl(var(--muted));
  overflow: hidden;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Responsive images without CLS */
img {
  max-width: 100%;
  height: auto;
  display: block;
}
```

```html
<!-- Always include width + height -->
<img src="hero.jpg" width="1200" height="630" alt="..." loading="lazy" />
```

For dynamic content (ads, async components), reserve fixed space:
```css
.ad-slot { min-height: 250px; }
.async-card { min-height: 120px; }
```

---

## Form UX Patterns

**Research**: Single-column layouts complete **15.4% faster** than multi-column. Removing one optional field at Expedia increased annual revenue by **$12M**.

### Core rules

| Rule | Correct | Avoid |
|------|---------|-------|
| Label position | Above the field | Placeholder as label (disappears on focus) |
| Validation timing | On blur (when user leaves field) | On every keystroke |
| Error placement | Below the field, immediately | Top of form only |
| Error language | "Enter a valid email address" | "Invalid input" |
| Required fields | Mark optional fields instead (fewer to mark) | Mark every required field with * |

### Accessible form pattern

```tsx
function FormField({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {/* Clone child with aria props */}
      {React.cloneElement(children as React.ReactElement, {
        id,
        "aria-describedby": error ? `${id}-error` : undefined,
        "aria-invalid": error ? true : undefined,
        className: cn((children as React.ReactElement).props.className,
          error && "border-destructive focus-visible:ring-destructive"
        ),
      })}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
```

---

## Mobile UX — Touch Targets & Thumb Zones

### Touch target sizes

| Element | Minimum (CSS) | Recommended | Notes |
|---------|--------------|-------------|-------|
| Primary button | 44×44px | 48×48px | Full-width on mobile is ideal |
| Icon button | 44×44px tap area | 48×48px | Use padding to expand tap area |
| Link in text | 24px height | Increase padding | Hard to tap in running text |
| List item | 44px height | 48px | Add py-3 minimum |
| Input field | 44px height | 48px | Avoid small inputs |

```css
/* Expand tap area without changing visual size */
.icon-button {
  position: relative;
  padding: 12px;  /* 48px total for a 24px icon */
}

/* Or use the ::after pseudo-element */
.small-tap-target::after {
  content: "";
  position: absolute;
  inset: -8px;
}
```

### Thumb zones (one-handed use)

```
┌─────────────────────┐
│  ✗ Hard to reach    │  ← Top corners, especially top-right
│─────────────────────│
│  ~ Stretch zone     │  ← Middle of screen, slight reach
│─────────────────────│
│  ✓ Natural zone     │  ← Bottom 40% — thumb reaches easily
│  ✓✓ Primary zone   │  ← Bottom bar — most comfortable
└─────────────────────┘
```

**Decisions based on thumb zones:**
- Primary actions (CTA, submit): bottom third
- Navigation: bottom bar over hamburger menu
- Destructive actions: middle or top (requires deliberate reach)
- Secondary actions: anywhere, but avoid top-right corner

### Bottom navigation vs hamburger

| Metric | Bottom nav (visible) | Hamburger (hidden) |
|--------|---------------------|-------------------|
| Engagement | **1.5x higher** | Baseline |
| Discoverability | High | **20% lower** |
| With labels | +**75% engagement** vs. icon-only | — |

Use bottom navigation for **3–5 primary destinations**. For 6+ items, use a hybrid (bottom bar for top 4–5, slide-out drawer for the rest).

---

## Dark Pattern Quick Reference

2024 FTC sweep: **76% of apps use at least one dark pattern**. Risk: FTC enforcement, EU EAA, state law violations.

| Dark pattern | What it does | Ethical alternative |
|-------------|-------------|-------------------|
| **Roach motel** | Easy to subscribe, impossible to cancel | Cancel in the same number of steps as subscribe |
| **Hidden costs** | Fees revealed only at checkout | Show total price from first interaction |
| **Confirm-shaming** | "No, I hate saving money" | Neutral language: "No thanks" or "Remind me later" |
| **Misdirection** | Primary/secondary button styling reversed for destructive action | Destructive = outlined/ghost; Constructive = filled |
| **Forced continuity** | Auto-renewal without clear notice | Email 7 days before renewal with easy cancel link |
| **Privacy maze** | Opt-out buried in settings → settings → advanced | Toggle on the same page as consent was given |

---

## Related Skills

- `styling/tailwindcss` — Tailwind animation utilities (`animate-pulse`, transitions)
- `accessibility/wcag` — focus management in modals/dialogs
- `best-practices/performance` — Core Web Vitals and CLS measurement
- `ux/visual-hierarchy` — typography and spacing foundations
- `ux/design-systems` — animation tokens (duration, easing variables)

## Deep Knowledge

Load via `mcp__documentation__fetch_docs`:
- `ux-interaction-design` — extended animation research, microinteraction patterns, loading state psychology
- `ux-mobile` — thumb zone research data, touch target guidelines, navigation pattern studies
- `ux-forms` — form conversion research, validation UX studies, accessible error pattern library
- `ux-ethical-design` — full dark pattern catalog, FTC/EU EAA legal context
