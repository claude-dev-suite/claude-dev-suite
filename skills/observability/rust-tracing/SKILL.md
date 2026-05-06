---
name: rust-tracing
description: |
  Rust `tracing` crate — structured, async-aware diagnostics. Spans, events,
  fields, instrument macro, subscribers (fmt, JSON, OpenTelemetry, Tokio Console),
  filtering (env-filter, RUST_LOG), targets, contextual fields with span data,
  integration with `tracing-subscriber` layers, OpenTelemetry export, and patterns
  for embedded/mobile (FFI to Android Logcat / iOS os.Logger), wallet apps with
  privacy-respecting log redaction.

  USE WHEN: user mentions "tracing", "tracing-subscriber", "instrument", "Span",
  "info!/error!/debug!", "tracing-opentelemetry", "tokio-console", "env-filter",
  "RUST_LOG", "JSON logs Rust", "structured logging Rust"

  DO NOT USE FOR: Mobile-specific log integration only - use `mobile/android-native` or `mobile/ios-native`
  DO NOT USE FOR: Java/Kotlin logging (slf4j) - use Java/Kotlin specific
  DO NOT USE FOR: Generic Rust language - use `languages/rust`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Rust `tracing` — Structured Diagnostics

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `tracing`.

## Why `tracing` Over `log`

| Aspect | `log` crate | `tracing` |
|---|---|---|
| Granularity | Single events | Events + spans (nested context) |
| Async-aware | ❌ Loses context across `.await` | ✅ Span context follows tasks |
| Structured fields | ❌ String-only | ✅ Typed key-value |
| Multiple subscribers | One global | Composable layers |
| Sampling/filtering | Global level | Per-target, per-field, dynamic |
| OpenTelemetry | Manual bridge | First-class via `tracing-opentelemetry` |
| Tokio integration | None | Tokio Console for live debugging |

For modern Rust async services and wallet apps: **`tracing`**.

## Setup

```toml
[dependencies]
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json", "fmt"] }

# Optional
tracing-appender = "0.2"                       # rolling file output
tracing-opentelemetry = "0.27"                 # OTel export
opentelemetry = "0.26"
opentelemetry_sdk = "0.26"
opentelemetry-otlp = "0.26"
console-subscriber = "0.4"                     # tokio-console
```

## Initialize Subscriber

```rust
use tracing_subscriber::{fmt, EnvFilter, prelude::*};

fn init_tracing() {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(fmt::layer().with_target(true).with_line_number(true))
        .init();
}

fn main() {
    init_tracing();
    tracing::info!("started");
}
```

Filter via env:

```bash
RUST_LOG=info cargo run                       # default level info
RUST_LOG=debug cargo run                      # debug everything
RUST_LOG=bhodl=debug,tower=info cargo run    # per-crate
RUST_LOG="bhodl::wallet=trace" cargo run     # per-module
```

## Events (Like Log Lines)

```rust
use tracing::{trace, debug, info, warn, error};

info!("server started");
warn!("retrying after error");
error!("send failed");

// With fields (structured)
info!(user_id = 42, action = "login", "user authenticated");
warn!(retry_count = 3, ?error, "retry exhausted");      // ?error = Debug format
error!(%error, "send failed");                           // %error = Display format

// Conditional formatting
debug!(target: "payments", amount_sats = 1000, "payment initiated");
```

Output (default `fmt` layer):
```
2026-05-04T10:00:00.123456Z  INFO bhodl::auth: user authenticated user_id=42 action=login
2026-05-04T10:00:01.123456Z  WARN bhodl::sync: retry exhausted retry_count=3 error=ConnectionError
```

## Spans (Nested Context)

```rust
use tracing::{info_span, instrument};

fn process_request(req: Request) {
    let span = info_span!("process_request", request_id = %req.id, method = req.method);
    let _enter = span.enter();

    info!("validating");
    validate(&req);
    info!("storing");
    store(&req);
}                                              // span exits here

// All `info!` inside the span are tagged with request_id and method
```

### `#[instrument]` Attribute (Idiomatic)

```rust
use tracing::instrument;

#[instrument(skip(repo), fields(wallet_id = %wallet.id))]
async fn sync_wallet(wallet: &Wallet, repo: &Repo) -> Result<()> {
    info!("syncing");
    let txs = repo.fetch_transactions(&wallet.id).await?;
    info!(count = txs.len(), "fetched transactions");
    repo.save_transactions(txs).await?;
    Ok(())
}
```

`skip(repo)` excludes `repo` from instrumented fields (often big or non-Display).
`fields(wallet_id = %wallet.id)` adds custom fields not from arguments.

Async-aware: span context survives `.await` boundaries automatically.

### Span on Result

