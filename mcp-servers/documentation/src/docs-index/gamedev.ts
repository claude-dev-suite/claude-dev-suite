// SPDX-License-Identifier: MIT
/**
 * Game development documentation
 * Includes: Unity (3D core + 2D dedicated cluster) — Unity 6 baseline
 *
 * Phase A: per-skill `overview` stub. Topic-by-topic articles will be added in Phase B.
 */

import type { DocsRecord } from "./types.js";

export const GAMEDEV_TECHNOLOGIES = [
  // Generic Unity
  "unity-core",
  "unity-rendering",
  "unity-input-ui",
  "unity-physics-anim",
  "unity-addressables",
  "unity-performance",
  "unity-dots",
  "unity-netcode",
  "unity-xr",
  "unity-editor-tooling",
  "unity-testing",
  "unity-build-platforms",
  "unity-best-practices",
  // 2D-dedicated cluster
  "unity-2d-core",
  "unity-2d-tilemap",
  "unity-2d-physics",
  "unity-2d-animation",
  "unity-2d-lighting",
  "unity-2d-cameras",
  "unity-2d-gameplay",
] as const;

export const gamedevDocs: DocsRecord = {
  "unity-core": {
    overview: {
      local: "unity-core/overview.md",
      url: "https://docs.unity3d.com/Manual/ExecutionOrder.html",
    },
  },
  "unity-rendering": {
    overview: {
      local: "unity-rendering/overview.md",
      url: "https://docs.unity3d.com/Manual/render-pipelines.html",
    },
  },
  "unity-input-ui": {
    overview: {
      local: "unity-input-ui/overview.md",
      url: "https://docs.unity3d.com/Packages/com.unity.inputsystem@latest",
    },
  },
  "unity-physics-anim": {
    overview: {
      local: "unity-physics-anim/overview.md",
      url: "https://docs.unity3d.com/Manual/PhysicsSection.html",
    },
  },
  "unity-addressables": {
    overview: {
      local: "unity-addressables/overview.md",
      url: "https://docs.unity3d.com/Packages/com.unity.addressables@latest",
    },
  },
  "unity-performance": {
    overview: {
      local: "unity-performance/overview.md",
      url: "https://docs.unity3d.com/Manual/Profiler.html",
    },
  },
  "unity-dots": {
    overview: {
      local: "unity-dots/overview.md",
      url: "https://docs.unity3d.com/Packages/com.unity.entities@latest",
    },
  },
  "unity-netcode": {
    overview: {
      local: "unity-netcode/overview.md",
      url: "https://docs-multiplayer.unity3d.com/netcode/current/about/",
    },
  },
  "unity-xr": {
    overview: {
      local: "unity-xr/overview.md",
      url: "https://docs.unity3d.com/Packages/com.unity.xr.interaction.toolkit@latest",
    },
  },
  "unity-editor-tooling": {
    overview: {
      local: "unity-editor-tooling/overview.md",
      url: "https://docs.unity3d.com/Manual/ExtendingTheEditor.html",
    },
  },
  "unity-testing": {
    overview: {
      local: "unity-testing/overview.md",
      url: "https://docs.unity3d.com/Packages/com.unity.test-framework@latest",
    },
  },
  "unity-build-platforms": {
    overview: {
      local: "unity-build-platforms/overview.md",
      url: "https://docs.unity3d.com/Manual/PublishingBuilds.html",
    },
  },
  "unity-best-practices": {
    overview: {
      local: "unity-best-practices/overview.md",
      url: "https://unity.com/how-to/organizing-your-project",
    },
  },

  // 2D cluster — Phase A overview + Phase B topic-by-topic articles
  "unity-2d-core": {
    overview: {
      local: "unity-2d-core/overview.md",
      url: "https://docs.unity3d.com/Manual/Unity2D.html",
    },
    "sprite-atlas-v2": {
      local: "unity-2d-core/sprite-atlas-v2.md",
      url: "https://docs.unity3d.com/Manual/sprite-atlas.html",
    },
    "sorting-layers-and-groups": {
      local: "unity-2d-core/sorting-layers-and-groups.md",
      url: "https://docs.unity3d.com/Manual/SortingGroup.html",
    },
    "pixel-perfect-camera": {
      local: "unity-2d-core/pixel-perfect-camera.md",
      url: "https://docs.unity3d.com/Packages/com.unity.2d.pixel-perfect@latest",
    },
  },
  "unity-2d-tilemap": {
    overview: {
      local: "unity-2d-tilemap/overview.md",
      url: "https://docs.unity3d.com/Manual/Tilemap.html",
    },
    "rule-tiles": {
      local: "unity-2d-tilemap/rule-tiles.md",
      url: "https://docs.unity3d.com/Packages/com.unity.2d.tilemap.extras@latest/manual/RuleTile.html",
    },
    "composite-collider-tilemap": {
      local: "unity-2d-tilemap/composite-collider-tilemap.md",
      url: "https://docs.unity3d.com/Manual/class-CompositeCollider2D.html",
    },
    "procedural-tilemap-generation": {
      local: "unity-2d-tilemap/procedural-tilemap-generation.md",
      url: "https://docs.unity3d.com/ScriptReference/Tilemaps.Tilemap.SetTilesBlock.html",
    },
  },
  "unity-2d-physics": {
    overview: {
      local: "unity-2d-physics/overview.md",
      url: "https://docs.unity3d.com/Manual/Physics2DReference.html",
    },
    "rigidbody2d-body-types": {
      local: "unity-2d-physics/rigidbody2d-body-types.md",
      url: "https://docs.unity3d.com/Manual/class-Rigidbody2D.html",
    },
    "effectors-2d": {
      local: "unity-2d-physics/effectors-2d.md",
      url: "https://docs.unity3d.com/Manual/class-PlatformEffector2D.html",
    },
    "contact-filters-and-allocation-free-queries": {
      local: "unity-2d-physics/contact-filters-and-allocation-free-queries.md",
      url: "https://docs.unity3d.com/ScriptReference/ContactFilter2D.html",
    },
  },
  "unity-2d-animation": {
    overview: {
      local: "unity-2d-animation/overview.md",
      url: "https://docs.unity3d.com/Packages/com.unity.2d.animation@latest",
    },
    "skeletal-2d-animation": {
      local: "unity-2d-animation/skeletal-2d-animation.md",
      url: "https://docs.unity3d.com/Packages/com.unity.2d.animation@latest/manual/SkinningEditor.html",
    },
    "psd-importer-workflow": {
      local: "unity-2d-animation/psd-importer-workflow.md",
      url: "https://docs.unity3d.com/Packages/com.unity.2d.psdimporter@latest",
    },
    "sprite-library-and-resolver": {
      local: "unity-2d-animation/sprite-library-and-resolver.md",
      url: "https://docs.unity3d.com/Packages/com.unity.2d.animation@latest/manual/SpriteLibrary.html",
    },
  },
  "unity-2d-lighting": {
    overview: {
      local: "unity-2d-lighting/overview.md",
      url: "https://docs.unity3d.com/Packages/com.unity.render-pipelines.universal@latest/manual/2DLightProperties.html",
    },
    "2d-lights-and-blend-styles": {
      local: "unity-2d-lighting/2d-lights-and-blend-styles.md",
      url: "https://docs.unity3d.com/Packages/com.unity.render-pipelines.universal@latest/manual/2DLightBlendStyles.html",
    },
    "shadow-casters-2d": {
      local: "unity-2d-lighting/shadow-casters-2d.md",
      url: "https://docs.unity3d.com/Packages/com.unity.render-pipelines.universal@latest/manual/2DShadows.html",
    },
    "normal-mapped-sprites": {
      local: "unity-2d-lighting/normal-mapped-sprites.md",
      url: "https://docs.unity3d.com/Manual/SecondaryTextures.html",
    },
  },
  "unity-2d-cameras": {
    overview: {
      local: "unity-2d-cameras/overview.md",
      url: "https://docs.unity3d.com/Packages/com.unity.cinemachine@latest",
    },
    "cinemachine-2d-position-composer": {
      local: "unity-2d-cameras/cinemachine-2d-position-composer.md",
      url: "https://docs.unity3d.com/Packages/com.unity.cinemachine@latest/manual/CinemachinePositionComposer.html",
    },
    "confiner-2d": {
      local: "unity-2d-cameras/confiner-2d.md",
      url: "https://docs.unity3d.com/Packages/com.unity.cinemachine@latest/manual/CinemachineConfiner2D.html",
    },
    "parallax-techniques": {
      local: "unity-2d-cameras/parallax-techniques.md",
      url: "https://learn.unity.com/tutorial/2d-game-kit-walkthrough",
    },
  },
  "unity-2d-gameplay": {
    overview: {
      local: "unity-2d-gameplay/overview.md",
      url: "https://learn.unity.com/tutorial/2d-platformer-character-controller",
    },
    "coyote-time-and-jump-buffer": {
      local: "unity-2d-gameplay/coyote-time-and-jump-buffer.md",
      url: "https://learn.unity.com/tutorial/2d-platformer-character-controller",
    },
    "variable-jump-and-fall-gravity": {
      local: "unity-2d-gameplay/variable-jump-and-fall-gravity.md",
      url: "https://docs.unity3d.com/ScriptReference/Rigidbody2D-gravityScale.html",
    },
    "dash-and-wall-jump": {
      local: "unity-2d-gameplay/dash-and-wall-jump.md",
      url: "https://learn.unity.com/tutorial/2d-platformer-character-controller",
    },
  },
};
