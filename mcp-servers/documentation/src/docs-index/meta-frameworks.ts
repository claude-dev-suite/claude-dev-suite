// SPDX-License-Identifier: MIT
/**
 * Meta-frameworks documentation
 * Includes: Next.js, Nuxt, Remix, SvelteKit, Astro
 */

import type { DocsRecord } from "./types.js";

export const META_FRAMEWORK_TECHNOLOGIES = [
  "nextjs",
  "nuxt",
  "remix",
  "sveltekit",
  "astro",
] as const;

export const metaFrameworkDocs: DocsRecord = {
  nextjs: {
    "app-router": {
      local: "nextjs/app-router.md",
      url: "https://nextjs.org/docs/app",
    },
    caching: {
      local: "nextjs/caching.md",
      url: "https://nextjs.org/docs/app/building-your-application/caching",
    },
    "server-components": {
      local: "nextjs/server-components.md",
      url: "https://nextjs.org/docs/app/building-your-application/rendering/server-components",
    },
    "data-fetching": {
      local: "nextjs/data-fetching.md",
      url: "https://nextjs.org/docs/app/building-your-application/data-fetching",
    },
    "server-actions": {
      local: "nextjs/server-actions.md",
      url: "https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations",
    },
    routing: {
      local: "nextjs/routing.md",
      url: "https://nextjs.org/docs/app/building-your-application/routing",
    },
  },

  sveltekit: {
    basics: {
      local: "svelte/sveltekit.md",
      url: "https://kit.svelte.dev/",
    },
  },
};
