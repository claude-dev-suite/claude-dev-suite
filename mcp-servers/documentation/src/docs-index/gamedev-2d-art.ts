// SPDX-License-Identifier: MIT
/**
 * 2D game art documentation index
 *
 * Engine-agnostic 2D art knowledge: tile design (autotiling Wang/blob,
 * grid types), pixel art fundamentals (AA, dithering, outlines),
 * palettes (color theory, restricted palettes, hue shifting), seamless
 * textures (tileability, normal maps), animation frames (walk cycles,
 * attack anticipation), tools (Aseprite, Tiled, LDtk, Tilesetter,
 * Pixelorama, Spine), 2D lighting art, VFX, environment design,
 * character design.
 *
 * Skills cross-load onto language/engine experts (today: unity-expert
 * when unity-2d detected; future: godot-expert, phaser-expert, etc.).
 */

import type { DocsRecord } from "./types.js";

export const GAMEDEV_2D_ART_TECHNOLOGIES = [
  "gamedev-2d-art-tile-design",
  "gamedev-2d-art-pixel-art-fundamentals",
  "gamedev-2d-art-palettes",
  "gamedev-2d-art-seamless-textures",
  "gamedev-2d-art-animation-frames",
  "gamedev-2d-art-tools",
  "gamedev-2d-art-lighting-art",
  "gamedev-2d-art-vfx-2d",
  "gamedev-2d-art-environment-design",
  "gamedev-2d-art-character-design",
] as const;

const e = (local: string, url: string) => ({ overview: { local, url } });

export const gamedev2dArtDocs: DocsRecord = {
  "gamedev-2d-art-tile-design": e(
    "gamedev/2d-art/tile-design/overview.md",
    "https://www.boristhebrave.com/2021/05/14/wang-tiles-and-truchet-tiles-explained/",
  ),
  "gamedev-2d-art-pixel-art-fundamentals": e(
    "gamedev/2d-art/pixel-art-fundamentals/overview.md",
    "https://lospec.com/pixel-art-tutorials",
  ),
  "gamedev-2d-art-palettes": e(
    "gamedev/2d-art/palettes/overview.md",
    "https://lospec.com/palette-list",
  ),
  "gamedev-2d-art-seamless-textures": e(
    "gamedev/2d-art/seamless-textures/overview.md",
    "https://www.spritelamp.com/",
  ),
  "gamedev-2d-art-animation-frames": e(
    "gamedev/2d-art/animation-frames/overview.md",
    "https://www.gameanim.com/",
  ),
  "gamedev-2d-art-tools": e(
    "gamedev/2d-art/tools/overview.md",
    "https://www.aseprite.org/docs/",
  ),
  "gamedev-2d-art-lighting-art": e(
    "gamedev/2d-art/lighting-art/overview.md",
    "https://docs.unity3d.com/Packages/com.unity.render-pipelines.universal@latest/manual/2d-lighting.html",
  ),
  "gamedev-2d-art-vfx-2d": e(
    "gamedev/2d-art/vfx-2d/overview.md",
    "https://youtu.be/AJdEqssNZ-U",  // Vlambeer "Art of Screenshake"
  ),
  "gamedev-2d-art-environment-design": e(
    "gamedev/2d-art/environment-design/overview.md",
    "https://www.gamedeveloper.com/design/level-design-101-leveraging-parallax-scrolling-in-2d",
  ),
  "gamedev-2d-art-character-design": e(
    "gamedev/2d-art/character-design/overview.md",
    "https://saint11.org/",
  ),
};
