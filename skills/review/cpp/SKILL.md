---
name: cpp-review
description: |
  Reviewing C++ code - what to flag, and what the compiler, clang-tidy and sanitizers already flag for you

  USE WHEN: you are reviewing, critiquing or auditing existing C++ code - a
  "code review", a "review" of a .cpp/.hpp/.cc/.h file, a diff, a PR or a pull
  request; deciding what to comment on in C++; avoiding false positives on C++

  DO NOT USE FOR: writing, explaining or learning C++ - use `languages/cpp`;
  anything `-Wall -Wextra`, clang-tidy or a sanitizer run already reports (this
  skill lists those so you can stay silent about them); build system questions -
  use the CMake material; embedded specifics - use `systems/embedded-rtos`
allowed-tools: Read, Grep, Glob
---
# Reviewing C++

A reviewer's leverage is what the toolchain cannot say. C++ is the language
where that gap is widest — but the gap is not "undefined behaviour" in the
abstract. Listing UB categories is not a review; it is a textbook.

What earns a comment is a **lifetime or ownership claim that the code makes and
nothing checks**. Almost every check below is one of those.

Two things decide how much the toolchain said before you did, and both are
project settings rather than language facts:

- **Warnings are off by default.** A CMake project that never sets
  `-Wall -Wextra` compiles almost silently. Check before assuming.
- **Sanitizers find these defects, but only on executed paths.** ASan and UBSan
  turn most lifetime bugs below into loud failures — if the test suite reaches
  them. An untested branch is exactly where they survive.

The snippets are fragments cut down to the defect, not runnable programs.

## Already covered - do not spend review on it

| Defect | Reported by |
|---|---|
| Unused variable, unused parameter | `-Wall` / `-Wextra` |
| Signed/unsigned comparison | `-Wextra` (`-Wsign-compare`) |
| Missing return on some path | `-Wreturn-type` (in `-Wall`) |
| Member initialisation order mismatch | `-Wreorder` (in `-Wall`) |
| `delete` through a base with no virtual dtor, direct case | `-Wdelete-non-virtual-dtor` (in `-Wall`) |
| Use after move | clang-tidy `bugprone-use-after-move` — **only if clang-tidy runs** |
| Raw `new`/`delete` where a smart pointer belongs | clang-tidy `modernize-make-unique`, `cppcoreguidelines-owning-memory` |
| Heap use-after-free, buffer overflow, leak | ASan — **only on executed paths** |
| Signed overflow, misaligned load, bad shift | UBSan — **only on executed paths** |

**Read the build first.** If `CMakeLists.txt` sets no warning flags, no
clang-tidy target and no sanitizer preset, then rows 1-9 are all yours. That is
one comment about the build, followed by the specific instances — not a
per-line campaign.

## The checks that earn their place

### A guard that guards nothing

```cpp
std::lock_guard<std::mutex>(m);        // a TEMPORARY: destroyed at the semicolon
std::lock_guard<std::mutex> guard(m);  // holds until end of scope
```

**When you see it**: any RAII type constructed without a variable name —
`lock_guard`, `unique_lock`, `scoped_lock`, a timer, a transaction guard.

**Ask**: does this have a name? The unnamed form locks and unlocks on the same
line, so the critical section below runs unprotected. It compiles, it looks
right, and the race it creates is intermittent. (Some compilers warn under
`-Wunused-value`; many do not for types with non-trivial destructors.)

### A `string_view` or reference outliving what it points into

```cpp
std::string_view name = person().full_name();   // temporary dies at the semicolon
return name;                                    // dangling
```

**When you see it**: `string_view`, `span`, a reference or a raw pointer
initialised from a function call returning by value; a `string_view` stored as a
class member.

**Ask**: who owns the buffer, and does it outlive this? `string_view` and `span`
are non-owning by design, so every one of them is a lifetime claim. A member of
that type is a claim about an object the class does not control.

### A range-for over a temporary's subobject

```cpp
for (const auto& row : getTable().rows()) { }   // getTable() dies before the loop
```

**When you see it**: `for (... : expr)` where `expr` is a member access, an index
or a call *on* a temporary rather than the temporary itself.

**Ask**: is the temporary itself bound, or something inside it? Lifetime
extension applies to the whole temporary bound directly to the reference — and
not to a subobject reached through a call. C++23 fixed this for the direct case
only; the shape above still dangles.

### An iterator used after the container was modified

```cpp
for (auto it = v.begin(); it != v.end(); ++it) {
    if (pred(*it)) v.push_back(*it);   // may reallocate; `it` and `end()` dangle
}
```

**When you see it**: `push_back`, `insert`, `erase` or `resize` inside a loop
over the same container.

