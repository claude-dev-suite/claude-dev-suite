---
name: gsap
description: |
  Builds high-performance JavaScript animations with GSAP — tweens (to/from/fromTo),
  timeline sequencing with position parameters, ScrollTrigger (pin, scrub, snap),
  Flip plugin for layout transitions, stagger grids, matchMedia responsive animations,
  React integration via useGSAP hook with automatic cleanup, and SVG path drawing.

  USE WHEN: user mentions "gsap", "GreenSock", "ScrollTrigger", "gsap.to",
  "gsap.timeline", "gsap.from", "useGSAP", "scrub animation", "pin scroll",
  "GSAP context", "gsap.matchMedia", "Flip plugin", "GSAP stagger",
  "tween animation", "gsap.registerPlugin"

  DO NOT USE FOR: Framer Motion (React-specific declarative), CSS-only animations,
  Lottie/Rive, Web Animations API without GSAP
allowed-tools: Read, Grep, Glob, Write, Edit
---

# GSAP (GreenSock Animation Platform)

High-performance JavaScript animation engine with timeline sequencing, ScrollTrigger, Flip plugin, and React integration.

## Install

```bash
npm install gsap
# Plugins (ScrollTrigger free, others require club membership):
# ScrollTrigger, Flip, Observer, ScrollSmoother — included in gsap package
```

## Core API

```ts
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Flip } from "gsap/Flip";
gsap.registerPlugin(ScrollTrigger, Flip);
```

| Method | Purpose |
|--------|---------|
| `gsap.to(target, vars)` | Animate FROM current state TO vars |
| `gsap.from(target, vars)` | Animate FROM vars TO current state |
| `gsap.fromTo(target, from, to)` | Explicit start and end |
| `gsap.set(target, vars)` | Instant set, no animation |
| `gsap.timeline(vars)` | Sequence multiple tweens |
| `gsap.context(fn, scope)` | Scope cleanup (React) |
| `gsap.matchMedia()` | Responsive animations |

## Tween Properties

```ts
gsap.to(".box", {
  x: 100,           // translateX (px)
  y: -50,           // translateY
  rotation: 360,    // degrees
  scale: 1.5,
  opacity: 0,
  duration: 1,
  delay: 0.2,
  ease: "power2.out",
  stagger: 0.1,     // when targeting multiple elements
  repeat: -1,       // -1 = infinite
  yoyo: true,       // reverse on repeat
  onComplete: () => console.log("done"),
});
```

## Easing Reference

| Ease | Character |
|------|-----------|
| `power1-4.in/out/inOut` | Polynomial — power2.out is the go-to |
| `elastic.out(1, 0.3)` | Springy bounce |
| `back.out(1.7)` | Slight overshoot |
| `bounce.out` | Ball bounce |
| `circ.out` | Circular — sharp deceleration |
| `expo.out` | Dramatic fast-to-slow |
| `none` / `linear` | Constant speed |

## Timeline

```ts
const tl = gsap.timeline({ defaults: { ease: "power2.out", duration: 0.5 } });

tl.from(".hero-title",    { opacity: 0, y: 60 })
  .from(".hero-subtitle", { opacity: 0, y: 40 }, "-=0.3")   // 0.3s overlap
  .from(".hero-cta",      { opacity: 0, scale: 0.9 }, "+=0.1") // 0.1s gap
  .from(".hero-image",    { opacity: 0, x: 60 }, "<0.2");    // same start as prev + 0.2

// Position parameter:
// "<"   = same start as previous
// ">"   = end of previous
// "+=n" = n seconds after end
// "-=n" = n seconds before end
// "1.5" = absolute time in timeline
```

## ScrollTrigger

```ts
gsap.to(".panel", {
  xPercent: -100 * (panels.length - 1),
  ease: "none",
  scrollTrigger: {
    trigger: ".scroll-container",
    pin: true,           // pins the trigger element during scroll
    scrub: 1,            // smooth scrubbing (lag in seconds)
    snap: 1 / (panels.length - 1),
    end: () => `+=${containerRef.current?.offsetWidth}`,
  }
});

// Callbacks
ScrollTrigger.create({
  trigger: "#section",
  start: "top 80%",
  end: "bottom 20%",
  onEnter: () => console.log("entered"),
  onLeave: () => console.log("left"),
  onEnterBack: () => console.log("entered back"),
  markers: process.env.NODE_ENV === "development", // visual debug markers
});
```

## React Integration — useGSAP hook

```tsx
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef } from "react";

gsap.registerPlugin(useGSAP);

function AnimatedHero() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    // All GSAP code here is automatically cleaned up on unmount
    gsap.from(".title", { opacity: 0, y: 60, duration: 0.8, ease: "power3.out" });
  }, { scope: containerRef }); // scope = only select within containerRef

  return (
    <div ref={containerRef}>
      <h1 className="title">Hello</h1>
    </div>
  );
}
```

## Context (manual cleanup without useGSAP)

```tsx
useEffect(() => {
  const ctx = gsap.context(() => {
    gsap.from(".item", { opacity: 0, stagger: 0.1 });
  }, containerRef);

  return () => ctx.revert(); // kills all tweens created in context
}, []);
```

## Stagger

```ts
gsap.from(".card", {
  opacity: 0, y: 30,
  stagger: {
    amount: 0.6,         // total time spread across all elements
    from: "center",      // start: "start" | "end" | "center" | "random" | index
    ease: "power2.inOut",
    grid: [3, 4],        // for grid layouts
  }
});
```

## SVG Path Draw (manual, no plugin)

```ts
function animatePath(el: SVGPathElement) {
  const len = el.getTotalLength();
  gsap.set(el, { strokeDasharray: len, strokeDashoffset: len });
  gsap.to(el, { strokeDashoffset: 0, duration: 2, ease: "power2.inOut" });
}
```

## matchMedia (responsive)

```ts
const mm = gsap.matchMedia();

mm.add("(min-width: 768px)", () => {
  gsap.from(".title", { x: -100, opacity: 0 });
});

mm.add("(max-width: 767px)", () => {
  gsap.from(".title", { y: 40, opacity: 0 });
});

// Cleanup:
return () => mm.revert();
```

## Reduced Motion

```ts
const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

gsap.to(".element", {
  x: prefersReduced ? 0 : 200,
  duration: prefersReduced ? 0 : 1,
  opacity: 1,
});
```

## Pitfalls

- Always `ctx.revert()` or use `useGSAP` in React — GSAP tweens survive component unmount otherwise
- `scrub: true` = hard sync with scroll; `scrub: 1` = 1s lag (smoother)
- `pin: true` — the trigger element must have explicit height for the pinned section to work
- Avoid `document.querySelector` inside components — use refs with `gsap.context(scope)`
- `ScrollTrigger.refresh()` after dynamic content loads (images, fonts)
