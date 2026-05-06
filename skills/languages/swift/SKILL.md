---
name: swift
description: |
  Swift language fundamentals (5.10+ / 6.x). Covers optionals, value vs reference
  semantics, protocols & generics, Swift Concurrency (async/await, actors,
  Sendable, structured tasks), Result Builders, and Apple platform interop.

  USE WHEN: user mentions "Swift", "SwiftUI", "async/await Swift", "actor",
  "Sendable", "Codable", "Combine", "Result Builder", "Apple Keychain",
  "Secure Enclave", "iOS native"

  DO NOT USE FOR: SwiftUI screen layouts in depth - use SwiftUI-specific skill if exists
  DO NOT USE FOR: Compose iOS via Skia - use `frontend-frameworks/compose-multiplatform`
  DO NOT USE FOR: Kotlin/Native ↔ Swift bridging - use `languages/uniffi`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Swift Core Knowledge

> **References**: [concurrency.md](quick-ref/concurrency.md) for async/await, actors, Sendable, structured tasks. [interop.md](quick-ref/interop.md) for ObjC, C, and Rust (cinterop) bridging, Keychain, Secure Enclave.
>
> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `swift`.

## Optionals

```swift
var name: String = "Alice"           // Non-optional
var maybe: String? = nil             // Optional (sugar for Optional<String>)

// Force-unwrap (avoid)
let n = maybe!                       // Crash if nil

// Optional binding
if let n = maybe {
    print("got \(n)")
}

// Guard (early exit)
func greet(_ name: String?) {
    guard let name else { return }
    print("Hello, \(name)")
}

// Nil coalescing
let display = maybe ?? "Anonymous"

// Optional chaining
let len = maybe?.count               // Int?
```

Use `guard let name else { ... }` (Swift 5.7+) — implicit shadow shorter than `guard let name = name else`.

## Value vs Reference Types

| Kind | Semantics | Allocation | Use for |
|---|---|---|---|
| `struct` | Value (copied on assign/pass) | Stack (usually) | Models, lightweight data, thread-safe by default |
| `enum` | Value | Stack | Discriminated unions, sealed states |
| `class` | Reference (shared identity) | Heap | Identity, inheritance, ObjC interop |
| `actor` | Reference + isolated | Heap | Mutable state across concurrency |

```swift
struct Point { var x: Double; var y: Double }
var a = Point(x: 1, y: 2)
var b = a            // copy
b.x = 10
// a.x still 1, b.x is 10

class Node { var value: Int = 0 }
let n1 = Node()
let n2 = n1          // same instance
n2.value = 42        // n1.value also 42
```

Default to `struct`. Use `class` only for identity, mutable shared state, or ObjC inheritance.

## Enums with Associated Values

```swift
enum NetworkResult<Success> {
    case success(Success)
    case failure(NetworkError)
    case loading
}

enum NetworkError: Error {
    case unauthorized
    case server(code: Int, body: String)
    case timeout(after: TimeInterval)
}

func handle<T>(_ result: NetworkResult<T>) -> String {
    switch result {
    case .success(let value):
        return "ok: \(value)"
    case .failure(.unauthorized):
        return "login"
    case .failure(.server(let code, _)):
        return "server \(code)"
    case .failure(.timeout(let t)):
        return "timeout \(t)"
    case .loading:
        return "loading"
    }
}
```

`switch` is exhaustive — no `default` needed when all cases covered. Compiler enforces.

## Protocols & Generics

```swift
protocol Identifiable {
    associatedtype ID: Hashable
    var id: ID { get }
}

struct User: Identifiable {
    let id: Int
    let name: String
}

// Protocol-oriented design
protocol Drawable { func draw() }

extension Drawable where Self: Identifiable, Self.ID == Int {
    func describe() -> String { "drawable id=\(id)" }
}

// Generic constraints
func first<C: Collection>(_ c: C) -> C.Element? where C.Element: Equatable {
    c.first
}

// Existential ('any') vs opaque ('some')
func makeShape() -> some Drawable { Circle() }     // concrete type, hidden
func loadShapes() -> [any Drawable] { [Circle(), Square()] }  // heterogeneous
```

Prefer `some` over `any` — opaque types preserve type identity for the compiler (no boxing). Use `any` only when truly heterogeneous.

## Codable

```swift
struct User: Codable {
    let id: Int
    let name: String
    let email: String?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, name, email
        case createdAt = "created_at"
    }
}

let decoder = JSONDecoder()
decoder.dateDecodingStrategy = .iso8601
decoder.keyDecodingStrategy = .convertFromSnakeCase  // alternative to CodingKeys

let user = try decoder.decode(User.self, from: jsonData)

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
let data = try encoder.encode(user)
```

For BHODL-style FFI, prefer Codable for IPC payloads and `JSONEncoder/Decoder` over manual parsing.

## Error Handling

```swift
enum WalletError: Error {
    case insufficientFunds(Amount)
    case invalidAddress(String)
}

func send(amount: Amount, to address: String) throws -> Transaction {
    guard isValid(address) else { throw WalletError.invalidAddress(address) }
    guard hasFunds(amount) else { throw WalletError.insufficientFunds(amount) }
    return buildTx(amount, address)
}

// Call site
do {
    let tx = try send(amount: 1000, to: "bc1q...")
    print(tx)
} catch WalletError.insufficientFunds(let need) {
    print("need \(need)")
} catch {
    print("other error: \(error)")
}

// try? returns optional, try! force-unwraps (avoid)
let tx = try? send(amount: 1000, to: address)
```

