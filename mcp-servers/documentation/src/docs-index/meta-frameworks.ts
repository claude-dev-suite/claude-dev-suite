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

  // nuxt, remix and astro were listed in META_FRAMEWORK_TECHNOLOGIES with no
  // record, so every request for them errored. The KB has no content for any
  // of them; these entries make them live-only.

  // Nuxt pins the major in the docs path, so these need revisiting at 5.x.
  nuxt: {
    routing: {
      local: "nuxt/routing.md",
      url: "https://nuxt.com/docs/4.x/getting-started/routing",
    },
    "data-fetching": {
      local: "nuxt/data-fetching.md",
      url: "https://nuxt.com/docs/4.x/getting-started/data-fetching",
    },
    "state-management": {
      local: "nuxt/state-management.md",
      url: "https://nuxt.com/docs/4.x/getting-started/state-management",
    },
    testing: {
      local: "nuxt/testing.md",
      url: "https://nuxt.com/docs/4.x/getting-started/testing",
    },
    deployment: {
      local: "nuxt/deployment.md",
      url: "https://nuxt.com/docs/4.x/getting-started/deployment",
    },
  },

  // Remix has no docs site of its own any more: remix.run is a v3 beta landing
  // page, remix.run/docs redirects off-host, and the v2 docs at v2.remix.run
  // self-describe as legacy and point to React Router. The Remix framework is
  // now React Router's Framework Mode, so that is where these point.
  remix: {
    routing: {
      local: "remix/routing.md",
      url: "https://reactrouter.com/start/framework/routing",
    },
    "data-loading": {
      local: "remix/data-loading.md",
      url: "https://reactrouter.com/start/framework/data-loading",
    },
    actions: {
      local: "remix/actions.md",
      url: "https://reactrouter.com/start/framework/actions",
    },
    testing: {
      local: "remix/testing.md",
      url: "https://reactrouter.com/start/framework/testing",
    },
    deploying: {
      local: "remix/deploying.md",
      url: "https://reactrouter.com/start/framework/deploying",
    },
  },

  astro: {
    routing: {
      local: "astro/routing.md",
      url: "https://docs.astro.build/en/guides/routing/",
    },
    components: {
      local: "astro/components.md",
      url: "https://docs.astro.build/en/basics/astro-components/",
    },
    "content-collections": {
      local: "astro/content-collections.md",
      url: "https://docs.astro.build/en/guides/content-collections/",
    },
    middleware: {
      local: "astro/middleware.md",
      url: "https://docs.astro.build/en/guides/middleware/",
    },
    deployment: {
      local: "astro/deployment.md",
      url: "https://docs.astro.build/en/guides/deploy/",
    },
  },
};
