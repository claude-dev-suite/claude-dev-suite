// SPDX-License-Identifier: MIT
/**
 * Development tooling documentation
 * Includes: Build tools, Package managers, Linting, Logging frameworks
 */

import type { DocsRecord } from "./types.js";

export const TOOLING_TECHNOLOGIES = [
  // Build tools
  "webpack",
  "esbuild",
  "vite",
  "cmake",
  // Monorepo tools
  "turborepo",
  "nx",
  // Package managers
  "pnpm",
  // Linting
  "biome",
  "eslint",
  "cpp-quality",
  "ruff",
  // Static analysis, per language. These back the "already covered by the
  // toolchain" half of the `review/*` skills, which is the half that goes stale
  // — a rule moves in or out of a default set with the tool, not with us. The
  // entries are deliberately live-only (no `local`): the rule indexes are
  // maintained by the tool authors, and a copy of ours would age faster than
  // the skill it supports.
  "go-quality",
  "rust-quality",
  "java-quality",
  "dotnet-quality",
  "kotlin-quality",
  "swift-quality",
  // Validation
  "zod",
  "yup",
  "class-validator",
  "pydantic",
  // Logging - Java
  "logback",
  "slf4j",
  "log4j2",
  // Logging - Node.js
  "winston",
  "pino",
  // Logging - Python
  "structlog",
] as const;

