// SPDX-License-Identifier: MIT
/**
 * Standards, best practices, and documentation
 * Includes: Git workflow, Clean code, Performance, OWASP, SPDX, WCAG, JSDoc, TSDoc
 */

import type { DocsRecord } from "./types.js";

export const STANDARDS_TECHNOLOGIES = [
  // Best Practices
  "git-workflow",
  "clean-code",
  "performance",
  // Security
  "owasp",
  "spdx",
  // Accessibility
  "wcag",
  // Documentation
  "jsdoc",
  "tsdoc",
] as const;

export const standardsDocs: DocsRecord = {
  "git-workflow": {
    commands: {
      local: "git-workflow/commands.md",
      url: "https://git-scm.com/docs",
    },
    branching: {
      local: "git-workflow/branching.md",
      url: "https://nvie.com/posts/a-successful-git-branching-model/",
    },
  },

  "clean-code": {
    principles: {
      local: "clean-code/principles.md",
      url: "https://www.oreilly.com/library/view/clean-code-a/9780136083238/",
    },
    refactoring: {
      local: "clean-code/refactoring.md",
      url: "https://refactoring.guru/refactoring",
    },
  },

  performance: {
    frontend: {
      local: "performance/frontend.md",
      url: "https://web.dev/performance/",
    },
    backend: {
      local: "performance/backend.md",
      url: "https://developer.mozilla.org/en-US/docs/Learn/Performance",
    },
  },

  owasp: {
    "top-10": {
      local: "owasp/top-10.md",
      url: "https://owasp.org/www-project-top-ten/",
    },
  },

  spdx: {
    licenses: {
      local: "spdx/licenses.md",
      url: "https://spdx.org/licenses/",
    },
    expressions: {
      local: "spdx/expressions.md",
      url: "https://spdx.github.io/spdx-spec/v2.3/SPDX-license-expressions/",
    },
    "license-checker": {
      local: "spdx/license-checker.md",
      url: "https://www.npmjs.com/package/license-checker-rseidelsohn",
    },
  },

  wcag: {
    overview: {
      local: "wcag/overview.md",
      url: "https://www.w3.org/TR/WCAG22/",
    },
    "quick-reference": {
      local: "wcag/quick-reference.md",
      url: "https://www.w3.org/WAI/WCAG22/quickref/",
    },
    "aria-patterns": {
      local: "wcag/aria-patterns.md",
      url: "https://www.w3.org/WAI/ARIA/apg/patterns/",
    },
    "axe-core": {
      local: "wcag/axe-core.md",
      url: "https://github.com/dequelabs/axe-core",
    },
  },

  jsdoc: {
    reference: {
      local: "jsdoc/reference.md",
      url: "https://jsdoc.app/",
    },
    "typescript-support": {
      local: "jsdoc/typescript-support.md",
      url: "https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html",
    },
  },

  tsdoc: {
    syntax: {
      local: "tsdoc/syntax.md",
      url: "https://tsdoc.org/",
    },
    tags: {
      local: "tsdoc/tags.md",
      url: "https://tsdoc.org/pages/spec/overview/",
    },
    "api-extractor": {
      local: "tsdoc/api-extractor.md",
      url: "https://api-extractor.com/",
    },
  },
};
