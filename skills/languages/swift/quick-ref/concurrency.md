# Swift Concurrency — Quick Reference

Swift 5.5+ structured concurrency model. Swift 6 enforces strict concurrency checking by default — most patterns here are aimed at Swift 6 compliance.

## async/await Basics

```swift
func loadUser(id: Int) async throws -> User {
    let (data, _) = try await URLSession.shared.data(from: url(id))
    return try JSONDecoder().decode(User.self, from: data)
}

// Sequential
let user = try await loadUser(id: 1)
let posts = try await loadPosts(for: user)

// Parallel via async let
async let user = loadUser(id: 1)
async let posts = loadPosts(for: 1)
let (u, p) = try await (user, posts)
```

`async let` starts the task immediately, awaits at use site.

## Tasks

```swift
// Unstructured task — fires off, returns handle
let task = Task {
    try await heavyWork()
}

let result = try await task.value
task.cancel()                              // request cancellation

// Detached task — does NOT inherit context (priority, actor)
let detached = Task.detached(priority: .background) {
    await indexingJob()
}
```

Prefer structured tasks (`async let`, `TaskGroup`) over `Task { }` when possible. Use `Task { }` for fire-and-forget UI events.

## TaskGroup

For dynamic parallelism (unknown number of tasks):

```swift
func loadPostsForAll(users: [User]) async throws -> [Post] {
    try await withThrowingTaskGroup(of: Post.self) { group in
        for user in users {
            group.addTask { try await loadPosts(for: user.id) }
        }
        var results: [Post] = []
        for try await post in group {
            results.append(post)
        }
        return results
    }
}
```

Cancellation propagates: cancel group → cancel all children. Throwing one child cancels the rest.

## Actors

Reference type with serialized access — solves data races on mutable state.

```swift
actor BankAccount {
    private var balance: Decimal = 0

    func deposit(_ amount: Decimal) {
        balance += amount
    }

    func withdraw(_ amount: Decimal) throws -> Decimal {
        guard balance >= amount else { throw WalletError.insufficientFunds(amount) }
        balance -= amount
        return amount
    }

    var current: Decimal { balance }
}

// Call site — implicit await
let account = BankAccount()
await account.deposit(100)
let bal = await account.current
```

All actor method calls from outside are `async` (cross-actor hop). Reads of `let` properties don't need `await`.

## MainActor

UI updates must run on main thread. Mark types or methods with `@MainActor`:

```swift
@MainActor
final class HomeViewModel: ObservableObject {
    @Published var state: UiState = .loading

    func load() async {
        state = .loading                        // safe — already on main
        do {
            let user = try await fetchUser()    // fetchUser may hop off main
            state = .loaded(user)               // back on main automatically
        } catch {
            state = .error(error)
        }
    }
}

// Hop manually
await MainActor.run {
    label.text = "loaded"
}
```

`@MainActor` on a class means all its mutable state and methods are isolated to main. Compiler enforces.

## Sendable

Types passed across actor boundaries must be `Sendable` (thread-safe).

```swift
struct UserDTO: Sendable {
    let id: Int
    let name: String
}

// Compile error in Swift 6 strict mode:
class MutableBag { var items: [String] = [] }   // not Sendable

// Final class with let-only fields → can be Sendable
final class ImmutableConfig: Sendable {
    let host: String
    let port: Int
    init(host: String, port: Int) { self.host = host; self.port = port }
}

// Mark class @unchecked Sendable when YOU guarantee thread-safety (e.g., wraps lock)
final class LockedCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var n = 0
    func increment() { lock.lock(); defer { lock.unlock() }; n += 1 }
}
```

Standard rules:
- `struct`/`enum` with all-`Sendable` stored properties → auto-Sendable
- `actor` is implicitly Sendable
- `final class` with only `let` Sendable properties → can be Sendable
- Closures crossing actors must be `@Sendable`

## Sendable Closures

```swift
// @Sendable closure — captures must be Sendable, no mutable references
func runInBackground(_ work: @Sendable @escaping () async -> Void) {
    Task.detached { await work() }
}

runInBackground { [user] in       // capture immutable copy
    await process(user)
}
```

