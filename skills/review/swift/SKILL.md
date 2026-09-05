---
name: swift-review
description: |
  Reviewing Swift code - what to flag, and what the compiler and SwiftLint already flag for you

  USE WHEN: you are reviewing, critiquing or auditing existing Swift code - a
  "code review", a "review" of a .swift file, a diff, a PR or a pull request;
  deciding what to comment on in Swift; avoiding false positives on Swift code

  DO NOT USE FOR: writing, explaining or learning Swift - use `languages/swift`;
  anything the compiler or a configured SwiftLint already reports (this skill
  lists those so you can stay silent about them); SwiftUI layout - use the
  SwiftUI material; Kotlin Multiplatform bridging - use `languages/uniffi`
allowed-tools: Read, Grep, Glob
---
# Reviewing Swift

A reviewer's leverage is what the toolchain cannot say. Swift's compiler is
strong on nullability and exhaustiveness, so what remains clusters in the two
things it does not model by default: **object graph lifetime** (ARC will not
warn you about a cycle) and **concurrency**, whose checking is a per-target
setting rather than a language guarantee.

The snippets are fragments cut down to the defect, not runnable programs.

## Already covered - do not spend review on it

| Defect | Reported by |
|---|---|
| Using an optional without unwrapping | the compiler |
| Non-exhaustive `switch` over an enum | the compiler |
| Unused variable, unreachable code | the compiler |
| Unhandled `throws` | the compiler |
| Force unwrap `!` | SwiftLint `force_unwrapping` — **opt-in, not in the default rules** |
| Force cast `as!`, force `try!` | SwiftLint `force_cast` / `force_try` (force_cast is default) |
| Line length, naming, formatting | SwiftLint defaults |
| Data race on shared mutable state | the compiler — **only under Swift 6 language mode or `-strict-concurrency=complete`** |

The last row is the one that matters most. In Swift 5 mode with minimal
concurrency checking, every concurrency finding below is unreported. Establish
the target's setting before deciding.

> **The table above dates; the tools do not.** Verify a default set with
> `mcp__documentation__fetch_docs` on technology `swift-quality` — topics `swiftlint-rules`, `swift-6-migration`.
> Those entries point at the indexes the tool authors maintain, so they follow
> the version the project actually pins rather than the one this skill was
> written against.

## The checks that earn their place

### A closure capturing `self` strongly and outliving the call

```swift
manager.onUpdate = { self.refresh() }   // manager holds the closure, closure holds self
```

**When you see it**: an `@escaping` closure stored on a long-lived object, a
`Timer`, a `NotificationCenter` observer, or a Combine sink assigned to a
property — capturing `self` without a capture list.

**Ask**: does the callee outlive `self`? ARC frees nothing in a cycle, and
nothing reports it. The leak shows up as a view controller that is never
deinitialised and keeps responding to events after its screen is gone.
`[weak self]` breaks it; a non-escaping closure does not need one.

### `[weak self]` followed by a force unwrap

```swift
load { [weak self] data in
    self!.render(data)          // crashes exactly in the case weak was for
}
```

**When you see it**: `guard let self = self else { return }` is correct;
`self!` or `self?.x!` is not.

**Ask**: what is the behaviour when the object is gone? The capture list says
"this may be nil", and the force unwrap says "it will not be" — one of them is
wrong. A `guard` with an early return states the intent.

### An implicitly unwrapped optional read before it is set

```swift
var client: APIClient!          // nil until configure() runs
func send() { client.post(msg) }  // crash if the order changes
```

**When you see it**: `var x: T!` outside an `@IBOutlet`, or a dependency
assigned in a setup method rather than an initialiser.

**Ask**: is every entry point downstream of the assignment? An IUO turns a
compile-time check into a runtime trap you opted into — the same trade as
Kotlin's `lateinit`, and worth the same scrutiny.

### An unstructured `Task` that nobody cancels

```swift
Task { await refresh() }        // detached from the caller's lifetime
```

