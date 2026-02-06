---
name: wcag
description: |
  WCAG 2.2 Web Content Accessibility Guidelines. Covers conformance levels A/AA/AAA,
  success criteria, testing with axe-core, and common accessibility patterns.

  USE WHEN: user mentions "accessibility", "a11y", "WCAG", "screen reader", "ARIA", asks about "color contrast", "keyboard navigation", "accessible forms", "compliance", "ADA", "Section 508"

  DO NOT USE FOR: automated testing implementation - use `axe-core` instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# WCAG 2.2 Accessibility

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `wcag` for comprehensive WCAG guidelines, success criteria, and techniques.

## When NOT to Use This Skill

- **Automated testing setup** - Use the `axe-core` skill for integrating axe testing tools
- **Component library accessibility** - Use framework-specific skills (e.g., React, Vue) for accessible component patterns
- **Design systems** - Use UI library skills for pre-built accessible components
- **ARIA implementation only** - This skill covers broader WCAG compliance, not just ARIA

## Official References

| Resource | URL |
|----------|-----|
| WCAG 2.2 Spec | https://www.w3.org/TR/WCAG22/ |
| Quick Reference | https://www.w3.org/WAI/WCAG22/quickref/ |
| Understanding WCAG | https://www.w3.org/WAI/WCAG22/Understanding/ |
| axe-core | https://github.com/dequelabs/axe-core |
| WAI-ARIA | https://www.w3.org/TR/wai-aria-1.2/ |

---

## Conformance Levels

| Level | Description | Legal Requirement |
|-------|-------------|-------------------|
| **A** | Minimum accessibility | Rarely sufficient |
| **AA** | Standard accessibility | Most regulations (ADA, EN 301 549) |
| **AAA** | Enhanced accessibility | Specialized contexts |

### WCAG 2.2 Success Criteria Count

| Level | New in 2.2 | Total |
|-------|------------|-------|
| A | 0 | 30 |
| AA | 6 | 24 |
| AAA | 3 | 31 |

---

## POUR Principles

### 1. Perceivable

| Guideline | Key Criteria | Level |
|-----------|--------------|-------|
| **1.1 Text Alternatives** | All non-text content has text alternative | A |
| **1.2 Time-based Media** | Captions, audio descriptions | A-AAA |
| **1.3 Adaptable** | Content structure, meaningful sequence | A |
| **1.4 Distinguishable** | Color contrast, resize text, spacing | A-AAA |

```tsx
// Text alternatives
<img src="chart.png" alt="Q3 sales increased 25% compared to Q2" />

// Decorative images
<img src="divider.png" alt="" role="presentation" />

// Color contrast (4.5:1 for normal text, 3:1 for large text)
// Use tools: WebAIM Contrast Checker, axe DevTools
```

### 2. Operable

| Guideline | Key Criteria | Level |
|-----------|--------------|-------|
| **2.1 Keyboard** | All functionality via keyboard | A |
| **2.2 Enough Time** | Adjustable time limits | A-AAA |
| **2.4 Navigable** | Skip links, focus order, focus visible | A-AAA |
| **2.5 Input Modalities** | Target size, motion alternatives | A-AAA |

```tsx
// Skip link
<a href="#main-content" className="skip-link">
  Skip to main content
</a>

// Focus visible (2.4.7)
button:focus {
  outline: 3px solid #005fcc;
  outline-offset: 2px;
}

// Target size minimum (2.5.8) - 24x24 CSS pixels
.button {
  min-width: 44px;
  min-height: 44px;
  padding: 12px 16px;
}
```

### 3. Understandable

| Guideline | Key Criteria | Level |
|-----------|--------------|-------|
| **3.1 Readable** | Language of page, unusual words | A-AAA |
| **3.2 Predictable** | Consistent navigation, identification | A-AA |
| **3.3 Input Assistance** | Error identification, labels | A-AAA |

