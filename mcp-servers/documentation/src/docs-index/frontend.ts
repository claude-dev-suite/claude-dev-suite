// SPDX-License-Identifier: MIT
/**
 * Frontend frameworks and libraries documentation
 * Includes: React, Vue, Angular, Svelte, Solid, UI libs, State management
 */

import type { DocsRecord } from "./types.js";

export const FRONTEND_TECHNOLOGIES = [
  "react",
  "vue",
  "angular",
  "svelte",
  "solid",
  "tailwindcss",
  "zustand",
  "redux-toolkit",
  "pinia",
  "tanstack-query",
  "tanstack-router",
  "react-hook-form",
  "shadcn",
  "skeleton",
] as const;

export const frontendDocs: DocsRecord = {
  react: {
    hooks: {
      local: "react/hooks.md",
      url: "https://react.dev/reference/react/hooks",
    },
    components: {
      local: "react/components.md",
      url: "https://react.dev/reference/react/components",
    },
    "server-components": {
      local: "react/server-components.md",
      url: "https://react.dev/reference/rsc/server-components",
    },
    patterns: {
      local: "react/patterns.md",
      url: "https://react.dev/learn",
    },
    "react-19": {
      local: "react/react-19.md",
      url: "https://react.dev/blog/2024/12/05/react-19",
    },
    suspense: {
      local: "react/suspense.md",
      url: "https://react.dev/reference/react/Suspense",
    },
    context: {
      local: "react/context.md",
      url: "https://react.dev/reference/react/useContext",
    },
    performance: {
      local: "react/performance.md",
      url: "https://react.dev/learn/render-and-commit",
    },
    concurrent: {
      local: "react/concurrent.md",
      url: "https://react.dev/reference/react/useTransition",
    },
    router: {
      local: "react/router.md",
      url: "https://reactrouter.com/en/main",
    },
    testing: {
      local: "react/testing.md",
      url: "https://testing-library.com/docs/react-testing-library/intro/",
    },
    forms: {
      local: "react/forms.md",
      url: "https://react.dev/reference/react-dom/components/form",
    },
  },

  vue: {
    "composition-api": {
      local: "vue/composition-api.md",
      url: "https://vuejs.org/guide/extras/composition-api-faq.html",
    },
    components: {
      local: "vue/components.md",
      url: "https://vuejs.org/guide/essentials/component-basics.html",
    },
    patterns: {
      local: "vue/patterns.md",
      url: "https://vuejs.org/guide/reusability/composables.html",
    },
  },

  tailwindcss: {
    utilities: {
      local: "tailwind/utilities.md",
      url: "https://tailwindcss.com/docs/utility-first",
    },
    responsive: {
      local: "tailwind/responsive.md",
      url: "https://tailwindcss.com/docs/responsive-design",
    },
    customization: {
      local: "tailwind/customization.md",
      url: "https://tailwindcss.com/docs/configuration",
    },
    spacing: {
      local: "tailwind/spacing.md",
      url: "https://tailwindcss.com/docs/customizing-spacing",
    },
  },

  zustand: {
    basics: {
      local: "zustand/basics.md",
      url: "https://docs.pmnd.rs/zustand/getting-started/introduction",
    },
  },

  "tanstack-query": {
    basics: {
      local: "tanstack-query/basics.md",
      url: "https://tanstack.com/query/latest/docs/framework/react/overview",
    },
  },

  "tanstack-router": {
    basics: {
      local: "tanstack-router/basics.md",
      url: "https://tanstack.com/router/latest/docs/framework/react/overview",
    },
  },

  "react-hook-form": {
    basics: {
      local: "react-hook-form/basics.md",
      url: "https://react-hook-form.com/get-started",
    },
  },

  shadcn: {
    basics: {
      local: "shadcn/basics.md",
      url: "https://ui.shadcn.com/docs",
    },
  },

  skeleton: {
    basics: {
      local: "skeleton/basics.md",
      url: "https://www.skeleton.dev/",
    },
    components: {
      local: "skeleton/components.md",
      url: "https://www.skeleton.dev/components",
    },
  },

  "redux-toolkit": {
    slices: {
      local: "redux-toolkit/slices.md",
      url: "https://redux-toolkit.js.org/api/createSlice",
    },
    "rtk-query": {
      local: "redux-toolkit/rtk-query.md",
      url: "https://redux-toolkit.js.org/rtk-query/overview",
    },
  },

  pinia: {
    stores: {
      local: "pinia/stores.md",
      url: "https://pinia.vuejs.org/core-concepts/",
    },
    composables: {
      local: "pinia/composables.md",
      url: "https://pinia.vuejs.org/cookbook/composing-stores.html",
    },
  },
};
