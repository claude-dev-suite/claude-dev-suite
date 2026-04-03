# Advanced CSS Effects Skill

clip-path, masks, backdrop-filter, blend modes, CSS 3D, scroll-driven animations, @property, CSS Houdini.

## clip-path

```css
/* Basic shapes */
.diagonal    { clip-path: polygon(0 0, 100% 0, 100% 85%, 0 100%); }
.circle      { clip-path: circle(50% at center); }
.inset       { clip-path: inset(10px 20px 10px 20px round 8px); }
.hexagon     { clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%); }

/* SVG path — use for organic shapes */
.blob { clip-path: path("M 100 0 C 180 0 200 80 160 120 ..."); }

/* Animated reveal */
.reveal-ltr {
  clip-path: inset(0 100% 0 0);
  transition: clip-path 0.7s cubic-bezier(0.77, 0, 0.18, 1);
}
.reveal-ltr.is-visible { clip-path: inset(0 0% 0 0); }

/* Image wipe on hover */
.image-wipe { clip-path: inset(0 50% 0 50%); }
.image-wipe:hover { clip-path: inset(0 0% 0 0%); transition: clip-path 0.5s ease; }
```

## CSS Masks

```css
/* Image mask */
.masked {
  mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
}

/* SVG mask */
.svg-masked {
  mask-image: url(#mask-id);
  mask-size: contain;
  mask-repeat: no-repeat;
}

/* Text as mask (text reveal effect) */
.text-reveal {
  background: linear-gradient(135deg, #6366f1, #a855f7);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

## backdrop-filter

```css
/* Glassmorphism */
.glass {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(16px) saturate(180%) brightness(1.1);
  -webkit-backdrop-filter: blur(16px) saturate(180%) brightness(1.1);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 1rem;
}

/* Frosted dark panel */
.frosted-dark {
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
}

/* NOTE: requires a background behind the element — transparent background on parent breaks it */
```

## CSS Filters

```css
.card:hover {
  filter: drop-shadow(0 20px 40px rgba(99, 102, 241, 0.4));
  transition: filter 0.3s ease;
}

/* Stacked filters */
.artistic {
  filter:
    contrast(1.2)
    saturate(1.3)
    brightness(0.95)
    hue-rotate(10deg);
}

/* Blur on load → sharpen on ready */
.loading  { filter: blur(8px); transition: filter 0.4s ease; }
.loaded   { filter: blur(0); }