```tsx
// Language of page (3.1.1)
<html lang="en">

// Error identification (3.3.1)
<div role="alert" aria-live="assertive">
  Email is required and must be valid
</div>

// Labels (3.3.2)
<label htmlFor="email">Email Address</label>
<input id="email" type="email" aria-describedby="email-hint" />
<span id="email-hint">We'll never share your email</span>
```

### 4. Robust

| Guideline | Key Criteria | Level |
|-----------|--------------|-------|
| **4.1 Compatible** | Valid HTML, name/role/value | A |

```tsx
// Name, Role, Value (4.1.2)
<button aria-pressed="true" aria-label="Favorite this item">
  ★
</button>

// Custom controls
<div
  role="slider"
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={50}
  aria-label="Volume"
  tabIndex={0}
/>
```

---

## New in WCAG 2.2

### Level AA (Required)

| Criterion | Description |
|-----------|-------------|
| **2.4.11 Focus Not Obscured (Minimum)** | Focused element at least partially visible |
| **2.4.13 Focus Appearance** | Focus indicator meets size/contrast requirements |
| **2.5.7 Dragging Movements** | Single pointer alternative to drag |
| **2.5.8 Target Size (Minimum)** | 24x24 CSS pixels minimum |
| **3.2.6 Consistent Help** | Help in consistent location |
| **3.3.7 Redundant Entry** | Don't require re-entering info |

### Level AAA

| Criterion | Description |
|-----------|-------------|
| **2.4.12 Focus Not Obscured (Enhanced)** | Focused element fully visible |
| **3.3.8 Accessible Authentication (Minimum)** | No cognitive function test |
| **3.3.9 Accessible Authentication (Enhanced)** | No object/content recognition |

---

## Common Patterns

### Modal Dialog

```tsx
function Modal({ isOpen, onClose, title, children }) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Trap focus inside modal
      modalRef.current?.focus();

      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      ref={modalRef}
      tabIndex={-1}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <h2 id="modal-title">{title}</h2>
      {children}
      <button onClick={onClose}>Close</button>
    </div>
  );
}
```

### Dropdown Menu

