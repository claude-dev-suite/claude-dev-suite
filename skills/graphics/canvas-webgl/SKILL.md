---
name: canvas-webgl
description: |
  Implements browser graphics with Canvas 2D API, WebGL2, and creative coding
  libraries (p5.js) — React canvas setup with retina scaling, 2D drawing paths and
  shapes, gradient/pattern fills, transform state management, particle systems,
  pixel manipulation via ImageData, OffscreenCanvas with Web Workers, WebGL2 shader
  compilation, p5.js React integration, noise functions, and performance patterns
  (Path2D caching, object pooling, layer canvases).

  USE WHEN: user mentions "canvas 2D", "WebGL", "WebGL2", "canvas animation",
  "particle system", "pixel manipulation", "getImageData", "OffscreenCanvas",
  "requestAnimationFrame", "p5.js", "creative coding", "canvas React",
  "shader", "GLSL", "noise function", "canvas drawing", "ctx.fillRect"

  DO NOT USE FOR: Three.js / React Three Fiber (use three-js skill), SVG animation
  (use svg-animation skill), CSS animations, server-side rendering
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Canvas / WebGL

Browser graphics via Canvas 2D API, WebGL2, and creative coding libraries — with React integration, retina scaling, and performance patterns.

## Canvas 2D — React Setup

```tsx
import { useEffect, useRef } from "react";

function Canvas2D({ draw }: { draw: (ctx: CanvasRenderingContext2D, t: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf: number;
    let start: number | null = null;

    // Retina scaling
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = canvas.offsetWidth  * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);

    const loop = (ts: number) => {
      if (!start) start = ts;
      const elapsed = (ts - start) / 1000; // seconds
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      draw(ctx, elapsed);
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />;
}
```

## Canvas 2D API Reference

### Drawing

```ts
// Paths
ctx.beginPath();
ctx.moveTo(x, y);
ctx.lineTo(x, y);
ctx.arc(x, y, radius, startAngle, endAngle, counterclockwise?);
ctx.arcTo(x1, y1, x2, y2, radius);
ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
ctx.quadraticCurveTo(cpx, cpy, x, y);
ctx.rect(x, y, w, h);
ctx.roundRect(x, y, w, h, radii); // Chrome 99+
ctx.closePath();
ctx.fill();
ctx.stroke();
ctx.clip();

// Shapes
ctx.fillRect(x, y, w, h);
ctx.strokeRect(x, y, w, h);
ctx.clearRect(x, y, w, h);

// Text
ctx.font = "bold 16px system-ui";
ctx.textAlign = "center";      // left | right | center | start | end
ctx.textBaseline = "middle";   // top | middle | alphabetic | bottom
ctx.fillText("text", x, y);
ctx.strokeText("text", x, y);
const metrics = ctx.measureText("text"); // .width, .actualBoundingBoxHeight
```

### Styles

```ts
ctx.fillStyle = "#6366f1";
ctx.fillStyle = "rgba(99, 102, 241, 0.5)";
ctx.strokeStyle = "#fff";
ctx.lineWidth = 2;
ctx.lineCap = "round";      // butt | round | square
ctx.lineJoin = "round";     // miter | round | bevel
ctx.globalAlpha = 0.8;
ctx.globalCompositeOperation = "screen"; // multiply | screen | overlay | lighten | darken | etc.

// Gradient
const grad = ctx.createLinearGradient(0, 0, 200, 0);
grad.addColorStop(0, "#6366f1");
grad.addColorStop(1, "#a855f7");
ctx.fillStyle = grad;

// Radial gradient
const rGrad = ctx.createRadialGradient(cx, cy, rInner, cx, cy, rOuter);

// Pattern
const img = new Image(); img.src = "/pattern.png";
ctx.fillStyle = ctx.createPattern(img, "repeat")!;
```

### Transforms

```ts
ctx.save();                          // push state
ctx.translate(x, y);
ctx.rotate(angle);                   // radians
ctx.scale(sx, sy);
ctx.transform(a, b, c, d, e, f);    // raw matrix
ctx.setTransform(a, b, c, d, e, f); // reset + set
ctx.restore();                       // pop state
```

## Particle System Pattern

