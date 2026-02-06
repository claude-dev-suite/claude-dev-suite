---
name: rust
description: |
  Rust systems programming language. Covers ownership, borrowing, lifetimes,
  async/await, error handling, and Cargo. Use for high-performance backend systems.

  USE WHEN: user mentions "rust", "ownership", "borrowing", "lifetimes", asks about
  "borrow checker", "cargo", "traits", "Result type", "async rust", "tokio"

  DO NOT USE FOR: Actix/Axum/Rocket frameworks - use framework-specific skills
  DO NOT USE FOR: WASM - use WebAssembly-specific skill
  DO NOT USE FOR: Tauri - use `tauri` skill instead
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Rust Core Knowledge

> **Full Reference**: See [advanced.md](advanced.md) for builder pattern, advanced traits, async patterns (join!/select!/spawn), custom errors with thiserror, and production configuration.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `rust` for comprehensive documentation.

## Ownership System

Rust's memory safety is guaranteed through its ownership system without a garbage collector.

### The Three Ownership Rules

1. Each value in Rust has an owner
2. There can only be one owner at a time
3. When the owner goes out of scope, the value will be dropped

### Move Semantics (Heap Data)

```rust
fn main() {
    let s1 = String::from("hello");
    let s2 = s1;  // s1 is MOVED to s2

    // println!("{s1}");  // ERROR: s1 is no longer valid
    println!("{s2}");     // OK: s2 owns the data
}
```

### Copy Semantics (Stack Data)

```rust
fn main() {
    let x = 5;
    let y = x;  // x is COPIED (not moved)

    println!("x = {x}, y = {y}");  // Both valid
}
```

Types implementing `Copy` trait:
- All integer types (`u32`, `i64`, etc.)
- Boolean (`bool`)
- Floating-point types (`f64`)
- Character (`char`)
- Tuples of Copy types

### Clone for Deep Copying

```rust
fn main() {
    let s1 = String::from("hello");
    let s2 = s1.clone();  // Explicit deep copy

    println!("s1 = {s1}, s2 = {s2}");  // Both valid
}
```

## Borrowing and References

### Immutable References

```rust
fn main() {
    let s1 = String::from("hello");
    let len = calculate_length(&s1);  // Borrow s1
    println!("Length of '{s1}' is {len}");  // s1 still valid
}

fn calculate_length(s: &String) -> usize {
    s.len()
}  // s goes out of scope but doesn't drop data (just a reference)
```

### Mutable References

```rust
fn main() {
    let mut s = String::from("hello");
    change(&mut s);
    println!("{s}");  // Prints "hello, world"
}

fn change(s: &mut String) {
    s.push_str(", world");
}
```

### Borrowing Rules

1. You can have either:
   - One mutable reference, OR
   - Any number of immutable references
2. References must always be valid (no dangling references)

```rust
fn main() {
    let mut s = String::from("hello");

    let r1 = &s;      // OK: first immutable borrow
    let r2 = &s;      // OK: second immutable borrow
    println!("{r1} and {r2}");
    // r1 and r2 no longer used after this point

    let r3 = &mut s;  // OK: mutable borrow (after immutables are done)
    println!("{r3}");
}
```

## Lifetimes

Lifetimes ensure references are valid for as long as they're used.

### Lifetime Annotations

```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}

fn main() {
    let string1 = String::from("long string");
    let result;
    {
        let string2 = String::from("xyz");
        result = longest(string1.as_str(), string2.as_str());
        println!("Longest: {result}");  // Must use result here
    }
    // Can't use result here - string2 dropped
}
```

### Lifetime Elision Rules

The compiler applies these rules automatically:
1. Each input reference gets its own lifetime
2. If exactly one input lifetime, output gets that lifetime
3. If `&self` or `&mut self`, output gets `self`'s lifetime

### Static Lifetime

```rust
let s: &'static str = "I live forever";
```

## Error Handling

### Result Type

```rust
use std::fs::File;
use std::io::{self, Read};

fn read_username_from_file() -> Result<String, io::Error> {
    let mut file = File::open("hello.txt")?;  // ? propagates errors
    let mut username = String::new();
    file.read_to_string(&mut username)?;
    Ok(username)
}

// Even shorter with fs::read_to_string
fn read_username_shortest() -> Result<String, io::Error> {
    std::fs::read_to_string("hello.txt")
}
```

### Option Type

