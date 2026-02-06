---
name: rust-testing
description: |
  Rust testing with cargo test, tokio-test, and mockall. Covers unit tests,
  integration tests, async testing, mocking, and benchmarks.

  USE WHEN: user mentions "rust test", "cargo test", "mockall", asks about "#[test]", "#[tokio::test]", "proptest", "criterion", "async rust testing"

  DO NOT USE FOR: JavaScript/TypeScript - use `vitest` or `jest`; Java - use `junit`; Python - use `pytest`; Go - use `go-testing`; E2E browser tests - use Playwright
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# Rust Testing Core Knowledge

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `rust` for comprehensive documentation.

> **Full Reference**: See [advanced.md](advanced.md) for HTTP Testing with wiremock, Property-Based Testing with proptest, Benchmarks with criterion, and Test Coverage with cargo-tarpaulin.

## When NOT to Use This Skill

- **JavaScript/TypeScript Projects** - Use `vitest` or `jest`
- **Java Projects** - Use `junit` for Java testing
- **Python Projects** - Use `pytest` for Python
- **Go Projects** - Use `go-testing` skill
- **E2E Browser Testing** - Use Playwright or Selenium

## Basic Testing

### Unit Tests

```rust
// src/lib.rs
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

pub fn divide(a: f64, b: f64) -> Option<f64> {
    if b == 0.0 {
        None
    } else {
        Some(a / b)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add() {
        assert_eq!(add(2, 3), 5);
    }

    #[test]
    fn test_divide() {
        assert_eq!(divide(10.0, 2.0), Some(5.0));
    }

    #[test]
    fn test_divide_by_zero() {
        assert_eq!(divide(10.0, 0.0), None);
    }
}
```

### Running Tests

```bash
# Run all tests
cargo test

# Run specific test
cargo test test_add

# Run tests in specific module
cargo test tests::

# Run tests with output
cargo test -- --nocapture

# Run tests sequentially
cargo test -- --test-threads=1

# Run ignored tests
cargo test -- --ignored
```

### Assertions

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_assertions() {
        // Equality
        assert_eq!(2 + 2, 4);
        assert_ne!(2 + 2, 5);

        // Boolean
        assert!(true);
        assert!(!false);

        // Custom message
        assert!(1 + 1 == 2, "Math is broken!");
        assert_eq!(2 + 2, 4, "Expected {} but got {}", 4, 2 + 2);
    }

    #[test]
    fn test_floating_point() {
        let result = 0.1 + 0.2;
        let expected = 0.3;

        // Approximate comparison for floats
        assert!((result - expected).abs() < 1e-10);
    }
}
```

### Expected Panics

```rust
pub fn divide_or_panic(a: i32, b: i32) -> i32 {
    if b == 0 {
        panic!("Cannot divide by zero!");
    }
    a / b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[should_panic]
    fn test_panic() {
        divide_or_panic(10, 0);
    }

    #[test]
    #[should_panic(expected = "Cannot divide by zero")]
    fn test_panic_message() {
        divide_or_panic(10, 0);
    }
}
```

### Result-Based Tests

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_with_result() -> Result<(), String> {
        if 2 + 2 == 4 {
            Ok(())
        } else {
            Err("Math failed".to_string())
        }
    }
}
```

### Ignored Tests

```rust
#[test]
#[ignore]
fn expensive_test() {
    // Long running test
    std::thread::sleep(std::time::Duration::from_secs(60));
}

#[test]
#[ignore = "requires database connection"]
fn test_database() {
    // Test that requires external resources
}
```

## Integration Tests

```rust
// tests/integration_test.rs
use my_crate::{add, divide};

#[test]
fn test_add_integration() {
    assert_eq!(add(100, 200), 300);
}

// tests/common/mod.rs - Shared test utilities
pub fn setup() {
    // Setup code
}

// tests/another_test.rs
mod common;

#[test]
fn test_with_setup() {
    common::setup();
    // Test code
}
```

## Async Testing

### Tokio Test

```toml
# Cargo.toml
[dev-dependencies]
tokio = { version = "1", features = ["full", "test-util"] }
```

```rust
use tokio::time::{sleep, Duration};

async fn async_add(a: i32, b: i32) -> i32 {
    sleep(Duration::from_millis(10)).await;
    a + b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_async_add() {
        let result = async_add(2, 3).await;
        assert_eq!(result, 5);
    }

    #[tokio::test]
    async fn test_multiple_async() {
        let (a, b) = tokio::join!(
            async_add(1, 2),
            async_add(3, 4)
        );
        assert_eq!(a, 3);
        assert_eq!(b, 7);
    }
}
```

### Testing with Time

