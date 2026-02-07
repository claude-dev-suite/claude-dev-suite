// SPDX-License-Identifier: MIT
/**
 * Testing frameworks documentation
 * Includes: Vitest, Jest, Playwright, Cypress, Pytest, Testing Library, Spring Boot Test
 */

import type { DocsRecord } from "./types.js";

export const TESTING_TECHNOLOGIES = [
  "vitest",
  "jest",
  "playwright",
  "cypress",
  "pytest",
  "testing-library",
  "spring-boot-test",
  "testcontainers",
  "xunit",
] as const;

export const testingDocs: DocsRecord = {
  vitest: {
    api: {
      local: "vitest/api.md",
      url: "https://vitest.dev/api/",
    },
    mocking: {
      local: "vitest/mocking.md",
      url: "https://vitest.dev/guide/mocking.html",
    },
    coverage: {
      local: "vitest/coverage.md",
      url: "https://vitest.dev/guide/coverage.html",
    },
  },

  jest: {
    basics: {
      local: "jest/basics.md",
      url: "https://jestjs.io/docs/getting-started",
    },
    mocking: {
      local: "jest/mocking.md",
      url: "https://jestjs.io/docs/mock-functions",
    },
    advanced: {
      local: "jest/advanced.md",
      url: "https://jestjs.io/docs/setup-teardown",
    },
  },

  playwright: {
    locators: {
      local: "playwright/locators.md",
      url: "https://playwright.dev/docs/locators",
    },
    assertions: {
      local: "playwright/assertions.md",
      url: "https://playwright.dev/docs/test-assertions",
    },
    "page-objects": {
      local: "playwright/page-objects.md",
      url: "https://playwright.dev/docs/pom",
    },
  },

  cypress: {
    commands: {
      local: "cypress/commands.md",
      url: "https://docs.cypress.io/api/table-of-contents",
    },
    patterns: {
      local: "cypress/patterns.md",
      url: "https://docs.cypress.io/guides/references/best-practices",
    },
  },

  pytest: {
    basics: {
      local: "pytest/basics.md",
      url: "https://docs.pytest.org/en/stable/getting-started.html",
    },
    fixtures: {
      local: "pytest/fixtures.md",
      url: "https://docs.pytest.org/en/stable/how-to/fixtures.html",
    },
    advanced: {
      local: "pytest/advanced.md",
      url: "https://docs.pytest.org/en/stable/how-to/parametrize.html",
    },
  },

  "testing-library": {
    queries: {
      local: "testing-library/queries.md",
      url: "https://testing-library.com/docs/queries/about",
    },
    "user-events": {
      local: "testing-library/user-events.md",
      url: "https://testing-library.com/docs/user-event/intro",
    },
  },

  "spring-boot-test": {
    "sliced-tests": {
      local: "spring-boot-test/sliced-tests.md",
      url: "https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html",
    },
    testcontainers: {
      local: "spring-boot-test/testcontainers.md",
      url: "https://docs.spring.io/spring-boot/reference/testing/testcontainers.html",
    },
    mockmvc: {
      local: "spring-boot-test/mockmvc.md",
      url: "https://docs.spring.io/spring-framework/reference/testing/spring-mvc-test-framework.html",
    },
  },

  testcontainers: {
    basics: {
      local: "testcontainers/basics.md",
      url: "https://testcontainers.com/guides/getting-started-with-testcontainers-for-java/",
    },
    "service-connection": {
      local: "testcontainers/service-connection.md",
      url: "https://docs.spring.io/spring-boot/reference/testing/testcontainers.html",
    },
    lifecycle: {
      local: "testcontainers/lifecycle.md",
      url: "https://java.testcontainers.org/test_framework_integration/junit_5/",
    },
  },

  xunit: {
    basics: {
      local: "xunit/basics.md",
      url: "https://xunit.net/docs/getting-started/netcore/cmdline",
    },
    assertions: {
      local: "xunit/assertions.md",
      url: "https://xunit.net/docs/assertions",
    },
    fixtures: {
      local: "xunit/fixtures.md",
      url: "https://xunit.net/docs/shared-context",
    },
  },
};
