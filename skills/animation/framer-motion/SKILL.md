# Framer Motion Skill

Animation library for React. Declarative, physics-based, gesture-aware.

## Install

```bash
npm install framer-motion
```

## Core API

| API | Purpose |
|-----|---------|
| `motion.div` | Animatable element |
| `animate` prop | Target state |
| `initial` prop | Starting state |
| `exit` prop | Unmount state (requires AnimatePresence) |
| `variants` | Named animation states, enables orchestration |
| `transition` | Timing, easing, spring config |
| `whileHover / whileTap / whileFocus` | Gesture states |
| `drag` | Drag gesture with constraints |
| `layout / layoutId` | FLIP layout animation |
| `AnimatePresence` | Animates unmounting components |
| `useScroll` | Scroll progress values |
| `useTransform` | Map one motion value to another |
| `useSpring` | Spring-based motion value |
| `useInView` | Observe element entering viewport |
| `useAnimation` | Imperative animation control |

## Variants & Orchestration

```tsx
const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } }
};
const item = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
};

<motion.ul variants={container} initial="hidden" whileInView="visible" viewport={{ once: true }}>
  {items.map(i => <motion.li key={i} variants={item}>{i}</motion.li>)}
</motion.ul>
```

## AnimatePresence

```tsx
<AnimatePresence mode="wait">
  {isVisible && (
    <motion.div
      key="unique-key"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    />
  )}
</AnimatePresence>
```

`mode="wait"` — exits finish before new element enters.
`mode="popLayout"` — exiting element pops out of layout flow.

## Layout Animation (FLIP)

```tsx
// Automatic smooth repositioning
<motion.div layout />

// Shared element transition across routes/conditions
<motion.div layoutId="card-thumbnail" />  // source
<motion.div layoutId="card-thumbnail" />  // destination — auto-animates
```

## Scroll-linked

```tsx
const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
const y = useTransform(scrollYProgress, [0, 1], [0, -100]);
const opacity = useTransform(scrollYProgress, [0, 0.3, 1], [0, 1, 0]);
```

## Spring Config

```ts
// Bouncy entrance
transition={{ type: "spring", stiffness: 400, damping: 20 }

// Gentle
transition={{ type: "spring", stiffness: 100, damping: 30 }

// No bounce
transition={{ type: "spring", stiffness: 300, damping: 50 }
```

## Gestures

```tsx
<motion.button
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.97 }}
  transition={{ type: "spring", stiffness: 400, damping: 20 }}
>
  Click me
</motion.button>

// Drag with constraints
<motion.div
  drag
  dragConstraints={{ left: -100, right: 100, top: -50, bottom: 50 }}
  dragElastic={0.2}
/>
```

## Imperative Control

```tsx
const controls = useAnimation();

await controls.start({ opacity: 1, y: 0, transition: { duration: 0.4 } });
controls.stop();

<motion.div animate={controls} initial={{ opacity: 0, y: 20 }} />
```

## Reduced Motion

```tsx
import { useReducedMotion } from "framer-motion";

function AnimatedCard() {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
    />
  );
}
```

## Common Patterns

```tsx
// Stagger list reveal on scroll
// Page transition wrapper
// Accordion with layout animation
// Drag-and-drop with layoutId
// Hero → detail shared element
```

## Pitfalls

- `exit` only works inside `<AnimatePresence>` — wrap the closest conditional parent
- `layout` on elements that change children count can cause jumps — use `layoutId` instead
- Spring animations ignore `duration` — use `stiffness`/`damping`
- `useScroll` without `target` tracks window scroll
- Always set `viewport={{ once: true }}` for entry animations to avoid re-triggering on scroll-up
