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
  "code-review",
  "performance",
  // Security
  "owasp",
  "spdx",
  // Accessibility
  "wcag",
  // Documentation
  "jsdoc",
  "tsdoc",
  // Resilience & Caching
  "resilience-patterns",
  "caching-strategies",
] as const;

export const standardsDocs: DocsRecord = {
  // No `url`: nobody publishes the cross-language comparison, because no
  // vendor benefits from stating how much their defaults leave out. Pointing
  // at a loosely related tool page would assert an authority that does not
  // exist, so this is served from the knowledge base only.
  "code-review": {
    "default-analysis-by-language": {
      local: "code-review/default-analysis-by-language.md",
    },
  },

  "git-workflow": {
    commands: {
      url: "https://git-scm.com/docs",
    },
    branching: {
      url: "https://nvie.com/posts/a-successful-git-branching-model/",
    },
  },

  "clean-code": {
    principles: {
      url: "https://www.oreilly.com/library/view/clean-code-a/9780136083238/",
    },
    refactoring: {
      url: "https://refactoring.guru/refactoring",
    },
  },

  performance: {
    frontend: {
      url: "https://web.dev/performance/",
    },
    backend: {
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

  // Resilience & Caching
  "resilience-patterns": {
    "circuit-breaker": {
      local: "resilience-patterns/circuit-breaker.md",
      url: "https://resilience4j.readme.io/docs/circuitbreaker",
    },
    retry: {
      local: "resilience-patterns/retry.md",
      url: "https://resilience4j.readme.io/docs/retry",
    },
    bulkhead: {
      local: "resilience-patterns/bulkhead.md",
      url: "https://resilience4j.readme.io/docs/bulkhead",
    },
    timeout: {
      local: "resilience-patterns/timeout.md",
      url: "https://resilience4j.readme.io/docs/timeout",
    },
    fallback: {
      local: "resilience-patterns/fallback.md",
      url: "https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker",
    },
  },

  "caching-strategies": {
    patterns: {
      local: "caching-strategies/patterns.md",
      url: "https://learn.microsoft.com/en-us/azure/architecture/best-practices/caching",
    },
    invalidation: {
      local: "caching-strategies/invalidation.md",
      url: "https://redis.io/docs/latest/develop/use/patterns/",
    },
    distributed: {
      local: "caching-strategies/distributed.md",
      url: "https://redis.io/docs/latest/operate/oss_and_stack/management/scaling/",
    },
    "http-caching": {
      local: "caching-strategies/http-caching.md",
      url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching",
    },
  },
};
