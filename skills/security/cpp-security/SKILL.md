---
name: cpp-security
description: |
  C++ memory and concurrency safety: AddressSanitizer (ASan), UndefinedBehaviorSanitizer
  (UBSan), ThreadSanitizer (TSan), MemorySanitizer (MSan), MSVC `/sdl` and `/guard:cf`,
  CERT C++ secure coding rules, integer-overflow safe arithmetic, and Control Flow Integrity.

  USE WHEN: user mentions "ASan", "AddressSanitizer", "UBSan", "TSan", "MSan",
  "use-after-free", "buffer overflow", "undefined behavior", "data race",
  "CERT C++", "secure C++", "/sdl", "/GS", "ASLR", "DEP", "stack canary"

  DO NOT USE FOR: Web/app security (use `owasp`), .NET security (`dotnet-security`),
  cryptography APIs (use `cryptography`)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# C++ Security & Memory Safety - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `cpp-security`.

## The Sanitizers (debug-time, near-zero false positives)

| Sanitizer | Catches | Overhead | Notes |
|-----------|---------|----------|-------|
| **ASan** | Heap/stack/global OOB, use-after-free, double-free, leaks | ~2x | Cannot combine with TSan/MSan |
| **UBSan** | Signed overflow, null deref, OOB shift, misaligned access, etc. | ~10-20% | Often combined with ASan |
| **TSan** | Data races between threads | ~5-15x | Cannot combine with ASan |
| **MSan** | Use of uninitialized memory | ~3x | Requires *all* deps instrumented (Clang only) |
| **CFI** (`-fsanitize=cfi`) | Indirect-call integrity violations | small | Requires LTO |

### Enable in CMake

```cmake
add_library(sanitizers_iface INTERFACE)
if(NOT MSVC)
    target_compile_options(sanitizers_iface INTERFACE
        -fsanitize=address,undefined -fno-omit-frame-pointer -g -O1)
    target_link_options(sanitizers_iface INTERFACE
        -fsanitize=address,undefined)
endif()
target_link_libraries(myapp PRIVATE sanitizers_iface)
```

Or per-preset (see `cmake` skill `debug-asan` example).

### Run-time options

```bash
ASAN_OPTIONS=detect_leaks=1:abort_on_error=1:strict_string_checks=1 ./myapp
UBSAN_OPTIONS=print_stacktrace=1:halt_on_error=1                    ./myapp
TSAN_OPTIONS=second_deadlock_stack=1:halt_on_error=1                ./myapp
LSAN_OPTIONS=suppressions=lsan.supp                                 ./myapp
```

CI tip: build a **separate sanitizer job** rather than slowing every test.

## Compiler hardening flags

### Linux/macOS (Clang/GCC)

```
-D_FORTIFY_SOURCE=3                     # libc bounds checks (needs -O1+)
-fstack-protector-strong                # stack canaries
-fstack-clash-protection                 # GCC: probe pages
-fcf-protection=full                    # x86: CET indirect-branch tracking
-Wformat -Wformat-security              # printf format-string attacks
-fPIE -pie                              # ASLR for executables
-Wl,-z,relro,-z,now                     # full RELRO
-Wl,-z,noexecstack                      # NX stack
```

### Windows (MSVC)

```
/sdl                                    # all `/W4` security warnings + extra checks
/GS                                     # stack buffer overrun detection (default)
/guard:cf                               # Control Flow Guard
/guard:ehcont                           # EH continuation metadata (CET)
/Qspectre                               # Spectre mitigations
/DYNAMICBASE  /HIGHENTROPYVA            # ASLR (linker)
/NXCOMPAT                               # DEP
/CETCOMPAT                              # CET
```

Set per-target:
```cmake
target_compile_options(myapp PRIVATE
    $<$<CXX_COMPILER_ID:MSVC>:/sdl /guard:cf /Qspectre>
    $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-fstack-protector-strong -D_FORTIFY_SOURCE=3>
)
target_link_options(myapp PRIVATE
    $<$<CXX_COMPILER_ID:MSVC>:/DYNAMICBASE /HIGHENTROPYVA /NXCOMPAT /CETCOMPAT /guard:cf>
    $<$<NOT:$<CXX_COMPILER_ID:MSVC>>:-pie -Wl,-z,relro,-z,now,-z,noexecstack>
)
```