**When you see it**: `Task { }` created in a view's `onAppear`, a view model
method, or a `deinit`-less object, with the handle discarded.

**Ask**: what cancels this? An unstructured task does **not** inherit
cancellation from the scope that created it, so the work continues after the
screen is dismissed. `.task { }` in SwiftUI ties it to the view's lifetime; a
stored handle cancelled in `deinit` does it manually.

### State assumed unchanged across an `await` inside an actor

```swift
actor Cache {
    func refresh() async {
        guard !isLoading else { return }
        isLoading = true
        let data = await fetch()      // other calls can run HERE
        entries = data                // isLoading may have been reset meanwhile
        isLoading = false
    }
}
```

**When you see it**: a check, then an `await`, then a mutation depending on that
check — inside an `actor` or a `@MainActor` type.

**Ask**: what else can run at the suspension point? Actors are re-entrant: they
guarantee no *simultaneous* execution, not that a method runs atomically. Every
`await` is a place another call can interleave, and the compiler will not
mention it even under strict checking.

### `try?` discarding the reason

```swift
let user = try? decoder.decode(User.self, from: data)   // nil, and no idea why
```

**When you see it**: `try?` on a decode, a file read, or a network call whose
failure is actionable.

**Ask**: does the caller need to know why? `try?` collapses every distinct error
into `nil`, which then usually flows into an `else` branch reporting something
generic. `do/catch` costs three lines and keeps the diagnosis.

### A `struct` that is not actually a value type

```swift
struct Config {
    let store: Storage      // a CLASS: copies share this instance
}
```

**When you see it**: a `struct` with a property of class type, especially one
passed between threads or captured in a closure.

**Ask**: what does copying this actually copy? Value semantics stop at the
reference — two "copies" mutate the same `Storage`. This is also the shape that
makes a `Sendable` conformance unsound.

### An array subscript on an index that may not exist

```swift
let first = items[0]            // traps on empty; there is no optional subscript
```

**When you see it**: indexing by a computed value, a count-derived index, or a
result from another collection.

**Ask**: is the index proven in range? Unlike `Dictionary`, `Array`'s subscript
does not return an optional — it traps, and a trap is not catchable. `first`,
`last` and `indices.contains` are the checked forms.

### UI work off the main actor

```swift
URLSession.shared.dataTask(with: url) { data, _, _ in
    self.label.text = "done"       // completion runs on a background queue
}
```

**When you see it**: a UIKit or AppKit mutation inside a URLSession completion,
a `DispatchQueue.global` block, or any non-`@MainActor` context.

**Ask**: which actor or queue is this on? Under Swift 6 the compiler catches it;
under Swift 5 with minimal checking it does not, and the failure is an
intermittent crash or a silent no-op rather than a clear error.

## Config-dependent - read the target settings before commenting

| What to read | Why it changes the review |
|---|---|
| Swift language mode (5 vs 6) | Under 6, the data-race findings are compile errors and not review findings. Under 5 they are entirely yours |
| `SWIFT_STRICT_CONCURRENCY` (`minimal`/`targeted`/`complete`) | The gradient between those two states; `targeted` checks only code that already adopted concurrency |
| `.swiftlint.yml` — is `force_unwrapping` enabled? | It is **not** a default rule, so in most projects `!` is unreported |
| Deployment target | `async`/`await` need iOS 13+ with back-deployment, Observation needs 17, Swift Testing needs 16 — do not suggest below the floor |
| Is this a package or an app target? | `Sendable` diagnostics differ, and a library's public API carries concurrency annotations into its consumers |

## What to say

Anchor the comment to the line, name the condition that triggers the defect, and
say what breaks: "`manager` holds this closure and the closure captures `self`
strongly, so the controller is never deinitialised and keeps handling events
after dismissal" beats "use `[weak self]`". If you cannot state the input that
fails, it is a preference, not a defect.

Say once whether the target uses Swift 6 mode. Half of these findings depend on
it, and repeating the caveat per comment is noise.