```rust
use tokio::time::{self, Duration, Instant};

async fn delayed_operation() -> &'static str {
    time::sleep(Duration::from_secs(10)).await;
    "done"
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{pause, advance};

    #[tokio::test]
    async fn test_with_time_control() {
        pause(); // Pause time

        let start = Instant::now();
        let future = delayed_operation();

        // Advance time instantly
        advance(Duration::from_secs(10)).await;

        let result = future.await;
        assert_eq!(result, "done");

        // Very little real time has passed
        assert!(start.elapsed() < Duration::from_secs(1));
    }
}
```

## Mocking with mockall

```toml
# Cargo.toml
[dev-dependencies]
mockall = "0.12"
```

### Basic Mocking

```rust
use mockall::{automock, predicate::*};

#[automock]
trait Database {
    fn get(&self, key: &str) -> Option<String>;
    fn set(&mut self, key: &str, value: &str) -> bool;
}

struct Service<D: Database> {
    db: D,
}

impl<D: Database> Service<D> {
    fn new(db: D) -> Self {
        Self { db }
    }

    fn get_value(&self, key: &str) -> String {
        self.db.get(key).unwrap_or_else(|| "default".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_value_exists() {
        let mut mock = MockDatabase::new();
        mock.expect_get()
            .with(eq("key1"))
            .times(1)
            .returning(|_| Some("value1".to_string()));

        let service = Service::new(mock);
        assert_eq!(service.get_value("key1"), "value1");
    }

    #[test]
    fn test_get_value_missing() {
        let mut mock = MockDatabase::new();
        mock.expect_get()
            .with(eq("missing"))
            .times(1)
            .returning(|_| None);

        let service = Service::new(mock);
        assert_eq!(service.get_value("missing"), "default");
    }
}
```

### Mock Expectations

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use mockall::Sequence;

    #[test]
    fn test_call_count() {
        let mut mock = MockDatabase::new();
        mock.expect_get()
            .times(3)  // Exactly 3 times
            .returning(|_| Some("value".to_string()));

        let service = Service::new(mock);
        service.get_value("a");
        service.get_value("b");
        service.get_value("c");
    }

    #[test]
    fn test_call_sequence() {
        let mut seq = Sequence::new();
        let mut mock = MockDatabase::new();

        mock.expect_get()
            .with(eq("first"))
            .times(1)
            .in_sequence(&mut seq)
            .returning(|_| Some("1".to_string()));

        mock.expect_get()
            .with(eq("second"))
            .times(1)
            .in_sequence(&mut seq)
            .returning(|_| Some("2".to_string()));

        let service = Service::new(mock);
        assert_eq!(service.get_value("first"), "1");
        assert_eq!(service.get_value("second"), "2");
    }
}
```

### Async Mock

```rust
use mockall::{automock, predicate::*};
use async_trait::async_trait;

#[async_trait]
#[automock]
trait AsyncDatabase {
    async fn get(&self, key: &str) -> Option<String>;
    async fn set(&self, key: &str, value: &str) -> bool;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_async_mock() {
        let mut mock = MockAsyncDatabase::new();
        mock.expect_get()
            .with(eq("key"))
            .times(1)
            .returning(|_| Some("value".to_string()));

        let result = mock.get("key").await;
        assert_eq!(result, Some("value".to_string()));
    }
}
```

## Checklist

- [ ] Unit tests for all public functions
- [ ] Integration tests for module interactions
- [ ] Async tests with tokio-test
- [ ] Mock external dependencies
- [ ] Property-based tests for algorithms
- [ ] Benchmarks for performance-critical code
- [ ] Coverage reporting
- [ ] CI integration

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Testing private functions | Coupled to implementation | Test through public API |
| Not using #[should_panic] | Missing error validation | Test expected panics explicitly |
| Shared mutable state in tests | Flaky tests | Use test isolation |
| Not using Result<()> in tests | Can't use ? operator | Return Result<(), Error> |
| Ignoring async tests | Wrong runtime behavior | Use #[tokio::test] for async |
| Not benchmarking | Performance regressions | Use Criterion for benchmarks |
| Missing property tests | Edge cases missed | Use proptest for algorithms |

## Quick Troubleshooting

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| "test result: FAILED. 0 passed" | Panic in test | Check panic message, add proper assertions |
| Async test timeout | Missing await or infinite loop | Ensure all futures are awaited |
| Mock expectation failed | Wrong method calls | Verify mockall expectations |
| "cannot find derive macro" | Missing dev-dependency | Add mockall to [dev-dependencies] |
| Benchmark not running | Wrong harness setting | Set harness = false in [[bench]] |
| Coverage tool crashes | Incompatible version | Use cargo-tarpaulin or llvm-cov |

## Reference Documentation

- [Unit Tests](quick-ref/unit-tests.md)
- [Async Testing](quick-ref/async-testing.md)
- [Mocking](quick-ref/mocking.md)
- [Advanced Patterns](advanced.md)
