# Three.js / React Three Fiber Skill

3D graphics in the browser. Three.js = core library. React Three Fiber (R3F) = React renderer for Three.js.

## Install

```bash
# React Three Fiber + helpers
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three

# Optional — postprocessing
npm install @react-three/postprocessing
```

## R3F Canvas Setup

```tsx
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Preload } from "@react-three/drei";
import { Suspense } from "react";

export function Scene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 50, near: 0.1, far: 100 }}
      dpr={[1, 2]}          // cap pixel ratio at 2 for performance
      gl={{ antialias: true }}
      style={{ width: "100%", height: "100%" }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1} castShadow />
        <MyObject />
        <Environment preset="city" />
        <OrbitControls enableZoom={false} />
        <Preload all />
      </Suspense>
    </Canvas>
  );
}
```

## Core Concepts

| Concept | Three.js | R3F |
|---------|----------|-----|
| Geometry | `new THREE.BoxGeometry(1,1,1)` | `<boxGeometry args={[1,1,1]} />` |
| Material | `new THREE.MeshStandardMaterial()` | `<meshStandardMaterial color="red" />` |
| Mesh | `new THREE.Mesh(geo, mat)` | `<mesh>` wrapping both |
| Scene graph | `scene.add(mesh)` | JSX nesting |
| Camera | Manual setup | `camera` prop on Canvas |
| Animation loop | `renderer.setAnimationLoop` | `useFrame` hook |

## useFrame — Animation Loop

```tsx
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

function SpinningMesh() {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * 0.5; // delta = time since last frame (frame-rate independent)
    ref.current.rotation.x = Math.sin(state.clock.elapsedTime) * 0.2;
  });

  return (
    <mesh ref={ref}>
      <torusKnotGeometry args={[1, 0.3, 128, 16]} />
      <meshStandardMaterial color="#6366f1" roughness={0.2} metalness={0.8} />
    </mesh>
  );
}
```

## Common Geometries

```tsx
<boxGeometry args={[w, h, d]} />
<sphereGeometry args={[radius, widthSeg, heightSeg]} />
<planeGeometry args={[w, h, wSeg, hSeg]} />
<torusGeometry args={[radius, tube, radSeg, tubeSeg]} />
<torusKnotGeometry args={[radius, tube, tubSeg, radSeg]} />
<cylinderGeometry args={[radiusTop, radiusBottom, height, seg]} />
```

## Common Materials

```tsx
<meshBasicMaterial color="#fff" />             // no lighting
<meshStandardMaterial                          // PBR (recommended)
  color="#6366f1" roughness={0.3} metalness={0.6} />
<meshPhysicalMaterial                          // advanced PBR
  transmission={1} ior={1.5} thickness={0.5} /> // glass
<meshNormalMaterial />                         // debug normals
<shaderMaterial                                // custom GLSL
  vertexShader={vert} fragmentShader={frag} uniforms={uniforms} />
```

## Lights

```tsx
<ambientLight intensity={0.5} />               // uniform, no shadows
<directionalLight position={[5,5,5]} castShadow intensity={1} />
<pointLight position={[0,3,0]} intensity={20} distance={10} />
<spotLight position={[0,5,0]} angle={0.3} penumbra={0.5} castShadow />
<hemisphereLight skyColor="#88ccff" groundColor="#332200" intensity={0.5} />
```

## @react-three/drei Helpers

```tsx
import {
  OrbitControls, TrackballControls,  // camera controls
  Environment,                        // HDR environment/lighting
  Text, Text3D,                       // 3D text
  Html,                               // DOM element in 3D space
  useGLTF, useFBX,                   // load 3D models
  useTexture,                         // load textures
  Instances, Instance,                // instanced rendering (performance)
  MeshTransmissionMaterial,           // glass/crystal material
  Sparkles, Stars, Cloud,             // particle effects
  GradientTexture,                    // procedural gradient texture
  RoundedBox, Torus,                  // pre-built shapes
  PresentationControls,               // drag-to-rotate without orbit
  Float,                              // floating animation
  Bounds, useBounds,                  // auto-fit camera to content
} from "@react-three/drei";
```

## Load GLTF Model

```tsx
import { useGLTF } from "@react-three/drei";

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

// Preload outside component:
useGLTF.preload("/model.glb");
```

## Custom Shader (shaderMaterial)

```tsx
import { shaderMaterial } from "@react-three/drei";
import { extend, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const GradientMaterial = shaderMaterial(
  { uTime: 0, uColorA: new THREE.Color("#6366f1"), uColorB: new THREE.Color("#a855f7") },
  // Vertex
  `varying vec2 vUv;
   void main() {
     vUv = uv;
     gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
   }`,
  // Fragment
  `uniform float uTime;
   uniform vec3 uColorA;
   uniform vec3 uColorB;
   varying vec2 vUv;
   void main() {
     float t = sin(vUv.x * 3.14 + uTime) * 0.5 + 0.5;
     gl_FragColor = vec4(mix(uColorA, uColorB, t), 1.0);
   }`
);
extend({ GradientMaterial });

// TypeScript declaration:
declare module "@react-three/fiber" {
  interface ThreeElements { gradientMaterial: any }
}
```

## Postprocessing

```tsx
import { EffectComposer, Bloom, ChromaticAberration, Noise, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";

<EffectComposer>
  <Bloom luminanceThreshold={0.9} intensity={1.5} mipmapBlur />
  <ChromaticAberration offset={[0.002, 0.002]} />
  <Noise opacity={0.03} />
  <Vignette eskil={false} offset={0.1} darkness={0.8} />
</EffectComposer>
```

## Performance Patterns

```tsx
// Instanced rendering for many identical objects (100x faster than individual meshes)
import { Instances, Instance } from "@react-three/drei";

<Instances limit={1000}>
  <sphereGeometry args={[0.1]} />
  <meshStandardMaterial color="white" />
  {positions.map((p, i) => (
    <Instance key={i} position={p} />
  ))}
</Instances>

// Suspend expensive work
<Suspense fallback={<LoadingSpinner />}>
  <HeavyScene />
</Suspense>

// Level of detail
import { Detailed } from "@react-three/drei";
<Detailed distances={[0, 10, 50]}>
  <HighPolyMesh />
  <MidPolyMesh />
  <LowPolyMesh />
</Detailed>
```

## Cleanup (critical — prevents GPU memory leak)

```tsx
useEffect(() => {
  return () => {
    // Dispose all geometry, materials, textures when component unmounts
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  };
}, [scene]);
```

## Pitfalls

- `dpr={[1, 2]}` — always cap; `dpr={window.devicePixelRatio}` without cap tanks mobile perf
- Three.js objects are NOT garbage collected — `dispose()` manually
- `useFrame` runs every frame — avoid creating new objects inside it (allocations cause GC pauses)
- Server-side rendering: Canvas must be `dynamic` imported with `{ ssr: false }` in Next.js
- `shadows` on Canvas + `castShadow`/`receiveShadow` on meshes — both needed for shadows to work