## AsyncSequence / AsyncStream

```swift
// Custom AsyncSequence
func ticker(every interval: Duration) -> AsyncStream<Int> {
    AsyncStream { continuation in
        let task = Task {
            var i = 0
            while !Task.isCancelled {
                continuation.yield(i)
                i += 1
                try? await Task.sleep(for: interval)
            }
            continuation.finish()
        }
        continuation.onTermination = { _ in task.cancel() }
    }
}

// Consume
for await tick in ticker(every: .seconds(1)) {
    print(tick)
    if tick > 5 { break }      // breaking cancels the source
}
```

`AsyncStream` is the bridge from callback-based APIs (delegates, NotificationCenter) to async/await world. Replaces most Combine usage in new code.

## Continuations (Bridge Callbacks)

```swift
func loadLegacy() async throws -> Data {
    try await withCheckedThrowingContinuation { continuation in
        legacyAPI.load { result in
            switch result {
            case .success(let data): continuation.resume(returning: data)
            case .failure(let error): continuation.resume(throwing: error)
            }
        }
    }
}
```

**Critical**: must call `resume` exactly once. Multiple resumes crash. Zero resumes leak.

Use `withCheckedContinuation` (debug overhead) during development; switch to `withUnsafeContinuation` only when profiling shows it matters.

## Cancellation

```swift
func process(items: [Item]) async throws {
    for item in items {
        try Task.checkCancellation()       // throws if cancelled
        try await heavyWork(item)
    }
}

// Cooperative
let task = Task {
    while !Task.isCancelled {
        try await tick()
    }
}

task.cancel()                              // cooperative — task must check
```

URLSession, Task.sleep, and most stdlib async APIs check cancellation automatically.

## Common Patterns

### Debounce in AsyncSequence

```swift
extension AsyncSequence {
    func debounce(for duration: Duration) -> AsyncStream<Element> {
        AsyncStream { continuation in
            Task {
                var task: Task<Void, Never>?
                do {
                    for try await value in self {
                        task?.cancel()
                        task = Task {
                            try? await Task.sleep(for: duration)
                            if !Task.isCancelled { continuation.yield(value) }
                        }
                    }
                } catch { }
                continuation.finish()
            }
        }
    }
}
```

### Timeout

```swift
func withTimeout<T>(
    _ duration: Duration,
    operation: @escaping @Sendable () async throws -> T
) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
        group.addTask { try await operation() }
        group.addTask {
            try await Task.sleep(for: duration)
            throw TimeoutError()
        }
        let result = try await group.next()!
        group.cancelAll()
        return result
    }
}

let user = try await withTimeout(.seconds(5)) {
    try await fetchUser(id: 1)
}
```

## Pitfalls

| Pitfall | Fix |
|---|---|
| Forgetting `await` on actor call | Compiler error in Swift 6 |
| Using `DispatchQueue.main.async` from `async` code | Use `@MainActor` or `MainActor.run { }` |
| Capturing `self` in `Task` (retain cycle risk) | `[weak self]` for long-running tasks |
| Calling `Task { }` inside `for` loop without awaiting | Use `TaskGroup` |
| Using `Combine` for new async work | Prefer `AsyncSequence`/`AsyncStream` |
| `Task.detached` everywhere | Loses priority/actor inheritance — use `Task { }` |
| Resuming continuation twice | Crash; use `withCheckedContinuation` to catch |
| `@MainActor` everywhere | Defeats parallelism — only on UI/state types |

## Swift 6 Migration Checklist

- [ ] Enable strict concurrency: `.enableUpcomingFeature("StrictConcurrency")` in Package.swift
- [ ] Mark UI types `@MainActor`
- [ ] Mark DTOs `Sendable`
- [ ] Replace shared mutable state with `actor`
- [ ] Replace `DispatchQueue` with `Task` / `MainActor.run`
- [ ] Replace `Combine` pipelines with `AsyncSequence` where possible
- [ ] Audit `@unchecked Sendable` — must guarantee thread safety