```rust
#[instrument(err)]
async fn risky() -> Result<(), MyError> {
    // returns Err — auto-logged at error level
    Err(MyError::Boom)
}

#[instrument(ret)]
async fn computes() -> u64 {
    // returns Ok(42) — auto-logged
    42
}

#[instrument(level = "debug", skip_all, fields(user_id = %user.id))]
async fn detailed(user: &User) { /* ... */ }
```

## JSON Output (Structured for Log Aggregators)

```rust
use tracing_subscriber::fmt::format::Json;

tracing_subscriber::fmt()
    .json()
    .with_current_span(true)
    .with_span_list(false)
    .flatten_event(true)
    .with_max_level(Level::INFO)
    .init();
```

Output:
```json
{"timestamp":"2026-05-04T10:00:00.123Z","level":"INFO","fields":{"message":"user authenticated","user_id":42},"target":"bhodl::auth","span":{"name":"process_request","request_id":"abc"}}
```

Pipe to log aggregator (Loki, Elasticsearch, Datadog).

## Multiple Layers Composition

```rust
use tracing_subscriber::{fmt, EnvFilter, prelude::*, Registry};

let stdout_log = fmt::layer().with_target(true);
let json_log = fmt::layer().json().with_writer(std::io::stderr);

let file_appender = tracing_appender::rolling::daily("logs", "bhodl.log");
let (file_writer, _guard) = tracing_appender::non_blocking(file_appender);
let file_log = fmt::layer().json().with_writer(file_writer);

Registry::default()
    .with(EnvFilter::from_default_env())
    .with(stdout_log)
    .with(json_log)
    .with(file_log)
    .init();
```

Each layer can have its own filter:

```rust
.with(stdout_log.with_filter(EnvFilter::new("info")))
.with(file_log.with_filter(EnvFilter::new("trace")))    // file gets everything
```

## OpenTelemetry Export

```rust
use opentelemetry::trace::TracerProvider as _;
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::trace::TracerProvider;
use tracing_opentelemetry::OpenTelemetryLayer;

fn init_otel() {
    let exporter = opentelemetry_otlp::SpanExporter::builder()
        .with_tonic()
        .with_endpoint("http://localhost:4317")
        .build()
        .unwrap();

    let provider = TracerProvider::builder()
        .with_batch_exporter(exporter, opentelemetry_sdk::runtime::Tokio)
        .build();

    let tracer = provider.tracer("bhodl");

    tracing_subscriber::registry()
        .with(EnvFilter::from_default_env())
        .with(fmt::layer())
        .with(OpenTelemetryLayer::new(tracer))
        .init();
}
```

Sends spans to OTel collector → Jaeger, Tempo, Honeycomb, etc.

## Tokio Console (Live Async Debugging)

```toml
[dependencies]
console-subscriber = "0.4"
tokio = { version = "1", features = ["full", "tracing"] }
```

```rust
fn main() {
    console_subscriber::init();
    // ... your app
}
```

```bash
# In another terminal
cargo install --locked tokio-console
tokio-console
```

Live view of all tasks, polls, locks, blocking I/O. Identifies stuck tasks, contention, slow polls.

## Mobile / FFI Integration

For wallet apps shipping Rust core via UniFFI to Android/iOS, route Rust logs to native log systems.

### Android Logcat

```toml
[dependencies]
android_logger = "0.14"
tracing-android = "0.2"                        # bridges tracing to Logcat
```

```rust
#[cfg(target_os = "android")]
fn init_for_android() {
    use tracing_subscriber::prelude::*;
    let android_layer = tracing_android::layer("BhodlCore").unwrap();

    tracing_subscriber::registry()
        .with(EnvFilter::new("info,bhodl=debug"))
        .with(android_layer)
        .init();
}
```

Logs appear in `adb logcat -s BhodlCore`.

### iOS os_log

```toml
[dependencies]
oslog = "0.2"
tracing-oslog = "0.2"                          # community crate
```

```rust
#[cfg(target_os = "ios")]
fn init_for_ios() {
    use tracing_subscriber::prelude::*;
    let oslog_layer = tracing_oslog::OsLogger::new("com.bhodl.core", "default");

    tracing_subscriber::registry()
        .with(EnvFilter::new("info,bhodl=debug"))
        .with(oslog_layer)
        .init();
}
```

Logs appear in `Console.app` filtered by subsystem `com.bhodl.core`.

### Cross-Platform Init (UniFFI)

```rust
use std::sync::Once;

#[uniffi::export]
pub fn init_logging() {
    static INIT: Once = Once::new();
    INIT.call_once(|| {
        #[cfg(target_os = "android")]
        init_for_android();
        #[cfg(target_os = "ios")]
        init_for_ios();
        #[cfg(not(any(target_os = "android", target_os = "ios")))]
        init_for_default();
    });
}
```

Call from Kotlin/Swift on app start.

## Privacy-Respecting Logging (Wallet Apps)

For BHODL: **never log raw addresses, balances, seeds in production logs**.

