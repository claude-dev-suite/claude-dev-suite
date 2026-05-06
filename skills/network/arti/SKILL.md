---
name: arti
description: |
  Arti — pure-Rust implementation of the Tor anonymity network, by Tor Project.
  Embeddable Tor client (no system Tor daemon needed), provides SOCKS proxy and
  programmatic API for connecting to .onion services or routing clearnet traffic
  through Tor. Used by privacy-respecting wallets (BHODL-style), messenger apps,
  and any Rust app needing anonymity. Ships as library (arti-client crate) or
  standalone CLI.

  USE WHEN: user mentions "arti", "Tor in Rust", "embedded Tor", "arti-client",
  "Tor circuit Rust", "onion service Rust", "TorClient", "BridgeConfig",
  "PreferredRuntime"

  DO NOT USE FOR: Bitcoin Core + Tor configuration - use `bitcoin/privacy/tor`
  DO NOT USE FOR: Browsing via Tor Browser - end-user tool, not dev
  DO NOT USE FOR: TLS configuration - use `network/rustls`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Arti — Tor in Rust

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `arti`.

## Why Arti

Arti is the **next-generation Tor implementation**, written in Rust. Replaces the C `tor` daemon for embedded use cases. Since v1.2.0+ (2024) it's stable enough for production embed in apps.

| Feature | Arti | C tor (legacy) |
|---|---|---|
| Language | Rust (memory safe) | C |
| Embedding API | ✅ Native (`arti-client`) | ❌ Requires running daemon |
| Async | ✅ Built on Tokio/async-std | Manual threading |
| Memory safety | ✅ | Periodic CVEs |
| Onion services | ✅ Stable since 1.2 | Original support |
| Bridges (obfs4, snowflake) | ✅ Plugin system | ✅ Mature |
| iOS/Android support | ✅ Cross-compile + UniFFI bindings | Hard |
| HSv2 (deprecated) | ❌ | Removed |

For BHODL-style wallets: ideal — embed Tor without bundling a binary or requiring the user to install Tor.

## Setup

```toml
[dependencies]
arti-client = { version = "0.27", features = ["tokio", "rustls"] }
tor-rtcompat = "0.27"
tokio = { version = "1", features = ["full"] }
```

Features:
- `tokio` (default) or `async-std` runtime
- `rustls` (default) or `native-tls` for TLS
- `bridge-client` — connect via bridges (obfs4, snowflake)
- `pt-client` — pluggable transports
- `onion-service-client` — connect to .onion (default)
- `onion-service-service` — host .onion (more advanced)

## Hello World — TCP Connection Through Tor

```rust
use arti_client::{TorClient, TorClientConfig};
use tor_rtcompat::PreferredRuntime;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = TorClientConfig::default();
    let runtime = PreferredRuntime::current()?;

    println!("Bootstrapping Tor (this can take a minute)...");
    let tor = TorClient::with_runtime(runtime)
        .config(config)
        .create_bootstrapped()
        .await?;
    println!("Connected to Tor network!");

    // Connect to a clearnet site through Tor
    let mut stream = tor.connect(("check.torproject.org", 80)).await?;

    // Or to a .onion v3 address
    let mut onion_stream = tor.connect((
        "duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion",
        80,
    )).await?;

    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    onion_stream.write_all(b"GET / HTTP/1.0\r\nHost: duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion\r\n\r\n").await?;

    let mut response = String::new();
    onion_stream.read_to_string(&mut response).await?;
    println!("{}", response);

    Ok(())
}
```

First-time bootstrap downloads the Tor consensus (~5-10 MB). Subsequent runs use cached data (faster).

## TorClient with HTTP

For HTTP through Tor, layer with reqwest or hyper:

```toml
[dependencies]
arti-client = { version = "0.27", features = ["tokio", "rustls"] }
arti-hyper = "0.27"
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls"] }
hyper = "1"
```

```rust
use arti_client::TorClient;
use arti_hyper::ArtiHttpConnector;
use hyper::Client;
use tls_api::{TlsConnector, TlsConnectorBuilder};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let tor = TorClient::create_bootstrapped(Default::default()).await?;

    let tls_connector = tls_api_native_tls::TlsConnector::builder()?.build()?;
    let connector = ArtiHttpConnector::new(tor, tls_connector);
    let http: Client<_, hyper::Body> = Client::builder().build(connector);

    let resp = http
        .get("https://check.torproject.org".parse()?)
        .await?;

    println!("Status: {}", resp.status());
    Ok(())
}
```

## Persistent Configuration

For production: persist Tor state to disk (cached descriptors, circuits) — much faster restarts.

```rust
use arti_client::{TorClient, TorClientConfig};
use std::path::PathBuf;

let mut config = TorClientConfig::builder();
config.storage()
    .cache_dir(PathBuf::from("/path/to/cache").into())
    .state_dir(PathBuf::from("/path/to/state").into());

let config = config.build()?;

let tor = TorClient::create_bootstrapped(config).await?;
```

