---
name: game-engine-architecture
description: |
  Game-engine architecture, engine-agnostic: the game loop (fixed vs variable
  timestep), ECS vs scene-graph/OOP, the render pipeline, core subsystems
  (physics, audio, animation, assets, memory), and netcode models. Architect-
  level, beyond any specific engine.

  USE WHEN: designing/evaluating a game engine or game's architecture in general,
  "game loop", "ECS", "entity component system", "render pipeline", "forward vs
  deferred", "rollback netcode", "lockstep", custom engine vs off-the-shelf,
  data-oriented game design.

  DO NOT USE FOR: Unity-specific work (use the `gamedev/unity-*` skills);
  low-level cache/SIMD detail (use `hardware-aware-design`); web graphics (use
  graphics skills).
allowed-tools: Read, Grep, Glob
---
# Game-Engine Architecture (engine-agnostic)

Generalizes the Unity-specific `gamedev/*` skills into engine-agnostic design.
For Unity APIs/DOTS specifics, defer to those skills.

## The game loop

The heartbeat: process input → update simulation → render. Key decision is the
timestep:
- **Fixed timestep** for the simulation (deterministic physics, stable netcode),
  **decoupled** from a variable render rate with interpolation. This is the
  standard for anything needing determinism (multiplayer, physics).
- Variable timestep is simpler but makes physics/netcode non-deterministic.

## Data model: ECS vs scene-graph/OOP

| | OOP / scene graph | **ECS** (entity-component-system) |
|---|---|---|
| Layout | Objects with inheritance | Data in contiguous component arrays |
| Cache | Pointer-chasing, poor | Data-oriented, cache-friendly, SIMD-able |
| Logic | Methods on objects | Systems iterate components |
| Fits | Small/simple games, editor tooling | Many entities, performance, parallelism |

ECS is the modern default for performance and parallelism (see
`hardware-aware-design`); OOP scene graphs remain fine for simpler titles.

## Render pipeline

- **Forward** (shade per object) vs **deferred** (G-buffer, shade per pixel —
  many lights) vs forward+ / clustered. Choose by light count and platform
  (mobile/bandwidth favors forward/tiled).
- A **render graph / frame graph** declares passes + resource dependencies so
  the engine schedules and aliases GPU memory — the modern structuring approach.

## Core subsystems

Physics, audio, animation, scene/asset streaming, and a **memory strategy**
(pools/arenas/frame allocators rather than per-frame malloc — determinism +
no GC stalls). Keep subsystems decoupled behind clear interfaces.

## Netcode (multiplayer)

- **Lockstep** (send inputs, simulate deterministically everywhere): tiny
  bandwidth, needs full determinism; RTS.
- **Client prediction + server reconciliation**: responsive, authoritative
  server; FPS.
- **Rollback**: predict + re-simulate on correction; fighting games.
Authority and determinism (fixed timestep) are the cross-cutting requirements.

## Guidance
Prefer off-the-shelf (Unity/Unreal/Godot) unless you have a specific reason to
build. If custom: fixed-timestep loop, ECS for entity-heavy/perf games, a render
graph, arena memory, and a netcode model matched to the genre.
