---
name: cpp-quality
description: |
  C++ static analysis and formatting tooling: clang-tidy, clang-format, cppcheck,
  include-what-you-use (IWYU), and CI integration patterns.

  USE WHEN: user mentions "clang-tidy", "clang-format", "cppcheck", "iwyu",
  "include-what-you-use", ".clang-tidy", ".clang-format", "C++ static analysis",
  "C++ linter"

  DO NOT USE FOR: SonarQube C++ rules (tool-agnostic), Coverity (commercial),
  PVS-Studio (commercial)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# C++ Quality Tooling - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `cpp-quality`.

## clang-format

Reformats source per a style file. Runs in milliseconds; safe to wire into pre-commit and editors.

`.clang-format`:
```yaml
---
BasedOnStyle: LLVM
Language: Cpp
Standard: c++20
ColumnLimit: 100
IndentWidth: 4
AccessModifierOffset: -4
AllowShortFunctionsOnASingleLine: Empty
AlwaysBreakTemplateDeclarations: Yes
BreakBeforeBraces: Attach
NamespaceIndentation: None
PointerAlignment: Left
SortIncludes: CaseInsensitive
IncludeBlocks: Regroup
SpaceAfterTemplateKeyword: false
```

Run:
```bash
clang-format -i src/**/*.cpp include/**/*.hpp
clang-format --dry-run --Werror src/foo.cpp        # CI: fail if not formatted
git ls-files '*.cpp' '*.hpp' | xargs clang-format -i
```

Choose a base (`LLVM`, `Google`, `Mozilla`, `Chromium`, `Microsoft`) and tweak — don't bikeshed style from scratch.

## clang-tidy

Linter + simple refactor tool driven by `compile_commands.json` (enable with `set(CMAKE_EXPORT_COMPILE_COMMANDS ON)`).

`.clang-tidy`:
```yaml
---
Checks: >
  -*,
  bugprone-*,
  cert-*,
  clang-analyzer-*,
  concurrency-*,
  cppcoreguidelines-*,
  modernize-*,
  performance-*,
  portability-*,
  readability-*,
  -modernize-use-trailing-return-type,
  -readability-magic-numbers,
  -readability-identifier-length,
  -cppcoreguidelines-avoid-magic-numbers
WarningsAsErrors: '*'
HeaderFilterRegex: '^.*/(include|src)/.*\.(h|hpp)$'
FormatStyle: file
CheckOptions:
  - { key: readability-function-cognitive-complexity.Threshold, value: '25' }
  - { key: cppcoreguidelines-avoid-non-const-global-variables.AllowInternalLinkage, value: 'true' }
```

Run:
```bash
# Single file
clang-tidy -p build src/foo.cpp

# Whole project (parallelized)
run-clang-tidy -p build -quiet -header-filter='^.*/(include|src)/.*'

# Auto-apply fixes
run-clang-tidy -p build -fix -fix-errors

# CMake target
add_custom_target(tidy COMMAND run-clang-tidy -p ${CMAKE_BINARY_DIR})
```

### High-value check categories

| Category | What it catches |
|----------|-----------------|
| `bugprone-*` | Real defect patterns (use-after-move, sizeof on pointer, infinite loop) |
| `clang-analyzer-*` | Path-sensitive: null deref, leak, UB |
| `cppcoreguidelines-*` | Per the C++ Core Guidelines (ownership, narrowing, slicing) |
| `modernize-*` | Suggests modern equivalents (`nullptr`, `auto`, `make_unique`) |
| `performance-*` | Unnecessary copies, std::move misuse, string concat in loops |
| `concurrency-*` | Misuse of `std::thread`, `std::condition_variable` |
| `readability-*` | Naming, identifier conventions, redundant code |

### Suppressing

```cpp
// One line
int* p = (int*)x;  // NOLINT(cppcoreguidelines-pro-type-cstyle-cast)

// Block
// NOLINTBEGIN(modernize-use-nodiscard)
int legacy_api();
// NOLINTEND(modernize-use-nodiscard)
```
Prefer fixing or disabling at config level for whole categories you don't want.

## cppcheck (complementary, not a replacement)

```bash
cppcheck --enable=warning,style,performance,portability \
         --inline-suppr --error-exitcode=2 \
         --project=build/compile_commands.json \
         --suppress=missingIncludeSystem \
         -i tests
```

Catches different patterns than clang-tidy (less path-sensitive but quicker; flags some uninitialized-member and dangling-reference issues clang-tidy misses).

## include-what-you-use (IWYU)

Reduces include bloat → faster builds + fewer accidental dependencies.

```bash
iwyu_tool.py -p build src/foo.cpp
fix_includes.py < iwyu.out                # auto-apply suggestions
```

Annotate to override:
```cpp
#include <vector>          // IWYU pragma: keep
class Foo;                 // IWYU pragma: forward_declare
```

## Compiler warnings (the cheap layer underneath)

```cmake
target_compile_options(mylib PRIVATE
    $<$<CXX_COMPILER_ID:MSVC>:/W4 /WX /permissive- /w14640>
    $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:
        -Wall -Wextra -Wpedantic -Werror
        -Wshadow -Wnon-virtual-dtor -Wold-style-cast
        -Wcast-align -Woverloaded-virtual -Wconversion -Wsign-conversion
        -Wnull-dereference -Wdouble-promotion -Wformat=2
    >
)
```

Don't skip this in favor of clang-tidy — compiler warnings are free and faster than any external tool.

## CI pipeline (GitHub Actions sketch)

```yaml
- name: Configure
  run: cmake --preset debug

- name: Format check
  run: |
    git ls-files '*.cpp' '*.hpp' | xargs clang-format --dry-run --Werror

- name: Build
  run: cmake --build --preset debug -j

- name: clang-tidy
  run: run-clang-tidy -p build/debug -quiet

- name: Test
  run: ctest --preset debug
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| `WarningsAsErrors: '*'` then `// NOLINT` everywhere | Hides real issues | Disable check at config level instead |
| Running clang-tidy without `compile_commands.json` | Wrong include paths, false positives | Always pass `-p build/` |
| Reformatting whole repo in one PR | Murders `git blame` | One reformat commit, mark in `.git-blame-ignore-revs` |
| `-Wno-error=...` to ship faster | Tech debt that never returns | Fix the warning or `// NOLINT` with reason |
| Skipping warnings when adopting a third-party header | Future you will pay | Wrap with `#pragma GCC diagnostic push/ignored/pop` |
| Tidying generated code | Fights the generator | Exclude with `HeaderFilterRegex` or path globs |