```tsx
function Dropdown({ label, items }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, items.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
        break;
      case 'Escape':
        setIsOpen(false);
        break;
      case 'Enter':
      case ' ':
        if (activeIndex >= 0) items[activeIndex].onClick();
        break;
    }
  };

  return (
    <div onKeyDown={handleKeyDown}>
      <button
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        {label}
      </button>
      {isOpen && (
        <ul role="menu">
          {items.map((item, i) => (
            <li
              key={item.id}
              role="menuitem"
              tabIndex={activeIndex === i ? 0 : -1}
              aria-current={activeIndex === i}
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### Form with Validation

```tsx
function Form() {
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <form aria-describedby="form-errors">
      {Object.keys(errors).length > 0 && (
        <div id="form-errors" role="alert" aria-live="polite">
          <h2>Please fix the following errors:</h2>
          <ul>
            {Object.entries(errors).map(([field, msg]) => (
              <li key={field}>
                <a href={`#${field}`}>{msg}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <label htmlFor="email">
          Email <span aria-hidden="true">*</span>
          <span className="sr-only">(required)</span>
        </label>
        <input
          id="email"
          type="email"
          aria-required="true"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
        {errors.email && (
          <span id="email-error" role="alert">{errors.email}</span>
        )}
      </div>
    </form>
  );
}
```

---

## Testing

### Automated Testing with axe-core

```typescript
// Playwright + axe
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('homepage has no accessibility violations', async ({ page }) => {
  await page.goto('/');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});

// Vitest + axe
import { axe, toHaveNoViolations } from 'jest-axe';
import { render } from '@testing-library/react';

expect.extend(toHaveNoViolations);

test('Button is accessible', async () => {
  const { container } = render(<Button>Click me</Button>);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

### Manual Testing Checklist

```markdown
## Keyboard Navigation
- [ ] Tab through all interactive elements
- [ ] Shift+Tab navigates backwards
- [ ] Enter/Space activates buttons and links
- [ ] Arrow keys work in menus, tabs, sliders
- [ ] Escape closes modals and dropdowns
- [ ] No keyboard traps

## Screen Reader
- [ ] All images have alt text
- [ ] Form fields have labels
- [ ] Headings are hierarchical (h1 > h2 > h3)
- [ ] Links are descriptive (not "click here")
- [ ] Dynamic content announced (aria-live)

## Visual
- [ ] Color contrast meets 4.5:1 (normal text)
- [ ] Color contrast meets 3:1 (large text, UI components)
- [ ] Focus indicators visible
- [ ] Content readable at 200% zoom
- [ ] No horizontal scrolling at 320px width
```

### Tools

| Tool | Purpose |
|------|---------|
| **axe DevTools** | Browser extension for auditing |
| **WAVE** | Visual accessibility evaluation |
| **Lighthouse** | Performance + accessibility audit |
| **NVDA/VoiceOver** | Screen reader testing |
| **Color Contrast Analyzer** | Contrast checking |

---

## CSS Utilities

```css
/* Visually hidden but accessible to screen readers */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Focus visible only for keyboard users */
:focus:not(:focus-visible) {
  outline: none;
}

:focus-visible {
  outline: 3px solid #005fcc;
  outline-offset: 2px;
}

/* Reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* High contrast mode support */
@media (forced-colors: active) {
  .button {
    border: 2px solid currentColor;
  }
}
```

---

## Checklist

### Design Phase
- [ ] Color contrast meets requirements
- [ ] Touch targets 44x44 minimum (recommended)
- [ ] Focus states designed
- [ ] Error states include text, not just color

### Development
- [ ] Semantic HTML used
- [ ] ARIA only when HTML insufficient
- [ ] Keyboard navigation works
- [ ] Focus management for SPAs
- [ ] Form errors accessible

### Testing
- [ ] axe-core in CI pipeline
- [ ] Manual screen reader testing
- [ ] Keyboard-only navigation tested
- [ ] Zoom to 200% tested

---

## Anti-Patterns

| Anti-Pattern | Why It's Wrong | Correct Approach |
|-------------|----------------|------------------|
| Using `aria-label` on `<div>` without `role` | ARIA on non-semantic elements without roles is ignored | Use semantic HTML first: `<button>` instead of `<div role="button">` |
| `<div onclick="">` for buttons | Not keyboard accessible by default | Use `<button>` with proper event handlers |
| Color-only indicators | Fails for colorblind users | Add icons, text, or patterns alongside color |
| `placeholder` as label replacement | Disappears on input, low contrast | Always use `<label>` with `for` attribute |
| `tabindex` > 0 | Disrupts natural tab order | Use `tabindex="0"` or rely on DOM order |
| `alt=""` on informative images | Screen readers skip important content | Provide descriptive alt text |
| Missing focus indicators | Users can't see where they are | Always show `:focus-visible` styles |
| Auto-playing media | Disorienting for screen reader users | Require user action to start media |

## Quick Troubleshooting

| Issue | Diagnosis | Solution |
|-------|-----------|----------|
| Screen reader not announcing button | Missing accessible name | Add `aria-label` or visible text inside button |
| Keyboard trap in modal | Focus not properly managed | Implement focus trap with first/last element logic |
| Form errors not announced | No `role="alert"` or `aria-live` | Add `aria-live="assertive"` to error container |
| Low contrast warning | Text doesn't meet 4.5:1 ratio | Use contrast checker, adjust colors or increase font size |
| Tab order feels wrong | DOM order doesn't match visual order | Reorder DOM to match visual layout, avoid `tabindex` > 0 |
| Custom dropdown not accessible | Missing ARIA roles and keyboard handling | Use `role="combobox"`, `aria-expanded`, arrow key navigation |
| Dynamic content not announced | Changes happen silently | Use `aria-live="polite"` or `role="status"` |
| Image button has no label | Only icon, no text alternative | Add `aria-label` with descriptive text |

---

## Related Skills

- [React](../../frontend-frameworks/react/SKILL.md)
- [Testing Library](../../testing/testing-library/SKILL.md)
- [Playwright](../../testing/playwright/SKILL.md)