export const toolingDocs: DocsRecord = {
  // Build tools
  webpack: {
    basics: {
      local: "webpack/basics.md",
      url: "https://webpack.js.org/concepts/",
    },
    configuration: {
      local: "webpack/configuration.md",
      url: "https://webpack.js.org/configuration/",
    },
    loaders: {
      local: "webpack/loaders.md",
      url: "https://webpack.js.org/loaders/",
    },
    plugins: {
      local: "webpack/plugins.md",
      url: "https://webpack.js.org/plugins/",
    },
    optimization: {
      local: "webpack/optimization.md",
      url: "https://webpack.js.org/guides/build-performance/",
    },
  },

  esbuild: {
    basics: {
      local: "esbuild/basics.md",
      url: "https://esbuild.github.io/getting-started/",
    },
    api: {
      local: "esbuild/api.md",
      url: "https://esbuild.github.io/api/",
    },
    plugins: {
      local: "esbuild/plugins.md",
      url: "https://esbuild.github.io/plugins/",
    },
  },

  vite: {
    basics: {
      url: "https://vite.dev/guide/",
    },
    config: {
      local: "vite/quick-ref/config.md",
      url: "https://vite.dev/config/",
    },
    "env-variables": {
      url: "https://vite.dev/guide/env-and-mode",
    },
    build: {
      url: "https://vite.dev/guide/build",
    },
    plugins: {
      url: "https://vite.dev/plugins/",
    },
    optimization: {
      local: "vite/deep-docs/optimization.md",
      url: "https://vite.dev/guide/performance",
    },
  },

  ruff: {
    basics: {
      local: "ruff/basics.md",
      url: "https://docs.astral.sh/ruff/",
    },
    configuration: {
      local: "ruff/configuration.md",
      url: "https://docs.astral.sh/ruff/configuration/",
    },
    formatter: {
      local: "ruff/formatter.md",
      url: "https://docs.astral.sh/ruff/formatter/",
    },
    rules: {
      local: "ruff/rules.md",
      url: "https://docs.astral.sh/ruff/rules/",
    },
    // Where `select` is set. The default is `E4, E7, E9, F` — far narrower
    // than ruff's reputation — so whether B006, DTZ and ASYNC findings are the
    // linter's job or the reviewer's is decided in this file.
    settings: {
      url: "https://docs.astral.sh/ruff/settings/",
    },
  },

  pydantic: {
    models: {
      local: "pydantic/models.md",
      url: "https://pydantic.dev/docs/validation/latest/concepts/models/",
    },
    validation: {
      local: "pydantic/validation.md",
      url: "https://pydantic.dev/docs/validation/latest/concepts/validators/",
    },
    types: {
      local: "pydantic/types.md",
      url: "https://pydantic.dev/docs/validation/latest/concepts/types/",
    },
    settings: {
      local: "pydantic/settings.md",
      url: "https://pydantic.dev/docs/validation/latest/concepts/pydantic_settings/",
    },
  },

  cmake: {
    basics: {
      local: "cmake/basics.md",
      url: "https://cmake.org/cmake/help/latest/guide/tutorial/index.html",
    },
    "modern-targets": {
      local: "cmake/modern-targets.md",
      url: "https://cmake.org/cmake/help/latest/manual/cmake-buildsystem.7.html",
    },
    presets: {
      local: "cmake/presets.md",
      url: "https://cmake.org/cmake/help/latest/manual/cmake-presets.7.html",
    },
    "find-package": {
      local: "cmake/find-package.md",
      url: "https://cmake.org/cmake/help/latest/command/find_package.html",
    },
    "fetch-content": {
      local: "cmake/fetch-content.md",
      url: "https://cmake.org/cmake/help/latest/module/FetchContent.html",
    },
    "generator-expressions": {
      local: "cmake/generator-expressions.md",
      url: "https://cmake.org/cmake/help/latest/manual/cmake-generator-expressions.7.html",
    },
    install: {
      local: "cmake/install.md",
      url: "https://cmake.org/cmake/help/latest/command/install.html",
    },
    vcpkg: {
      local: "cmake/vcpkg.md",
      url: "https://learn.microsoft.com/vcpkg/users/manifests",
    },
    conan: {
      local: "cmake/conan.md",
      url: "https://docs.conan.io/2/integrations/cmake.html",
    },
  },

  // Monorepo tools
  turborepo: {
    basics: {
      local: "turborepo/basics.md",
      url: "https://turbo.build/repo/docs",
    },
    configuration: {
      local: "turborepo/configuration.md",
      url: "https://turbo.build/repo/docs/reference/configuration",
    },
    caching: {
      local: "turborepo/caching.md",
      url: "https://turbo.build/repo/docs/core-concepts/caching",
    },
    "remote-cache": {
      local: "turborepo/remote-cache.md",
      url: "https://turbo.build/repo/docs/core-concepts/remote-caching",
    },
  },

  nx: {
    basics: {
      local: "nx/basics.md",
      url: "https://nx.dev/getting-started/intro",
    },
    configuration: {
      local: "nx/configuration.md",
      url: "https://nx.dev/reference/project-configuration",
    },
    generators: {
      local: "nx/generators.md",
      url: "https://nx.dev/docs/extending-nx/local-generators",
    },
    executors: {
      local: "nx/executors.md",
      url: "https://nx.dev/docs/extending-nx/local-executors",
    },
    affected: {
      local: "nx/affected.md",
      url: "https://nx.dev/ci/features/affected",
    },
  },

  // Package managers
  pnpm: {
    basics: {
      local: "pnpm/basics.md",
      url: "https://pnpm.io/motivation",
    },
    workspaces: {
      local: "pnpm/workspaces.md",
      url: "https://pnpm.io/workspaces",
    },
    configuration: {
      local: "pnpm/configuration.md",
      url: "https://pnpm.io/npmrc",
    },
    filtering: {
      local: "pnpm/filtering.md",
      url: "https://pnpm.io/filtering",
    },
  },

  // Validation
  zod: {
    basics: {
      url: "https://zod.dev/?id=basic-usage",
    },
    schemas: {
      local: "zod/quick-ref/schemas.md",
      url: "https://zod.dev/?id=primitives",
    },
    validation: {
      local: "zod/deep-docs/form-validation.md",
      url: "https://zod.dev/?id=parse",
    },
    transforms: {
      url: "https://zod.dev/?id=transform",
    },
  },

  yup: {
    basics: {
      local: "yup/basics.md",
      url: "https://github.com/jquense/yup#getting-started",
    },
    schemas: {
      local: "yup/schemas.md",
      url: "https://github.com/jquense/yup#api",
    },
    validation: {
      local: "yup/validation.md",
      url: "https://github.com/jquense/yup#schemavalidatevalue-any-options-object-promiseinfertype",
    },
  },

  "class-validator": {
    basics: {
      local: "class-validator/basics.md",
      url: "https://github.com/typestack/class-validator#usage",
    },
    decorators: {
      local: "class-validator/decorators.md",
      url: "https://github.com/typestack/class-validator#validation-decorators",
    },
    "custom-validation": {
      local: "class-validator/custom-validation.md",
      url: "https://github.com/typestack/class-validator#custom-validation-classes",
    },
  },

  // Linting
  biome: {
    basics: {
      local: "biome/basics.md",
      url: "https://biomejs.dev/guides/getting-started/",
    },
  },

  eslint: {
    "flat-config": {
      local: "eslint/flat-config.md",
      url: "https://eslint.org/docs/latest/use/configure/configuration-files",
    },
    rules: {
      local: "eslint/rules.md",
      url: "https://eslint.org/docs/latest/rules/",
    },
    "typescript-eslint": {
      local: "eslint/typescript-eslint.md",
      url: "https://typescript-eslint.io/getting-started/",
    },
  },

  // --- Static analysis, per language ------------------------------------
  // Every entry here is live-only on purpose. These are rule indexes the tool
  // authors maintain and version; a KB copy would diverge from the tool the
  // reader is actually running, which is the one thing that must not happen
  // when the question is "did the linter already report this?".

  "go-quality": {
    "go-vet": {
      url: "https://pkg.go.dev/cmd/vet",
    },
    "staticcheck-checks": {
      url: "https://staticcheck.dev/docs/checks/",
    },
    "golangci-lint-linters": {
      url: "https://golangci-lint.run/usage/linters/",
    },
  },

  "rust-quality": {
    "clippy-lints": {
      url: "https://rust-lang.github.io/rust-clippy/master/",
    },
    "rustc-lints": {
      url: "https://doc.rust-lang.org/rustc/lints/listing/index.html",
    },
    // Where `overflow-checks` lives: on in debug, off in release, which is why
    // an unsigned subtraction panics under `cargo test` and wraps in the
    // binary users run.
    "cargo-profiles": {
      url: "https://doc.rust-lang.org/cargo/reference/profiles.html",
    },
  },

  "java-quality": {
    "spotbugs-bug-descriptions": {
      url: "https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html",
    },
    "errorprone-bugpatterns": {
      url: "https://errorprone.info/bugpatterns",
    },
    nullaway: {
      url: "https://github.com/uber/NullAway/wiki",
    },
    // `-Xlint` is the only analysis a plain build runs; the three above are
    // separate build steps a Spring Boot starter does not have.
    "javac-xlint": {
      url: "https://docs.oracle.com/en/java/javase/21/docs/specs/man/javac.html",
    },
  },

  "dotnet-quality": {
    "code-analysis-rules": {
      url: "https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/",
    },
    "nullable-reference-types": {
      url: "https://learn.microsoft.com/en-us/dotnet/csharp/nullable-references",
    },
  },

  "kotlin-quality": {
    detekt: {
      url: "https://detekt.dev/",
    },
    "detekt-configuration": {
      url: "https://detekt.dev/docs/introduction/configurations",
    },
    // The rule family that matters for review; detekt has no single rules
    // index page, the categories are separate documents.
    "detekt-potential-bugs": {
      url: "https://detekt.dev/docs/rules/potential-bugs",
    },
    "detekt-suppressing": {
      url: "https://detekt.dev/docs/introduction/suppressing-rules",
    },
  },

  "swift-quality": {
    "swiftlint-rules": {
      url: "https://realm.github.io/SwiftLint/rule-directory.html",
    },
    // Whether the data-race findings are compile errors or review findings is
    // decided here, not by the language version alone.
    "swift-6-migration": {
      url: "https://www.swift.org/migration/documentation/migrationguide/",
    },
  },

  "cpp-quality": {
    "clang-tidy": {
      local: "cpp-quality/clang-tidy.md",
      url: "https://clang.llvm.org/extra/clang-tidy/",
    },
    "clang-tidy-checks": {
      local: "cpp-quality/clang-tidy-checks.md",
      url: "https://clang.llvm.org/extra/clang-tidy/checks/list.html",
    },
    "clang-format": {
      local: "cpp-quality/clang-format.md",
      url: "https://clang.llvm.org/docs/ClangFormat.html",
    },
    // The warning set itself, which is OFF by default: a CMake project that
    // never sets `-Wall -Wextra` compiles almost silently, and then every
    // "already covered" row in `review/cpp` moves into the reviewer's column.
    "gcc-warning-options": {
      url: "https://gcc.gnu.org/onlinedocs/gcc/Warning-Options.html",
    },
    // Sanitizers catch most lifetime defects — but only on executed paths, so
    // an untested branch is exactly where they survive.
    "address-sanitizer": {
      url: "https://clang.llvm.org/docs/AddressSanitizer.html",
    },
    "undefined-behavior-sanitizer": {
      url: "https://clang.llvm.org/docs/UndefinedBehaviorSanitizer.html",
    },
    "clang-format-style": {
      local: "cpp-quality/clang-format-style.md",
      url: "https://clang.llvm.org/docs/ClangFormatStyleOptions.html",
    },
    cppcheck: {
      local: "cpp-quality/cppcheck.md",
      url: "https://cppcheck.sourceforge.io/manual.pdf",
    },
    iwyu: {
      local: "cpp-quality/iwyu.md",
      url: "https://include-what-you-use.org/",
    },
    "ci-integration": {
      local: "cpp-quality/ci-integration.md",
      url: "https://clang.llvm.org/extra/clang-tidy/Integrations.html",
    },
  },

  // Logging - Java
  logback: {
    configuration: {
      local: "logback/configuration.md",
      url: "https://logback.qos.ch/manual/configuration.html",
    },
    appenders: {
      local: "logback/appenders.md",
      url: "https://logback.qos.ch/manual/appenders.html",
    },
    layouts: {
      local: "logback/layouts.md",
      url: "https://logback.qos.ch/manual/layouts.html",
    },
  },

  slf4j: {
    basics: {
      local: "slf4j/basics.md",
      url: "https://www.slf4j.org/manual.html",
    },
    mdc: {
      local: "slf4j/mdc.md",
      url: "https://www.slf4j.org/manual.html#mdc",
    },
  },

  log4j2: {
    configuration: {
      local: "log4j2/configuration.md",
      url: "https://logging.apache.org/log4j/2.x/manual/configuration.html",
    },
    async: {
      local: "log4j2/async.md",
      url: "https://logging.apache.org/log4j/2.x/manual/async.html",
    },
    appenders: {
      local: "log4j2/appenders.md",
      url: "https://logging.apache.org/log4j/2.x/manual/appenders.html",
    },
  },

  // Logging - Node.js
  winston: {
    basics: {
      local: "winston/basics.md",
      url: "https://github.com/winstonjs/winston#quick-start",
    },
    transports: {
      local: "winston/transports.md",
      url: "https://github.com/winstonjs/winston#transports",
    },
    formats: {
      local: "winston/formats.md",
      url: "https://github.com/winstonjs/winston#formats",
    },
  },

  pino: {
    basics: {
      local: "pino/basics.md",
      url: "https://getpino.io/#/docs/api",
    },
    transports: {
      local: "pino/transports.md",
      url: "https://getpino.io/#/docs/transports",
    },
    "child-loggers": {
      local: "pino/child-loggers.md",
      url: "https://getpino.io/#/docs/child-loggers",
    },
    redact: {
      local: "pino/redact.md",
      url: "https://getpino.io/#/docs/redaction",
    },
  },

  // Logging - Python
  structlog: {
    basics: {
      local: "structlog/basics.md",
      url: "https://www.structlog.org/en/stable/getting-started.html",
    },
    processors: {
      local: "structlog/processors.md",
      url: "https://www.structlog.org/en/stable/processors.html",
    },
    configuration: {
      local: "structlog/configuration.md",
      url: "https://www.structlog.org/en/stable/configuration.html",
    },
  },
};