```ts
class Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; color: string;

  constructor(w: number, h: number) {
    this.x = Math.random() * w;
    this.y = Math.random() * h;
    this.vx = (Math.random() - 0.5) * 2;
    this.vy = (Math.random() - 0.5) * 2;
    this.maxLife = 60 + Math.random() * 120;
    this.life = this.maxLife;
    this.size = 2 + Math.random() * 4;
    this.color = `hsl(${220 + Math.random() * 60}, 80%, 65%)`;
  }

  update() {
    this.x += this.vx; this.y += this.vy; this.life--;
  }

  draw(ctx: CanvasRenderingContext2D) {
    const alpha = this.life / this.maxLife;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  isDead() { return this.life <= 0; }
}

// In animation loop:
particles = particles.filter(p => !p.isDead());
while (particles.length < 100) particles.push(new Particle(w, h));
particles.forEach(p => { p.update(); p.draw(ctx); });
```

## Pixel Manipulation

```ts
// Read/write every pixel
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
const data = imageData.data; // Uint8ClampedArray: [r,g,b,a, r,g,b,a, ...]

for (let i = 0; i < data.length; i += 4) {
  const r = data[i], g = data[i+1], b = data[i+2]; // a = data[i+3]
  const gray = 0.299 * r + 0.587 * g + 0.114 * b;
  data[i] = data[i+1] = data[i+2] = gray; // grayscale
}

ctx.putImageData(imageData, 0, 0);
```

## OffscreenCanvas (Web Worker)

```ts
// main.ts
const worker = new Worker(new URL("./canvas.worker.ts", import.meta.url));
const offscreen = canvas.transferControlToOffscreen();
worker.postMessage({ canvas: offscreen }, [offscreen]);

// canvas.worker.ts
self.onmessage = (e) => {
  const canvas: OffscreenCanvas = e.data.canvas;
  const ctx = canvas.getContext("2d")!;
  // Heavy drawing here — doesn't block main thread
};
```

## WebGL — Raw (when needed)

```ts
const gl = canvas.getContext("webgl2")!;

// Minimal setup
const vert = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const frag = `#version 300 es
precision highp float;
uniform float u_time;
out vec4 outColor;
void main() {
  outColor = vec4(sin(u_time) * 0.5 + 0.5, 0.3, 0.7, 1.0);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader)!);
  }
  return shader;
}
```

**For most WebGL work in React, use Three.js / R3F instead of raw WebGL.**

## p5.js — Creative Coding

```tsx
import { useEffect, useRef } from "react";

export function P5Sketch() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let p5Instance: any;

    import("p5").then(({ default: P5 }) => {
      p5Instance = new P5((p: any) => {
        p.setup = () => {
          p.createCanvas(containerRef.current!.offsetWidth, 400).parent(containerRef.current!);
          p.colorMode(p.HSB, 360, 100, 100);
        };

        p.draw = () => {
          p.background(0, 0, 10, 10); // slight trail
          const x = p.width / 2 + Math.cos(p.frameCount * 0.02) * 150;
          const y = p.height / 2 + Math.sin(p.frameCount * 0.03) * 80;
          p.noStroke();
          p.fill((p.frameCount * 2) % 360, 80, 90);
          p.ellipse(x, y, 20, 20);
        };
      });
    });

    return () => p5Instance?.remove();
  }, []);

  return <div ref={containerRef} />;
}
```

## Noise Functions

```ts
// Simple 2D noise without library (value noise)
function hash(n: number) {
  return Math.sin(n) * 43758.5453 % 1;
}

function noise2d(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx); // smoothstep
  const uy = fy * fy * (3 - 2 * fy);
  return (
    hash(ix + iy * 57) * (1-ux) * (1-uy) +
    hash(ix+1 + iy*57) * ux * (1-uy) +
    hash(ix + (iy+1)*57) * (1-ux) * uy +
    hash(ix+1 + (iy+1)*57) * ux * uy
  );
}

// Better: use "simplex-noise" or "noisejs" packages
```

## Performance Patterns

| Technique | When |
|-----------|------|
| `ctx.save()/restore()` batching | Minimize state changes |
| Object pooling | Particle systems — avoid GC pauses |
| `ImageBitmap` + `createImageBitmap()` | Off-thread image decode |
| `OffscreenCanvas` + Worker | Heavy per-frame computation |
| `path2D` caching | Reuse expensive path objects |
| Layer canvas technique | Static + dynamic layers as separate canvases |

```ts
// Path2D caching (reuse complex path):
const cachedPath = new Path2D("M 0 0 L 100 0 L 50 80 Z");
ctx.fill(cachedPath);
```

## Pitfalls

- Always cancel `requestAnimationFrame` on unmount — memory leak if loop continues
- Canvas must be explicitly sized — CSS size ≠ canvas resolution (causes blurriness)
- Retina: multiply by `devicePixelRatio`, then scale ctx, then set CSS size
- `ctx.clearRect` must cover full canvas including dpr-scaled dimensions
- `getImageData` is slow — avoid every frame; batch pixel operations