## Result Builders (DSLs)

Power SwiftUI's `body` and many Apple DSLs.

```swift
@resultBuilder
struct StringBuilder {
    static func buildBlock(_ components: String...) -> String {
        components.joined(separator: "\n")
    }
    static func buildEither(first: String) -> String { first }
    static func buildEither(second: String) -> String { second }
}

@StringBuilder
func greeting(name: String, formal: Bool) -> String {
    "Hello"
    if formal { "Mr/Ms \(name)" } else { name }
    "Welcome"
}
```

## Property Wrappers

```swift
@propertyWrapper
struct Clamped<Value: Comparable> {
    var value: Value
    let range: ClosedRange<Value>

    init(wrappedValue: Value, _ range: ClosedRange<Value>) {
        self.range = range
        self.value = min(max(wrappedValue, range.lowerBound), range.upperBound)
    }

    var wrappedValue: Value {
        get { value }
        set { value = min(max(newValue, range.lowerBound), range.upperBound) }
    }
}

struct Volume {
    @Clamped(0...100) var level: Int = 50
}
```

Common in SwiftUI (`@State`, `@Binding`, `@StateObject`, `@Environment`, `@AppStorage`).

## Memory Management

ARC (Automatic Reference Counting). Watch for retain cycles.

```swift
class Node {
    var children: [Node] = []
    weak var parent: Node?           // weak breaks cycle
}

class ViewModel {
    private var task: Task<Void, Never>?

    func start() {
        task = Task { [weak self] in
            guard let self else { return }
            await self.load()
        }
    }
}
```

`weak` → optional, becomes nil when target deallocs. `unowned` → non-optional, crash on access if dealloc'd. Prefer `weak` unless lifetime guaranteed.

## Concurrency — Essentials

```swift
func fetchUser(id: Int) async throws -> User {
    let (data, _) = try await URLSession.shared.data(from: url(id))
    return try JSONDecoder().decode(User.self, from: data)
}

// Parallel
async let user = fetchUser(id: 1)
async let posts = fetchPosts(userId: 1)
let result = try await (user, posts)

// Sequential
let user = try await fetchUser(id: 1)
let posts = try await fetchPosts(userId: user.id)
```

See [concurrency.md](quick-ref/concurrency.md) for actors, Sendable, TaskGroup, AsyncStream, MainActor.

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| Force-unwrap `!` everywhere | Crash on nil | `guard let`, `if let`, `??` |
| `class` for value-like types | Surprising aliasing | Use `struct` |
| `Combine` for new code (post-Swift Concurrency) | Apple steering toward async/await | Prefer `AsyncSequence`/`AsyncStream` |
| `DispatchQueue.main.async` from async code | Use `@MainActor` | `MainActor.run { ... }` or annotate function |
| `weak var` everywhere | Hides ownership intent | Only break actual cycles |
| `try!` outside tests | Crash on error | `try?` or proper `do/catch` |
| String-based KVO/selectors | No type safety | Use `KeyPath`, `Combine`, async sequences |
| `print` for production logging | No filter, no privacy | Use `os.Logger` (`import os`) |

## Build & Tooling

```swift
// Package.swift (Swift Package Manager)
// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "MyLib",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "MyLib", targets: ["MyLib"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-algorithms.git", from: "1.2.0"),
    ],
    targets: [
        .target(name: "MyLib", dependencies: [
            .product(name: "Algorithms", package: "swift-algorithms"),
        ]),
        .testTarget(name: "MyLibTests", dependencies: ["MyLib"]),
    ]
)
```

```bash
swift build                        # Build
swift test                         # Run XCTest
swift run                          # Run executable target
swift package update               # Update deps
xcodebuild -scheme MyApp test      # Xcode CI build
```

## Testing

```swift
// XCTest (legacy but widely used)
import XCTest
@testable import MyLib

final class UserTests: XCTestCase {
    func testValidEmail() {
        let u = User(id: 1, name: "x", email: "x@y.z")
        XCTAssertTrue(u.email.contains("@"))
    }

    func testAsync() async throws {
        let user = try await fetchUser(id: 1)
        XCTAssertEqual(user.id, 1)
    }
}

// Swift Testing (Swift 6+ — recommended for new code)
import Testing

@Suite struct UserTests {
    @Test func validEmail() {
        let u = User(id: 1, name: "x", email: "x@y.z")
        #expect(u.email.contains("@"))
    }

    @Test(arguments: [1, 2, 3])
    func userExists(id: Int) async throws {
        let user = try await fetchUser(id: id)
        #expect(user.id == id)
    }
}
```

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| KMP from Rust → Swift bindings | `languages/uniffi` |
| Compose Multiplatform iOS UI | `frontend-frameworks/compose-multiplatform` |
| iOS Keychain/Secure Enclave deep dive | [interop.md](quick-ref/interop.md) |
| SwiftUI screen-by-screen architecture | SwiftUI-specific skill (TBD) |
| ObjC migration | [interop.md](quick-ref/interop.md) |
