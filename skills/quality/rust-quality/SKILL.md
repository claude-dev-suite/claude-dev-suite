---
name: rust-quality
description: |
  Rust code quality with Clippy, rustfmt, and cargo tools.
  Covers linting, formatting, and idiomatic Rust patterns.

  USE WHEN: user works with "Rust", "Cargo", "Actix", "Axum", asks about "Clippy", "rustfmt", "Rust linting", "Rust best practices", "idiomatic Rust"

  DO NOT USE FOR: SonarQube - use `sonarqube` skill, security - use `rust-security` skill
allowed-tools: Read, Grep, Glob, Bash
---
# Rust Quality - Quick Reference

## When NOT to Use This Skill
- **SonarQube setup** - Use `sonarqube` skill
- **Security scanning** - Use `rust-security` skill

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `rust` for comprehensive documentation.

## Tool Overview

| Tool | Focus | Command |
|------|-------|---------|
| **rustfmt** | Formatting | `cargo fmt` |
| **Clippy** | Linting | `cargo clippy` |
| **rust-analyzer** | IDE analysis | LSP |
| **cargo-deny** | Dependency policy | `cargo deny` |
| **cargo-audit** | Security audit | `cargo audit` |

## Clippy Setup

### Run Clippy

```bash
# Basic check
cargo clippy

# Strict mode - deny all warnings
cargo clippy -- -D warnings

# With pedantic lints
cargo clippy -- -W clippy::pedantic

# Fix auto-fixable
cargo clippy --fix

# All targets (tests, benches, examples)
cargo clippy --all-targets --all-features
```

### clippy.toml

```toml
# Maximum cognitive complexity
cognitive-complexity-threshold = 15

# Maximum function length
too-many-lines-threshold = 50

# Maximum arguments
too-many-arguments-threshold = 5

# Allowed wildcard imports
allowed-wildcard-imports = ["crate::prelude::*"]
```

### Cargo.toml Lint Configuration

```toml
[lints.rust]
unsafe_code = "deny"
missing_docs = "warn"

[lints.clippy]
# Categories
pedantic = { level = "warn", priority = -1 }
nursery = { level = "warn", priority = -1 }

# Specific lints
unwrap_used = "warn"
expect_used = "warn"
panic = "warn"
todo = "warn"
dbg_macro = "warn"

# Allow specific pedantic lints
module_name_repetitions = "allow"
must_use_candidate = "allow"
```

### CI Configuration

```bash
# Strict CI check
cargo clippy --all-targets --all-features -- \
  -D warnings \
  -D clippy::pedantic \
  -D clippy::nursery \
  -A clippy::module_name_repetitions
```

## rustfmt Setup

### rustfmt.toml

```toml
edition = "2021"
max_width = 100
tab_spaces = 4
newline_style = "Unix"

# Imports
imports_granularity = "Module"
group_imports = "StdExternalCrate"
reorder_imports = true

# Items
reorder_modules = true
reorder_impl_items = true

# Formatting
use_small_heuristics = "Default"
fn_single_line = false
where_single_line = false
struct_lit_single_line = true

# Comments
comment_width = 100
wrap_comments = true
normalize_comments = true

# Macros
format_macro_matchers = true
format_macro_bodies = true
```

### Commands

```bash
# Format all
cargo fmt

# Check without changing
cargo fmt -- --check

# Format specific file
rustfmt src/main.rs
```

## Common Clippy Lints

### unwrap_used / expect_used

```rust
// BAD - Panics on None/Err
let value = some_option.unwrap();
let result = some_result.expect("should work");

// GOOD - Handle errors properly
let value = some_option.ok_or(MyError::NotFound)?;
let result = some_result.map_err(|e| MyError::from(e))?;

// GOOD - When panic is intentional (with justification)
let value = config.get("required_key")
    .expect("required_key must be set in configuration");
```

### clone_on_ref_ptr

```rust
// BAD - Cloning Arc/Rc unnecessarily
let clone = arc_value.clone();

// GOOD - Use Arc::clone for clarity
let clone = Arc::clone(&arc_value);
```

### needless_pass_by_value

```rust
// BAD - Takes ownership unnecessarily
fn process(data: String) {
    println!("{}", data);
}

// GOOD - Borrow instead
fn process(data: &str) {
    println!("{}", data);
}
```

### cognitive_complexity

```rust
// BAD - Too complex
fn process(data: &Data) -> Result<Output, Error> {
    if data.is_valid() {
        if data.type_a() {
            if data.has_value() {
                // deep nesting...
            }
        }
    }
    // ... more conditions
}

// GOOD - Extract and simplify
fn process(data: &Data) -> Result<Output, Error> {
    validate(data)?;

    match data.data_type() {
        DataType::A => process_type_a(data),
        DataType::B => process_type_b(data),
    }
}
```

### missing_errors_doc

```rust
// BAD - No error documentation
/// Processes the data.
pub fn process(data: &Data) -> Result<Output, Error> { ... }

// GOOD - Document errors
/// Processes the data.
///
/// # Errors
///
/// Returns `Error::InvalidData` if the data is malformed.
/// Returns `Error::NotFound` if the resource doesn't exist.
pub fn process(data: &Data) -> Result<Output, Error> { ... }
```

## Common Code Smells & Fixes

### 1. Stringly Typed Code

```rust
// BAD - Using strings for types
fn set_status(status: &str) {
    match status {
        "active" => { ... }
        "inactive" => { ... }
        _ => panic!("unknown status"),
    }
}

// GOOD - Use enums
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Active,
    Inactive,
}

fn set_status(status: Status) {
    match status {
        Status::Active => { ... }
        Status::Inactive => { ... }
    }
}
```