```rust
use tracing::Span;

// Custom Display that redacts
struct RedactedAddr<'a>(&'a str);

impl std::fmt::Display for RedactedAddr<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        let len = self.0.len();
        if len > 8 {
            write!(f, "{}...{}", &self.0[..4], &self.0[len-4..])
        } else {
            write!(f, "***")
        }
    }
}

#[instrument(skip(amount, address), fields(addr = %RedactedAddr(&address)))]
fn send_payment(amount: u64, address: String) {
    info!("sending payment");                   // amount NOT logged
    // process
}
```

Or use feature flag:

```toml
[features]
default = ["redact-secrets"]
redact-secrets = []
```

```rust
fn log_amount(amount: u64) -> impl std::fmt::Display {
    #[cfg(feature = "redact-secrets")]
    return "***";
    #[cfg(not(feature = "redact-secrets"))]
    return amount.to_string();
}
```

## Custom Filter / Layer

```rust
use tracing::{Subscriber, Event, Metadata};
use tracing_subscriber::{Layer, layer::Context, registry::LookupSpan};

struct MetricsLayer;

impl<S> Layer<S> for MetricsLayer
where S: Subscriber + for<'a> LookupSpan<'a>,
{
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        if event.metadata().level() == &Level::ERROR {
            // increment Prometheus counter
            prometheus::ERRORS.inc();
        }
    }
}
```

Add to subscriber:

```rust
tracing_subscriber::registry()
    .with(EnvFilter::from_default_env())
    .with(fmt::layer())
    .with(MetricsLayer)
    .init();
```

## Performance

`tracing` is designed for production: when a level is filtered out, the macro expands to ~zero cost (no allocation, no formatting). Use `trace!` and `debug!` liberally.

For very hot paths, consider:

```rust
if tracing::enabled!(target: "hot_loop", Level::DEBUG) {
    debug!(value = expensive_computation());
}
```

`enabled!` is cheap; gates the expensive `expensive_computation()`.

## Tokio Tasks Naming

```rust
use tokio::task::Builder;

Builder::new()
    .name("wallet-sync-worker")
    .spawn(async { /* ... */ })
    .unwrap();
```

Names show in tokio-console and in span context.

## Trace Sampling (Production at Scale)

For high-throughput apps, sample spans to reduce export volume:

```rust
use opentelemetry_sdk::trace::Sampler;

let provider = TracerProvider::builder()
    .with_config(opentelemetry_sdk::trace::Config::default()
        .with_sampler(Sampler::TraceIdRatioBased(0.1)))   // 10% sample
    .build();
```

For wallet apps: typically not needed (low traffic per user).

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| `println!` for production logs | No filter, no levels, no context | Use `tracing` macros |
| Logging raw secrets (seeds, balances, addresses) | Leaks via logs | Redact via Display impl or skip fields |
| `format!` inside log macros for filtered levels | Wasteful when level disabled | Use `?` or `%` and let macro handle |
| One huge subscriber with all levels enabled | High overhead | Use `EnvFilter` per-target |
| Forgetting `.in_current_span()` for spawned tasks | Lost context | Tokio's `tracing` feature handles auto, otherwise wrap |
| Synchronous file writer | Blocks async runtime | Use `tracing_appender::non_blocking` |
| Initializing `tracing-subscriber` twice | Panic | Use `Once` for FFI init |
| `error!` for expected errors (404, validation) | Alarms ops | `warn!` or `info!` for expected, `error!` for unexpected |
| Logging in tight loops without level check | Volume explosion | Check level or sample |
| OpenTelemetry without `tokio` runtime | Async export fails | Pair OTel exporter with Tokio runtime |
| Hardcoded log file path on mobile | No write access in app sandbox | Use platform-specific writable dir |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `init()` called twice panic | Subscriber set globally | Use `try_init()` or `Once::call_once` |
| No output | EnvFilter rejects | Check `RUST_LOG` env or default filter |
| Span context lost across `.await` | Async without `tracing` feature on Tokio | Use `#[tokio::main]` or `Builder` with `enable_all` |
| `oslog` symbols missing on iOS | Missing framework link | Link `os` framework in build script |
| Logs not appearing in Logcat | Wrong tag or low level | Increase Logcat verbosity, check tag |
| OTel exporter never sends | Tokio runtime mismatch | Build TracerProvider on same runtime |
| JSON output mangled | Pretty printer interfering | Use `.json().flatten_event(true)` |
| Stack traces missing in errors | `error!(%err)` only formats Display | `error!(?err)` for Debug or use `tracing-error` crate |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Java/Kotlin logging (slf4j, Logback) | Java/Kotlin specific |
| Mobile-specific platform log integration | `mobile/android-native` / `mobile/ios-native` |
| Generic Rust language | `languages/rust` |
| Distributed tracing protocol details | OpenTelemetry-specific docs |
| Spring Boot logging | Spring Boot specific |