State dir holds:
- Cached relay descriptors
- Onion service descriptor cache
- Guard nodes (don't change between sessions)

For mobile apps: use platform's app-private dir (filesDir on Android, Documents on iOS).

## Bridges (Obfuscated Tor)

For users in censored networks. Bridges hide that you're using Tor.

```toml
[dependencies]
arti-client = { version = "0.27", features = ["tokio", "rustls", "bridge-client", "pt-client"] }
tor-pt-client = "0.27"
```

```rust
use arti_client::config::pt::TransportConfigBuilder;
use arti_client::config::BridgeConfigBuilder;

let mut config_builder = TorClientConfig::builder();

// Add a bridge (example obfs4)
let bridge: BridgeConfigBuilder = "obfs4 IP:PORT FINGERPRINT cert=... iat-mode=0"
    .parse()?;
config_builder.bridges().bridges().push(bridge);

// Configure obfs4 transport binary
let mut transport = TransportConfigBuilder::default();
transport.protocols(vec!["obfs4".parse()?]);
transport.path(CfgPath::new("/usr/local/bin/obfs4proxy".into()));
config_builder.bridges().transports().push(transport);

let tor = TorClient::create_bootstrapped(config_builder.build()?).await?;
```

For mobile, use **Snowflake** (browser-based bridges, no binary install needed).

## SOCKS5 Proxy Mode

If you have legacy code that talks to a Tor SOCKS proxy, run Arti in proxy mode:

```bash
arti proxy -l 127.0.0.1:9150
```

Then existing apps using SOCKS5 work unchanged.

Programmatically:

```rust
use arti::cfg::ArtiCombinedConfig;
use arti::socks::run_socks_proxy;

let combined = ArtiCombinedConfig::default();
let runtime = PreferredRuntime::current()?;
run_socks_proxy(runtime, &combined.client, &combined.proxy).await?;
```

## Connecting to BHODL-Style Backends Over Tor

Wallet backends often expose `.onion` for privacy. Arti makes this trivial:

```rust
async fn fetch_balance(tor: &TorClient<PreferredRuntime>, address: &str) -> Result<u64> {
    let mut stream = tor.connect((
        "mempoolhqx4isw62xs7abwphsq7ldayuidyx2v2oethdhhj6mlo2r6ad.onion",
        443,
    )).await?;

    // ... TLS handshake (use rustls), HTTP/JSON request
    Ok(0)
}
```

For BDK + Tor:

```rust
use bdk_esplora::EsploraAsyncExt;
use bdk_esplora::esplora_client;

async fn sync_with_tor(wallet: &mut Wallet, tor: TorClient<PreferredRuntime>) -> Result<()> {
    let arti_connector = ArtiHttpConnector::new(tor, /* tls */);
    let http_client = reqwest::Client::builder()
        .connector(arti_connector)
        .build()?;

    let client = esplora_client::Builder::new("https://mempool.space/api")
        .client(http_client)
        .build_async()?;

    wallet.sync(&client, /* ... */).await?;
    Ok(())
}
```

## Mobile Integration (BHODL Pattern)

Arti compiles for Android (via cargo-ndk) and iOS (native Cargo). Embed in KMP shared module via UniFFI.

```rust
// crates/bhodl-tor-ffi/src/lib.rs
use arti_client::{TorClient, TorClientConfig};
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(uniffi::Object)]
pub struct BhodlTor {
    inner: Mutex<Option<TorClient<PreferredRuntime>>>,
}

#[uniffi::export(async_runtime = "tokio")]
impl BhodlTor {
    #[uniffi::constructor]
    pub fn new() -> Arc<Self> {
        Arc::new(BhodlTor {
            inner: Mutex::new(None),
        })
    }

    pub async fn bootstrap(&self, cache_dir: String) -> Result<(), TorError> {
        let mut config = TorClientConfig::builder();
        config.storage()
            .cache_dir(PathBuf::from(&cache_dir).into())
            .state_dir(PathBuf::from(&cache_dir).join("state").into());

        let tor = TorClient::create_bootstrapped(config.build()?).await?;
        *self.inner.lock().await = Some(tor);
        Ok(())
    }

    pub async fn is_ready(&self) -> bool {
        self.inner.lock().await.is_some()
    }
}
```

Bootstrap takes 30-60s on first run, ~5s after with persisted state. UI must show progress.

## Bootstrap Status

Track bootstrap progress for UX:

```rust
use arti_client::status::BootstrapStatus;

let mut events = tor.bootstrap_events();
while let Some(status) = events.next().await {
    println!("{}: {:.0}%", status.summary(), status.as_frac() * 100.0);
}
```

Show in UI: "Connecting to Tor network: 42%".

## Onion Service Hosting (Server-Side)

For exposing your own service on Tor:

```toml
arti-client = { version = "0.27", features = ["tokio", "rustls", "onion-service-service"] }
```

```rust
use arti_client::config::onion_service::OnionServiceConfigBuilder;

let mut osvc_config = OnionServiceConfigBuilder::default();
osvc_config.nickname("my_wallet_backend".parse()?);

let osvc = tor.launch_onion_service(osvc_config.build()?)?;
let onion = osvc.onion_address().unwrap();
println!("Service available at: {}", onion);

// Accept connections
let mut requests = osvc.into_accept_stream();
while let Some(req) = requests.next().await {
    tokio::spawn(handle(req));
}
```

Useful for self-hosted wallet sync backends, p2p messaging.

## Cross-Compile for Mobile

```bash
# Android (via cargo-ndk)
cargo ndk -t arm64-v8a -o jniLibs build --release \
    --features="arti-client/tokio,arti-client/rustls"

# iOS
cargo build --release --target aarch64-apple-ios \
    --features="arti-client/tokio,arti-client/rustls"
```

Pair with `network/rustls` skill — never use system OpenSSL on mobile.

## Performance & Limits

- **Bootstrap time**: 30-60s first run, 1-5s with cached state
- **Memory**: ~30-50 MB resident
- **Throughput**: typical Tor latency (300-2000ms first byte), ~1-10 Mbps stream
- **Battery on mobile**: significant — only run when needed, not always-on
- **Connection time to .onion**: 1-5s after bootstrap (circuit construction)
- **Storage**: ~50-100 MB cached state after warm

For BHODL: Tor as **opt-in** in settings, default off for battery. Show clear UI when connecting.

## Configuration Reference

```toml
# arti.toml — default config
[storage]
cache_dir = "$ARTI_CACHE/arti"
state_dir = "$ARTI_LOCAL_DATA/arti"

[bridges]
enabled = false
# bridges = ["obfs4 ..."]

[address_filter]
allow_local_addrs = false

[circuit_timing]
max_dirtiness = "10 minutes"
request_timeout = "60 seconds"

[stream_timeouts]
connect_timeout = "10 seconds"
resolve_timeout = "10 seconds"
```

## Anti-Patterns

| Anti-pattern | Why it's bad | Correct approach |
|---|---|---|
| `create_bootstrapped()` on UI thread | Blocks for 30-60s | Run on background thread, show progress |
| No cache dir set | Bootstrap from scratch every run | Persist cache + state to app dir |
| Routing wallet RPC via clearnet | Defeats Tor purpose | Connect via SOCKS or arti-client API |
| Sharing client across requests without locking | Concurrent issues with state | `Arc<Mutex<TorClient>>` |
| Bootstrapping on every API call | Slow + wasteful | Bootstrap once at app start |
| Using `system-tls` instead of `rustls` | Cross-compile breaks | Use `rustls` feature |
| Always-on Tor on mobile | Battery drain | Opt-in toggle in settings |
| Mixed clearnet + Tor traffic to same service | Correlation attacks | Onion-only for sensitive endpoints |
| Hardcoded bridges in source | Updates break | Fetch from BridgeDB or let user input |
| Skipping bootstrap UI feedback | Confusing UX | Show progress events to user |
| Using HSv2 (deprecated) addresses | No longer supported | Only HSv3 (.onion 56 chars) |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Bootstrap hangs forever | Network blocked, ISP filters Tor | Try bridges (obfs4, snowflake) |
| `.onion` connect fails after bootstrap | Wrong descriptor, target offline | Retry; verify address spelling |
| OOM on mobile | Heavy state directory | Limit `state_dir` size, prune old descriptors |
| Slow startup | No persisted cache | Set `cache_dir` to writable persistent path |
| `tor-circmgr: no exit nodes available` | Censored network | Use bridges |
| Crash on `runtime` mismatch | Mixed tokio/async-std | Pick one, set in Cargo features |
| Apple App Store rejection (unencrypted Tor traffic via NSURLSession) | iOS ATS conflict | Tor is encrypted; document for review |
| Battery drain | Always-on | Toggle off when idle |
| Slow .onion bootstrap | First-time HSv3 lookup | Cache descriptors, retry |
| Config errors | Strict TOML schema | Use `TorClientConfig::builder()` programmatically |

## When NOT to Use This Skill

| Scenario | Use Instead |
|----------|-------------|
| Bitcoin Core daemon + Tor | `bitcoin/privacy/tor` |
| User-facing browsing | Tor Browser (not dev tool) |
| TLS configuration | `network/rustls` |
| HTTP client patterns | reqwest/hyper docs |
| C tor daemon embedding (legacy) | tor-rs C bindings (deprecated) |
| Browser-side anonymity | Tor Browser, snowflake-webext |
