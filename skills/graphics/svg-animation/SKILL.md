# SVG Animation Skill

Animating SVG with CSS, Framer Motion, GSAP, and native SVG attributes.

## SVG Fundamentals

```svg
<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 200 200"   <!-- coordinate system, not pixel size -->
  width="200" height="200"
  role="img" aria-label="Description"
>
```

### Coordinate system
- `viewBox="minX minY width height"` — defines the internal coordinate space
- Scales with CSS `width`/`height` — use `width: 100%` for responsive SVG
- Always set `viewBox` — never rely on pixel `width`/`height` for scaling

## Path Syntax (d attribute)

| Command | Meaning |
|---------|---------|
| `M x y` | Move to (pen up) |
| `L x y` | Line to |
| `H x` | Horizontal line |
| `V y` | Vertical line |
| `C cx1 cy1 cx2 cy2 x y` | Cubic bezier |
| `Q cx cy x y` | Quadratic bezier |
| `A rx ry rot large-arc sweep x y` | Arc |
| `Z` | Close path |

Lowercase = relative coords, uppercase = absolute.

## CSS Animation on SVG

### Path Draw Effect

```css
/* Step 1: measure path length in JS:
   path.getTotalLength() → e.g. 342 */

.animated-path {
  stroke-dasharray: 342;
  stroke-dashoffset: 342;
  animation: draw 2s ease-in-out forwards;
}

@keyframes draw {
  to { stroke-dashoffset: 0; }
}
```

```tsx
// React: measure and animate
function AnimatedPath({ d }: { d: string }) {
  const pathRef = useRef<SVGPathElement>(null);
  const [length, setLength] = useState(0);

  useEffect(() => {
    if (pathRef.current) setLength(pathRef.current.getTotalLength());
  }, []);

  return (
    <path
      ref={pathRef}
      d={d}
      style={{
        strokeDasharray: length,
        strokeDashoffset: length,
        animation: "draw 2s ease-in-out forwards"
      }}
    />
  );
}
```

### Stroke Animation Properties

```css
path {
  stroke: #6366f1;
  stroke-width: 2;
  fill: none;
  stroke-linecap: round;   /* round | butt | square */
  stroke-linejoin: round;
  stroke-dasharray: 10 5;  /* dash gap dash gap */
}
```

## Framer Motion + SVG

### Path Drawing with `pathLength`

```tsx
// Framer Motion built-in — no manual getTotalLength needed
<motion.path
  d={pathD}
  initial={{ pathLength: 0, opacity: 0 }}
  animate={{ pathLength: 1, opacity: 1 }}
  transition={{ pathLength: { duration: 2, ease: "easeInOut" }, opacity: { duration: 0.3 } }}
/>
```

### Path Morphing

```tsx
<motion.path
  d={isOpen ? expandedPath : collapsedPath}
  transition={{ duration: 0.4, ease: "easeInOut" }}
/>
```

**Rule**: paths must have the same number of commands for morphing to work.

### Animated SVG Icon

```tsx
const iconVariants = {
  closed: { d: "M4 6h16M4 12h16M4 18h16" }, // hamburger
  open:   { d: "M6 18L18 6M6 6l12 12" }       // X
};

function MenuIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor">
      <motion.path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        variants={iconVariants}
        animate={isOpen ? "open" : "closed"}
        transition={{ duration: 0.3 }}
      />
    </svg>
  );
}
```

## GSAP + SVG

```ts
// Stagger SVG element entrance
gsap.from("svg path", {
  opacity: 0,
  scale: 0,
  transformOrigin: "center",
  stagger: 0.05,
  duration: 0.4,
  ease: "back.out(1.7)"
});

// Draw path manually
function drawPath(el: SVGPathElement) {
  const len = el.getTotalLength();
  gsap.set(el, { strokeDasharray: len, strokeDashoffset: len });
  gsap.to(el, { strokeDashoffset: 0, duration: 2, ease: "power2.inOut" });
}
```

## SVG Filters

```svg
<defs>
  <!-- Glow -->
  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="4" result="blur" />
    <feMerge>
      <feMergeNode in="blur" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>

  <!-- Grain/noise texture -->
  <filter id="grain">
    <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
    <feColorMatrix type="saturate" values="0" />
    <feBlend in="SourceGraphic" in2="noise" mode="overlay" result="blend" />
    <feComposite in="blend" in2="SourceGraphic" operator="in" />
  </filter>

  <!-- Displacement -->
  <filter id="wave">
    <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="3" result="turb">
      <animate attributeName="baseFrequency" values="0.02;0.04;0.02" dur="4s" repeatCount="indefinite" />
    </feTurbulence>
    <feDisplacementMap in="SourceGraphic" in2="turb" scale="20" />
  </filter>
</defs>
```

Apply: `<use filter="url(#glow)" />` or inline on element.

## Generative SVG (React)

```tsx
// Generative blob
function Blob({ seed = 0 }: { seed?: number }) {
  const points = 8;
  const coords = Array.from({ length: points }, (_, i) => {
    const angle = (i / points) * Math.PI * 2;
    const r = 80 + Math.sin(seed + i * 1.3) * 20;
    return [100 + Math.cos(angle) * r, 100 + Math.sin(angle) * r];
  });

  // Build smooth closed path
  const d = coords.map((p, i) => {
    const next = coords[(i + 1) % points];
    const mx = (p[0] + next[0]) / 2;
    const my = (p[1] + next[1]) / 2;
    return `${i === 0 ? "M" : "Q"} ${p[0]} ${p[1]} ${mx} ${my}`;
  }).join(" ") + " Z";

  return <path d={d} fill="#6366f1" />;
}
```

## Animated SVG Gradient

```tsx
function AnimatedGradientCircle() {
  return (
    <svg viewBox="0 0 200 200">
      <defs>
        <radialGradient id="grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6366f1">
            <animate attributeName="stop-color"
              values="#6366f1;#a855f7;#ec4899;#6366f1"
              dur="4s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="80" fill="url(#grad)" />
    </svg>
  );
}
```

## Accessibility

```svg
<!-- Informative SVG -->
<svg role="img" aria-labelledby="title desc">
  <title id="title">Chart title</title>
  <desc id="desc">Detailed description for screen readers</desc>
  ...
</svg>

<!-- Decorative SVG -->
<svg aria-hidden="true" focusable="false">
  ...
</svg>
```

## Pitfalls

- `transform-origin` in SVG ≠ CSS — use `transform-box: fill-box` to make it behave like CSS
- SVG path morphing requires same point count — simplify paths with tools like SVGOMG
- `stroke-dasharray` values must match `getTotalLength()` precisely — measure after render
- Filters with percentage units expand beyond SVG bounds — use `primitiveUnits="objectBoundingBox"` or explicit overflow
- `viewBox` without `preserveAspectRatio="xMidYMid meet"` (default) may distort on resize