**Ask**: can this reallocate or shift? For `vector` any growth invalidates
everything; `erase` invalidates from the erase point on. The `erase` case has a
correct idiom (`it = v.erase(it)`) that is one character from the wrong one.

### An owning raw pointer member with compiler-generated copy

```cpp
class Buffer {
    char* data_;             // owns
public:
    ~Buffer() { delete[] data_; }
    // no copy ctor, no copy assignment declared
};
```

**When you see it**: a destructor that frees, with no user-declared copy/move
operations — the Rule of Three/Five broken in the direction that compiles.

**Ask**: what happens when this is copied? The implicit copy duplicates the
pointer, and both objects free it: double free, at a moment unrelated to the
copy. Declaring the destructor does not suppress the copy operations. `= delete`
or a smart pointer member is the fix.

### A derived object sliced on copy

```cpp
void render(Shape s);        // by value
render(circle);              // the Circle part is cut away
std::vector<Shape> shapes;   // same, on every push_back
```

**When you see it**: a polymorphic type passed, returned or stored **by value**;
a container of a base class.

**Ask**: is this type ever derived from? Slicing is silent — the program runs
and calls the base implementation. No warning covers it, because by-value
passing is legitimate for non-polymorphic types.

### A `shared_ptr` that does not share the same control block

```cpp
class Session {
    void register_self() { registry.add(std::shared_ptr<Session>(this)); }
};
```

**When you see it**: a `shared_ptr` constructed from a raw `this`, or twice from
the same raw pointer.

**Ask**: how many control blocks now exist for this object? Two owners each
believing they are the last, so it is freed twice. `enable_shared_from_this` is
the mechanism that avoids it. Also check the cycle case: two `shared_ptr`s
pointing at each other never reach zero, and nothing reports the leak.

### A `const` method handing out a mutable reference

```cpp
class Config {
    std::map<std::string, std::string> values_;
public:
    std::map<std::string, std::string>& all() const { return values_; }  // needs mutable/const_cast to compile
    const std::vector<Item>& items() const { return items_; }            // fine
};
```

**When you see it**: a getter returning a non-const reference or pointer to a
member, especially from a `const` method or on a class documented as immutable.

**Ask**: does the class still control its invariants? `const` on the method
protects the pointer, not what it points at, and a returned handle outlives the
call. Note this is also the shape that makes thread-safety reasoning impossible.

### An object used after being moved from

```cpp
process(std::move(cfg));
if (cfg.enabled) { }        // valid but unspecified state
```

**When you see it**: a variable read after appearing in a `std::move`, or moved
inside a loop body.

**Ask**: is this read guaranteed? A moved-from standard type is valid but
*unspecified* — `.empty()` is allowed to be false. It is not UB, which is why it
survives sanitizers, and it is why the bug reproduces on one standard library
and not another. `bugprone-use-after-move` finds the direct shape when
clang-tidy runs.

### Static initialisation order across translation units

```cpp
// a.cpp
extern Logger logger;
Registry registry{logger};   // logger may not be constructed yet
```

**When you see it**: a namespace-scope object whose constructor uses another
namespace-scope object from a different `.cpp`.

**Ask**: is the order defined? Across translation units it is not, and the
failure depends on link order — so it appears when an unrelated file is added.
A function-local static (constructed on first use) is the standard fix.

## Version- and build-dependent - read `CMakeLists.txt` before commenting

| What to read | Why it changes the review |
|---|---|
| `CMAKE_CXX_STANDARD` / `-std=` | 17 made evaluation order of function arguments... still unspecified, but fixed it for `a[i] = b[i++]`-style expressions and for `<<` chains. 20 adds `std::span` and ranges; 23 extends lifetime for the *directly bound* range-for temporary only. Do not suggest what the standard forbids |
| Warning flags | If `-Wall -Wextra` is absent, the whole "already covered" table is unreported. That is the first comment, and it outranks the individual findings |
| A clang-tidy target, `.clang-tidy` | Without it, use-after-move and the modernize/ownership families never ran |
| A sanitizer build (`-fsanitize=address,undefined`) and whether CI runs it | With it, the lifetime findings above become test failures *on covered paths*; without it they reach production |
| `-Wthread-safety` (clang) with annotations | The only mechanism that checks locking discipline at all; almost never enabled |

`-Werror` in CI tells you the warnings that *are* enabled were all resolved,
which narrows what is worth reading closely.

## What to say

Anchor the comment to the line, name the ownership or lifetime claim being made,
and say what breaks: "`name` is a `string_view` into the temporary returned by
`person()`, which is destroyed at the end of this statement, so the return value
dangles" beats "watch out for dangling views". If you cannot state the input
that fails, it is a preference, not a defect.

Do not review by reciting UB categories. One concrete lifetime finding is worth
more than a list of everything the standard leaves undefined.