### 2. Error Handling

```rust
// BAD - Using unwrap in library code
pub fn parse_config(path: &Path) -> Config {
    let content = fs::read_to_string(path).unwrap();
    serde_json::from_str(&content).unwrap()
}

// GOOD - Proper error handling with thiserror
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("failed to read config file: {0}")]
    Io(#[from] std::io::Error),
    #[error("failed to parse config: {0}")]
    Parse(#[from] serde_json::Error),
}

pub fn parse_config(path: &Path) -> Result<Config, ConfigError> {
    let content = fs::read_to_string(path)?;
    let config = serde_json::from_str(&content)?;
    Ok(config)
}
```

### 3. Builder Pattern

```rust
// BAD - Constructor with many parameters
impl Server {
    pub fn new(
        host: String,
        port: u16,
        max_connections: usize,
        timeout: Duration,
        tls_config: Option<TlsConfig>,
    ) -> Self { ... }
}

// GOOD - Builder pattern
#[derive(Default)]
pub struct ServerBuilder {
    host: String,
    port: u16,
    max_connections: usize,
    timeout: Duration,
    tls_config: Option<TlsConfig>,
}

impl ServerBuilder {
    pub fn host(mut self, host: impl Into<String>) -> Self {
        self.host = host.into();
        self
    }

    pub fn port(mut self, port: u16) -> Self {
        self.port = port;
        self
    }

    pub fn build(self) -> Result<Server, BuildError> {
        // Validate and build
    }
}

// Usage
let server = Server::builder()
    .host("localhost")
    .port(8080)
    .build()?;
```

### 4. Newtype Pattern

```rust
// BAD - Primitive obsession
fn create_user(email: String, name: String, age: u32) { ... }

// GOOD - Newtypes for validation
#[derive(Debug, Clone)]
pub struct Email(String);

impl Email {
    pub fn new(value: impl Into<String>) -> Result<Self, ValidationError> {
        let value = value.into();
        if !value.contains('@') {
            return Err(ValidationError::InvalidEmail);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

fn create_user(email: Email, name: Name, age: Age) { ... }
```

### 5. Avoid clone() Abuse

```rust
// BAD - Cloning everywhere
fn process(data: &Vec<Item>) {
    let owned = data.clone();
    for item in owned {
        // process
    }
}

// GOOD - Borrow when possible
fn process(data: &[Item]) {
    for item in data {
        // process
    }
}

// GOOD - Take ownership when needed
fn process(data: Vec<Item>) {
    for item in data {
        // consume item
    }
}
```

## Pre-commit Setup

### .pre-commit-config.yaml

```yaml
repos:
  - repo: local
    hooks:
      - id: cargo-fmt
        name: cargo fmt
        entry: cargo fmt --
        language: system
        types: [rust]

      - id: cargo-clippy
        name: cargo clippy
        entry: cargo clippy --all-targets --all-features -- -D warnings
        language: system
        types: [rust]
        pass_filenames: false

      - id: cargo-test
        name: cargo test
        entry: cargo test
        language: system
        types: [rust]
        pass_filenames: false
```

## Makefile

```makefile
.PHONY: fmt lint test check quality

fmt:
	cargo fmt

lint:
	cargo clippy --all-targets --all-features -- -D warnings

test:
	cargo test

check:
	cargo check --all-targets --all-features

quality: fmt check lint test
```

## VS Code Settings

```json
// .vscode/settings.json
{
  "[rust]": {
    "editor.defaultFormatter": "rust-lang.rust-analyzer",
    "editor.formatOnSave": true
  },
  "rust-analyzer.check.command": "clippy",
  "rust-analyzer.check.extraArgs": ["--all-targets", "--all-features"],
  "rust-analyzer.diagnostics.disabled": [],
  "rust-analyzer.lens.run.enable": true,
  "rust-analyzer.lens.debug.enable": true
}
```

## Quality Metrics Targets

| Metric | Target | Tool |
|--------|--------|------|
| Cognitive Complexity | < 15 | Clippy |
| Function Lines | < 50 | Clippy |
| Arguments | < 5 | Clippy |
| unsafe blocks | Minimize | Clippy |
| Test Coverage | > 80% | cargo-tarpaulin |

## CI/CD Integration

### GitHub Actions

```yaml
name: Quality
on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2

      - name: Check formatting
        run: cargo fmt -- --check

      - name: Clippy
        run: cargo clippy --all-targets --all-features -- -D warnings

      - name: Run tests
        run: cargo test --all-features

      - name: Build docs
        run: cargo doc --no-deps
        env:
          RUSTDOCFLAGS: -D warnings
```

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| `unwrap()` in library code | Panics propagate | Use `?` operator |
| Excessive `clone()` | Performance cost | Borrow when possible |
| `#[allow(clippy::all)]` | Hides all issues | Allow specific lints |
| `unsafe` without comment | Unclear safety | Document invariants |
| String for everything | No type safety | Use enums/newtypes |
| Giant functions | Hard to test/maintain | Extract smaller functions |

## Quick Troubleshooting

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Clippy false positive | Edge case or intended | `#[allow(clippy::lint)]` with comment |
| rustfmt changes code | Formatting opinion | Configure `rustfmt.toml` |
| Lint conflicts | Pedantic vs nursery | Prioritize in `Cargo.toml` |
| Slow compilation | Many dependencies | Use `cargo-chef` for caching |
| Dead code warnings | Unused exports | Add `#[cfg(test)]` or remove |

## Related Skills
- [SonarQube](../sonarqube/SKILL.md)
- [Clean Code](../../best-practices/clean-code/SKILL.md)
- [Rust Security](../../security/rust-security/SKILL.md)