## CERT C++ — top categories with C++ idiomatic fixes

### Use `std::span` / `std::string_view` instead of pointer + size

```cpp
// BAD: easy to desync
void process(const char* buf, std::size_t n);

// GOOD
void process(std::span<const std::byte> buf);
```

### Safe integer arithmetic

```cpp
#include <limits>
#include <stdexcept>

template <std::integral T>
T checked_add(T a, T b) {
    T r;
    if (__builtin_add_overflow(a, b, &r))         // GCC/Clang; MSVC: <intsafe.h> IntAdd*
        throw std::overflow_error("add overflow");
    return r;
}
```

C++26 will land `<numeric>` `add_sat`, `sub_sat`, `mul_sat`, `div_sat` as standard.

### Avoid `printf` with non-literal format strings

```cpp
printf(user_input);             // BAD - format-string vuln
std::print("{}", user_input);   // GOOD - C++23 std::print/format
```

### Validate at boundaries, trust internally

Once data is parsed into a typed value, downstream code should not re-validate. Concentrate validation at the deserialization layer.

### Prefer `enum class` to avoid implicit conversions

```cpp
enum class Permission { None = 0, Read = 1, Write = 2, Admin = 4 };
```

### Don't slice polymorphic types

```cpp
struct Base { virtual ~Base() = default; };
struct Derived : Base { int extra{}; };

void take(Base b);      // BAD - slices Derived state
void take(const Base&); // GOOD
```

## Concurrency safety

```cpp
// BAD: data race on `count`
int count = 0;
auto worker = [&] { for (int i = 0; i < 1'000'000; ++i) ++count; };

// GOOD
std::atomic<int> count{0};
auto worker = [&] { for (int i = 0; i < 1'000'000; ++i) count.fetch_add(1, std::memory_order_relaxed); };
```

Build the same binary under TSan in CI to catch latent races; relying on "we tested it" misses races that surface only on different hardware/OS.

## Common Vulnerability Patterns and Their C++ Fixes

| Vulnerability | Bad pattern | Modern C++ fix |
|---------------|-------------|----------------|
| Buffer overflow | `char buf[64]; strcpy(buf, x);` | `std::string` or `std::span` + bounds-checked algorithms |
| Use-after-free | Returning pointer to local | Return by value (RVO) or `std::unique_ptr` |
| Format string | `printf(input)` | `std::format("{}", input)` |
| Integer overflow → OOB | `new T[n * sizeof(T)]` | `std::vector<T>(n)` (allocator throws on overflow) |
| TOCTOU file race | `if (access("x")) open("x");` | `open()` then check errno (atomic intent) |
| Iterator invalidation | Mutating container while iterating | Use index, or rebuild iterator after mutation |
| Uninitialized read | `int x; use(x);` | `int x{};` or initialize at decl point |
| Dangling reference to temporary | `auto&& s = std::string{"x"}.c_str();` | Bind by value, or extend lifetime explicitly |

## Fuzzing (for parsers, decoders, anything taking untrusted input)

```cpp
// fuzz_target.cpp
#include <cstdint>
#include <cstddef>
#include "parser.hpp"

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size) {
    try { (void) parse(std::span<const uint8_t>(data, size)); }
    catch (...) { /* parser may throw on bad input - that's fine */ }
    return 0;
}
```
Build with `clang -fsanitize=fuzzer,address,undefined fuzz_target.cpp parser.cpp`.

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Disabling ASan after a CI failure | Hides real bugs | Fix the bug; keep sanitizer on |
| `reinterpret_cast` to silence the compiler | Almost always UB | `static_cast` + redesign types, or `std::bit_cast` (C++20) |
| `std::memcpy` of non-trivially-copyable types | UB | Construct/move properly |
| Catching `std::exception&` and ignoring | Loses diagnostics | Re-throw or log + handle |
| `new T[n]` with `n` from input | Integer overflow → tiny alloc, big write | `std::vector<T>(n)` (throws `bad_alloc`) |
| Hand-rolled crypto/hash | Subtle errors, side channels | Use libsodium / OpenSSL / Botan |
| C-style cast `(T)x` | Hides reinterpret/const-cast | C++ casts so the intent is reviewable |
