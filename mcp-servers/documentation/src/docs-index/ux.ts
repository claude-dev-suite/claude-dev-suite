// SPDX-License-Identifier: MIT
/**
 * UX/UI design documentation
 * Includes: visual hierarchy, design systems, interaction design, color systems,
 * mobile UX, form UX, and ethical design
 */

import type { DocsRecord } from "./types.js";

export const UX_TECHNOLOGIES = [
  "ux-visual-hierarchy",
  "ux-design-systems",
  "ux-interaction-design",
  "ux-color-systems",
  "ux-mobile",
  "ux-forms",
  "ux-ethical-design",
] as const;

export const uxDocs: DocsRecord = {
  "ux-visual-hierarchy": {
    basics: {
      local: "ux/visual-hierarchy.md",
      url: "https://www.nngroup.com/articles/text-scanning-patterns-eyetracking/",
    },
  },
  "ux-design-systems": {
    basics: {
      local: "ux/design-systems.md",
      url: "https://www.designtokens.org/",
    },
  },
  "ux-interaction-design": {
    basics: {
      local: "ux/interaction-design.md",
      url: "https://www.nngroup.com/articles/animation-duration/",
    },
  },
  "ux-color-systems": {
    basics: {
      local: "ux/color-systems.md",
      url: "https://www.smashingmagazine.com/2025/08/psychology-color-ux-design-digital-products/",
    },
  },
  "ux-mobile": {
    basics: {
      local: "ux/mobile-ux.md",
      url: "https://www.smashingmagazine.com/2019/08/bottom-navigation-pattern-mobile-web-pages/",
    },
  },
  "ux-forms": {
    basics: {
      local: "ux/form-ux.md",
      url: "https://cxl.com/blog/form-design-best-practices/",
    },
  },
  "ux-ethical-design": {
    basics: {
      local: "ux/ethical-design.md",
      url: "https://www.ftc.gov/news-events/news/press-releases/2024/07/ftc-icpen-gpen-announce-results-review-use-dark-patterns-affecting-subscription-services-privacy",
    },
  },
};