/* Glitch effect */
.glitch { filter: url(#glitch-filter); }
```

## mix-blend-mode

```css
/* Overlay text on image */
.overlay-text {
  mix-blend-mode: overlay;   /* multiply | screen | overlay | color-dodge | difference */
  color: white;
}

/* Screen mode for logo on any background */
.logo-screen { mix-blend-mode: screen; }

/* Difference for psychedelic effect */
.psychedelic { mix-blend-mode: difference; }

/* isolation creates a new stacking context (stops blend-mode from affecting parent) */
.container { isolation: isolate; }
```

## @property — Animatable Custom Properties

```css
/* Declare animatable custom property */
@property --hue {
  syntax: "<number>";
  inherits: false;
  initial-value: 0;
}

@property --gradient-angle {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}

/* Animated conic gradient (impossible without @property) */
.spinner {
  background: conic-gradient(from var(--gradient-angle), #6366f1, #a855f7, #6366f1);
  border-radius: 50%;
  animation: spin 3s linear infinite;
}

@keyframes spin { to { --gradient-angle: 360deg; } }

/* Animated hue shift */
.hue-animate {
  background: hsl(var(--hue), 80%, 60%);
  animation: hue-cycle 4s linear infinite;
}
@keyframes hue-cycle { to { --hue: 360; } }
```

## CSS Scroll-Driven Animations (Chrome 115+, 2025 baseline)

```css
/* Fade in as element enters viewport */
@keyframes fade-up {
  from { opacity: 0; transform: translateY(30px); }
  to   { opacity: 1; transform: translateY(0); }
}

.card {
  animation: fade-up linear both;
  animation-timeline: view();                   /* tied to element's visibility */
  animation-range: entry 0% entry 50%;          /* start: enters viewport → fully entered */
}

/* Progress bar tied to page scroll */
.progress-bar {
  transform-origin: left;
  animation: grow-x linear;
  animation-timeline: scroll(root block);        /* scroll of root element, block axis */
  animation-range: 0% 100%;
}
@keyframes grow-x { from { scaleX: 0 } to { scaleX: 1 } }

/* Parallax */
.parallax-bg {
  animation: parallax linear;
  animation-timeline: scroll(root);
}
@keyframes parallax {
  from { transform: translateY(0); }
  to   { transform: translateY(-30%); }
}
```

### Animation Range Keywords

| Keyword | Meaning |
|---------|---------|
| `entry 0%` | Element starts entering viewport |
| `entry 100%` | Element fully in viewport |
| `exit 0%` | Element starts leaving viewport |
| `exit 100%` | Element fully out of viewport |
| `contain` | Element is fully contained within scroller |
| `cover` | Element covers full scroller |

## CSS 3D Transforms

```css
/* Card flip */
.scene {
  perspective: 1000px;
  perspective-origin: center;
}

.card {
  transform-style: preserve-3d;   /* children exist in 3D space */
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}
.card.flipped { transform: rotateY(180deg); }

.face { backface-visibility: hidden; }
.back { transform: rotateY(180deg); }

/* 3D tilt on hover (with JS mouse tracking) */
.tilt-card {
  transform: perspective(800px)
             rotateX(var(--tilt-x, 0deg))
             rotateY(var(--tilt-y, 0deg));
  transition: transform 0.1s ease;
}
```

```ts
// JS tilt tracking
el.addEventListener("mousemove", (e) => {
  const rect = el.getBoundingClientRect();
  const x = ((e.clientY - rect.top)  / rect.height - 0.5) * 20;
  const y = ((e.clientX - rect.left) / rect.width  - 0.5) * -20;
  el.style.setProperty("--tilt-x", `${x}deg`);
  el.style.setProperty("--tilt-y", `${y}deg`);
});
el.addEventListener("mouseleave", () => {
  el.style.setProperty("--tilt-x", "0deg");
  el.style.setProperty("--tilt-y", "0deg");
});
```

## Advanced Gradients

```css
/* Mesh gradient (layered radial) */
.mesh-gradient {
  background:
    radial-gradient(ellipse at 20% 30%, rgba(99,102,241,0.6) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 70%, rgba(168,85,247,0.6) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 50%, rgba(236,72,153,0.4) 0%, transparent 60%),
    #0f172a;
}

/* Noise texture overlay (grain) */
.noisy::after {
  content: "";
  position: absolute; inset: 0;
  background-image: url("data:image/svg+xml,..."); /* or generated via CSS filter */
  opacity: 0.05;
  pointer-events: none;
}

/* Aurora / moving gradient */
.aurora {
  background: linear-gradient(
    135deg,
    #6366f1, #8b5cf6, #a855f7, #ec4899, #6366f1
  );
  background-size: 300% 300%;
  animation: aurora 6s ease infinite;
}
@keyframes aurora {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
```

## Text Effects

```css
/* Gradient text */
.gradient-text {
  background: linear-gradient(135deg, #6366f1, #a855f7);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* Text stroke */
.outlined-text {
  -webkit-text-stroke: 1px currentColor;
  color: transparent;
}

/* Animated underline */
.link {
  background: linear-gradient(currentColor, currentColor) no-repeat bottom;
  background-size: 0% 2px;
  transition: background-size 0.3s ease;
}
.link:hover { background-size: 100% 2px; }

/* Glitch text (pure CSS) */
.glitch {
  position: relative;
}
.glitch::before,
.glitch::after {
  content: attr(data-text);
  position: absolute; top: 0; left: 0;
  clip-path: polygon(0 30%, 100% 30%, 100% 50%, 0 50%);
}
.glitch::before { color: #f00; animation: glitch1 2s infinite; }
.glitch::after  { color: #0ff; animation: glitch2 2s infinite; }
```

## Reduced Motion Safety

```css
/* Always wrap motion in this check */
@media (prefers-reduced-motion: no-preference) {
  .animated { animation: slide-in 0.5s ease-out; }
  .scroll-card {
    animation: fade-up linear both;
    animation-timeline: view();
  }
}

/* Provide static fallback by default */
.animated { opacity: 1; }
```

## Browser Support Notes (2025)

| Feature | Support |
|---------|---------|
| `clip-path` | All modern browsers |
| `backdrop-filter` | All (needs `-webkit-` prefix for older Safari) |
| `@property` | Chrome/Edge 85+, Firefox 128+, Safari 16.4+ |
| Scroll-driven animations | Chrome 115+, Firefox 110+ (partial), Safari 18+ |
| `mix-blend-mode` | All modern browsers |
| CSS 3D transforms | All modern browsers |
| Container queries | All modern browsers (2023+) |
