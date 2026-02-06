# Rust Testing Advanced Patterns

## HTTP Testing

```toml
# Cargo.toml
[dev-dependencies]
reqwest = { version = "0.11", features = ["json"] }
wiremock = "0.5"
```

```rust
use wiremock::{MockServer, Mock, ResponseTemplate};
use wiremock::matchers::{method, path, body_json};

#[tokio::test]
async fn test_http_client() {
    // Start mock server
    let mock_server = MockServer::start().await;

    // Setup mock response
    Mock::given(method("GET"))
        .and(path("/users/1"))
        .respond_with(ResponseTemplate::new(200)
            .set_body_json(serde_json::json!({
                "id": 1,
                "name": "Alice"
            })))
        .mount(&mock_server)
        .await;

    // Make request
    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/users/1", mock_server.uri()))
        .send()
        .await
        .unwrap();

    assert_eq!(response.status(), 200);

    let user: serde_json::Value = response.json().await.unwrap();
    assert_eq!(user["name"], "Alice");
}

#[tokio::test]
async fn test_http_post() {
    let mock_server = MockServer::start().await;

    Mock::given(method("POST"))
        .and(path("/users"))
        .and(body_json(serde_json::json!({ "name": "Bob" })))
        .respond_with(ResponseTemplate::new(201)
            .set_body_json(serde_json::json!({
                "id": 2,
                "name": "Bob"
            })))
        .mount(&mock_server)
        .await;

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/users", mock_server.uri()))
        .json(&serde_json::json!({ "name": "Bob" }))
        .send()
        .await
        .unwrap();

    assert_eq!(response.status(), 201);
}
```

---

## Property-Based Testing

```toml
# Cargo.toml
[dev-dependencies]
proptest = "1"
```

```rust
use proptest::prelude::*;

fn reverse<T: Clone>(vec: &[T]) -> Vec<T> {
    vec.iter().rev().cloned().collect()
}

proptest! {
    #[test]
    fn test_reverse_twice_is_identity(vec in prop::collection::vec(any::<i32>(), 0..100)) {
        let reversed_twice = reverse(&reverse(&vec));
        prop_assert_eq!(vec, reversed_twice);
    }

    #[test]
    fn test_reverse_length(vec in prop::collection::vec(any::<i32>(), 0..100)) {
        prop_assert_eq!(vec.len(), reverse(&vec).len());
    }

    #[test]
    fn test_add_commutative(a in any::<i32>(), b in any::<i32>()) {
        // Using wrapping_add to avoid overflow
        prop_assert_eq!(a.wrapping_add(b), b.wrapping_add(a));
    }
}
```

---

## Benchmarks

```toml
# Cargo.toml
[dev-dependencies]
criterion = { version = "0.5", features = ["html_reports"] }

[[bench]]
name = "my_benchmark"
harness = false
```

```rust
// benches/my_benchmark.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn fibonacci(n: u64) -> u64 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci(n - 1) + fibonacci(n - 2),
    }
}

fn fibonacci_iter(n: u64) -> u64 {
    let mut a = 0;
    let mut b = 1;
    for _ in 0..n {
        let tmp = a;
        a = b;
        b = tmp + b;
    }
    a
}

fn criterion_benchmark(c: &mut Criterion) {
    c.bench_function("fib 20", |b| {
        b.iter(|| fibonacci(black_box(20)))
    });

    c.bench_function("fib_iter 20", |b| {
        b.iter(|| fibonacci_iter(black_box(20)))
    });

    let mut group = c.benchmark_group("fibonacci");
    for n in [10, 20, 30].iter() {
        group.bench_with_input(
            format!("recursive_{}", n),
            n,
            |b, n| b.iter(|| fibonacci(black_box(*n))),
        );
        group.bench_with_input(
            format!("iterative_{}", n),
            n,
            |b, n| b.iter(|| fibonacci_iter(black_box(*n))),
        );
    }
    group.finish();
}

criterion_group!(benches, criterion_benchmark);
criterion_main!(benches);
```

```bash
# Run benchmarks
cargo bench

# Run specific benchmark
cargo bench fib
```

---

## Test Coverage

```bash
# Install cargo-tarpaulin
cargo install cargo-tarpaulin

# Generate coverage report
cargo tarpaulin

# Generate HTML report
cargo tarpaulin --out Html

# Exclude patterns
cargo tarpaulin --exclude-files "tests/*"
```

---

## Test Organization

### Test Modules

```rust
// src/lib.rs
pub mod user;
pub mod order;

// src/user.rs
pub struct User {
    pub id: u64,
    pub name: String,
}

impl User {
    pub fn new(id: u64, name: &str) -> Self {
        Self { id, name: name.to_string() }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_creation() {
        let user = User::new(1, "Alice");
        assert_eq!(user.id, 1);
        assert_eq!(user.name, "Alice");
    }
}
```

### Test Fixtures

```rust
struct TestContext {
    db: MockDatabase,
    config: Config,
}

impl TestContext {
    fn new() -> Self {
        Self {
            db: MockDatabase::new(),
            config: Config::default(),
        }
    }

    fn with_user(&mut self, id: &str, name: &str) -> &mut Self {
        self.db.expect_get()
            .with(eq(id.to_string()))
            .returning(move |_| Some(name.to_string()));
        self
    }
}

#[test]
fn test_with_fixture() {
    let mut ctx = TestContext::new();
    ctx.with_user("1", "Alice");

    // Use ctx.db in tests
}
```

---

## Integration Tests

```rust
// tests/integration_test.rs
use my_crate::{add, divide};

#[test]
fn test_add_integration() {
    assert_eq!(add(100, 200), 300);
}

#[test]
fn test_divide_integration() {
    assert_eq!(divide(100.0, 4.0), Some(25.0));
}

// tests/common/mod.rs - Shared test utilities
pub fn setup() {
    // Setup code
}

pub fn teardown() {
    // Cleanup code
}

// tests/another_test.rs
mod common;

#[test]
fn test_with_setup() {
    common::setup();
    // Test code
    common::teardown();
}
```
