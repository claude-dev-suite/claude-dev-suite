# Rust Advanced Patterns

## Builder Pattern

```rust
#[derive(Default)]
pub struct UserBuilder {
    name: Option<String>,
    email: Option<String>,
    age: Option<u32>,
}

impl UserBuilder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn name(mut self, name: impl Into<String>) -> Self {
        self.name = Some(name.into());
        self
    }

    pub fn email(mut self, email: impl Into<String>) -> Self {
        self.email = Some(email.into());
        self
    }

    pub fn age(mut self, age: u32) -> Self {
        self.age = Some(age);
        self
    }

    pub fn build(self) -> Result<User, &'static str> {
        Ok(User {
            name: self.name.ok_or("name is required")?,
            email: self.email.ok_or("email is required")?,
            age: self.age.unwrap_or(0),
        })
    }
}

// Usage
let user = UserBuilder::new()
    .name("Alice")
    .email("alice@example.com")
    .age(30)
    .build()?;
```

---

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

### Trait Bounds

```rust
// Using trait bounds
pub fn notify<T: Summary>(item: &T) {
    println!("Breaking news! {}", item.summarize());
}

// Multiple trait bounds
pub fn notify<T: Summary + Display>(item: &T) { ... }

// Where clause for complex bounds
fn some_function<T, U>(t: &T, u: &U) -> i32
where
    T: Display + Clone,
    U: Clone + Debug,
{ ... }
```

### Common Derive Traits

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
pub struct Config {
    pub host: String,
    pub port: u16,
}
```

---

## Advanced Async Patterns

### Concurrent Execution

```rust
use tokio::join;

async fn fetch_all() -> (String, String) {
    let (result1, result2) = join!(
        fetch_data("https://api.example.com/1"),
        fetch_data("https://api.example.com/2")
    );
    (result1.unwrap(), result2.unwrap())
}
```

### Select for Racing

```rust
use tokio::select;
use tokio::time::{sleep, Duration};

async fn with_timeout() {
    select! {
        result = fetch_data("https://slow.api.com") => {
            println!("Got result: {:?}", result);
        }
        _ = sleep(Duration::from_secs(5)) => {
            println!("Timeout!");
        }
    }
}
```

### Spawning Tasks

```rust
use tokio::spawn;

async fn process_items(items: Vec<Item>) {
    let handles: Vec<_> = items
        .into_iter()
        .map(|item| spawn(async move { process(item).await }))
        .collect();

    for handle in handles {
        handle.await.unwrap();
    }
}
```

---

## Custom Error Types

```rust
use std::fmt;
use std::error::Error;

#[derive(Debug)]
pub enum AppError {
    NotFound(String),
    InvalidInput(String),
    DatabaseError(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            AppError::NotFound(msg) => write!(f, "Not found: {msg}"),
            AppError::InvalidInput(msg) => write!(f, "Invalid input: {msg}"),
            AppError::DatabaseError(msg) => write!(f, "Database error: {msg}"),
        }
    }
}

impl Error for AppError {}

// Using thiserror crate (recommended)
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Resource not found: {0}")]
    NotFound(String),
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    #[error("Database error: {0}")]
    DatabaseError(#[from] sqlx::Error),
}
```

---

## Production Readiness

### Environment Configuration

```rust
use std::env;

#[derive(Debug)]
pub struct Config {
    pub database_url: String,
    pub port: u16,
    pub log_level: String,
}

impl Config {
    pub fn from_env() -> Result<Self, env::VarError> {
        Ok(Self {
            database_url: env::var("DATABASE_URL")?,
            port: env::var("PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()
                .expect("PORT must be a number"),
            log_level: env::var("LOG_LEVEL")
                .unwrap_or_else(|_| "info".to_string()),
        })
    }
}
```

### Logging with tracing

```rust
use tracing::{info, error, instrument, Level};
use tracing_subscriber::FmtSubscriber;

fn setup_logging() {
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .json()  // JSON format for production
        .finish();
    tracing::subscriber::set_global_default(subscriber).unwrap();
}

#[instrument]
async fn process_request(id: u64) -> Result<(), AppError> {
    info!(request_id = %id, "Processing request");
    // ...
    Ok(())
}
```

### Graceful Shutdown

```rust
use tokio::signal;

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    info!("Shutdown signal received");
}
```

---

## Cargo.toml Configuration

```toml
[package]
name = "my_project"
version = "0.1.0"
edition = "2021"
authors = ["Name <email@example.com>"]
description = "A sample Rust project"

[dependencies]
tokio = { version = "1.0", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
thiserror = "1.0"

[dev-dependencies]
tokio-test = "0.4"

[profile.release]
opt-level = 3
lto = true

[[bin]]
name = "my_app"
path = "src/main.rs"
```

---

## Production Checklist

- [ ] Error types with thiserror
- [ ] Structured logging with tracing
- [ ] Configuration via environment variables
- [ ] Graceful shutdown handling
- [ ] Clippy lints enabled
- [ ] Cargo fmt enforced
- [ ] Tests with coverage
- [ ] Release profile optimized
