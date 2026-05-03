---
name: cpp
description: |
  Modern C++ (C++17/20/23) language and standard library. Covers RAII, move semantics,
  smart pointers, templates, concepts, ranges, coroutines, modules, std::expected,
  std::format, std::span, std::string_view.

  USE WHEN: user mentions "C++", "modern C++", "C++17/20/23", "RAII", "smart pointers",
  "templates", "concepts", "ranges", "move semantics", "std::expected", "std::span",
  "coroutines", "modules", "STL"

  DO NOT USE FOR: C (use a C-specific skill), C# (use `csharp`),
  Objective-C++, Carbon, kernel/no-exception subset (use `cpp-systems`)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Modern C++ - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `cpp` for comprehensive documentation.

## Smart Pointers

```cpp
#include <memory>

// Single ownership (preferred default)
auto p = std::make_unique<Widget>(arg1, arg2);
std::unique_ptr<Widget> moved = std::move(p);   // p is now nullptr

// Shared ownership (only when truly shared)
auto sp = std::make_shared<Widget>(args);       // single allocation, atomic refcount
std::weak_ptr<Widget> wp = sp;                  // breaks cycles

// Custom deleter
auto file = std::unique_ptr<FILE, decltype(&std::fclose)>(std::fopen("x", "r"), &std::fclose);
```

## Move Semantics & Rule of Five

```cpp
class Buffer {
    std::byte* data_{nullptr};
    std::size_t size_{0};
public:
    Buffer() = default;
    explicit Buffer(std::size_t n) : data_(new std::byte[n]), size_(n) {}
    ~Buffer() { delete[] data_; }

    // Copy
    Buffer(const Buffer& o) : data_(new std::byte[o.size_]), size_(o.size_) {
        std::copy_n(o.data_, size_, data_);
    }
    Buffer& operator=(Buffer o) noexcept { swap(o); return *this; }   // copy-and-swap

    // Move
    Buffer(Buffer&& o) noexcept : data_(std::exchange(o.data_, nullptr)),
                                  size_(std::exchange(o.size_, 0)) {}

    void swap(Buffer& o) noexcept { std::swap(data_, o.data_); std::swap(size_, o.size_); }
};
```

**Rule of zero**: prefer to define no special members and let the compiler generate them — use `std::vector` / `std::unique_ptr` so resources are managed automatically.

## Concepts (C++20)

```cpp
#include <concepts>

template <typename T>
concept Numeric = std::integral<T> || std::floating_point<T>;

template <Numeric T>
constexpr T square(T x) { return x * x; }

// requires-clause
template <typename It>
    requires std::forward_iterator<It>
auto count_unique(It first, It last) { /* ... */ }

// requires-expression
template <typename T>
concept Hashable = requires(T x) {
    { std::hash<T>{}(x) } -> std::convertible_to<std::size_t>;
};
```

## Ranges (C++20/23)

```cpp
#include <ranges>
#include <vector>

std::vector<int> v{1, 2, 3, 4, 5, 6};

// Lazy view pipeline
auto evens_squared = v
    | std::views::filter([](int x){ return x % 2 == 0; })
    | std::views::transform([](int x){ return x * x; });

for (int x : evens_squared) { /* 4, 16, 36 */ }

// Materialize (C++23)
auto vec = evens_squared | std::ranges::to<std::vector>();

// Algorithms
std::ranges::sort(v);
auto it = std::ranges::find(v, 3);
```

## std::expected (C++23) - error handling without exceptions

```cpp
#include <expected>
#include <charconv>

std::expected<int, std::errc> parse(std::string_view s) {
    int v{};
    auto [ptr, ec] = std::from_chars(s.data(), s.data() + s.size(), v);
    if (ec != std::errc{}) return std::unexpected(ec);
    return v;
}

auto result = parse("42")
    .transform([](int x){ return x * 2; })
    .or_else([](std::errc e) -> std::expected<int, std::errc> { return 0; });
```

## std::span and std::string_view

```cpp
#include <span>
#include <string_view>

// Non-owning view of contiguous memory; replaces (T*, size_t) pairs
void process(std::span<const int> xs) {
    for (int x : xs) { /* ... */ }
}

int arr[]{1, 2, 3};
std::vector<int> v{1, 2, 3};
process(arr);          // OK
process(v);            // OK
process({v.data(), 2}); // OK - first 2 elements

// string_view: non-owning string reference
void log(std::string_view msg);
log("literal");          // no allocation
log(std::string{"x"});   // no allocation
```

## std::format (C++20) and std::print (C++23)

```cpp
#include <format>
#include <print>

std::string s = std::format("user={} id={:08x}", name, id);
std::print("Total: {:.2f} MB\n", bytes / 1.0e6);
std::println("OK");
```

## Coroutines (C++20) - high level

```cpp
#include <coroutine>

// Use a library task type (cppcoro, folly::coro, std::generator C++23)
#include <generator>

std::generator<int> fib() {
    int a = 0, b = 1;
    while (true) { co_yield a; auto t = a; a = b; b = t + b; }
}

for (int x : fib() | std::views::take(10)) std::print("{} ", x);
```

## Modules (C++20) - basic structure

```cpp
// math.cppm  (module interface unit)
export module math;
export int add(int a, int b) { return a + b; }
namespace detail { int helper(); }   // not exported

// main.cpp
import math;
int main() { return add(2, 3); }
```

CMake support: `set(CMAKE_CXX_STANDARD 20)` + `set(CMAKE_CXX_SCAN_FOR_MODULES ON)` (CMake 3.28+).

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Raw `new`/`delete` | Leaks, double-free | `std::make_unique` |
| `std::shared_ptr` by default | Atomic cost, cycles | `std::unique_ptr`, share only when needed |
| `using namespace std;` in header | Pollutes every TU | Qualify; `using` only inside `.cpp` |
| Returning `T*` for ownership | Unclear contract | Return `std::unique_ptr<T>` |
| `T*, size_t` parameter pair | Easy to desync | `std::span<T>` |
| `const std::string&` for string params | Forces allocation | `std::string_view` |
| `0` / `NULL` for pointers | Overload ambiguity | `nullptr` |
| C-style cast `(T)x` | Hides intent | `static_cast<T>(x)` etc. |
| Macros for constants | No type safety, no scope | `inline constexpr T name = ...;` |
| Throwing in destructors | Aborts during stack unwinding | `noexcept` destructors |

## Quick Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Use-after-free at runtime | Dangling reference / invalidated iterator | Run with `-fsanitize=address` |
| Random data corruption | UB (signed overflow, OOB) | Run with `-fsanitize=undefined,address` |
| Slow compile | Heavy includes in headers | Forward declare; PIMPL; precompiled headers |
| Linker "undefined reference to vtable" | Pure virtual without out-of-line dtor | Define dtor in `.cpp` even if `= default` |
| Linker "multiple definition" | Non-inline function in header | Mark `inline`, move to `.cpp`, or make template |
| `std::vector<T>` won't move-construct in container | `T`'s move ctor not `noexcept` | Mark `noexcept` |
| Templates produce wall-of-text errors | Constraint mismatch | Use C++20 concepts to localize the diagnostic |