```rust
fn find_user(id: u32) -> Option<User> {
    users.iter().find(|u| u.id == id).cloned()
}

// Using Option
match find_user(42) {
    Some(user) => println!("Found: {}", user.name),
    None => println!("User not found"),
}

// Combinators
let name = find_user(42)
    .map(|u| u.name)
    .unwrap_or_else(|| "Anonymous".to_string());
```

## Async/Await

### Basic Async Function

```rust
async fn fetch_data(url: &str) -> Result<String, reqwest::Error> {
    let response = reqwest::get(url).await?;
    let body = response.text().await?;
    Ok(body)
}

#[tokio::main]
async fn main() {
    match fetch_data("https://api.example.com").await {
        Ok(data) => println!("Got: {data}"),
        Err(e) => eprintln!("Error: {e}"),
    }
}
```

## Structs and Implementations

### Struct Definition

```rust
#[derive(Debug, Clone)]
pub struct User {
    pub id: u64,
    pub name: String,
    pub email: String,
    active: bool,  // private field
}

impl User {
    // Associated function (constructor)
    pub fn new(id: u64, name: String, email: String) -> Self {
        Self {
            id,
            name,
            email,
            active: true,
        }
    }

    // Method with immutable borrow
    pub fn is_active(&self) -> bool {
        self.active
    }

    // Method with mutable borrow
    pub fn deactivate(&mut self) {
        self.active = false;
    }
}
```

## Traits

### Trait Definition and Implementation

```rust
pub trait Summary {
    fn summarize(&self) -> String;

    // Default implementation
    fn summarize_author(&self) -> String {
        String::from("Unknown author")
    }
}

impl Summary for Article {
    fn summarize(&self) -> String {
        format!("{}, by {}", self.headline, self.author)
    }
}
```

### Common Derive Traits

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
pub struct Config {
    pub host: String,
    pub port: u16,
}
```

## Cargo Essentials

### Project Structure

```
my_project/
├── Cargo.toml
├── Cargo.lock
├── src/
│   ├── main.rs      # Binary entry point
│   ├── lib.rs       # Library root
│   └── module/      # Module directory
│       └── mod.rs
├── tests/           # Integration tests
├── benches/         # Benchmarks
└── examples/        # Example programs
```

### Cargo.toml

```toml
[package]
name = "my_project"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio = { version = "1.0", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
thiserror = "1.0"

[dev-dependencies]
tokio-test = "0.4"

[profile.release]
opt-level = 3
lto = true
```

### Common Commands

```bash
cargo new my_project      # Create new project
cargo build               # Build debug
cargo build --release     # Build optimized
cargo run                 # Build and run
cargo test                # Run tests
cargo doc --open          # Generate docs
cargo clippy              # Lint code
cargo fmt                 # Format code
cargo check               # Fast type checking
```

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Actix/Axum framework specifics | Framework-specific skills |
| Tauri desktop apps | `tauri` skill |
| WebAssembly compilation | WASM-specific skill |
| Diesel ORM | ORM-specific skill |
| Rocket web framework | Framework-specific skill |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| `.clone()` everywhere | Unnecessary allocations | Use references or Arc |
| `.unwrap()` in production | Panics on error | Use proper error handling |
| Large `match` statements | Hard to maintain | Use methods or polymorphism |
| Ignoring Clippy warnings | Misses best practices | Fix all warnings |
| Not using `?` operator | Verbose error handling | Use ? for propagation |
| Mutex for everything | Lock contention | Use channels or RwLock |
| Blocking in async | Blocks executor | Use spawn_blocking |
| Manual memory management | Defeats ownership | Trust the compiler |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "cannot borrow as mutable" | Multiple borrows | Drop immutable refs first |
| "move occurs because X has type Y" | Ownership moved | Clone or use references |
| "lifetime may not live long enough" | Lifetime mismatch | Add lifetime annotations |
| "trait X is not implemented" | Missing trait impl | Implement trait or derive |
| "cannot return reference to local" | Dangling reference | Return owned value |
| "cyclic dependency detected" | Circular deps | Refactor dependency tree |
| Slow compilation | Too many dependencies | Use cargo workspaces |
| Memory leak with Arc | Circular references | Use Weak references |

## Reference Documentation

- [Ownership](quick-ref/ownership.md)
- [Async Patterns](quick-ref/async.md)
- [Error Handling](quick-ref/errors.md)

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `rust` for comprehensive documentation.
