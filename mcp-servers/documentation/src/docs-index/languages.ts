// SPDX-License-Identifier: MIT
/**
 * Programming languages documentation
 * Includes: JavaScript, TypeScript, Node.js, Bun, Python, Rust, Go, Deno
 */

import type { DocsRecord } from "./types.js";

export const LANGUAGE_TECHNOLOGIES = [
  "javascript",
  "typescript",
  "nodejs",
  "bun",
  "python",
  "rust",
  "go",
  "deno",
  "csharp",
  "cpp",
] as const;

export const languageDocs: DocsRecord = {
  javascript: {
    modules: {
      local: "javascript/modules.md",
      url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules",
    },
    "es6-features": {
      local: "javascript/es6-features.md",
      url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference",
    },
    async: {
      local: "javascript/async.md",
      url: "https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous",
    },
    "esm-vs-cjs": {
      local: "javascript/esm-vs-cjs.md",
      url: "https://nodejs.org/api/esm.html",
    },
  },

  typescript: {
    types: {
      local: "typescript/types.md",
      url: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html",
    },
    generics: {
      local: "typescript/generics.md",
      url: "https://www.typescriptlang.org/docs/handbook/2/generics.html",
    },
    "utility-types": {
      local: "typescript/utility-types.md",
      url: "https://www.typescriptlang.org/docs/handbook/utility-types.html",
    },
  },

  nodejs: {
    "event-loop": {
      local: "nodejs/event-loop.md",
      url: "https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick",
    },
    streams: {
      local: "nodejs/streams.md",
      url: "https://nodejs.org/api/stream.html",
    },
    "worker-threads": {
      local: "nodejs/worker-threads.md",
      url: "https://nodejs.org/api/worker_threads.html",
    },
    cluster: {
      local: "nodejs/cluster.md",
      url: "https://nodejs.org/api/cluster.html",
    },
    performance: {
      local: "nodejs/performance.md",
      url: "https://nodejs.org/en/learn/getting-started/profiling",
    },
  },

  bun: {
    basics: {
      local: "bun/basics.md",
      url: "https://bun.sh/docs",
    },
    runtime: {
      local: "bun/runtime.md",
      url: "https://bun.sh/docs/runtime",
    },
    bundler: {
      local: "bun/bundler.md",
      url: "https://bun.sh/docs/bundler",
    },
    "test-runner": {
      local: "bun/test-runner.md",
      url: "https://bun.sh/docs/cli/test",
    },
    sqlite: {
      local: "bun/sqlite.md",
      url: "https://bun.sh/docs/api/sqlite",
    },
  },

  rust: {
    ownership: {
      local: "rust/ownership.md",
      url: "https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html",
    },
    async: {
      local: "rust/async.md",
      url: "https://rust-lang.github.io/async-book/",
    },
    "error-handling": {
      local: "rust/error-handling.md",
      url: "https://doc.rust-lang.org/book/ch09-00-error-handling.html",
    },
    traits: {
      local: "rust/traits.md",
      url: "https://doc.rust-lang.org/book/ch10-02-traits.html",
    },
    cargo: {
      local: "rust/cargo.md",
      url: "https://doc.rust-lang.org/cargo/",
    },
  },

  go: {
    basics: {
      local: "go/basics.md",
      url: "https://go.dev/tour/",
    },
    concurrency: {
      local: "go/concurrency.md",
      url: "https://go.dev/doc/effective_go#concurrency",
    },
    interfaces: {
      local: "go/interfaces.md",
      url: "https://go.dev/doc/effective_go#interfaces",
    },
    modules: {
      local: "go/modules.md",
      url: "https://go.dev/doc/modules/",
    },
    testing: {
      local: "go/testing.md",
      url: "https://go.dev/doc/tutorial/add-a-test",
    },
  },

  deno: {
    basics: {
      local: "deno/basics.md",
      url: "https://docs.deno.com/runtime/",
    },
    permissions: {
      local: "deno/permissions.md",
      url: "https://docs.deno.com/runtime/fundamentals/security/",
    },
    std: {
      local: "deno/std.md",
      url: "https://jsr.io/@std",
    },
    deploy: {
      local: "deno/deploy.md",
      url: "https://docs.deno.com/deploy/",
    },
    kv: {
      local: "deno/kv.md",
      url: "https://docs.deno.com/deploy/kv/manual/",
    },
  },

  csharp: {
    records: {
      local: "csharp/records.md",
      url: "https://learn.microsoft.com/dotnet/csharp/language-reference/builtin-types/record",
    },
    async: {
      local: "csharp/async.md",
      url: "https://learn.microsoft.com/dotnet/csharp/asynchronous-programming/",
    },
    linq: {
      local: "csharp/linq.md",
      url: "https://learn.microsoft.com/dotnet/csharp/linq/",
    },
    "pattern-matching": {
      local: "csharp/pattern-matching.md",
      url: "https://learn.microsoft.com/dotnet/csharp/fundamentals/functional/pattern-matching",
    },
    nullable: {
      local: "csharp/nullable.md",
      url: "https://learn.microsoft.com/dotnet/csharp/nullable-references",
    },
  },

  cpp: {
    "raii-smart-pointers": {
      local: "cpp/raii-smart-pointers.md",
      url: "https://en.cppreference.com/w/cpp/memory",
    },
    "move-semantics": {
      local: "cpp/move-semantics.md",
      url: "https://en.cppreference.com/w/cpp/language/move_constructor",
    },
    concepts: {
      local: "cpp/concepts.md",
      url: "https://en.cppreference.com/w/cpp/language/constraints",
    },
    ranges: {
      local: "cpp/ranges.md",
      url: "https://en.cppreference.com/w/cpp/ranges",
    },
    coroutines: {
      local: "cpp/coroutines.md",
      url: "https://en.cppreference.com/w/cpp/language/coroutines",
    },
    modules: {
      local: "cpp/modules.md",
      url: "https://en.cppreference.com/w/cpp/language/modules",
    },
    "expected-format": {
      local: "cpp/expected-format.md",
      url: "https://en.cppreference.com/w/cpp/utility/expected",
    },
    "core-guidelines": {
      local: "cpp/core-guidelines.md",
      url: "https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines",
    },
  },
};
